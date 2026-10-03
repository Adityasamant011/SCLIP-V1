import type { Composition } from '../state/model.js'

export type InspectionType = 'boundary' | 'section' | 'full_range'
export type InspectionMethod = 'context_only' | 'frame' | 'range_render'
export type AssessmentRating = 'natural' | 'questionable' | 'bad'
export type IssueSeverity = 'minor' | 'moderate' | 'critical'
export type IssueType =
  | 'abrupt_cut'
  | 'audio_clipping'
  | 'incomplete_sentence'
  | 'pacing_drag'
  | 'jarring_jump'
  | 'visual_mismatch'
  | 'other'

export interface RoughCutInspection {
  id: string
  type: InspectionType
  timeline_range_us: [number, number]
  method: InspectionMethod
  evidence: string
  assessment: AssessmentRating
  reason: string
  clip_ids: string[]
}

export interface RoughCutIssue {
  id: string
  severity: IssueSeverity
  timeline_t_us: number
  affected_range_us: [number, number]
  issue_type: IssueType
  description: string
  suggestion: string
}

export interface RoughCutReview {
  version: 1
  project_id: string
  composition_id: string
  summary: string
  total_duration_us: number
  clip_count: number
  inspections: RoughCutInspection[]
  identified_issues: RoughCutIssue[]
  ready_for_next_stage: boolean
}

export interface RoughCutReviewValidationResult {
  valid: boolean
  errors: string[]
  inspections_count: number
  issues_count: number
  has_critical_issues: boolean
}

const FRAME_TOLERANCE_US = 33_334 // 1 frame at 30fps

/**
 * Mechanically validates a RoughCutReview against the actual composition.
 *
 * CRITICAL AGENTIC PROTECTION:
 * This validator checks only deterministic physical facts (valid JSON schema,
 * timestamp bounds within composition duration, existence of referenced clip IDs).
 * It NEVER scores editorial quality, never flags subjective pacing, and never
 * overrides Hermes's creative judgment.
 */
