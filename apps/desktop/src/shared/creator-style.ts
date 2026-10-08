export type StyleScope = { kind: 'creator' } | { kind: 'series'; id: string } | { kind: 'project'; id: string }
export interface CreatorBinding { creatorId: string; seriesId?: string; learningEnabled?: boolean }
export interface CreatorIdentity { id: string; label: string; enabled: boolean }
export interface CreatorEvidence {
  id: string; creatorId: string; projectId: string; seriesId?: string; at: string
  kind: 'explicit_instruction' | 'correction' | 'manual_edit' | 'undo' | 'reference'
  authority: 'creator_statement' | 'ProjectActor' | 'source_metadata_and_local_observations'
  data: Record<string, unknown>
  scope?: StyleScope
  suppressed?: boolean
}
export interface CreatorPreference {
  id: string; creatorId: string; scope: StyleScope; dimension: string; hypothesis: string
  origin: 'explicit' | 'inferred'; status: 'active' | 'candidate' | 'disabled' | 'disputed'
  support: string[]; counterexamples: string[]; confidence: 'explicit' | 'tentative' | 'supported'
  firstObserved: string; updated: string
}
export interface CreatorStyleView {
  binding: CreatorBinding; creators: CreatorIdentity[]; preferences: CreatorPreference[]; evidence: CreatorEvidence[]
  context: string; generation: number
  captureWarning?: string
  referenceMedia?: Array<{ id: string; label: string }>
}
