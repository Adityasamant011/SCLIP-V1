import type { Composition } from '../state/model.js'

/** Debug record supplied by Hermes or a benchmark harness; never project state. */
export interface EditorialRevisionAttempt {
  version: 1
  composition_id: string
  issue_id: string
  /** One successful timeline-mutating tool call; rollback never resets this ordinal. */
  attempt: number
  checkpoint_id: string
  problem: {
    timeline_range_us: [number, number]
    description: string
  }
  action: {
    tool: string
    target_layer_ids: string[]
    summary: string
  }
  before_inspection: { evidence: string }
  after_inspection: {
    evidence: string
    assessment: 'resolved' | 'improved_but_unresolved' | 'worse' | 'unchanged'
  }
}

export const MAX_REVISION_ATTEMPTS_PER_ISSUE = 3

/** Checks only physical references against the pre-edit composition and the runaway-work limit. */
export function validateEditorialRevisionAttempt(
  attempt: EditorialRevisionAttempt,
  composition: Composition,
): string[] {
  const errors: string[] = []
  if (attempt.version !== 1) errors.push('unsupported version')
  if (attempt.composition_id !== composition.id) errors.push('composition mismatch')
  if (!attempt.issue_id?.trim()) errors.push('missing issue_id')
  if (!Number.isInteger(attempt.attempt) || attempt.attempt < 1 || attempt.attempt > MAX_REVISION_ATTEMPTS_PER_ISSUE) {
    errors.push('attempt must be between 1 and 3')
  }
  if (!attempt.checkpoint_id?.trim()) errors.push('missing checkpoint_id')
  const range = attempt.problem?.timeline_range_us
  if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger)
    || range[0] < 0 || range[1] < range[0] || range[1] > composition.duration_us) {
    errors.push('problem range outside composition')
  }
  if (!attempt.problem?.description?.trim()) errors.push('missing problem description')
  if (!attempt.action?.tool?.trim() || !attempt.action?.summary?.trim()) errors.push('missing action metadata')
  const ids = new Set(composition.tracks.flatMap((track) => track.layers.map((layer) => layer.id)))
  if (!Array.isArray(attempt.action?.target_layer_ids) || attempt.action.target_layer_ids.length === 0
    || attempt.action.target_layer_ids.some((id) => !ids.has(id))) {
    errors.push('target layer does not exist in composition')
  }
  if (!attempt.before_inspection?.evidence?.trim()) errors.push('missing before evidence')
  if (!attempt.after_inspection?.evidence?.trim()) errors.push('missing after evidence')
  if (!['resolved', 'improved_but_unresolved', 'worse', 'unchanged'].includes(attempt.after_inspection?.assessment)) {
    errors.push('invalid assessment')
  }
  return errors
}
