import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Project } from '../state/model.js'
import { inspectTimelineFrame } from './timelineFrame.js'
import { reviewState, validateTimelineRange } from './evidenceCoordinates.js'
import { getVisionRuntime, type AnalyzeResult } from './visionRuntime.js'

const perceptionCache = new Map<string, AnalyzeResult>()
const rangeIndex = new Map<string, {state:string; frames:unknown[]}>()
export function currentVisualIndex(project: Project) {
  const hit=rangeIndex.get(project.project_id)
  return hit?.state===reviewState(project) ? {status:'available', evidence_class:'MODEL_OBSERVATION', frame_observations:hit.frames.map((f:any)=>({...f,description:String(f.description).slice(0,320),visible_content:f.visible_content?.slice(0,8),approximate_subject_position:f.approximate_subject_position?.slice(0,80)})), temporal_scope:'Previously sampled instants in this exact current state only.'} : undefined
}
export const VISUAL_EVIDENCE_SEMANTICS = 'Canvas coverage is geometric only, not a subject/composition verdict. Wall, light or signage can cover the canvas. Describe visible content, approximate subject/face position and boundary intersections as observations, with uncertainty. Do not prescribe a crop or repair. One frame establishes only that instant; sampled frames do not certify unsampled moments.'
export function subjectObservations(result: AnalyzeResult) {
  return { availability: result.ok ? 'model_observation' : 'unavailable', subject_visible: result.subjectVisible ?? null, approximate_subject_position: result.subjectPosition ?? null,
    visible_content: result.visibleContent, confidence: result.confidence, bounding_regions: null,
    limitations: 'Model-derived, possibly incorrect. No calibrated face detector or face bounding box is available here. No aesthetic verdict or tracking is inferred.' }
}
export function representativeTimes(start: number, end: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 2 || count > 5) throw new Error('representative_samples must be an integer from 2 to 5')
  return [...new Set(Array.from({ length: count }, (_, i) => Math.round(start + (end - 1 - start) * i / (count - 1))))]
}
export async function inspectTimelineRangeVisuals(project: Project, args: Record<string, unknown>, getActiveWindow?: () => any | null, sampleTimes?: number[], signal?: AbortSignal) {
  const compositionId = String(args.composition_id ?? project.root_id)
  const comp = project.compositions[compositionId]
  if (!comp) throw new Error('Composition not found')
  validateTimelineRange(args.start_us, args.end_us, comp.duration_us, compositionId)
  const start = Number(args.start_us), end = Number(args.end_us)
  const times = sampleTimes ?? representativeTimes(start, end, Number(args.representative_samples ?? 5))
  if(times.length<2 || times.length>5 || times.some((t,i)=>!Number.isSafeInteger(t)||t<start||t>=end||i>0&&t<=times[i-1]))throw new Error('Invalid bounded chronological samples')
  signal?.throwIfAborted()
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-range-visuals-'))
  try {
    const frames = []
    const imagePaths: string[] = []
    for (const t of times) {
      signal?.throwIfAborted()
      const frame = await inspectTimelineFrame(project, { t_us: t, composition_id: compositionId, getActiveWindow, requireLiveCompositor: true })
      const file = path.join(temp, `${imagePaths.length}.png`)
      fs.writeFileSync(file, Buffer.from(frame.pngBase64, 'base64')); imagePaths.push(file)
      const sample: any = { sample_index: frames.length, coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', composition_id: compositionId, timeline_t_us: frame.t_us,
        composed_frame_facts: frame.factualEvidence,
        current_visual_state: comp.tracks.flatMap(track => track.layers).filter(l => l.t_start_us <= frame.t_us && frame.t_us < l.t_end_us && l.params.kind !== 'Audio').map(l => ({ layer_id: l.id, timeline_range_us: [l.t_start_us, l.t_end_us], params: l.params,
          ...(l.params.kind === 'VideoClip' ? { source_mapping: { media_id: l.params.media, source_t_us_estimate: l.params.src_in_us + (frame.t_us - l.t_start_us) * l.params.speed, coordinate_space: 'source', note: 'Original media mapping, not source pixels or proof of subject position.' } } : {}) })) }
      const audit = process.env.SCLIP_EVIDENCE_AUDIT_DIR
      if (audit) {
        fs.mkdirSync(audit, { recursive: true })
        const target = path.join(audit, `timeline-${frame.t_us}-${randomUUID()}.png`)
        fs.copyFileSync(file, target); fs.writeFileSync(`${target}.json`, JSON.stringify(sample)); sample.evidence_file = target
      }
      frames.push(sample)
    }
    const runtime=getVisionRuntime()
    const modelIdentity=typeof runtime.status==='function' ? (await runtime.status()).model : 'unknown'
    const observations = []
    for (let i=0;i<frames.length;i++) {
      signal?.throwIfAborted()
      const key=createHash('sha256').update(fs.readFileSync(imagePaths[i])).update(String(frames[i].timeline_t_us)).update(String(args.question ?? '')).update(modelIdentity).digest('hex')
      const result = perceptionCache.get(key) ?? await getVisionRuntime().analyze({ imagePaths: [imagePaths[i]],
        question: `Describe only this frame's visible content, approximate subject/face position and boundary intersections. Report uncertainty; do not assess the whole range. ${typeof args.question === 'string' ? args.question : ''}`,
        context: `${VISUAL_EVIDENCE_SEMANTICS} This is sample ${i} at timeline ${frames[i].timeline_t_us}us.`, resolution:'high', maxTokens:160 })
      if(result.ok) { perceptionCache.set(key,result); if(perceptionCache.size>16)perceptionCache.delete(perceptionCache.keys().next().value!) }
      observations.push({sample_index:i,timeline_t_us:frames[i].timeline_t_us,evidence_class:'MODEL_OBSERVATION',description:result.description,...subjectObservations(result),model:result.model,inference_ok:result.ok})
    }
    signal?.throwIfAborted()
    const evidence = { coordinate_space:'timeline', evidence_origin:'CURRENT_TIMELINE', composition_id:compositionId, timeline_range_us:[start,end], representative_samples:frames,
      frame_observations:observations,
      visual_observations:{ description:observations.map(o=>`Sample ${o.sample_index}: ${o.description}`).join('\n'), summary_scope:'Labelled individual observations, not a unanimous/global claim.' },
      temporal_scope:'Representative samples only; changes between unsampled frames remain unknown.', semantics:VISUAL_EVIDENCE_SEMANTICS }
    rangeIndex.set(project.project_id,{state:reviewState(project),frames:observations}); if(rangeIndex.size>4)rangeIndex.delete(rangeIndex.keys().next().value!)
    if (process.env.SCLIP_EVIDENCE_AUDIT_DIR) fs.writeFileSync(path.join(process.env.SCLIP_EVIDENCE_AUDIT_DIR, `range-observations-${randomUUID()}.json`), JSON.stringify(evidence))
    return evidence
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
}
