// apps/desktop/src/main/state/mutations/roughCut.ts
import { createHash } from 'node:crypto'
import type { Project, Composition, Track, Uuid } from '../model'
import type { IdGen } from '../ids'
import { CommandFailure } from '../errors'
import { scopeComposition, applyDurationAutofit, dropLayerFromLinks } from './helpers'
import { applyAddLayer } from './add'
import { videoClipParams, audioParams } from './media'
import { applyLinksCreate } from './links'
import { gridForLayerKind, snapOnGrid, snapDownOnGrid } from '../snap'
import { validateRoughCutPlan, type RoughCutPlanInput, type ValidationResult } from '../../sclip/roughCutPlan'

export interface RoughCutMappingItem {
  plan_clip_id: string
  section_id: string
  layer_id: string
  audio_layer_id: string | null
  link_id: string | null
  media_id: string
  action: 'keep' | 'reorder'
  requested_source_range_us: [number, number]
  actual_source_range_us: [number, number]
  timeline_range_us: [number, number]
}

export interface RoughCutApplyResult {
  status: 'applied' | 'dry_run'
  checkpoint_id: string | null
  composition_id: string
  plan_version: 1
  planned_duration_us: number
  actual_duration_us: number
  duration_delta_us: number
  clips_created: number
  mapping: RoughCutMappingItem[]
}

export interface RoughCutCompileOptions {
  composition_id?: string | null
  track_id?: string | null
  dry_run?: boolean
  reapply?: boolean
  checkpoint_id?: string | null
  clean_track?: boolean
}

/**
 * Computes a deterministic cryptographic hash of the canonical plan
 * structure to detect duplicate plan executions.
 */
