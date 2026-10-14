import { describe, expect, it } from 'vitest'
import { shotCompute } from './shotCompute'

describe('desktop native shot dependencies', () => {
  it('forwards the scan and exact source-window coordinates with the native receiver', async () => {
    const backend = {
      report: JSON.stringify({ shots: [{ t_start_us: 2_000_000, t_end_us: 4_000_000 }], cut_scores: [] }),
      async analyzeShotsFloor(media: string) { expect(media).toBe('{"id":"fixture"}'); return this.report },
      reduceShotReport(report: string, sensitivity: number, minimum: number, start: number, end: number) {
        expect(report).toBe(this.report)
        expect([sensitivity, minimum, start, end]).toEqual([0.4, 500_000, 1_000_000, 5_000_000])
        return report
      },
      async shotFloorReportCached() { return true },
      shotFloorSensitivity() { return 0.1 },
      shotDefaultOpts() { return '{"sensitivity":0.4,"min_shot_us":500000}' },
    }
    const facade = shotCompute(backend)
    const report = await facade.analyzeShotsFloor('{"id":"fixture"}')
    expect(facade.reduceShotReport(report, 0.4, 500_000, 1_000_000, 5_000_000)).toBe(backend.report)
    expect(await facade.shotFloorReportCached('{}')).toBe(true)
    expect(facade.shotFloorSensitivity()).toBe(0.1)
    expect(facade.shotDefaultOpts()).toEqual({ sensitivity: 0.4, min_shot_us: 500_000 })
  })
})
