import type { Animated, Layer } from '../state/model'
/** Static authored layout BOX, not glyph occupancy. Animated/rotated/unboxed
 * text is deliberately unknown until inspected through the compositor. */
export function textLayoutBox(layer: Layer) {
  if (layer.params.kind !== 'Text') return null
  const p = layer.params, t = p.transform
  if (!t?.position || !t.scale_x || !t.anchor_x || p.box_w == null || p.box_h == null) return null
  const scalar = (a: Animated<number> | undefined) => a?.mode === 'Static' && Number.isFinite(a.value) ? a.value : null
  const x=scalar(t.position.x), y=scalar(t.position.y), sx=scalar(t.scale_x), sy=scalar(t.scale_y), ax=scalar(t.anchor_x), ay=scalar(t.anchor_y), rot=scalar(t.rotation_deg)
  if ([x,y,sx,sy,ax,ay].some(v=>v===null) || rot!==0 || p.box_w===null || p.box_h===null) return null
  const a=x!-p.box_w*ax!*sx!, b=y!-p.box_h*ay!*sy!
  return {left:Math.min(a,a+p.box_w*sx!),right:Math.max(a,a+p.box_w*sx!),top:Math.min(b,b+p.box_h*sy!),bottom:Math.max(b,b+p.box_h*sy!)}
}

/** Horizontal authored extent remains knowable for auto-height wrapped text. */
export function textHorizontalBounds(layer: Layer) {
  if(layer.params.kind!=='Text')return null
  const p=layer.params,t=p.transform
  if(!t || p.box_w==null || t.position.mode!=='XY' || t.position.x.mode!=='Static' || t.scale_x.mode!=='Static' || t.anchor_x.mode!=='Static' || t.rotation_deg.mode!=='Static' || t.rotation_deg.value!==0)return null
  const a=t.position.x.value-p.box_w*t.anchor_x.value*t.scale_x.value,b=a+p.box_w*t.scale_x.value
  return {left:Math.min(a,b),right:Math.max(a,b)}
}
