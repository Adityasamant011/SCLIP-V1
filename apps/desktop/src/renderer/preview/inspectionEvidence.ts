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
  const facts = {
    t_us: tUs, canvas: { width, height },
    pixel_facts: { near_black_fraction: black / (width * height), rgb_threshold: 8, full_width_near_black_bands: fullWidthBlackBands,
      opaque_near_black_fraction: opaqueBlack / (width * height), fully_transparent_fraction: transparent / (width * height),
      interpretation: 'Raw captured RGB only; alpha is reported separately. Does not distinguish uncovered canvas, image content, intended letterboxing, or a consumer background.' },
    layer_bounds: layers.filter(l => l.enabled !== false && l.t_start_us <= tUs && tUs < l.t_end_us && TRANSFORMABLE_KINDS.has(l.params.kind)).map(layer => {
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
        outside_canvas_edges: bounds ? [bounds.left < 0 ? 'left' : '', bounds.top < 0 ? 'top' : '', bounds.right > width ? 'right' : '', bounds.bottom > height ? 'bottom' : ''].filter(Boolean) : null,
        text_region_pixels: bounds && layer.params.kind === 'Text' ? regionPixels(bounds, width, height, pixels) : null,
        text_fit: probe.textFitOf(layer.id),
      }
    }),
    limitations: 'Bounds are geometric envelopes, not visible-pixel occupancy or face bounds. Text boxes are not necessarily glyph bounds. Effects, occlusion, crop, transparency and nested content are not inferred.',
  }
  const text=facts.layer_bounds.filter(l=>l.kind==='Text' && l.aabb).slice(0,32)
  const text_intersections=[]
  for(let i=0;i<text.length;i++) for(let j=i+1;j<text.length;j++) {
    const a=text[i]!.aabb!, b=text[j]!.aabb!
    const w=Math.min(a.right,b.right)-Math.max(a.left,b.left),h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)
    if(w>0 && h>0) text_intersections.push({layer_ids:[text[i]!.layer_id,text[j]!.layer_id],layout_box_intersection_area_px:w*h})
  }
  return {...facts, text_intersections: text_intersections.slice(0,32), omitted_text_intersections: Math.max(0,text_intersections.length-32),
    observation_authority: 'Rendered pixel measurements and current authored geometry. Local model descriptions are separate, fallible observations; they cannot overrule geometry or certify readability.'}
}
function regionPixels(b: {left:number;right:number;top:number;bottom:number},w:number,h:number,p:ArrayLike<number>) {
  let lo=255,hi=0,n=0,bright=0,dark=0
  const left=Math.max(0,Math.floor(b.left)),right=Math.min(w,Math.ceil(b.right)),top=Math.max(0,Math.floor(b.top)),bottom=Math.min(h,Math.ceil(b.bottom))
  const step=Math.max(1,Math.ceil(Math.sqrt((right-left)*(bottom-top)/4096)))
  for(let y=top;y<bottom;y+=step) for(let x=left;x<right;x+=step) { const i=(y*w+x)*4;if(p[i+3]!==255)continue;const v=.2126*p[i]!+.7152*p[i+1]!+.0722*p[i+2]!;lo=Math.min(lo,v);hi=Math.max(hi,v);n++;if(v>240)bright++;if(v<16)dark++ }
  return {sample_count:n,luminance_min:n?lo:null,luminance_max:n?hi:null,near_white_fraction:n?bright/n:null,near_black_fraction:n?dark/n:null,
    interpretation:'Composited region includes glyphs and background; not background-only contrast or a readability verdict. Narrow luminance range may warrant closer inspection.'}
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
