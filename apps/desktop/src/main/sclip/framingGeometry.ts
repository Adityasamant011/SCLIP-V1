/** Deterministic canvas-fit arithmetic. This does not find a subject or choose
 *  an edit: the caller selects cover/contain and, optionally, a source-space
 *  focal point after inspecting the actual composition. */
export interface VideoFitRequest {
  sourceWidth: number
  sourceHeight: number
  canvasWidth: number
  canvasHeight: number
  mode: 'cover' | 'contain'
  focusX?: number
  focusY?: number
}

export interface VideoFitGeometry {
  x: number
  y: number
  scale_x: number
  scale_y: number
  display_width: number
  display_height: number
  visible_source_rect: { x: number; y: number; width: number; height: number }
}

function positiveDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a finite positive dimension`)
}

function focus(value: number | undefined, name: string): number {
  const resolved = value ?? 0.5
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) throw new Error(`${name} must be between 0 and 1`)
  return resolved
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

export function calculateVideoFit(request: VideoFitRequest): VideoFitGeometry {
  const { sourceWidth, sourceHeight, canvasWidth, canvasHeight, mode } = request
  positiveDimension(sourceWidth, 'sourceWidth')
  positiveDimension(sourceHeight, 'sourceHeight')
  positiveDimension(canvasWidth, 'canvasWidth')
  positiveDimension(canvasHeight, 'canvasHeight')
  if (mode !== 'cover' && mode !== 'contain') throw new Error('mode must be cover or contain')
  const fx = focus(request.focusX, 'focusX')
  const fy = focus(request.focusY, 'focusY')
  const widthScale = canvasWidth / sourceWidth
  const heightScale = canvasHeight / sourceHeight
  const scale = mode === 'cover' ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale)
  const displayWidth = sourceWidth * scale
  const displayHeight = sourceHeight * scale
  const rawX = canvasWidth / 2 - fx * displayWidth
  const rawY = canvasHeight / 2 - fy * displayHeight
  const x = mode === 'cover' ? clamp(rawX, Math.min(0, canvasWidth - displayWidth), 0) : (canvasWidth - displayWidth) / 2
  const y = mode === 'cover' ? clamp(rawY, Math.min(0, canvasHeight - displayHeight), 0) : (canvasHeight - displayHeight) / 2
  const visibleX = Math.max(0, -x / scale)
  const visibleY = Math.max(0, -y / scale)
  const visibleRight = Math.min(sourceWidth, (canvasWidth - x) / scale)
  const visibleBottom = Math.min(sourceHeight, (canvasHeight - y) / scale)
  return {
    x, y, scale_x: scale, scale_y: scale,
    display_width: displayWidth, display_height: displayHeight,
    visible_source_rect: {
      x: visibleX, y: visibleY,
      width: Math.max(0, visibleRight - visibleX),
      height: Math.max(0, visibleBottom - visibleY),
    },
  }
}
