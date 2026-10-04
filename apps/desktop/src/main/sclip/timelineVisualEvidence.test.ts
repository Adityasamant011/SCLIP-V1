import { describe, expect, it, vi } from 'vitest'
import { blankProject } from '../state/model'
import { uuidV7Gen } from '../state/ids'
import { inspectTimelineRangeVisuals, representativeTimes, subjectObservations } from './timelineVisualEvidence'
const analyze = vi.hoisted(() => vi.fn(async (_req: any) => ({ ok: true, description: 'Sample 0 shows wall/light; later samples show a visible person near left boundary.', subjectVisible: true, subjectPosition: 'center-left', framingOk: false, confidence: null, visibleContent: ['person'], model: 'synthetic', latencyMs: 0 })))
vi.mock('./visionRuntime', () => ({ getVisionRuntime: () => ({ analyze }) }))
describe('Representative visual evidence', () => {
  it('captures five grounded timeline samples and uses one bounded model request', async () => {
    analyze.mockClear()
    const project = blankProject(uuidV7Gen(), 'Synthetic visuals'); project.compositions[project.root_id]!.duration_us = 60_000_000
    const execute = vi.fn(async (code: string) => ({ pngBase64: Buffer.from('synthetic image').toString('base64'), tUs: Number(code.match(/captureFrameAt\((\d+)/)![1]), factualEvidence: { layer_bounds: [{ canvas_coverage: { geometry: 'full' } }] } }))
    const result = await inspectTimelineRangeVisuals(project, { start_us: 0, end_us: 7_000_000 }, () => ({ isDestroyed: () => false, webContents: { executeJavaScript: execute } }))
    expect(execute).toHaveBeenCalledTimes(5); expect(analyze).toHaveBeenCalledTimes(1)
    expect(analyze.mock.calls[0]![0].imagePaths).toHaveLength(5)
    expect(result.representative_samples).toHaveLength(5)
    for (const sample of result.representative_samples) {
      expect(sample).toMatchObject({ coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', composition_id: project.root_id })
      expect(sample.timeline_t_us).toBeGreaterThanOrEqual(0); expect(sample.timeline_t_us).toBeLessThan(7_000_000)
      expect(sample.composed_frame_facts.layer_bounds[0].canvas_coverage.geometry).toBe('full')
    }
    expect(result.visual_observations.description).toContain('wall/light')
    expect(result.semantics).toContain('not a subject/composition verdict')
  })
  it('bounds sample count and rejects outside timeline before any inference', async () => {
    expect(() => representativeTimes(0, 60_000_000, 20)).toThrow('2 to 5')
    analyze.mockClear(); const project = blankProject(uuidV7Gen(), 'Synthetic'); project.compositions[project.root_id]!.duration_us = 60_000_000
    await expect(inspectTimelineRangeVisuals(project, { start_us: 0, end_us: 200_000_000 })).rejects.toThrow('INVALID_EVIDENCE_COORDINATE')
    expect(analyze).not.toHaveBeenCalled()
  })
  it('exposes uncertain subject observations without framing verdicts or invented regions', async () => {
    const result = subjectObservations(await analyze({} as any))
    expect(result.approximate_subject_position).toBe('center-left')
    expect(result.bounding_regions).toBeNull(); expect(result.confidence).toBeNull()
    expect(JSON.stringify(result)).not.toContain('framingOk'); expect(JSON.stringify(result)).not.toContain('framing_ok')
    expect(result.limitations).toContain('No aesthetic verdict')
  })
})
