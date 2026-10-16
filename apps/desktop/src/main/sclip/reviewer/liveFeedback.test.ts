import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mediaItemTemplate } from '../../state/mutations/media'
import { LiveFeedback, type FeedbackObserver } from './liveFeedback'
import { blankProject } from '../../state/model'
import { seededGen } from '../../state/ids'
import { feedbackContext } from './feedbackContext'
import type { LiveFeedbackObservation } from '../../../shared/liveFeedback'

const observation: LiveFeedbackObservation = { timeline_range_us: [0, 1_000_000], visual: { status: 'observed', description: 'Synthetic scene' }, audio: { status: 'no_audible_material' }, limitations: 'Partial observations, not completion.', provider_calls: 0 }
const reviewers: LiveFeedback[] = []
afterEach(() => { reviewers.splice(0).forEach(r => r.dispose()); vi.useRealTimers() })
function fixture(observe = vi.fn<FeedbackObserver>(async () => observation), enabled = true) {
  vi.useFakeTimers()
  const project = blankProject(seededGen(), 'Synthetic feedback')
  project.compositions[project.root_id].duration_us = 2_000_000
  let listener = () => {}, opening = 'opening-a'
  const unsubscribe = vi.fn()
  const reviewer = new LiveFeedback({ actor: { snapshot: () => project, subscribe: l => { listener = l; return unsubscribe } }, opening: () => opening, observe,
    enabled, idleMs: 10, intervalMs: 100, deadlineMs: 80 })
  reviewers.push(reviewer)
  return { reviewer, project, observe, unsubscribe, notify: () => listener(), reopen: () => { opening = 'opening-b' } }
}
describe('continuous local feedback ownership and admission', () => {
  it('debounces edits, observes automatically, then does not repeat unchanged successful work', async () => {
    const f = fixture()
    f.notify(); await vi.advanceTimersByTimeAsync(6); f.notify()
    await vi.advanceTimersByTimeAsync(9); expect(f.observe).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1); expect(f.observe).toHaveBeenCalledOnce()
    expect(f.reviewer.snapshot().status).toBe('available')
    expect(feedbackContext(f.project, f.reviewer.snapshot())?.visual.description).toBe('Synthetic scene')
    await vi.advanceTimersByTimeAsync(1000); expect(f.observe).toHaveBeenCalledOnce()
  })
  it('discards in-flight A→B→A results and aborts only its owned observation', async () => {
    let finish!: (v: LiveFeedbackObservation) => void
    const f = fixture(vi.fn(() => new Promise<LiveFeedbackObservation>(r => { finish = r })))
    await vi.advanceTimersByTimeAsync(10)
    const signal = f.observe.mock.calls[0]![1] as AbortSignal
    f.project.compositions[f.project.root_id].width++; f.notify()
    f.project.compositions[f.project.root_id].width--; f.notify()
    expect(signal.aborted).toBe(true)
    finish(observation); await vi.advanceTimersByTimeAsync(0)
    expect(f.reviewer.snapshot().observation).toBeUndefined()
    expect(f.reviewer.snapshot().epoch).toBe(2)
  })
  it('keeps physical concurrency at one after timeout until a late worker really settles', async () => {
    let finish!: (v: LiveFeedbackObservation) => void
    const f = fixture(vi.fn(() => new Promise<LiveFeedbackObservation>(r => { finish = r })))
    await vi.advanceTimersByTimeAsync(500)
    expect(f.observe).toHaveBeenCalledOnce()
    expect(f.reviewer.snapshot().status).toBe('deferred')
    finish(observation); await vi.advanceTimersByTimeAsync(0)
    expect(f.reviewer.snapshot().observation).toBeUndefined()
    await vi.advanceTimersByTimeAsync(10); expect(f.observe).toHaveBeenCalledTimes(2)
  })
  it('rejects reopening the same project during a job and refreshes after the old job settles', async () => {
    let finish!: (v: LiveFeedbackObservation) => void
    const f = fixture(vi.fn(() => new Promise<LiveFeedbackObservation>(r => { finish = r })))
    await vi.advanceTimersByTimeAsync(10); f.reopen(); finish(observation)
    await vi.advanceTimersByTimeAsync(0); expect(f.reviewer.snapshot().status).toBe('waiting')
    expect(f.reviewer.snapshot().observation).toBeUndefined()
  })
  it('disabled/disposed reviewers do not perform inference or retain a ready result', async () => {
    const f = fixture(undefined, false)
    f.notify(); await vi.advanceTimersByTimeAsync(500); expect(f.observe).not.toHaveBeenCalled()
    f.reviewer.setEnabled(true); await vi.advanceTimersByTimeAsync(10); expect(f.observe).toHaveBeenCalledOnce()
    f.reviewer.dispose(); expect(f.reviewer.snapshot().status).toBe('disabled'); expect(f.unsubscribe).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(500); expect(f.observe).toHaveBeenCalledOnce()
  })
  it('invalidates previously acquired observations when source bytes change without an actor edit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-feedback-source-'))
    try {
      const file = path.join(dir, 'synthetic.bin'); fs.writeFileSync(file, 'one')
      const f = fixture()
      f.project.media_pool.m = { ...mediaItemTemplate('m', 'Image', null, false), path_abs: file }
      const comp = f.project.compositions[f.project.root_id]
      comp.tracks[0].layers.push({ params: { kind: 'ImageOverlay', media: 'm' } } as any)
      await vi.advanceTimersByTimeAsync(10); expect(f.reviewer.snapshot().status).toBe('available')
      fs.writeFileSync(file, 'different byte length')
      expect(f.reviewer.snapshot().status).toBe('waiting')
      expect(f.reviewer.snapshot().observation).toBeUndefined()
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })
  it('does not inject observations belonging to a different project or state', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(10)
    const feedback = f.reviewer.snapshot()
    expect(feedbackContext(f.project, { ...feedback, project_id: 'another-project' })).toBeUndefined()
    expect(feedbackContext(f.project, { ...feedback, state_version: 'stale' })).toBeUndefined()
    expect(feedbackContext(f.project, { ...feedback, status: 'observing' })).toBeUndefined()
  })
})
