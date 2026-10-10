import { createHash } from 'node:crypto'
import type { Project } from '../../state/model.js'
import { reviewState } from '../evidenceCoordinates.js'
import type { TimelineReviewSummary } from './reviewerTypes.js'

/** Never re-label old/unknown findings as CURRENT_TIMELINE evidence. */
export function currentCritique(project: Project, read?: (immediate?: boolean) => TimelineReviewSummary) {
  const state_version = createHash('sha256').update(reviewState(project)).digest('hex')
  const identity = { project_id: project.project_id, composition_id: project.root_id, state_version, coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE' }
  let summary: TimelineReviewSummary | undefined
  try { summary = read?.(true) } catch { /* Unavailable is not clean. */ }
  const valid = summary?.project_id === project.project_id && summary?.state_version === state_version && summary?.availability === 'available'
  const issues = valid ? summary!.issues.slice(0, 12).map(i => ({ ...i, description: i.description.slice(0, 900), suggested_action: i.suggested_action.slice(0, 600) })) : []
  return { ...identity, availability: valid ? 'available' : summary ? 'stale_or_unavailable' : 'not_generated',
    commit_id: valid ? summary!.commit_id : '', updated_at: valid ? summary!.updated_at : null,
    critical_count: valid ? summary!.critical_count : 0, warning_count: valid ? summary!.warning_count : 0, suggestion_count: valid ? summary!.suggestion_count : 0,
    status: valid ? summary!.status : 'not_reviewed', issues, total_issues: valid ? summary!.total_issues : null,
    omitted_issues: valid ? Math.max(0, summary!.total_issues - issues.length) : 0,
    optional_observations: summary?.optional_observations,
    coverage: valid ? summary!.coverage : 'No current reviewer evidence available',
    scope: 'Fallible diagnostics, not certified defects or editorial readiness. Obtain relevant rendered evidence; Hermes decides repair, intentional choice, or unresolved limitation.' }
}
