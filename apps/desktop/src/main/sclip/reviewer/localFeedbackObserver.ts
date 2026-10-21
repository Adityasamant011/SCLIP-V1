import { runtimeScope } from '../runtimeScheduler.js'
import fs from 'node:fs'
import os from 'node:os'
import { memoryHeadroom } from './memoryHeadroom'
import path from 'node:path'
import type { Project } from '../../state/model'
import { inspectTimelineFrame } from '../timelineFrame'
import { renderComposedTimelineRange } from '../rangeRender'
import { decodeRenderedPcm, measureRenderedPcm } from '../renderedAudioEvidence'
import { audioAudibility, placedLayers } from '../audioAudibility'
import type { AnalyzeRequest, AnalyzeResult, SidecarStatus } from '../visionSidecar'
import type { AudioUnderstandingBackend } from '../audioUnderstanding'
import type { FeedbackObserver } from './liveFeedback'

interface LocalFeedbackDeps {
  window(): any | null
  vision: { status(): Promise<SidecarStatus>; analyze(req: AnalyzeRequest): Promise<AnalyzeResult> }
  understand?: AudioUnderstandingBackend['understand']
  frame?: typeof inspectTimelineFrame
  render?: typeof renderComposedTimelineRange
  decode?: typeof decodeRenderedPcm
  memory?: () => { free: number; total: number }
}
const LIMITATIONS = 'Local partial observations, never creative instructions, certified defects or completion evidence. One sampled frame cannot establish motion/continuity. Audio signal and coarse recognition do not certify sentence boundaries, vocal delivery, story or music suitability. Hermes/user decides whether a concern is intentional and what to change.'

export function compactFrameFacts(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const facts = value as { canvas?: unknown; pixel_facts?: { near_black_fraction?: number }; layer_bounds?: Array<{ layer_id?: string; kind?: string; aabb?: unknown; unknown_reason?: string }> }
  return { canvas: facts.canvas, near_black_fraction: facts.pixel_facts?.near_black_fraction,
    layer_bounds: facts.layer_bounds?.slice(0, 8).map(l => ({ layer_id: l.layer_id, kind: l.kind, aabb: l.aabb, unknown_reason: l.unknown_reason })),
    limitations: 'Measured bounds and RGB at one frame, not subject position or proof that black/insets/cropping are unintended.' }
}

/** Observe the paused playhead and at most six seconds of actual mixed audio.
 * No raw-source substitution, cloud inference, downloads, edits, or A-roll gate. */
