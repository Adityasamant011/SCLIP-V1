export type ExternalMediaType = 'video' | 'image'

export type ExternalMediaProviderName =
  | 'youtube'
  | 'wikimedia'
  | 'openverse'
  | 'pexels'
  | 'pixabay'

export type RightsStatus =
  | 'PROVIDER_LICENSE_ELIGIBLE'
  | 'OPEN_LICENSE_VERIFIED'
  | 'OPEN_LICENSE_ATTRIBUTION_REQUIRED'
  | 'SHAREALIKE_REVIEW_REQUIRED'
  | 'DISCOVERY_CC_CLAIMED'
  | 'RIGHTS_UNVERIFIED'
  | 'BLOCKED'

export type ImportMode =
  | 'AUTO_IMPORT'
  | 'APPROVAL_REQUIRED'
  | 'USER_IMPORT'
  | 'DISCOVERY_ONLY'

export interface VisualIntent {
  purpose?: 'visual_proof' | 'cutaway' | 'explanation' | 'atmosphere' | 'reference' | string
  subject?: string
  action?: string
  event?: string
  location?: string
  time_context?: string
  specificity?: 'exact' | 'specific' | 'generic'
  authenticity?: 'required' | 'preferred' | 'unnecessary'
  media_preference?: 'video' | 'image' | 'either'
  duration_needed_us?: number
  search_terms?: string[]
}

export interface BatchVisualIntentItem extends VisualIntent {
  intent_id?: string
  timeline_start_us?: number
  timeline_end_us?: number
}

export interface VisualCandidateJudgment {
  candidate_id: string
  candidate_num?: number
  visual_relevance: 'strong' | 'medium' | 'weak' | 'reject'
  specificity: 'exact' | 'related' | 'generic' | 'wrong'
  authenticity: 'authentic' | 'likely_authentic' | 'illustrative'
  quality: 'good' | 'usable' | 'poor'
  reason: string
  rank?: number
}

export interface RankedVisualCandidate {
  candidate: ExternalMediaCandidate
  judgment?: VisualCandidateJudgment
  stage: 'stage_1_metadata' | 'stage_2_keyframes'
  composite_score?: number
}

export interface BatchVisualIntentResult {
  intent_id: string
  subject: string
  timeline_start_us?: number
  timeline_end_us?: number
  media_preference: 'video' | 'image' | 'either'
  candidates_found: number
  candidates_evaluated: number
  ranked_candidates: RankedVisualCandidate[]
  editorial_summary: string
  error?: string | null
}

export interface ResolveVisualIntentsTelemetry {
  providers_queried: number
  raw_candidates_found: number
  candidates_after_cheap_filter: number
  qwen_inference_calls: number
  cache_hits: number
}

export interface ResolveVisualIntentsResponse {
  success: boolean
  intents: BatchVisualIntentResult[]
  total_wall_clock_ms: number
  hermes_compact_summary: string
  telemetry: ResolveVisualIntentsTelemetry
}

export const CONCURRENCY_LIMITS = {
  MAX_CONCURRENT_API_SEARCHES: 6,
  MAX_CONCURRENT_THUMBNAIL_FETCHES: 6,
  MAX_CONCURRENT_MEDIA_DOWNLOADS: 2,
  MAX_CONCURRENT_FFMPEG_JOBS: 2,
  MAX_CONCURRENT_QWEN_INFERENCE: 1,
} as const

export interface ExternalMediaCandidate {
  candidate_id: string
  provider: ExternalMediaProviderName
  provider_asset_id: string
  media_type: ExternalMediaType
  title: string
  description?: string
  thumbnail_url: string
  preview_url?: string
  source_page_url: string
  direct_media_url?: string
  creator?: string
  origin_domain?: string
  width?: number
  height?: number
  duration?: number // seconds
  fps?: number
  orientation?: 'landscape' | 'portrait' | 'square'
  query_used: string
  rights_status: RightsStatus
  import_mode: ImportMode
  license?: string
  license_url?: string
  attribution?: string
  attribution_required: boolean
  published_at?: string
  metadata?: Record<string, unknown>
}

export interface ExternalMediaSearchOptions {
  query: string
  media_type?: 'video' | 'image' | 'either'
  provider?: 'auto' | ExternalMediaProviderName
  limit?: number
  orientation?: 'landscape' | 'portrait' | 'square'
  visual_intent?: VisualIntent
  project_id?: string
}

export interface ExternalMediaSearchResult {
  success: boolean
  query: string
  total_found: number
  returned_count: number
  providers_queried: ExternalMediaProviderName[]
  candidates: ExternalMediaCandidate[]
  workflow_guidance: string
  search_status?: 'OK' | 'PARTIAL' | 'EXHAUSTED' | 'NO_RESULTS' | 'ERROR'
  provider_outcomes?: Array<{
    provider: ExternalMediaProviderName
    count: number
    error: string | null
  }>
  progress?: {
    new_candidate_count: number
    consecutive_no_progress: number
    action: 'continue' | 'change_strategy' | 'skip'
  }
}

export interface ExternalMediaProvider {
  readonly name: ExternalMediaProviderName
  readonly displayName: string
  search(options: ExternalMediaSearchOptions): Promise<ExternalMediaCandidate[]>
}

