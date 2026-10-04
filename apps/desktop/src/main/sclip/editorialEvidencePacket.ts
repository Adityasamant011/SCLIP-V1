import path from 'node:path'
import { currentVisualIndex } from './timelineVisualEvidence.js'
import { createHash } from 'node:crypto'
import type { Project } from '../state/model.js'
import { buildTimelineContext, loadTranscriptFromDir, type TimelineContextOptions } from './timelineContext.js'
import { validateTimelineRange, reviewState } from './evidenceCoordinates.js'
import { avRelationships } from './mediaRelationships.js'
import type { EvidenceDimension } from './evidenceModalities.js'

export const PACKET_LIMITS = { clips: 16, text: 12, relationships: 16, boundaries: 16, transitions: 8, bytes: 28000 } as const
export const PACKET_FIELD_CLASSES = { identity: 'PROVENANCE', project: 'STATE', tracks: 'STATE', clips: 'EVIDENCE', relationships: 'EVIDENCE', speech: 'EVIDENCE', text: 'EVIDENCE', technical: 'TECHNICAL INVARIANT', visuals: 'EVIDENCE', deeper_evidence: 'WORKFLOW', observed_dimensions: 'PROVENANCE', truncation: 'PROVENANCE' } as const
function compactTransform(t: any) {
  const value=(a:any)=>a?.mode==='Static' ? a.value : {mode:a?.mode,key_count:a?.keys?.length ?? null}
  return {position:t.position.mode==='XY' ? {mode:'XY',x:value(t.position.x),y:value(t.position.y)} : {mode:t.position.mode},scale_x:value(t.scale_x),scale_y:value(t.scale_y),rotation_deg:value(t.rotation_deg),anchor_x:value(t.anchor_x),anchor_y:value(t.anchor_y),scope:'Current static values or animation index; request get_param_track for full key/path data.'}
}
export function buildEditorialEvidencePacket(project: Project, options: TimelineContextOptions = {}, visuals?: unknown) {
  const id = options.compositionId ?? project.root_id, comp = project.compositions[id]
  if (!comp) throw new Error('Composition not found')
  const range=options.range ?? {start_us:0,end_us:comp.duration_us}
  if(comp.duration_us>0)validateTimelineRange(range.start_us,range.end_us,comp.duration_us,id)
  const allLayers=comp.tracks.flatMap(t=>t.layers),layers=allLayers.filter(l=>l.t_end_us>range.start_us&&l.t_start_us<range.end_us)
  const ctx = buildTimelineContext(project, options)
  const source = layers.filter(l => l.params.kind === 'VideoClip' || l.params.kind === 'Audio').sort((a,b) => a.t_start_us - b.t_start_us)
  const speech = source.slice(0, PACKET_LIMITS.clips).flatMap(l => {
    if (l.params.kind !== 'VideoClip' && l.params.kind !== 'Audio') return []
    const params=l.params
    const m = project.media_pool[params.media]
    const transcriptDir = options.transcriptsDir ?? process.env.SCLIP_TRANSCRIPTS_DIR ?? (m?.path_abs ? path.resolve(path.dirname(m.path_abs),'../Cache/transcripts') : undefined)
    const tr = options.transcriptLoader?.(params.media, m?.file_hash_blake3) ?? (transcriptDir && m?.file_hash_blake3 ? loadTranscriptFromDir(transcriptDir, m.file_hash_blake3) : null)
    if (!tr?.segments?.length) return []
    const words = tr.segments.flatMap(s => s.words ?? []).filter(w => w.t_end_us > params.src_in_us && w.t_start_us < params.src_out_us)
    const rate = params.kind === 'VideoClip' ? params.speed : 1
    return [{ layer_id: l.id, kind: params.kind, media_id: params.media, coordinate_space: 'source', evidence_class: 'MODEL_OBSERVATION', origin: 'cached_transcription', word_timing_available: !!words.length,
      selected_source_range_us: [params.src_in_us,params.src_out_us], selected_timeline_range_us: [l.t_start_us,l.t_end_us],
      text_excerpt: tr.segments.filter(s => s.t_end_us > params.src_in_us && s.t_start_us < params.src_out_us).map(s => s.text).join(' ').slice(0,180),
      boundary_words: [...words.slice(0,2),...words.slice(-2)].map(w => ({...w,mapped_timeline_start_us: l.t_start_us + (w.t_start_us-params.src_in_us)/rate,mapped_timeline_end_us:l.t_start_us+(w.t_end_us-params.src_in_us)/rate})),
      limitation: 'Transcribed word projection may extend outside the selected range; omitted portions are not heard/seen. No satisfaction verdict.' }]
  })
  const rel = avRelationships(project,id).filter(r=>r.timeline_overlap_us[1]>range.start_us&&r.timeline_overlap_us[0]<range.end_us), text = layers.filter(l => l.params.kind === 'Text')
  const visualIndex=visuals ?? currentVisualIndex(project)
  const observed: EvidenceDimension[] = ['timeline','text',...(visualIndex ? ['visual' as const] : []),...(speech.some(s => s.kind==='Audio' && s.word_timing_available) ? ['speech' as const] : [])]
  const packet = {
    identity: { project_id: project.project_id, composition_id: id, state_version: createHash('sha256').update(reviewState(project)).digest('hex'), coordinate_space: 'timeline', media_hashes:Object.fromEntries(source.slice(0,PACKET_LIMITS.clips).flatMap(l=>'media' in l.params ? [[l.params.media,project.media_pool[l.params.media]?.file_hash_blake3 ?? null]] : [])), evidence_class: 'AUTHORITATIVE_STATE' },
    project: { duration_us: comp.duration_us, width: comp.width, height: comp.height, fps: comp.fps, layer_count: allLayers.length, indexed_range_us:[range.start_us,range.end_us] },
    tracks: comp.tracks.slice(0,12).map(t => ({id:t.id, enabled:t.enabled, role:t.role, layers:t.layers.length})),
    clips: source.slice(0,PACKET_LIMITS.clips).map(l => ({ layer_id:l.id, kind:l.params.kind, timeline_range_us:[l.t_start_us,l.t_end_us], source_range_us:(l.params.kind==='VideoClip'||l.params.kind==='Audio') ? [l.params.src_in_us,l.params.src_out_us] : null, media_id:'media' in l.params ? l.params.media : null, ...(l.params.kind==='VideoClip'?{speed:l.params.speed,transform:compactTransform(l.params.transform)}: {}) })),
    relationships: rel.slice(0,PACKET_LIMITS.relationships), speech,
    text: text.slice(0,PACKET_LIMITS.text).map(l => ({ layer_id:l.id,timeline_range_us:[l.t_start_us,l.t_end_us],content:l.params.kind==='Text'?l.params.content.slice(0,100):'' })),
    technical: { interval_spacing: comp.tracks.flatMap(t => ['VideoClip','Audio'].flatMap(kind=>{const ordered=t.layers.filter(l=>l.enabled&&l.params.kind===kind).sort((a,b)=>a.t_start_us-b.t_start_us);return ordered.slice(1).map((l,i)=>({track_id:t.id,kind,previous_layer_id:ordered[i].id,current_layer_id:l.id,gap_us:Math.max(0,l.t_start_us-ordered[i].t_end_us),overlap_us:Math.max(0,ordered[i].t_end_us-l.t_start_us)}))})).slice(0,16), evidence_class:'DETERMINISTIC_MEASUREMENT', gaps:ctx.gaps.slice(0,16), boundaries:ctx.cut_boundaries.slice(0,PACKET_LIMITS.boundaries).map(b => ({timeline_t_us:b.timeline_t_us,has_gap:b.has_gap,is_continuous_source:b.is_continuous_source})),transitions:ctx.transitions.slice(0,PACKET_LIMITS.transitions) },
    visuals: visualIndex ?? { status:'not_observed', evidence_class:'MODEL_OBSERVATION', reason:'Initial index contains no rendered perception. Use bounded range inspection for targeted current visuals.' },
    deeper_evidence: { state_text_speech:'get_editorial_evidence_packet with start_us/end_us for targeted omitted sections', timeline:'get_timeline_context', visual:'inspect_timeline_range_visuals', source:'get_media_context / get_source_observations', audio:'render_timeline_range (inspect/listen to returned media)', parameters:'get_param_track', instruction:'This is a bounded observation index, not an editorial verdict. Choose any justified issue, repair, or no repair. Reacquire after a state change; expand omitted sections using existing tools.' },
    observed_dimensions: observed,
    truncation: { source_layers_total:source.length, text_layers_total:text.length, relationships_total:rel.length, limits:PACKET_LIMITS, size_limited:false },
  }
  // Bound pathological source labels/text/track counts as well as ordinary summaries.
  while (Buffer.byteLength(JSON.stringify(packet)) > PACKET_LIMITS.bytes && (packet.speech.length || packet.clips.length || packet.text.length || packet.relationships.length)) {
    packet.truncation.size_limited=true
    if(packet.speech.length) packet.speech.pop(); else if(packet.clips.length)packet.clips.pop(); else if(packet.text.length)packet.text.pop(); else packet.relationships.pop()
  }
  if (!packet.speech.some(s=>s.kind==='Audio' && s.word_timing_available)) packet.observed_dimensions=packet.observed_dimensions.filter(d=>d!=='speech')
  return packet
}
