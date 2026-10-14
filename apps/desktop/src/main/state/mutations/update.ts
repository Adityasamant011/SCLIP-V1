// src/main/state/mutations/update.ts
import type { Project, Uuid } from '../model'
import { checkTrackLock, requireSameComposition } from './helpers'
import { CommandFailure } from '../errors'

/** LayerPatch. null/absent = "don't touch". */
export interface LayerPatch {
  label?: string | null
  t_start_us?: number | null
  t_end_us?: number | null
  enabled?: boolean | null
  locked?: boolean | null
}

/** Envelope-only patch. check_track_lock FIRST (rejects
 *  edits on a locked track / missing layer), then apply only the provided fields.
 *  Does NOT autofit: a t_end edit here never moves composition.duration_us. */
export function applyUpdateLayer(p: Project, id: Uuid, patch: LayerPatch): void {
  const { layer } = checkTrackLock(p, id) // throws LayerNotFound (missing) or TrackLocked (locked track)
  const allowed = new Set(['label', 't_start_us', 't_end_us', 'enabled', 'locked'])
  const unsupported = Object.keys(patch).filter((key) => !allowed.has(key))
  if (unsupported.length) {
    throw new CommandFailure({ error: 'InvalidArgument', field: 'patch',
      detail: `update_layer accepts only label, t_start_us, t_end_us, enabled and locked. Unsupported fields: ${unsupported.join(', ')}. No changes applied. For kind-specific parameters use update_layer_params with patch.kind matching the layer (${layer.params.kind}); for position use set_position. Discover the target tool schema before calling it.` })
  }
  if (typeof patch.label === 'string') layer.label = patch.label
  if (typeof patch.t_start_us === 'number') layer.t_start_us = patch.t_start_us
  if (typeof patch.t_end_us === 'number') layer.t_end_us = patch.t_end_us
  if (typeof patch.enabled === 'boolean') layer.enabled = patch.enabled
  if (typeof patch.locked === 'boolean') layer.locked = patch.locked
}

/** Set `enabled` on exactly the layers named — the caller supplies a link's
 *  member set when the toggle should fan out; nothing is expanded here. A
 *  layer's own `locked` does not block it: the eye is visibility, not content,
 *  the same reasoning the track-flag path applies. A locked track does, and it
 *  refuses the WHOLE set before any layer is written (`checkTrackLock` also
 *  throws LayerNotFound for an unknown id). The set is one composition's
 *  (CrossCompositionSet otherwise) — a selection never spans two. */
export function applySetLayersEnabled(p: Project, layerIds: readonly Uuid[], enabled: boolean): void {
  const ids = [...new Set(layerIds)]
  if (ids.length === 0) return
  requireSameComposition(p, ids)
  const located = ids.map((id) => checkTrackLock(p, id))
  for (const { layer } of located) layer.enabled = enabled
}
