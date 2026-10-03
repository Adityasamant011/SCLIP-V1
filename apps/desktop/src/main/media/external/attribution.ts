import type { Project, MediaItem } from '../../state/model.js'
import { referencingLayers } from '../../state/mutations/media.js'
import type { ExternalMediaCandidate } from './types.js'

export type ExportObligationStatus = 'NOT_REQUIRED' | 'UNRESOLVED' | 'RESOLVED'

export interface ProjectAttributionObligation {
  media_id: string
  candidate_id?: string
  attribution_required: boolean
  attribution_text?: string
  license?: string
  license_url?: string
  source_page_url?: string
  creator?: string
  provider: string
  export_obligation_status: ExportObligationStatus
}

export interface ExportAttributionSafetyReport {
  can_export: boolean
  has_unresolved_obligations: boolean
  total_obligations_count: number
  unresolved_count: number
  unresolved_timeline_obligations: ProjectAttributionObligation[]
  warnings: string[]
}

/**
 * Builds a standardized ProjectAttributionObligation record from a candidate.
 */
export function buildAttributionObligation(
  candidate: ExternalMediaCandidate,
  mediaId: string,
): ProjectAttributionObligation {
  const isRequired = Boolean(candidate.attribution_required)
  return {
    media_id: mediaId,
    candidate_id: candidate.candidate_id,
    attribution_required: isRequired,
    attribution_text: candidate.attribution,
    license: candidate.license,
    license_url: candidate.license_url,
    source_page_url: candidate.source_page_url,
    creator: candidate.creator,
    provider: candidate.provider,
    export_obligation_status: isRequired ? 'UNRESOLVED' : 'NOT_REQUIRED',
  }
}

/**
 * Attaches attribution obligation and provenance metadata onto a MediaItem.
 */
export function attachAttributionMetadata(
  mediaItem: MediaItem,
  obligation: ProjectAttributionObligation,
  provenancePath?: string,
): void {
  if (!mediaItem.metadata) {
    mediaItem.metadata = { duration_us: null }
  }
  mediaItem.metadata.attribution_obligation = obligation
  if (provenancePath) {
    mediaItem.metadata.provenance_path = provenancePath
  }
}

/**
 * Extracts all attribution obligations tracked in a project's media pool.
 */
export function getProjectAttributionObligations(project: Project): ProjectAttributionObligation[] {
  const obligations: ProjectAttributionObligation[] = []
  for (const item of Object.values(project.media_pool || {})) {
    const ob = (item.metadata as Record<string, unknown> | undefined)?.attribution_obligation as
      | ProjectAttributionObligation
      | undefined
    if (ob) {
      obligations.push(ob)
    }
  }
  return obligations
}

/**
 * Detects attribution obligations for media that are ACTUALLY placed on the timeline.
 */
export function getTimelineAttributionObligations(project: Project): ProjectAttributionObligation[] {
  const timelineObligations: ProjectAttributionObligation[] = []
  for (const item of Object.values(project.media_pool || {})) {
    const ob = (item.metadata as Record<string, unknown> | undefined)?.attribution_obligation as
      | ProjectAttributionObligation
      | undefined
    if (!ob) continue

    // Check if this media is referenced by any layer on the timeline
    const layers = referencingLayers(project, item.id)
    if (layers.length > 0) {
      timelineObligations.push(ob)
    }
  }
  return timelineObligations
}

/**
 * Verifies whether required attribution obligations are satisfied before final export.
 */
export function checkExportAttributionSafety(project: Project): ExportAttributionSafetyReport {
  const timelineObligations = getTimelineAttributionObligations(project)
  const unresolved = timelineObligations.filter(
    (o) => o.attribution_required && o.export_obligation_status === 'UNRESOLVED',
  )

  const warnings: string[] = []
  for (const o of unresolved) {
    const text = o.attribution_text || `Asset from ${o.provider} (${o.license || 'attribution required'})`
    warnings.push(
      `Unresolved attribution obligation for media "${o.media_id}" (${o.provider}): "${text}". Attribution must be resolved before publishing.`,
    )
  }

  return {
    can_export: unresolved.length === 0,
    has_unresolved_obligations: unresolved.length > 0,
    total_obligations_count: timelineObligations.length,
    unresolved_count: unresolved.length,
    unresolved_timeline_obligations: unresolved,
    warnings,
  }
}
