/**
 * Types and contracts for the Sclip Background AI Reviewer.
 */

export type CritiqueSeverity = 'critical' | 'warning' | 'suggestion'

export type CritiqueCategory =
  | 'visual_framing'
  | 'caption_placement'
  | 'motif_collision'
  | 'audio_cutoff'
  | 'music_sync'
  | 'pacing'
  | 'continuity'
  | 'energy_mismatch'
  | 'visual_mismatch'
  | 'lip_sync'

export interface TimelineCritiqueIssue {
  id: string
  severity: CritiqueSeverity
  category: CritiqueCategory
  t_us: number
  affected_range_us?: [number, number]
  layer_id?: string
  description: string
  suggested_action: string
  project_id?: string
  composition_id?: string
  state_version?: string
  coordinate_space?: 'timeline'
  evidence_class?: 'DETERMINISTIC_MEASUREMENT' | 'MODEL_OBSERVATION'
  requires_inspection?: boolean
  uncertainty?: string
  evidence_basis?: string
}

export interface TimelineReviewSummary {
  live_feedback?: import('../../../shared/liveFeedback').LiveFeedbackSnapshot
  commit_id: string
  project_id?: string
  composition_id?: string
  state_version?: string
  availability?: 'available' | 'unavailable' | 'stale'
  readiness?: 'not_certified'
  coverage?: string
  optional_observations?: 'canceled' | 'timed_out'
  status: 'clean' | 'has_issues' | 'in_progress'
  updated_at: number
  total_issues: number
  critical_count: number
  warning_count: number
  suggestion_count: number
  issues: TimelineCritiqueIssue[]
}

export interface ReviewJob {
  id: string
  commit_id: string
  t_start_us: number
  t_end_us: number
  created_at: number
  stale: boolean
}
