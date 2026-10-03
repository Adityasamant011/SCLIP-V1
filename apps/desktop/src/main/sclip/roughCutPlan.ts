/**
 * SCLIP Phase 2B — Structured RoughCutPlan Schema & Deterministic Validator
 *
 * Provides a canonical representation and deterministic validation for editorial
 * rough-cut plans. The validator verifies mechanical validity (timestamps,
 * durations, media boundaries, absence of duplicate spans) without imposing
 * creative or subjective scoring heuristics.
 */

export interface RoughCutBrief {
  goal: string
  audience: string
  target_duration_us: number
  tone: string[]
}

export type RoughCutClipAction = 'keep' | 'reorder'

export interface RoughCutClip {
  media_id: string
  source_start_us: number
  source_end_us: number
  action: RoughCutClipAction
  reason: string
}

export interface RoughCutSection {
  id: string
  purpose: string
  clips: RoughCutClip[]
}

export interface RemovedRange {
  media_id: string
  source_start_us: number
  source_end_us: number
  reason: string
}

export interface RoughCutPlan {
  version: 1
  brief: RoughCutBrief
  source_summary: string
  editorial_thesis: string
  sections: RoughCutSection[]
  removed_ranges: RemovedRange[]
  estimated_duration_us: number
  uncertainties: string[]
}

/** Model-facing plans may omit redundant duration arithmetic; execution derives it
 * from the validated source intervals. Persisted/fully-authored plans may include it. */
export type RoughCutPlanInput = Omit<RoughCutPlan, 'estimated_duration_us'> & {
  estimated_duration_us?: number
}

const PLAN_TEXT = { type: 'string', minLength: 1 }
const SOURCE_RANGE_PROPERTIES = {
  media_id: { ...PLAN_TEXT, description: 'Existing media-pool ID, not a filename.' },
  source_start_us: { type: 'number', minimum: 0, description: 'Source start in microseconds.' },
  source_end_us: { type: 'number', minimum: 0, description: 'Source end in microseconds; greater than start and within media duration.' },
}

/** Model-facing contract shared by apply/validate. Types are erased by TS;
 * explicitly publish their nested shape without changing runtime validation.
 * Keep inline (no external $refs) for deferred MCP schema disclosure. */
