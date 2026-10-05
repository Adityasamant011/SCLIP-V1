import type { MediaItem } from '../state/model.js'
import type { SourceObservationIndexResult } from './sourceObservationIndex.js'
import type { CachedTranscriptData } from './timelineContext.js'

export const SOURCE_MAP_LIMITS = { cells: 12, observations: 24, description_chars: 220, bytes: 9000, coarse_samples: 6, sources: 4 } as const
const overlap = (a: number[], b: number[]) => a[1] >= b[0] && a[0] <= b[1]
/** Sampling grid, not scene detection, semantic segmentation, or a ranked clip list. */
export function buildSourceUnderstanding(media: MediaItem, indexes: SourceObservationIndexResult[], transcript: CachedTranscriptData | null) {
  const duration = media.metadata.duration_us
  if (!Number.isSafeInteger(duration) || !duration || duration < 1) throw new Error('Known positive source duration required')
  indexes=indexes.filter(x=>x.media_id===media.id && (!media.file_hash_blake3 || x.source_hash===media.file_hash_blake3))
  if(transcript?.source_hash && transcript.source_hash!==media.file_hash_blake3)transcript=null
  const observations = indexes.flatMap(x => x.observations).filter(x => x.source_t_us >= 0 && x.source_t_us < duration).sort((a,b)=>a.source_t_us-b.source_t_us)
  const visual = observations.filter(x => x.kind === 'visual')
  const speech = transcript?.segments ?? []
  const count = Math.min(SOURCE_MAP_LIMITS.cells, Math.max(1, Math.ceil(duration / 60_000_000)))
  const cells = Array.from({length:count}, (_, i) => {
    const bounds: [number,number] = [Math.floor(duration*i/count), Math.floor(duration*(i+1)/count)]
    const instants = [...new Set(visual.filter(x => x.source_t_us >= bounds[0] && x.source_t_us < bounds[1]).map(x => x.source_t_us))]
    const segments = speech.filter(x => x.t_end_us > bounds[0] && x.t_start_us < bounds[1])
    const signalRanges=indexes.filter(x=>x.audio.status==='available'&&x.analysis_range_us&&overlap(x.analysis_range_us,bounds)).map(x=>x.analysis_range_us!)
    const audio = indexes.filter(x => x.audio.status === 'available').flatMap(x => x.observations.filter(o => o.kind === 'audio_measurement')).filter(x=>overlap(x.sample_window_us,bounds))
    return { source_range_us:bounds, visual:{status:instants.length ? 'sampled_instants_only' : 'unobserved',sample_times_us:instants.slice(0,4),sample_times_total:instants.length,unsampled_time:'unobserved'},
      speech:{status:segments.length ? 'cached_transcript_segments' : 'not_observed', represented_ranges_us:segments.slice(0,4).map(s=>[Math.max(bounds[0],s.t_start_us),Math.min(bounds[1],s.t_end_us)]), segments_total:segments.length},
      audio:{status:signalRanges.length ? 'signal_window_measured' : audio.length ? 'measured_events_only' : 'not_observed',measured_ranges_us:signalRanges.slice(0,4)},text:{status:'not_observed',reason:'No source OCR/text evidence supplied'},metadata:{status:'available',evidence_class:'AUTHORITATIVE_MEDIA_METADATA'} }
  })
  const packet = { identity:{media_id:media.id,source_hash:media.file_hash_blake3,coordinate_space:'source',evidence_origin:'SOURCE_MEDIA'},
    metadata:{duration_us:duration,kind:media.kind,width:media.metadata.video?.width??null,height:media.metadata.video?.height??null,audio_stream_present:!!media.metadata.audio,evidence_class:'AUTHORITATIVE_MEDIA_METADATA'},
    structure:{basis:'uniform coverage grid, not scene boundaries or editorial sections',cells},
    observations:observations.slice(0,SOURCE_MAP_LIMITS.observations).map(x=>({source_t_us:x.source_t_us,kind:x.kind,description:x.description.slice(0,SOURCE_MAP_LIMITS.description_chars),model:x.model,evidence_class:x.evidence,observed_range_us:x.kind==='visual' ? [x.source_t_us,x.source_t_us] : x.sample_window_us})),
    transcript:{status:speech.length ? 'cached' : 'not_generated',segment_count:speech.length,word_timing_available:speech.some(s=>s.words?.length),speech_presence:speech.length ? 'observed_in_transcript_ranges' : 'unknown'},
    audio_measurements:indexes.filter(x=>x.audio.status==='available').slice(0,4).map(x=>({source_range_us:x.analysis_range_us??null,signal_analysis:{tempo_bpm:x.audio.signal_analysis?.tempo_bpm,has_clipping:x.audio.signal_analysis?.has_clipping,beat_count:x.audio.signal_analysis?.beats_us?.length},evidence_class:'DETERMINISTIC_MEASUREMENT',semantic_audio:'not_available'})),
    acquisition:{local_compute:'Qwen source frames and optional signal measurements',cached:indexes.every(x=>x.cached),cloud_inference:'none; only bounded returned text enters Hermes context'},
    uncertainty:'A visual sample establishes that instant only. Audio stream presence is not proof of speech. Missing evidence is unknown, not absent content. No semantic audio classifier or source OCR coverage is inferred.',
    deeper_evidence:{visual:'get_source_observations with source bounds, or vision_inspect with media_id/source_t_us',speech:'get_source_speech_context with your source bounds; if not generated, transcribe_clip on a chosen VideoClip/Audio layer then reacquire',principle:'Claims about spoken meaning, sentence boundaries or dialogue continuity require speech/audio evidence. Choose whether to acquire it or leave the claim unverified. This map chooses no story, range, cut, repair or readiness verdict.'},
    truncation:{observations_total:observations.length,observations_omitted:Math.max(0,observations.length-SOURCE_MAP_LIMITS.observations),size_limited:false} }
  while(Buffer.byteLength(JSON.stringify(packet))>SOURCE_MAP_LIMITS.bytes && packet.observations.length){packet.observations.pop();packet.truncation.observations_omitted++;packet.truncation.size_limited=true}
  if(Buffer.byteLength(JSON.stringify(packet))>SOURCE_MAP_LIMITS.bytes)throw new Error('SOURCE_MAP_SIZE_LIMIT')
  return packet
}

