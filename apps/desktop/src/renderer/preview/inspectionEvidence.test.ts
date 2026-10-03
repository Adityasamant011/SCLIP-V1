import { describe, it, expect } from 'vitest'
import { inspectionEvidence } from './inspectionEvidence'
import { setTransformOverride, clearTransformOverride } from '../render/transformOverrides'

describe('read-only composed frame facts', () => {
  it('measures black pixels without declaring them empty or a bad crop', () => {
    const pixels = new Uint8Array([255,255,255,255, 255,255,255,255, 0,0,0,255, 0,0,0,255])
    const original = pixels.slice()
    const facts = inspectionEvidence([], 123, 2, 2, pixels, { naturalSizeOf: () => null, textFitOf: () => null })
    expect(facts.pixel_facts.near_black_fraction).toBe(.5)
    expect(facts.pixel_facts.full_width_near_black_bands).toEqual([{ start_y: 1, end_y: 2 }])
    expect(pixels).toEqual(original)
    expect(JSON.stringify(facts)).not.toContain('framing_ok')
  })
  it('uses current transform geometry and keeps unstaged facts unknown', () => {
    const layer = { id: 'v', t_start_us: 0, t_end_us: 1000, params: { kind: 'VideoClip', x: { mode: 'Static', value: -20 }, y: { mode: 'Static', value: 10 } } } as any
    const probe = { naturalSizeOf: () => ({ w: 50, h: 20 }), textFitOf: () => null }
    const facts = inspectionEvidence([layer], 100, 40, 40, new Uint8Array(6400), probe)
    expect(facts.layer_bounds[0]?.aabb).toEqual({ left: -20, right: 30, top: 10, bottom: 30 })
    expect(facts.layer_bounds[0]?.aabb_canvas_intersection).toEqual({ left: 0, right: 30, top: 10, bottom: 30 })
    expect(inspectionEvidence([layer], 100, 40, 40, [], { ...probe, naturalSizeOf: () => null }).layer_bounds[0]?.aabb).toBeNull()
  })
  it('distinguishes transparent black pixels and reports live geometry as unknown without mutating it', () => {
    const layer = { id: 'dragged', t_start_us: 0, t_end_us: 1000, params: { kind: 'VideoClip' } } as any
    const original = JSON.stringify(layer)
    setTransformOverride(layer.id, { dx: 15, dy: 20 })
    try {
      const facts = inspectionEvidence([layer], 100, 2, 1, [0,0,0,0, 0,0,0,255], { naturalSizeOf: () => ({ w: 2, h: 1 }), textFitOf: () => null })
      expect(facts.pixel_facts).toMatchObject({ near_black_fraction: 1, opaque_near_black_fraction: .5, fully_transparent_fraction: .5 })
      expect(facts.layer_bounds[0]).toMatchObject({ aabb: null, unknown_reason: 'uncommitted_live_transform_override' })
      expect(JSON.stringify(layer)).toBe(original)
    } finally { clearTransformOverride(layer.id) }
  })
})
