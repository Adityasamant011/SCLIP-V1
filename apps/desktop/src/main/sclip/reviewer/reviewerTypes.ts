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
}

export interface TimelineReviewSummary {
  commit_id: string
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
