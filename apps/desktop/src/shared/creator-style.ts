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
  suppressedBy?: string[]
  claims?: Array<{ preferenceId: string; version: number }>
}
export interface CreatorPreferenceVersion {
  version: number; hypothesis: string; dimension: string; scope: StyleScope
  support: string[]; counterexamples: string[]; updated: string
  applicability?: string; exceptionTo?: string
}
export interface CreatorPreference {
  id: string; creatorId: string; scope: StyleScope; dimension: string; hypothesis: string
  origin: 'explicit' | 'inferred'; status: 'active' | 'candidate' | 'disabled' | 'disputed' | 'superseded'
  support: string[]; counterexamples: string[]; confidence: 'explicit' | 'tentative' | 'supported'
  firstObserved: string; updated: string
  version?: number; approved?: boolean; history?: CreatorPreferenceVersion[]
  aliases?: string[]; lineageFilter?: string; applicability?: string; exceptionTo?: string
  supersededBy?: string; legacyConfidence?: string
}
export interface CreatorMemoryControl {
  id: string; creatorId: string; scope: StyleScope; kind: 'disabled' | 'forgotten'
  aliases: string[]; keyFilter: string; evidenceIds: string[]; at: string
}
export interface CreatorMemoryStats {
  admittedObservations: number; groupedOperations: number
  evictedObservations: number; evictedOperations: number; compactedObservations: number
}
export interface CreatorEvidenceCapsule {
  id: string; creatorId: string; preferenceId: string; version: number; scope: StyleScope
  role: 'support' | 'counterexample'; observations: number; operations: number
  projects: string[]; projectCountIsLowerBound: boolean; seenFilter: string
  samples: CreatorEvidence[]; firstObserved: string; lastObserved: string
  omittedSamples: number; countIsLowerBound: boolean
}
export interface CreatorStyleView {
  binding: CreatorBinding; creators: CreatorIdentity[]; preferences: CreatorPreference[]; evidence: CreatorEvidence[]
  context: string; generation: number
  captureWarning?: string
  revision?: number; capsules?: CreatorEvidenceCapsule[]; retention?: CreatorMemoryStats
  referenceMedia?: Array<{ id: string; label: string }>
}
