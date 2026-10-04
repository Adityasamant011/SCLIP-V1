import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Project } from '../state/model.js'
import { inspectTimelineFrame } from './timelineFrame.js'
import { validateTimelineRange } from './evidenceCoordinates.js'
import { getVisionRuntime, type AnalyzeResult } from './visionRuntime.js'

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
export async function inspectTimelineRangeVisuals(project: Project, args: Record<string, unknown>, getActiveWindow?: () => any | null) {
  const compositionId = String(args.composition_id ?? project.root_id)
  const comp = project.compositions[compositionId]
  if (!comp) throw new Error('Composition not found')
  validateTimelineRange(args.start_us, args.end_us, comp.duration_us, compositionId)
  const start = Number(args.start_us), end = Number(args.end_us)
  const times = representativeTimes(start, end, Number(args.representative_samples ?? 5))
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-range-visuals-'))
  try {
    const frames = []
    const imagePaths: string[] = []
    for (const t of times) {
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
    const result = await getVisionRuntime().analyze({ imagePaths,
      question: typeof args.question === 'string' && args.question.trim() ? args.question : 'Describe each ordered sample: visible content, subject/face position, body or face intersecting image boundaries, obscuring elements and major changes between samples. Report uncertainty.',
      context: `${VISUAL_EVIDENCE_SEMANTICS} Images are ordered samples: ${frames.map(f => `sample ${f.sample_index} at timeline ${f.timeline_t_us}us`).join(', ')}. Explain changes by sample; do not generalize the first sample across the range.`, resolution: 'high', maxTokens: 384 })
    if (!result.ok) throw new Error(result.error ?? 'Local visual inference failed; no range observations generated')
    const evidence = { coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', composition_id: compositionId, timeline_range_us: [start, end], representative_samples: frames,
      visual_observations: { description: result.description, ...subjectObservations(result), model: result.model, input_frames: frames.length, inference_ok: result.ok, error: result.error },
      temporal_scope: 'Representative samples only; changes between unsampled frames remain unknown.', semantics: VISUAL_EVIDENCE_SEMANTICS }
    if (process.env.SCLIP_EVIDENCE_AUDIT_DIR) fs.writeFileSync(path.join(process.env.SCLIP_EVIDENCE_AUDIT_DIR, `range-observations-${randomUUID()}.json`), JSON.stringify(evidence))
    return evidence
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
}
