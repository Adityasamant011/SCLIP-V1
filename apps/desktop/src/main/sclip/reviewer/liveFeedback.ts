import { createHash } from 'node:crypto'
import type { Project } from '../../state/model'
import { reviewState } from '../evidenceCoordinates'
import { sourceFingerprint } from '../finalOutput'
import type { LiveFeedbackObservation, LiveFeedbackSnapshot } from '../../../shared/liveFeedback'

export type FeedbackObserver = (project: Project, signal: AbortSignal) => Promise<LiveFeedbackObservation>
interface FeedbackDeps {
  actor: { snapshot(): Project; subscribe(listener: () => void): (() => void) | undefined }
  opening(): unknown
  observe: FeedbackObserver
  enabled?: boolean
  idleMs?: number
  intervalMs?: number
  deadlineMs?: number
}

/** Debounced, one-job local sensing. Does not dispatch edits, start Hermes turns,
 * call a hosted model or issue review receipts. A→B→A invalidates by epoch. */
export class LiveFeedback {
  private epoch = 0
  private enabled: boolean
  private stopped = false
  private timer?: ReturnType<typeof setTimeout>
  private deadline?: ReturnType<typeof setTimeout>
  private controller?: AbortController
  private busy = false
  private lastAttempt = -Infinity
  private resultSources?: string
  private resultOpening?: unknown
  private result: LiveFeedbackSnapshot
  private readonly unsubscribe?: () => void

  constructor(private readonly deps: FeedbackDeps) {
    this.enabled = deps.enabled ?? false
    this.result = this.status('waiting')
    this.unsubscribe = deps.actor.subscribe(() => this.changed())
    this.schedule()
  }
  private identity() {
    const p = this.deps.actor.snapshot()
    return { project_id: p.project_id, state_version: createHash('sha256').update(reviewState(p)).digest('hex') }
  }
  private status(status: LiveFeedbackSnapshot['status'], reason?: string): LiveFeedbackSnapshot {
    return { ...this.identity(), epoch: this.epoch, enabled: this.enabled, status: this.enabled ? status : 'disabled', updated_at: Date.now(), ...(reason ? { reason } : {}) }
  }
  snapshot(): LiveFeedbackSnapshot {
    const identity = this.identity()
    if (identity.project_id !== this.result.project_id || identity.state_version !== this.result.state_version || this.result.observation && (this.resultOpening !== this.deps.opening() || this.resultSources !== sourceFingerprint(this.deps.actor.snapshot()))) {
      this.changed()
      return this.result
    }
    return this.result
  }
  setEnabled(enabled: boolean) {
    if (this.stopped) return
    this.enabled = enabled
    this.changed()
  }
  private changed() {
    this.epoch++
    this.controller?.abort()
    this.result = this.status('waiting', 'Edit changed; previous observations invalidated.')
    this.schedule()
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    if (this.stopped || !this.enabled) return
    const delay = Math.max(this.deps.idleMs ?? 4000, (this.deps.intervalMs ?? 20_000) - (Date.now() - this.lastAttempt))
    this.timer = setTimeout(() => { this.timer = undefined; void this.observe().catch(error => {
      if (!this.stopped) this.result = this.status('deferred', String(error).slice(0, 300))
    }) }, delay)
    this.timer.unref?.()
  }
  private async observe() {
    if (this.stopped || !this.enabled) return
    if (this.busy) { this.schedule(); return }
    const project = this.deps.actor.snapshot(), epoch = this.epoch, opening = this.deps.opening()
    const state = reviewState(project), sources = sourceFingerprint(project)
    if (!project.compositions[project.root_id]?.duration_us) { this.result = this.status('waiting', 'Timeline is empty.'); return }
    const controller = this.controller = new AbortController()
    this.busy = true
    this.lastAttempt = Date.now()
    this.result = this.status('observing')
    const current = () => !this.stopped && this.enabled && !controller.signal.aborted && epoch === this.epoch && opening === this.deps.opening() && state === reviewState(this.deps.actor.snapshot()) && sources === sourceFingerprint(this.deps.actor.snapshot())
    this.deadline = setTimeout(() => {
      if (current()) this.result = this.status('deferred', 'Local observation exceeded its time budget; no completed observation recorded.')
      controller.abort()
    }, this.deps.deadlineMs ?? 30_000)
    this.deadline.unref?.()
    try {
      const observation = await this.deps.observe(project, controller.signal)
      if (current()) { this.resultSources = sources; this.resultOpening = opening; this.result = { ...this.status('available'), observation } }
      else if (!this.stopped && this.enabled && !controller.signal.aborted) this.result = this.status('waiting', 'Observation opening or sources changed; result discarded.')
    } catch (error) {
      if (current()) this.result = this.status('deferred', error instanceof Error ? error.message.slice(0, 300) : 'Local observation unavailable')
    } finally {
      if (this.deadline) clearTimeout(this.deadline)
      this.deadline = undefined
      this.busy = false
      // Keep the physical inference lease until the observer really settles,
      // even if an HTTP/model operation could not be interrupted immediately.
      if (!this.stopped && this.enabled && (epoch !== this.epoch || opening !== this.deps.opening() || sources !== sourceFingerprint(this.deps.actor.snapshot()) || this.result.status === 'deferred')) this.schedule()
    }
  }
  dispose() {
    if (this.stopped) return
    this.stopped = true
    this.controller?.abort()
    if (this.timer) clearTimeout(this.timer)
    if (this.deadline) clearTimeout(this.deadline)
    this.unsubscribe?.()
    this.enabled = false
    this.result = this.status('disabled')
  }
}
