import type { CreatorStyleStore } from './creatorStyle'

/** Fake foreground caller explicitly reads and submits current ownership/state.
 * Never use for stale-state tests, which must deliberately call agent directly. */
export function creatorAgent(store: CreatorStyleStore, project: string, args: Record<string, unknown>) {
  const context = store.agent(project, { action: 'context' })
  const preference = store.view(project).preferences.find(p => p.id === args.id)
  return store.agent(project, { creator_id: context.binding.creatorId, expected_revision: context.revision,
    ...(preference ? { expected_version: preference.version } : {}), ...args })
}

export function legacyFixture() {
  return { version: 1, generation: 7, creators: [{ id: 'local', label: 'Synthetic creator', enabled: true }], bindings: { first: { creatorId: 'local', seriesId: 'series-a' } },
    evidence: [{ id: 'statement', creatorId: 'local', projectId: 'first', at: '2026-01-01', kind: 'explicit_instruction', authority: 'creator_statement', scope: { kind: 'series', id: 'series-a' }, data: { quote: 'Keep synthetic natural pauses', approvalOf: 'preference' }, suppressed: true }],
    preferences: [{ id: 'preference', creatorId: 'local', scope: { kind: 'series', id: 'series-a' }, dimension: 'rhythm', hypothesis: 'Keep synthetic natural pauses', origin: 'inferred', status: 'disabled', confidence: 'explicit', support: ['statement'], counterexamples: [], firstObserved: '2026-01-01', updated: '2026-02-01' }], proposals: [] }
}
