import { describe, expect, it } from 'vitest'
import { calculateVideoFit } from './framingGeometry'

describe('deterministic video canvas fit', () => {
  it('covers portrait canvas with landscape source without stretching', () => {
    const result = calculateVideoFit({ sourceWidth: 1920, sourceHeight: 1080, canvasWidth: 1080, canvasHeight: 1920, mode: 'cover' })
    expect(result.scale_x).toBeCloseTo(1920 / 1080)
    expect(result.scale_y).toBe(result.scale_x)
    expect(result.display_height).toBeCloseTo(1920)
    expect(result.x).toBeCloseTo((1080 - result.display_width) / 2)
    expect(result.y).toBeCloseTo(0)
    expect(result.visible_source_rect.width).toBeCloseTo(1080 / result.scale_x)
  })

  it('can move the source-space focal point while keeping the canvas covered', () => {
    const centered = calculateVideoFit({ sourceWidth: 1280, sourceHeight: 720, canvasWidth: 1080, canvasHeight: 1920, mode: 'cover' })
    const right = calculateVideoFit({ sourceWidth: 1280, sourceHeight: 720, canvasWidth: 1080, canvasHeight: 1920, mode: 'cover', focusX: 0.75 })
    expect(right.x).toBeLessThan(centered.x)
    expect(right.x).toBeGreaterThanOrEqual(1080 - right.display_width)
    expect(right.visible_source_rect.x).toBeGreaterThan(centered.visible_source_rect.x)
  })

  it('contains the whole source when the caller prefers preservation over cropping', () => {
    const result = calculateVideoFit({ sourceWidth: 1280, sourceHeight: 720, canvasWidth: 1080, canvasHeight: 1920, mode: 'contain', focusX: 0.9 })
    expect(result.display_width).toBeCloseTo(1080)
    expect(result.display_height).toBeLessThan(1920)
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo((1920 - result.display_height) / 2)
    expect(result.visible_source_rect).toEqual({ x: 0, y: 0, width: 1280, height: 720 })
  })

  it('refuses invalid dimensions and focal coordinates', () => {
    expect(() => calculateVideoFit({ sourceWidth: 0, sourceHeight: 720, canvasWidth: 1080, canvasHeight: 1920, mode: 'cover' })).toThrow(/sourceWidth/)
    expect(() => calculateVideoFit({ sourceWidth: 1280, sourceHeight: 720, canvasWidth: 1080, canvasHeight: 1920, mode: 'cover', focusX: 1.1 })).toThrow(/focusX/)
  })
})
