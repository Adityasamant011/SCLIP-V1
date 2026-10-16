/** Local observations only: these are never completion receipts or edit commands. */
export interface LiveFeedbackObservation {
  timeline_range_us: [number, number]
  visual: { status: string; t_us?: number; description?: string; model?: string; truncated?: boolean | null; facts?: unknown; reason?: string }
  audio: { status: string; signal?: { rms: number; peak: number; clipping_sample_count: number; silence_spans_us: number[][] }; understanding?: unknown; reason?: string }
  limitations: string
  provider_calls: 0
}
export interface LiveFeedbackSnapshot {
  enabled: boolean
  project_id: string
  state_version: string
  epoch: number
  status: 'waiting' | 'observing' | 'available' | 'deferred' | 'disabled' | 'unavailable'
  updated_at: number
  observation?: LiveFeedbackObservation
  reason?: string
}

export function compactAudioUnderstanding(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const data = value as { status?: string; windows?: Array<{ language?: string; emotion?: string; event?: string; transcript?: string }> }
  return { status: data.status, observations: (Array.isArray(data.windows) ? data.windows : []).slice(0, 1).filter(w => w && typeof w === 'object').map(w => ({ language: w.language, emotion: w.emotion, event: w.event, transcript: typeof w.transcript === 'string' ? w.transcript.slice(0, 220) : undefined, confidence: null })) }
}
