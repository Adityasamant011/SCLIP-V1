import type { Project } from '../state/model.js'

export class EvidenceCoordinateError extends Error {
  constructor(readonly details: Record<string, unknown>) { super(JSON.stringify(details)) }
}

export function validateEvidenceTime(space: 'timeline' | 'source', requested: unknown, duration: number, ids: Record<string, unknown> = {}) {
  if (!Number.isSafeInteger(requested) || Number(requested) < 0 || Number(requested) >= duration) {
    throw new EvidenceCoordinateError({ code: 'INVALID_EVIDENCE_COORDINATE', coordinate_space: space,
      requested_t_us: requested, duration_us: duration, valid_range_us: [0, duration], end_exclusive: true, ...ids,
      correction: space === 'timeline' ? 'Use edited composition time. Source frames require vision_inspect({media_id, source_t_us, question}); map through current clip timeline/source bounds explicitly.' : 'Use original media time with media_id, not composition time.' })
  }
  return Number(requested)
}

export function timelineTime(args: Record<string, unknown>): number | undefined {
  if (args.timeline_t_us !== undefined && args.t_us !== undefined && args.timeline_t_us !== args.t_us) {
    throw new EvidenceCoordinateError({ code: 'CONFLICTING_TIME_ARGUMENTS', coordinate_space: 'timeline', correction: 'timeline_t_us and legacy t_us must agree.' })
  }
  const value = args.timeline_t_us ?? args.t_us
  if (value === undefined || value === null) return undefined
  if (!Number.isSafeInteger(value)) throw new EvidenceCoordinateError({ code: 'INVALID_EVIDENCE_COORDINATE', coordinate_space: 'timeline', requested_t_us: value, correction: 'Use integer timeline microseconds.' })
  return Number(value)
}

/** Ignore background proxy/cache bookkeeping; preserve every editorial state change. */
export function reviewState(project: Project | undefined): string {
  return JSON.stringify(project && { project_id: project.project_id, root_id: project.root_id,
    compositions: project.compositions, settings: project.settings, media: Object.values(project.media_pool).map(m => ({ id: m.id, file_hash: m.file_hash_blake3, duration_us: m.metadata.duration_us })) })
}

export function validateTimelineRange(start: unknown, end: unknown, duration: number, compositionId: string) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || Number(start) < 0 || Number(end) <= Number(start) || Number(end) > duration) {
    throw new EvidenceCoordinateError({ code: 'INVALID_EVIDENCE_COORDINATE', coordinate_space: 'timeline', requested_range_us: [start, end], duration_us: duration, valid_range_us: [0, duration], composition_id: compositionId, correction: 'Use current edited-composition bounds, not source-media bounds.' })
  }
}