export function createLocalFeedbackObserver(deps: LocalFeedbackDeps): FeedbackObserver {
  return async (project: Project, signal: AbortSignal) => runtimeScope.run({signal,priority:0,project_id:project.project_id},async()=>{
    signal.throwIfAborted()
    const win = deps.window()
    if (!win || win.isDestroyed()) throw new Error('Open the preview to receive local observations.')
    const context = await win.webContents.executeJavaScript('({ready:typeof window.__sclipFeedbackCanObserve==="function"&&window.__sclipFeedbackCanObserve(),playing:window.__weftcutPreview?.isPlaying?.()??true,t:window.__weftcutPreview?.getPlayheadUs?.()})')
    signal.throwIfAborted()
    if (!context?.ready || context.playing) throw new Error('Deferred while playback/export is active; foreground work has priority.')
    const comp = project.compositions[project.root_id]
    const t = Math.min(comp.duration_us - 1, Math.max(0, Math.trunc(context.t ?? 0)))
    const start = Math.max(0, t - 2_000_000), end = Math.min(comp.duration_us, start + 6_000_000)
    const observation = { timeline_range_us: [start, end] as [number, number],
      visual: { status: 'not_observed' } as import('../../../shared/liveFeedback').LiveFeedbackObservation['visual'],
      audio: { status: 'not_observed' } as import('../../../shared/liveFeedback').LiveFeedbackObservation['audio'],
      limitations: LIMITATIONS, provider_calls: 0 as const }

    // Audio-only compositions remain useful without a visual model. Missing
    // model/memory is a disclosed modality gap, never a synthetic clean verdict.
    if (placedLayers(project, project.root_id, t, t + 1).some(p => p.layer.params.kind !== 'Audio')) {
      let temp: string | undefined
      try {
        const frame = await (deps.frame ?? inspectTimelineFrame)(project, { t_us: t, getActiveWindow: deps.window, requireLiveCompositor: true, passive: true })
        signal.throwIfAborted()
        observation.visual = { status: 'facts_only', t_us: frame.t_us, facts: compactFrameFacts(frame.factualEvidence) }
        const memory = deps.memory?.() ?? await memoryHeadroom()
        const status = await deps.vision.status()
        if (status.running && !['ready', 'loaded', 'idle', 'stopped'].includes(status.state)) throw new Error('Local vision is busy; foreground sensing has priority.')
        if (memory.total < 8 * 1024 ** 3 || memory.free < (status.modelLoaded ? 1 : 3) * 1024 ** 3) throw new Error('Local visual observation deferred for memory headroom.')
        signal.throwIfAborted()
        temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-live-feedback-'))
        const image = path.join(temp, 'frame.png')
        fs.writeFileSync(image, Buffer.from(frame.pngBase64, 'base64'))
        const result = await deps.vision.analyze({ imagePath: image, resolution: 'auto', maxTokens: 192, localOnly: true,
          question: 'Describe only visible subjects/text, their approximate positions, and whether any intersect the frame edges. State uncertainty. Do not choose edits, prescribe fixes, or rate aesthetics.',
          context: 'One current composed frame. Black backgrounds, insets and overlays may be intentional; no judgment of motion or the whole video is possible.' })
        signal.throwIfAborted()
        observation.visual = { status: result.ok ? 'observed' : 'unavailable', t_us: frame.t_us,
          description: result.description.slice(0, 900), model: result.model, truncated: result.outputLimitReached ?? null,
          facts: compactFrameFacts(frame.factualEvidence), ...(result.ok ? {} : { reason: result.error?.slice(0, 300) }) }
      } catch (error) {
        signal.throwIfAborted()
        observation.visual = { ...observation.visual, status: 'unavailable', reason: String(error).slice(0, 300) }
      } finally { if (temp) fs.rmSync(temp, { recursive: true, force: true }) }
    } else observation.visual = { status: 'no_visual_layer_at_sample', t_us: t }

    signal.throwIfAborted()
    if (audioAudibility(project, project.root_id, start, end).selected_count === 0) observation.audio = { status: 'no_audible_material' }
    else {
      let rendered: Awaited<ReturnType<typeof renderComposedTimelineRange>> | undefined
      try {
        // Recheck activity after visual inference. Never take a user-owned export
        // lock, interrupt playback, or render against a superseded opening.
        const allowed = await win.webContents.executeJavaScript('window.__sclipFeedbackCanObserve?.()===true && window.__weftcutPreview?.isPlaying?.()===false')
        signal.throwIfAborted()
        if (!allowed) throw new Error('Foreground playback/export started; audio observation deferred.')
        rendered = await (deps.render ?? renderComposedTimelineRange)(project, { start_us: start, end_us: end, audioOnly: true, background: true, getActiveWindow: deps.window, signal })
        const decoded = await (deps.decode ?? decodeRenderedPcm)(rendered.path, signal)
        signal.throwIfAborted()
        const pcm = decoded?.subarray(0, Math.floor((end - start) / 1e6 * 16000) * 4)
        observation.audio = pcm?.length ? { status: 'measured', signal: measureRenderedPcm(pcm, start) } : { status: 'no_audio_stream', reason: 'Expected selected audio but no rendered audio samples were decoded.' }
        if (pcm?.length && deps.understand) {
          // Existing SenseVoice CPU runner owns its process, one thread, cache,
          // cancellation and missing-model diagnostics. No resident second model.
          observation.audio.understanding = await deps.understand(pcm, start, signal)
        }
        signal.throwIfAborted()
      } catch (error) {
        signal.throwIfAborted()
        observation.audio = { status: 'unavailable', reason: String(error).slice(0, 300) }
      } finally { if (rendered) fs.rmSync(path.dirname(rendered.path), { recursive: true, force: true }) }
    }
    return observation
  })
}
