import type { ExportState } from '../panels/ExportPanel'
/** Internal QA renders never open the user Export UI or trigger its notifications.
 * Errors propagate to the requesting tool, rather than masquerading as a user export. */
export function createRenderPresentation(origin: 'user' | 'inspection', publish: (s: ExportState | null) => void) {
  let state: ExportState | null = null
  return {
    update(s: ExportState | null) { state = s; if (origin === 'user') publish(s) },
    finish() {
      if (origin !== 'inspection') return
      if (state?.kind === 'error') throw new Error(state.detail)
      if (state?.kind !== 'complete') throw new Error('Internal inspection render did not complete')
    },
  }
}
