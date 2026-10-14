import type { ComputeNapi, ShotDefaultOpts } from './hybrids'

type ShotBackend = {
  analyzeShotsFloor(mediaJson: string): Promise<string>
  reduceShotReport(reportJson: string, sensitivity: number, minShotUs: number, inUs: number, outUs: number): string
  shotFloorReportCached(mediaJson: string): Promise<boolean>
  shotFloorSensitivity(): number
  shotDefaultOpts(): string
}

/** Shared native scan/reduction dependencies for actor-owned shot edits. */
export function shotCompute(backend: ShotBackend): Required<Pick<ComputeNapi,
  'analyzeShotsFloor' | 'reduceShotReport' | 'shotFloorReportCached' | 'shotFloorSensitivity' | 'shotDefaultOpts'>> {
  return {
    analyzeShotsFloor: mediaJson => backend.analyzeShotsFloor(mediaJson),
    reduceShotReport: (report, sensitivity, minShotUs, inUs, outUs) =>
      backend.reduceShotReport(report, sensitivity, minShotUs, inUs, outUs),
    shotFloorReportCached: mediaJson => backend.shotFloorReportCached(mediaJson),
    shotFloorSensitivity: () => backend.shotFloorSensitivity(),
    shotDefaultOpts: () => JSON.parse(backend.shotDefaultOpts()) as ShotDefaultOpts,
  }
}
