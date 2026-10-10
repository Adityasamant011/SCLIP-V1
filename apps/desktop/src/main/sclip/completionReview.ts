import type { Project } from '../state/model.js'
import { RevisionLoopGuard } from './revisionLoopGuard.js'
import { reviewState } from './evidenceCoordinates.js'

/** Host-scoped existing guards survive MCP transport reconnects. No creative state. */
export interface CompletionReview {
  baseline: string
  guard: RevisionLoopGuard
  started: boolean
  reviewedState?: string
  limitation?: string
  decision?: { action: string; reason?: string }
}
export function completionReview(project: Project, sessions: Map<string, CompletionReview>): CompletionReview {
  let entry = sessions.get(project.project_id)
  if (!entry) {
    if (sessions.size >= 8) {
      const expendable = [...sessions].find(([, r]) => !r.started || r.guard.status.phase === 'done')
      if (!expendable) throw new Error('Completion review capacity reached; finish the active reviews')
      sessions.delete(expendable[0])
    }
    entry = { baseline: outputState(project), guard: new RevisionLoopGuard(), started: false }
    sessions.set(project.project_id, entry)
  }
  return entry
}
export function hasAuthoredOutput(project: Project) {
  const comp = project.compositions[project.root_id]
  return !!comp && comp.duration_us > 0 && comp.tracks.some(t => t.enabled !== false && t.layers.some(l => l.enabled && l.t_end_us > l.t_start_us))
}

/** Imports, locks and labels alone do not change authored output. Guard freshness still uses full reviewState. */
export function outputState(project: Project): string {
  const used = new Set(Object.values(project.compositions).flatMap(c => c.tracks.flatMap(t => t.layers.flatMap(l => 'media' in l.params ? [l.params.media] : []))))
  return JSON.stringify({ compositions: project.compositions, settings: project.settings,
    media: Object.values(project.media_pool).filter(m => used.has(m.id)).map(m => ({id:m.id,hash:m.file_hash_blake3,metadata:m.metadata})) },
    (key, value) => ['label', 'locked', 'markers'].includes(key) ? undefined : value)
}
export function completionDisposition(project: Project, sessions: Map<string, CompletionReview>) {
  const entry = sessions.get(project.project_id)
  return entry?.reviewedState === reviewState(project) ? { status:'considered_in_completed_review',decision:entry.decision,outcomes:entry.guard.status.outcomes } : {status:'not_considered_in_this_state'}
}
