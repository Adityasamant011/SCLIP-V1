import type { LayerSummary } from '../ipc'
import { layerFrameAt, TRANSFORMABLE_KINDS } from './centerInFrame'
import { layerQuad } from './gizmoGeometry'
import { quadAabb } from './previewSnap'
import type { TextFit } from '../render/textBox'
import { transformOverrideFor } from '../render/transformOverrides'

/** Read-only facts about the frame already captured. No draw, seek or edit. */
export function inspectionEvidence(
  layers: readonly LayerSummary[], tUs: number, width: number, height: number,
  pixels: ArrayLike<number>,
  probe: { naturalSizeOf(id: string): { w: number; h: number } | null; textFitOf(id: string): TextFit | null },
) {
  let black = 0
  let opaqueBlack = 0
  let transparent = 0
  const fullWidthBlackBands: Array<{ start_y: number; end_y: number }> = []
  let bandStart: number | null = null
  for (let y = 0; y < height; y++) {
    let rowBlack = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // Raw captured RGB, with alpha reported separately. Do not invent what
      // background a consumer composites transparent pixels against.
      if (pixels[i + 3]! === 0) transparent++
      if (pixels[i]! <= 8 && pixels[i + 1]! <= 8 && pixels[i + 2]! <= 8) {
        rowBlack++
        if (pixels[i + 3]! >= 250) opaqueBlack++
      }
    }
    black += rowBlack
    if (rowBlack === width) bandStart ??= y
    else if (bandStart !== null) { fullWidthBlackBands.push({ start_y: bandStart, end_y: y }); bandStart = null }
  }
  if (bandStart !== null) fullWidthBlackBands.push({ start_y: bandStart, end_y: height })
  return {
    t_us: tUs, canvas: { width, height },
    pixel_facts: { near_black_fraction: black / (width * height), rgb_threshold: 8, full_width_near_black_bands: fullWidthBlackBands,
      opaque_near_black_fraction: opaqueBlack / (width * height), fully_transparent_fraction: transparent / (width * height),
      interpretation: 'Raw captured RGB only; alpha is reported separately. Does not distinguish uncovered canvas, image content, intended letterboxing, or a consumer background.' },
    layer_bounds: layers.filter(l => l.t_start_us <= tUs && tUs < l.t_end_us && TRANSFORMABLE_KINDS.has(l.params.kind)).map(layer => {
      const size = probe.naturalSizeOf(layer.id)
      const quad = size && !transformOverrideFor(layer.id) ? layerQuad(layerFrameAt(layer, tUs, size)) : null
      const bounds = quad ? quadAabb(quad) : null
      return {
        layer_id: layer.id, kind: layer.params.kind,
        bounds_basis: layer.params.kind === 'Text' ? 'authored_transform_with_staged_layout_box_or_glyph_size' : 'authored_transform_with_staged_content_size',
        unknown_reason: transformOverrideFor(layer.id) ? 'uncommitted_live_transform_override' : size ? null : 'layer_not_staged',
        aabb: bounds,
        canvas_coverage: { geometry: quad ? quadCoversCanvas(quad, width, height) ? 'full' : bounds && (bounds.right <= 0 || bounds.bottom <= 0 || bounds.left >= width || bounds.top >= height) ? 'none' : 'partial' : 'unknown',
          basis: 'transformed_content_quad', interpretation: 'Geometric coverage only, before effects/occlusion/transparency. Full does not imply visible face, good composition or desirable source content. Wall/light/signage can fully cover the canvas.' },
        aabb_canvas_intersection: bounds ? {
          left: Math.max(0, Math.min(width, bounds.left)), top: Math.max(0, Math.min(height, bounds.top)),
          right: Math.max(0, Math.min(width, bounds.right)),
          bottom: Math.max(0, Math.min(height, bounds.bottom)),
        } : null,
        text_fit: probe.textFitOf(layer.id),
      }
    }),
    limitations: 'Bounds are geometric envelopes, not visible-pixel occupancy or face bounds. Text boxes are not necessarily glyph bounds. Effects, occlusion, crop, transparency and nested content are not inferred.',
  }
}

/** Convex transformed rectangle contains all canvas corners; no aesthetic judgment. */
function quadCoversCanvas(quad: readonly { x: number; y: number }[], width: number, height: number): boolean {
  const area = Math.abs(quad.reduce((a, p, i) => a + p.x * quad[(i + 1) % 4]!.y - p.y * quad[(i + 1) % 4]!.x, 0))
  if (area < 1e-6) return false
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }].every(c => {
    const crosses = quad.map((p, i) => { const q = quad[(i + 1) % 4]!; return (q.x - p.x) * (c.y - p.y) - (q.y - p.y) * (c.x - p.x) })
    return crosses.every(n => n >= -1e-6) || crosses.every(n => n <= 1e-6)
  })
}
