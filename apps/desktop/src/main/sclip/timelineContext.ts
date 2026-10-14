import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Composition, Project } from '../state/model.js'

export interface TimelineLayerFact {
  layer_id: string
  kind: string
  label: string | null
  text_content: string | null
  media_id: string | null
  media_label: string | null
  t_start_us: number
  t_end_us: number
  duration_us: number
  src_in_us: number | null
  src_out_us: number | null
  linked_layer_ids: string[]
  effects_count: number
}

export interface TimelineTrackFact {
  track_id: string
  kind: string
  label: string | null
  layer_count: number
  layers: TimelineLayerFact[]
}

export interface TimelineGapFact {
  track_id: string
  start_us: number
  end_us: number
  duration_us: number
}

export interface WordCue {
  text: string
  t_start_us: number
  t_end_us: number
}

export interface SpeechCutCues {
  outgoing_tail_text: string
  outgoing_tail_words: WordCue[]
  incoming_head_text: string
  incoming_head_words: WordCue[]
  is_mid_word: boolean
  source_jump_us: number | null
}

export interface CutBoundaryFact {
  cut_index: number
  timeline_t_us: number
  has_gap: boolean
  gap_duration_us: number
  outgoing_clip: {
    layer_id: string
    media_id: string | null
    media_label: string | null
    src_out_us: number | null
    t_end_us: number
  }
  incoming_clip: {
    layer_id: string
    media_id: string | null
    media_label: string | null
    src_in_us: number | null
    t_start_us: number
  }
  is_continuous_source: boolean
  speech_cues: SpeechCutCues | null
}

export interface TimelineTransitionFact {
  id: string
  from_layer: string
  to_layer: string
  duration_us: number
  kind: string
}

export interface TimelineMarkerFact {
  id: string
  t_us: number
  label: string
  note: string | null
}

export interface TimelineContext {
  version: 1
  project_id: string
  composition_id: string
  duration_us: number
  resolution: {
    width: number
    height: number
  }
  fps: {
    num: number
    den: number
  }
  sample_rate: number
  total_tracks: number
  total_layers: number
  tracks: TimelineTrackFact[]
  gaps: TimelineGapFact[]
  cut_boundaries: CutBoundaryFact[]
  transitions: TimelineTransitionFact[]
  markers: TimelineMarkerFact[]
}

export interface CachedWord {
  text: string
  t_start_us: number
  t_end_us: number
}

export interface CachedSegment {
  text: string
  t_start_us: number
  t_end_us: number
  words?: CachedWord[]
}

export interface CachedTranscriptData {
  source_hash?: string
  is_full_source?: boolean
  source_duration_us?: number | null
  in_us?: number
  out_us?: number
  word_timing?: string
  timing_adjustments?: unknown[]
  segments?: CachedSegment[]
}

export interface TimelineContextOptions {
  compositionId?: string
  range?: {
    start_us: number
    end_us: number
  }
  transcriptsDir?: string
  transcriptLoader?: (mediaId: string, fileHash: string | undefined) => CachedTranscriptData | null
}

export function loadTranscriptFromDir(transcriptsDir: string, fileHash: string): CachedTranscriptData | null {
  try {
    if (!fs.existsSync(transcriptsDir)) return null
    // Transcripts might be named <hash>.json or <subhash>.json
    const exactPath = path.join(transcriptsDir, `${fileHash}.json`)
    if (fs.existsSync(exactPath)) {
      return JSON.parse(fs.readFileSync(exactPath, 'utf8')) as CachedTranscriptData
    }
    const files = fs.readdirSync(transcriptsDir)
    for (const f of files) {
      if (f.endsWith('.json')) {
        const full = path.join(transcriptsDir, f)
        const content = JSON.parse(fs.readFileSync(full, 'utf8')) as CachedTranscriptData
        if (content.source_hash === fileHash) {
          return content
        }
      }
    }
  } catch {
    // Read-only best effort
  }
  return null
}

function extractSpeechCues(
  transcript: CachedTranscriptData | null,
  srcStartUs: number,
  srcEndUs: number,
  isTail: boolean,
  count = 4,
): { text: string; words: WordCue[] } {
  if (!transcript || !transcript.segments || transcript.segments.length === 0) {
    return { text: '', words: [] }
  }

  // Collect all words within [srcStartUs, srcEndUs)
  const allWords: WordCue[] = []
  for (const seg of transcript.segments) {
    if (seg.t_end_us <= srcStartUs || seg.t_start_us >= srcEndUs) continue
    if (seg.words && seg.words.length > 0) {
      for (const w of seg.words) {
        if (w.t_end_us > srcStartUs && w.t_start_us < srcEndUs) {
          allWords.push({
            text: w.text.trim(),
            t_start_us: w.t_start_us,
            t_end_us: w.t_end_us,
          })
        }
      }
    } else {
      // Fallback: segment text if word timings absent
      const words = seg.text.trim().split(/\s+/)
      const segDur = seg.t_end_us - seg.t_start_us
      const wordDur = words.length > 0 ? segDur / words.length : 0
      for (let i = 0; i < words.length; i++) {
        const wStart = Math.round(seg.t_start_us + i * wordDur)
        const wEnd = Math.round(seg.t_start_us + (i + 1) * wordDur)
        if (wEnd > srcStartUs && wStart < srcEndUs) {
          allWords.push({ text: words[i], t_start_us: wStart, t_end_us: wEnd })
        }
      }
    }
  }

  if (allWords.length === 0) {
    return { text: '', words: [] }
  }

  const selectedWords = isTail ? allWords.slice(-count) : allWords.slice(0, count)
  return {
    text: selectedWords.map((w) => w.text).join(' '),
    words: selectedWords,
  }
}