export function validateRoughCutReview(
  review: unknown,
  composition: Composition,
): RoughCutReviewValidationResult {
  const errors: string[] = []

  if (!review || typeof review !== 'object') {
    return {
      valid: false,
      errors: ['Review must be a JSON object'],
      inspections_count: 0,
      issues_count: 0,
      has_critical_issues: false,
    }
  }

  const r = review as Partial<RoughCutReview>

  if (r.version !== 1) {
    errors.push(`Expected version 1, got ${r.version}`)
  }

  if (typeof r.project_id !== 'string' || !r.project_id.trim()) {
    errors.push('Missing or empty project_id')
  }

  if (typeof r.composition_id !== 'string' || !r.composition_id.trim()) {
    errors.push('Missing or empty composition_id')
  } else if (composition.id && r.composition_id !== composition.id) {
    errors.push(`Composition ID mismatch: review specified '${r.composition_id}' but composition is '${composition.id}'`)
  }

  if (typeof r.summary !== 'string' || !r.summary.trim()) {
    errors.push('Missing or empty review summary')
  }

  if (typeof r.total_duration_us !== 'number' || r.total_duration_us <= 0) {
    errors.push('total_duration_us must be a positive integer')
  } else if (Math.abs(r.total_duration_us - composition.duration_us) > FRAME_TOLERANCE_US) {
    errors.push(
      `total_duration_us (${r.total_duration_us}) differs from actual composition duration (${composition.duration_us}) by more than 1 frame (${Math.abs(r.total_duration_us - composition.duration_us)} µs)`,
    )
  }

  if (typeof r.clip_count !== 'number' || r.clip_count < 0) {
    errors.push('clip_count must be a non-negative number')
  }

  if (typeof r.ready_for_next_stage !== 'boolean') {
    errors.push('ready_for_next_stage must be a boolean')
  }

  // Collect all known layer IDs in the composition for existence verification
  const knownLayerIds = new Set<string>()
  for (const track of composition.tracks) {
    for (const layer of track.layers) {
      knownLayerIds.add(layer.id)
    }
  }

  // Validate inspections
  let inspectionsCount = 0
  if (!Array.isArray(r.inspections)) {
    errors.push('inspections must be an array')
  } else {
    inspectionsCount = r.inspections.length
    for (let i = 0; i < r.inspections.length; i++) {
      const insp = r.inspections[i] as Partial<RoughCutInspection>
      const prefix = `inspections[${i}]`

      if (!insp.id || typeof insp.id !== 'string') {
        errors.push(`${prefix}: missing id`)
      }

      if (!['boundary', 'section', 'full_range'].includes(insp.type as string)) {
        errors.push(`${prefix}: invalid type '${insp.type}' (expected 'boundary' | 'section' | 'full_range')`)
      }

      if (
        !Array.isArray(insp.timeline_range_us) ||
        insp.timeline_range_us.length !== 2 ||
        typeof insp.timeline_range_us[0] !== 'number' ||
        typeof insp.timeline_range_us[1] !== 'number'
      ) {
        errors.push(`${prefix}: timeline_range_us must be a 2-tuple of numbers [start_us, end_us]`)
      } else {
        const [start, end] = insp.timeline_range_us
        if (start < 0) {
          errors.push(`${prefix}: timeline_range_us start cannot be negative (${start})`)
        }
        if (end < start) {
          errors.push(`${prefix}: timeline_range_us end (${end}) cannot be less than start (${start})`)
        }
        if (end > composition.duration_us + FRAME_TOLERANCE_US) {
          errors.push(
            `${prefix}: timeline_range_us end (${end}) exceeds composition duration (${composition.duration_us})`,
          )
        }
      }

      if (!['context_only', 'frame', 'range_render'].includes(insp.method as string)) {
        errors.push(
          `${prefix}: invalid method '${insp.method}' (expected 'context_only' | 'frame' | 'range_render')`,
        )
      }

      if (!['natural', 'questionable', 'bad'].includes(insp.assessment as string)) {
        errors.push(
          `${prefix}: invalid assessment '${insp.assessment}' (expected 'natural' | 'questionable' | 'bad')`,
        )
      }

      if (typeof insp.evidence !== 'string' || !insp.evidence.trim()) {
        errors.push(`${prefix}: evidence must be a non-empty string`)
      }

      if (typeof insp.reason !== 'string' || !insp.reason.trim()) {
        errors.push(`${prefix}: reason must be a non-empty string`)
      }

      if (Array.isArray(insp.clip_ids)) {
        for (const cid of insp.clip_ids) {
          if (typeof cid !== 'string' || !knownLayerIds.has(cid)) {
            errors.push(`${prefix}: referenced clip_id '${cid}' does not exist in composition`)
          }
        }
      }
    }
  }

  // Validate identified issues
  let issuesCount = 0
  let hasCritical = false
  if (!Array.isArray(r.identified_issues)) {
    errors.push('identified_issues must be an array')
  } else {
    issuesCount = r.identified_issues.length
    for (let i = 0; i < r.identified_issues.length; i++) {
      const issue = r.identified_issues[i] as Partial<RoughCutIssue>
      const prefix = `identified_issues[${i}]`

      if (!issue.id || typeof issue.id !== 'string') {
        errors.push(`${prefix}: missing id`)
      }

      if (!['minor', 'moderate', 'critical'].includes(issue.severity as string)) {
        errors.push(`${prefix}: invalid severity '${issue.severity}'`)
      }
      if (issue.severity === 'critical') {
        hasCritical = true
      }

      if (typeof issue.timeline_t_us !== 'number' || issue.timeline_t_us < 0) {
        errors.push(`${prefix}: timeline_t_us must be a non-negative number`)
      } else if (issue.timeline_t_us > composition.duration_us + FRAME_TOLERANCE_US) {
        errors.push(
          `${prefix}: timeline_t_us (${issue.timeline_t_us}) exceeds composition duration (${composition.duration_us})`,
        )
      }

      if (
        !Array.isArray(issue.affected_range_us) ||
        issue.affected_range_us.length !== 2 ||
        typeof issue.affected_range_us[0] !== 'number' ||
        typeof issue.affected_range_us[1] !== 'number'
      ) {
        errors.push(`${prefix}: affected_range_us must be a 2-tuple of numbers [start_us, end_us]`)
      } else {
        const [start, end] = issue.affected_range_us
        if (start < 0 || end < start) {
          errors.push(`${prefix}: invalid affected_range_us [${start}, ${end}]`)
        }
        if (end > composition.duration_us + FRAME_TOLERANCE_US) {
          errors.push(
            `${prefix}: affected_range_us end (${end}) exceeds composition duration (${composition.duration_us})`,
          )
        }
      }

      const validIssueTypes: IssueType[] = [
        'abrupt_cut',
        'audio_clipping',
        'incomplete_sentence',
        'pacing_drag',
        'jarring_jump',
        'visual_mismatch',
        'other',
      ]
      if (!validIssueTypes.includes(issue.issue_type as IssueType)) {
        errors.push(`${prefix}: invalid issue_type '${issue.issue_type}'`)
      }

      if (typeof issue.description !== 'string' || !issue.description.trim()) {
        errors.push(`${prefix}: description must be a non-empty string`)
      }

      if (typeof issue.suggestion !== 'string' || !issue.suggestion.trim()) {
        errors.push(`${prefix}: suggestion must be a non-empty string`)
      }
    }
  }

  // Logical consistency: if critical issues exist, ready_for_next_stage should not be true
  if (hasCritical && r.ready_for_next_stage === true) {
    errors.push('ready_for_next_stage cannot be true when critical issues are identified')
  }

  return {
    valid: errors.length === 0,
    errors,
    inspections_count: inspectionsCount,
    issues_count: issuesCount,
    has_critical_issues: hasCritical,
  }
}