export function computePlanHash(plan: RoughCutPlanInput): string {
  const canonical = JSON.stringify({
    version: plan.version,
    sections: (plan.sections || []).map((s) => ({
      id: s.id,
      clips: (s.clips || []).map((c) => [c.media_id, c.source_start_us, c.source_end_us, c.action]),
    })),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Preflight validation checks before mutating state.
 * Revalidates the plan against media pool, checks locks, media existence,
 * and duplicate execution history.
 */
export function preflightRoughCutPlan(
  project: Project,
  plan: RoughCutPlanInput,
  options: RoughCutCompileOptions = {}
): {
  validation: ValidationResult
  planHash: string
  composition: Composition
  track: Track
} {
  // 1. Re-validate using deterministic Phase 2B validator
  const validation = validateRoughCutPlan(plan, project.media_pool)
  if (!validation.valid) {
    throw new CommandFailure({
      error: 'InvalidArgument',
      field: 'plan',
      detail: `Plan failed preflight revalidation: ${validation.errors.join('; ')}`,
    })
  }

  // 2. Locate target composition
  const composition = scopeComposition(project, options.composition_id)

  // 3. Locate target track
  let track: Track | undefined
  if (options.track_id) {
    track = composition.tracks.find((t) => t.id === options.track_id)
    if (!track) {
      throw new CommandFailure({
        error: 'TrackNotFound',
        track: options.track_id,
      })
    }
  } else {
    // Prefer unlocked A-roll track, else first unlocked track
    track = composition.tracks.find((t) => t.role === 'ARoll' && !t.locked) ??
      composition.tracks.find((t) => !t.locked)
  }

  if (track && track.locked) {
    throw new CommandFailure({
      error: 'TrackLocked',
      track: track.id,
    })
  }

  // 4. Check media existence and duration bounds
  for (const sec of plan.sections) {
    for (const clip of sec.clips) {
      const item = project.media_pool[clip.media_id]
      if (!item) {
        throw new CommandFailure({
          error: 'InvalidArgument',
          field: 'media_id',
          detail: `Media item "${clip.media_id}" not found in project media pool`,
        })
      }
      if (item.metadata?.duration_us != null && item.metadata.duration_us > 0) {
        if (clip.source_end_us > item.metadata.duration_us) {
          throw new CommandFailure({
            error: 'InvalidArgument',
            field: 'source_end_us',
            detail: `Clip in section "${sec.id}" end time ${clip.source_end_us} µs exceeds media duration ${item.metadata.duration_us} µs`,
          })
        }
      }
    }
  }

  // 5. Duplicate execution check
  const planHash = computePlanHash(plan)
  const appliedHashes = ((composition as any).metadata?.['weftcut.applied_rough_cut_hashes'] as string[]) || []
  if (appliedHashes.includes(planHash) && !options.reapply) {
    throw new CommandFailure({
      error: 'InvalidArgument',
      field: 'plan',
      detail: 'This rough-cut plan has already been applied to this composition. Pass reapply: true to execute again.',
    })
  }

  return { validation, planHash, composition, track: track! }
}

/**
 * Deterministically compiles and assembles a RoughCutPlan into real WeftCut layers.
 * Can run in dry-run mode (0 mutations) or wet mutation mode.
 */
export function compileRoughCutTimeline(
  draft: Project,
  idGen: IdGen,
  plan: RoughCutPlanInput,
  options: RoughCutCompileOptions = {}
): RoughCutApplyResult {
  const isDryRun = options.dry_run === true
  const { validation, planHash, composition } = preflightRoughCutPlan(draft, plan, options)

  // Resolve target track
  let targetTrack: Track
  if (options.track_id) {
    targetTrack = composition.tracks.find((t) => t.id === options.track_id)!
  } else {
    targetTrack = composition.tracks.find((t) => t.role === 'ARoll' && !t.locked) ??
      composition.tracks.find((t) => !t.locked)!
    if (!targetTrack) {
      if (isDryRun) {
        targetTrack = {
          id: 'simulated-track-id',
          label: 'A Roll',
          enabled: true,
          locked: false,
          muted: false,
          solo: false,
          removable: false,
          role: 'ARoll',
          transient: false,
          height_px: 64,
          layers: [],
        }
      } else {
        throw new CommandFailure({
          error: 'TrackNotFound',
          track: 'No unlocked track available in composition',
        })
      }
    }
  }

  // Clean track if requested and not dry run
  const cleanTrack = options.clean_track !== false
  if (!isDryRun && cleanTrack && targetTrack.layers.length > 0) {
    for (const l of [...targetTrack.layers]) {
      dropLayerFromLinks(composition, l.id)
    }
    targetTrack.layers = []
  }

  const grid = gridForLayerKind('VideoClip', composition.fps)
  const mapping: RoughCutMappingItem[] = []
  let cursor = 0
  let simulatedIdCounter = 1
  const nextId = (): Uuid => (isDryRun ? `simulated-id-${simulatedIdCounter++}` : idGen())

  // Iterate sections and clips in STRICT PLAN ORDER
  for (let sIdx = 0; sIdx < plan.sections.length; sIdx++) {
    const section = plan.sections[sIdx]!
    for (let cIdx = 0; cIdx < section.clips.length; cIdx++) {
      const clip = section.clips[cIdx]!
      const planClipId = `${section.id}-clip-${cIdx + 1}`
      const media = draft.media_pool[clip.media_id]!

      const requestedDuration = clip.source_end_us - clip.source_start_us
      let actualTStartUs = cursor
      let actualTEndUs = snapOnGrid(cursor + requestedDuration, grid)
      let actualDuration = actualTEndUs - actualTStartUs

      let actualSrcIn = clip.source_start_us
      let actualSrcOut = clip.source_start_us + actualDuration

      // Clamp against media duration if known
      if (media.metadata?.duration_us != null && media.metadata.duration_us > 0) {
        if (actualSrcOut > media.metadata.duration_us) {
          actualTEndUs = snapDownOnGrid(actualTStartUs + (media.metadata.duration_us - actualSrcIn), grid)
          actualDuration = actualTEndUs - actualTStartUs
          actualSrcOut = actualSrcIn + actualDuration
        }
      }

      const hasAudio = media.kind === 'Video' && media.metadata.audio != null
      let videoLayerId: string = ''
      let audioLayerId: string | null = null
      let linkId: string | null = null

      if (!isDryRun) {
        if (media.kind === 'Video') {
          const vParams = videoClipParams(clip.media_id, actualSrcIn, actualSrcOut)
          videoLayerId = applyAddLayer(draft, nextId, targetTrack.id, vParams, actualTStartUs, actualTEndUs)

          if (hasAudio) {
            const aParams = {
              ...audioParams(clip.media_id, actualSrcIn, actualSrcOut),
              role: 'dialogue' as const,
            }
            audioLayerId = applyAddLayer(draft, nextId, targetTrack.id, aParams, actualTStartUs, actualTEndUs)
            linkId = applyLinksCreate(draft, nextId, [videoLayerId, audioLayerId], null, false)
          }
        } else if (media.kind === 'Audio') {
          const aParams = {
            ...audioParams(clip.media_id, actualSrcIn, actualSrcOut),
            role: 'dialogue' as const,
          }
          audioLayerId = applyAddLayer(draft, nextId, targetTrack.id, aParams, actualTStartUs, actualTEndUs)
          videoLayerId = audioLayerId
        }
      } else {
        videoLayerId = `dry-run-video-${mapping.length + 1}`
        if (hasAudio) {
          audioLayerId = `dry-run-audio-${mapping.length + 1}`
          linkId = `dry-run-link-${mapping.length + 1}`
        }
      }

      mapping.push({
        plan_clip_id: planClipId,
        section_id: section.id,
        layer_id: videoLayerId,
        audio_layer_id: audioLayerId,
        link_id: linkId,
        media_id: clip.media_id,
        action: clip.action,
        requested_source_range_us: [clip.source_start_us, clip.source_end_us],
        actual_source_range_us: [actualSrcIn, actualSrcOut],
        timeline_range_us: [actualTStartUs, actualTEndUs],
      })

      // Advance cursor gaplessly to end of this clip
      cursor = actualTEndUs
    }
  }

  const actualDurationUs = cursor
  const plannedDurationUs = plan.estimated_duration_us ?? validation.calculated_duration_us
  const durationDeltaUs = actualDurationUs - plannedDurationUs

  if (!isDryRun) {
    // Mechanical Post-Execution Verification
    if (mapping.length !== validation.clip_count) {
      throw new CommandFailure({
        error: 'ValidationFailed',
        detail: {
          rule: 'RoughCutClipCountMismatch',
          expected: validation.clip_count,
          actual: mapping.length,
        },
      })
    }

    for (let i = 0; i < mapping.length - 1; i++) {
      const curr = mapping[i]!
      const next = mapping[i + 1]!
      if (curr.timeline_range_us[1] !== next.timeline_range_us[0]) {
        throw new CommandFailure({
          error: 'ValidationFailed',
          detail: {
            rule: 'RoughCutGapDetected',
            at_us: curr.timeline_range_us[1],
            next_start_us: next.timeline_range_us[0],
          },
        })
      }
    }

    // Autofit composition duration
    composition.duration_pinned = false
    applyDurationAutofit(composition)

    // Record plan hash in composition metadata for duplicate execution protection
    const meta = (composition as any).metadata ? { ...(composition as any).metadata } : {}
    const existingHashes = (meta['weftcut.applied_rough_cut_hashes'] as string[]) || []
    meta['weftcut.applied_rough_cut_hashes'] = [...existingHashes, planHash]
    meta['weftcut.last_rough_cut_hash'] = planHash
    ;(composition as any).metadata = meta
  }

  return {
    status: isDryRun ? 'dry_run' : 'applied',
    checkpoint_id: options.checkpoint_id ?? null,
    composition_id: composition.id,
    plan_version: 1,
    planned_duration_us: plannedDurationUs,
    actual_duration_us: actualDurationUs,
    duration_delta_us: durationDeltaUs,
    clips_created: mapping.length,
    mapping,
  }
}