/**
 * Builds compact, structured timeline facts from a Project snapshot.
 * Guarantees zero ProjectActor mutations and zero history entries.
 */
export function buildTimelineContext(
  project: Project,
  options: TimelineContextOptions = {},
): TimelineContext {
  const compId = options.compositionId ?? project.root_id
  const comp: Composition | undefined = project.compositions[compId]
  if (!comp) {
    throw new Error(`Composition not found: ${compId}`)
  }

  const range = options.range
  const defaultDir = path.join(os.homedir(), 'Library/Application Support/Sclip/data/cache/transcripts')
  const transcriptsDir =
    options.transcriptsDir ??
    process.env.SCLIP_TRANSCRIPTS_DIR ??
    (fs.existsSync(defaultDir) ? defaultDir : undefined)

  const transcriptCache=new Map<string,CachedTranscriptData | null>()
  // Reuse source cache reads across all layers and cut boundaries in this snapshot.
  const getTranscript = (mediaId: string): CachedTranscriptData | null => {
    if(transcriptCache.has(mediaId))return transcriptCache.get(mediaId)!
    const item = project.media_pool[mediaId]
    if (options.transcriptLoader) {
      const value=options.transcriptLoader(mediaId, item?.file_hash_blake3);transcriptCache.set(mediaId,value);return value
    }
    if (transcriptsDir && item?.file_hash_blake3) {
      const value=loadTranscriptFromDir(transcriptsDir, item.file_hash_blake3);transcriptCache.set(mediaId,value);return value
    }
    transcriptCache.set(mediaId,null)
    return null
  }

  const tracks: TimelineTrackFact[] = []
  const allGaps: TimelineGapFact[] = []
  let totalLayers = 0

  // Build link index
  const links = comp.links || []
  const getLinked = (layerId: string): string[] => {
    const result: string[] = []
    for (const link of links) {
      if (link.members.includes(layerId)) {
        for (const m of link.members) {
          if (m !== layerId && !result.includes(m)) result.push(m)
        }
      }
    }
    return result
  }

  for (const track of comp.tracks) {
    const sortedLayers = [...track.layers].sort((a, b) => a.t_start_us - b.t_start_us)
    const layerFacts: TimelineLayerFact[] = []

    for (const layer of sortedLayers) {
      // Optional range filtering
      if (range) {
        if (layer.t_end_us <= range.start_us || layer.t_start_us >= range.end_us) {
          continue
        }
      }

      totalLayers++
      const params = layer.params as any
      const mediaId = params.media ?? null
      const mediaItem = mediaId ? project.media_pool[mediaId] : null
      const mediaLabel = mediaItem?.label ?? null

      layerFacts.push({
        layer_id: layer.id,
        kind: layer.params.kind,
        label: layer.label ?? mediaLabel,
        text_content: layer.params.kind === 'Text' ? params.content ?? null : null,
        media_id: mediaId,
        media_label: mediaLabel,
        t_start_us: layer.t_start_us,
        t_end_us: layer.t_end_us,
        duration_us: layer.t_end_us - layer.t_start_us,
        src_in_us: typeof params.src_in_us === 'number' ? params.src_in_us : null,
        src_out_us: typeof params.src_out_us === 'number' ? params.src_out_us : null,
        linked_layer_ids: getLinked(layer.id),
        effects_count: layer.effects?.length ?? 0,
      })
    }

    // Compute gaps on this track (visual or audio)
    // Only check against visual layers for track gap computation if visual track, or audio for audio
    const visualOrAudioLayers = sortedLayers.filter(
      (l) => l.params.kind === 'VideoClip' || l.params.kind === 'Audio',
    )
    if (visualOrAudioLayers.length > 0) {
      if (visualOrAudioLayers[0].t_start_us > 0) {
        allGaps.push({
          track_id: track.id,
          start_us: 0,
          end_us: visualOrAudioLayers[0].t_start_us,
          duration_us: visualOrAudioLayers[0].t_start_us,
        })
      }
      for (let i = 0; i < visualOrAudioLayers.length - 1; i++) {
        const curEnd = visualOrAudioLayers[i].t_end_us
        const nextStart = visualOrAudioLayers[i + 1].t_start_us
        if (curEnd < nextStart) {
          allGaps.push({
            track_id: track.id,
            start_us: curEnd,
            end_us: nextStart,
            duration_us: nextStart - curEnd,
          })
        }
      }
    }

    tracks.push({
      track_id: track.id,
      kind: track.role ?? 'Video',
      label: track.label ?? null,
      layer_count: layerFacts.length,
      layers: layerFacts,
    })
  }

  // Analyze Cut Boundaries (on the primary visual track or track 0 video clips)
  const cutBoundaries: CutBoundaryFact[] = []
  const primaryTrack = comp.tracks[0]
  if (primaryTrack) {
    const videoLayers = primaryTrack.layers
      .filter((l) => l.params.kind === 'VideoClip')
      .sort((a, b) => a.t_start_us - b.t_start_us)

    for (let i = 0; i < videoLayers.length - 1; i++) {
      const outLayer = videoLayers[i]
      const inLayer = videoLayers[i + 1]

      const outParams = outLayer.params as any
      const inParams = inLayer.params as any
      const cutTimeUs = outLayer.t_end_us

      if (range) {
        if (cutTimeUs < range.start_us || cutTimeUs > range.end_us) {
          continue
        }
      }

      const hasGap = inLayer.t_start_us > outLayer.t_end_us
      const gapDur = Math.max(0, inLayer.t_start_us - outLayer.t_end_us)

      const isContinuous =
        outParams.media &&
        inParams.media &&
        outParams.media === inParams.media &&
        outParams.src_out_us === inParams.src_in_us

      let speechCues: SpeechCutCues | null = null
      if (outParams.media && inParams.media) {
        const outTranscript = getTranscript(outParams.media)
        const inTranscript = getTranscript(inParams.media)

        if (outTranscript || inTranscript) {
          const tail = extractSpeechCues(
            outTranscript,
            outParams.src_in_us ?? 0,
            outParams.src_out_us ?? 0,
            true,
            4,
          )
          const head = extractSpeechCues(
            inTranscript,
            inParams.src_in_us ?? 0,
            inParams.src_out_us ?? 0,
            false,
            4,
          )

          // Check if cut lands mid-word: if last word of outgoing straddles src_out_us
          // or first word of incoming straddles src_in_us (with 1-frame tolerance for video grid quantization)
          const FRAME_TOL_US = 40_000
          let isMidWord = false
          if (tail.words.length > 0) {
            const lastWord = tail.words[tail.words.length - 1]
            if (lastWord.t_start_us < (outParams.src_out_us ?? 0) - FRAME_TOL_US && lastWord.t_end_us > (outParams.src_out_us ?? 0) + FRAME_TOL_US) {
              isMidWord = true
            }
          }
          if (head.words.length > 0) {
            const firstWord = head.words[0]
            if (firstWord.t_start_us < (inParams.src_in_us ?? 0) - FRAME_TOL_US && firstWord.t_end_us > (inParams.src_in_us ?? 0) + FRAME_TOL_US) {
              isMidWord = true
            }
          }

          const jumpUs =
            outParams.media === inParams.media &&
            typeof inParams.src_in_us === 'number' &&
            typeof outParams.src_out_us === 'number'
              ? inParams.src_in_us - outParams.src_out_us
              : null

          speechCues = {
            outgoing_tail_text: tail.text,
            outgoing_tail_words: tail.words,
            incoming_head_text: head.text,
            incoming_head_words: head.words,
            is_mid_word: isMidWord,
            source_jump_us: jumpUs,
          }
        }
      }

      cutBoundaries.push({
        cut_index: i,
        timeline_t_us: cutTimeUs,
        has_gap: hasGap,
        gap_duration_us: gapDur,
        outgoing_clip: {
          layer_id: outLayer.id,
          media_id: outParams.media ?? null,
          media_label: project.media_pool[outParams.media]?.label ?? null,
          src_out_us: outParams.src_out_us ?? null,
          t_end_us: outLayer.t_end_us,
        },
        incoming_clip: {
          layer_id: inLayer.id,
          media_id: inParams.media ?? null,
          media_label: project.media_pool[inParams.media]?.label ?? null,
          src_in_us: inParams.src_in_us ?? null,
          t_start_us: inLayer.t_start_us,
        },
        is_continuous_source: isContinuous,
        speech_cues: speechCues,
      })
    }
  }

  // Transitions
  const transitions: TimelineTransitionFact[] = (comp.transitions || []).map((t) => ({
    id: t.id,
    from_layer: t.from_layer,
    to_layer: t.to_layer,
    duration_us: t.duration_us,
    kind: t.kind.kind,
  }))

  // Markers
  const markers: TimelineMarkerFact[] = (comp.markers || []).map((m) => ({
    id: m.id,
    t_us: m.t_us,
    label: m.label,
    note: m.note ?? null,
  }))

  return {
    version: 1,
    project_id: project.project_id,
    composition_id: comp.id,
    duration_us: comp.duration_us,
    resolution: {
      width: comp.width,
      height: comp.height,
    },
    fps: {
      num: comp.fps.num,
      den: comp.fps.den,
    },
    sample_rate: comp.sample_rate,
    total_tracks: comp.tracks.length,
    total_layers: totalLayers,
    tracks,
    gaps: allGaps,
    cut_boundaries: cutBoundaries,
    transitions,
    markers,
  }
}