export function sourceSpeechContext(media:MediaItem, transcript:CachedTranscriptData|null,start:number,end:number,before=5_000_000,after=5_000_000) {
  if(transcript?.source_hash && transcript.source_hash!==media.file_hash_blake3)transcript=null
  const duration=media.metadata.duration_us??0
  if(![start,end,before,after].every(Number.isSafeInteger)||start<0||end<=start||end>duration||before<0||after<0||before>10_000_000||after>10_000_000)throw new Error('Valid source bounds and context padding of 0–10 seconds required')
  const lo=Math.max(0,start-before),hi=Math.min(duration,end+after)
  if(hi-lo>60_000_000)throw new Error('Speech context including padding is limited to 60 source seconds')
  const select=(a:number,b:number)=>(transcript?.segments??[]).filter(s=>s.t_end_us>a&&s.t_start_us<b).map(s=>({...s,words:s.words?.filter(w=>w.t_end_us>a&&w.t_start_us<b)}))
  const result={coordinate_space:'source',evidence_origin:'SOURCE_MEDIA',media_id:media.id,source_hash:media.file_hash_blake3,evidence_class:'MODEL_TRANSCRIPTION',status:transcript?.segments?.length?'cached':'not_generated',requested_range_us:[start,end],context_range_us:[lo,hi],before:select(lo,start),selected:select(start,end),after:select(end,hi),limitation:'Segment timing may cross selection edges; words retain original source times where available. Missing cache does not establish silence or a complete sentence.'}
  if(Buffer.byteLength(JSON.stringify(result))>12000)throw new Error('Speech context exceeds bounded output; choose a narrower source range')
  return result
}