export const ROUGH_CUT_PLAN_INPUT_SCHEMA = {
  type: ['object', 'string'],
  description: 'Prefer a plan object; a JSON string encoding the same object is also accepted. For mechanical assembly, metadata describes already-made decisions; do not invent a new story. source_summary and editorial_thesis belong at PLAN TOP LEVEL, not inside brief. estimated_duration_us is optional: when omitted, Sclip derives it from validated clip intervals. Use empty removed_ranges/uncertainties arrays when none.',
  properties: {
    version: { type: 'integer', enum: [1] },
    brief: {
      type: 'object',
      properties: {
        goal: PLAN_TEXT,
        audience: PLAN_TEXT,
        target_duration_us: { type: 'number', exclusiveMinimum: 0, description: 'Requested duration in microseconds; for decided assembly use the sum of the chosen ranges.' },
        tone: { type: 'array', minItems: 1, items: PLAN_TEXT },
      },
      required: ['goal', 'audience', 'target_duration_us', 'tone'],
    },
    source_summary: PLAN_TEXT,
    editorial_thesis: PLAN_TEXT,
    sections: {
      type: 'array', minItems: 1,
      description: 'Placement order is array order: sections in order, then each section\'s clips in order. One section is enough for an already-decided list; at least one clip overall.',
      items: {
        type: 'object',
        properties: {
          id: { ...PLAN_TEXT, description: 'Unique section label.' },
          purpose: PLAN_TEXT,
          clips: {
            type: 'array',
            items: {
              type: 'object',
              properties: { ...SOURCE_RANGE_PROPERTIES, action: { type: 'string', enum: ['keep', 'reorder'] }, reason: PLAN_TEXT },
              required: ['media_id', 'source_start_us', 'source_end_us', 'action', 'reason'],
            },
          },
        },
        required: ['id', 'purpose', 'clips'],
      },
    },
    removed_ranges: {
      type: 'array',
      items: { type: 'object', properties: { ...SOURCE_RANGE_PROPERTIES, reason: PLAN_TEXT },
        required: ['media_id', 'source_start_us', 'source_end_us', 'reason'] },
    },
    estimated_duration_us: { type: 'number', minimum: 0, description: 'Optional exact sum of every chosen source_end_us - source_start_us, BEFORE frame snapping, in microseconds. Omit if not calculated; if supplied, it must match within 1000us.' },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['version', 'brief', 'source_summary', 'editorial_thesis', 'sections', 'removed_ranges', 'uncertainties'],
} as const

export interface ValidationResult {
  valid: boolean
  errors: string[]
  calculated_duration_us: number
  clip_count: number
  removed_count: number
}

/**
 * Validates a RoughCutPlan deterministically against mechanical invariants.
 *
 * Strictly evaluates structure, physical timestamp constraints, and duration
 * calculations. Does NOT pass creative judgment on narrative quality.
 */
export function validateRoughCutPlan(
  raw: unknown,
  mediaPool?: Record<string, { duration_us?: number; metadata?: { duration_us?: number | null } }>
): ValidationResult {
  const errors: string[] = []
  let calculated_duration_us = 0
  let clip_count = 0
  let removed_count = 0

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: ['Plan must be a non-null object'],
      calculated_duration_us: 0,
      clip_count: 0,
      removed_count: 0,
    }
  }

  const plan = raw as Partial<RoughCutPlan>

  // Version check
  if (plan.version !== 1) {
    errors.push(`Unsupported plan version: expected 1, got ${plan.version}`)
  }

  // Brief validation
  if (!plan.brief || typeof plan.brief !== 'object') {
    errors.push('Missing or invalid "brief" object')
  } else {
    if (!plan.brief.goal || typeof plan.brief.goal !== 'string' || !plan.brief.goal.trim()) {
      errors.push('brief.goal must be a non-empty string')
    }
    if (!plan.brief.audience || typeof plan.brief.audience !== 'string' || !plan.brief.audience.trim()) {
      errors.push('brief.audience must be a non-empty string')
    }
    if (
      typeof plan.brief.target_duration_us !== 'number' ||
      !Number.isFinite(plan.brief.target_duration_us) ||
      plan.brief.target_duration_us <= 0
    ) {
      errors.push('brief.target_duration_us must be a positive finite number')
    }
    if (!Array.isArray(plan.brief.tone) || plan.brief.tone.length === 0) {
      errors.push('brief.tone must be a non-empty array of tone descriptors')
    }
  }

  // Editorial thesis & summary
  if (!plan.source_summary || typeof plan.source_summary !== 'string' || !plan.source_summary.trim()) {
    errors.push('source_summary must be a non-empty string')
  }
  if (!plan.editorial_thesis || typeof plan.editorial_thesis !== 'string' || !plan.editorial_thesis.trim()) {
    errors.push('editorial_thesis must be a non-empty string')
  }

  // Sections validation
  if (!Array.isArray(plan.sections) || plan.sections.length === 0) {
    errors.push('sections must be a non-empty array of RoughCutSection')
  } else {
    const sectionIds = new Set<string>()
    const spanKeys = new Set<string>()

    for (let sIdx = 0; sIdx < plan.sections.length; sIdx++) {
      const sec = plan.sections[sIdx]
      if (!sec || typeof sec !== 'object') {
        errors.push(`sections[${sIdx}] must be an object`)
        continue
      }

      if (!sec.id || typeof sec.id !== 'string' || !sec.id.trim()) {
        errors.push(`sections[${sIdx}].id must be a non-empty string`)
      } else if (sectionIds.has(sec.id)) {
        errors.push(`Duplicate section id "${sec.id}" at index ${sIdx}`)
      } else {
        sectionIds.add(sec.id)
      }

      if (!sec.purpose || typeof sec.purpose !== 'string' || !sec.purpose.trim()) {
        errors.push(`sections[${sIdx}].purpose must be a non-empty string`)
      }

      if (!Array.isArray(sec.clips)) {
        errors.push(`sections[${sIdx}].clips must be an array`)
        continue
      }

      for (let cIdx = 0; cIdx < sec.clips.length; cIdx++) {
        const clip = sec.clips[cIdx]
        clip_count++

        if (!clip || typeof clip !== 'object') {
          errors.push(`sections[${sIdx}].clips[${cIdx}] must be an object`)
          continue
        }

        if (!clip.media_id || typeof clip.media_id !== 'string' || !clip.media_id.trim()) {
          errors.push(`sections[${sIdx}].clips[${cIdx}].media_id must be a non-empty string`)
        } else if (mediaPool && !mediaPool[clip.media_id]) {
          errors.push(`sections[${sIdx}].clips[${cIdx}].media_id "${clip.media_id}" does not exist in media pool`)
        }

        const startUs = clip.source_start_us
        const endUs = clip.source_end_us

        if (typeof startUs !== 'number' || !Number.isFinite(startUs) || startUs < 0) {
          errors.push(`sections[${sIdx}].clips[${cIdx}].source_start_us must be a non-negative finite number`)
        }
        if (typeof endUs !== 'number' || !Number.isFinite(endUs) || endUs < 0) {
          errors.push(`sections[${sIdx}].clips[${cIdx}].source_end_us must be a non-negative finite number`)
        }

        if (typeof startUs === 'number' && typeof endUs === 'number' && Number.isFinite(startUs) && Number.isFinite(endUs)) {
          if (startUs >= endUs) {
            errors.push(`sections[${sIdx}].clips[${cIdx}]: source_start_us (${startUs}) must be strictly less than source_end_us (${endUs})`)
          } else {
            const clipDuration = endUs - startUs
            calculated_duration_us += clipDuration

            if (mediaPool && clip.media_id && mediaPool[clip.media_id]) {
              const item = mediaPool[clip.media_id]
              const mediaDuration = (item as any).duration_us ?? item.metadata?.duration_us
              if (typeof mediaDuration === 'number' && mediaDuration > 0 && endUs > mediaDuration) {
                errors.push(`sections[${sIdx}].clips[${cIdx}]: source_end_us (${endUs}) exceeds media duration (${mediaDuration})`)
              }
            }

            const spanKey = `${clip.media_id}:${startUs}:${endUs}`
            if (spanKeys.has(spanKey)) {
              errors.push(`sections[${sIdx}].clips[${cIdx}]: duplicate exact clip span [${startUs}, ${endUs}] for media "${clip.media_id}"`)
            } else {
              spanKeys.add(spanKey)
            }
          }
        }

        if (clip.action !== 'keep' && clip.action !== 'reorder') {
          errors.push(`sections[${sIdx}].clips[${cIdx}].action must be "keep" or "reorder", got "${clip.action}"`)
        }

        if (!clip.reason || typeof clip.reason !== 'string' || !clip.reason.trim()) {
          errors.push(`sections[${sIdx}].clips[${cIdx}].reason must be a non-empty string`)
        }
      }
    }
  }

  if (clip_count === 0) {
    errors.push('Plan must contain at least one kept clip')
  }

  // Removed ranges validation
  if (!Array.isArray(plan.removed_ranges)) {
    errors.push('removed_ranges must be an array')
  } else {
    removed_count = plan.removed_ranges.length
    for (let rIdx = 0; rIdx < plan.removed_ranges.length; rIdx++) {
      const rem = plan.removed_ranges[rIdx]
      if (!rem || typeof rem !== 'object') {
        errors.push(`removed_ranges[${rIdx}] must be an object`)
        continue
      }

      if (!rem.media_id || typeof rem.media_id !== 'string' || !rem.media_id.trim()) {
        errors.push(`removed_ranges[${rIdx}].media_id must be a non-empty string`)
      } else if (mediaPool && !mediaPool[rem.media_id]) {
        errors.push(`removed_ranges[${rIdx}].media_id "${rem.media_id}" does not exist in media pool`)
      }

      const startUs = rem.source_start_us
      const endUs = rem.source_end_us

      if (typeof startUs !== 'number' || !Number.isFinite(startUs) || startUs < 0) {
        errors.push(`removed_ranges[${rIdx}].source_start_us must be a non-negative finite number`)
      }
      if (typeof endUs !== 'number' || !Number.isFinite(endUs) || endUs < 0) {
        errors.push(`removed_ranges[${rIdx}].source_end_us must be a non-negative finite number`)
      }

      if (typeof startUs === 'number' && typeof endUs === 'number' && Number.isFinite(startUs) && Number.isFinite(endUs)) {
        if (startUs >= endUs) {
          errors.push(`removed_ranges[${rIdx}]: source_start_us (${startUs}) must be strictly less than source_end_us (${endUs})`)
        } else if (mediaPool && rem.media_id && mediaPool[rem.media_id]) {
          const item = mediaPool[rem.media_id]
          const mediaDuration = (item as any).duration_us ?? item.metadata?.duration_us
          if (typeof mediaDuration === 'number' && mediaDuration > 0 && endUs > mediaDuration) {
            errors.push(`removed_ranges[${rIdx}]: source_end_us (${endUs}) exceeds media duration (${mediaDuration})`)
          }
        }
      }

      if (!rem.reason || typeof rem.reason !== 'string' || !rem.reason.trim()) {
        errors.push(`removed_ranges[${rIdx}].reason must be a non-empty string`)
      }
    }
  }

  // Duration check
  if (plan.estimated_duration_us !== undefined) {
    if (
      typeof plan.estimated_duration_us !== 'number' ||
      !Number.isFinite(plan.estimated_duration_us) ||
      plan.estimated_duration_us < 0
    ) {
      errors.push('estimated_duration_us must be a non-negative finite number when supplied')
    } else if (Math.abs(plan.estimated_duration_us - calculated_duration_us) > 1000) {
      errors.push(
        `estimated_duration_us (${plan.estimated_duration_us}) does not match sum of kept clips (${calculated_duration_us}). The selected ranges themselves total ${calculated_duration_us} µs; shorten/change the ranges if the requested target is smaller, or omit this redundant estimate to derive it from the ranges. No edit was applied.`
      )
    }
  }

  // Uncertainties validation
  if (!Array.isArray(plan.uncertainties)) {
    errors.push('uncertainties must be an array of strings')
  } else {
    for (let uIdx = 0; uIdx < plan.uncertainties.length; uIdx++) {
      if (typeof plan.uncertainties[uIdx] !== 'string') {
        errors.push(`uncertainties[${uIdx}] must be a string`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    calculated_duration_us,
    clip_count,
    removed_count,
  }
}
