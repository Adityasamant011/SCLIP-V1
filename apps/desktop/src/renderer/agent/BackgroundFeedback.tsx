import { useEffect, useState } from 'react'
import { invoke } from '@/bridge/ipc'
import type { LiveFeedbackSnapshot } from '../../shared/liveFeedback'
import { compactAudioUnderstanding } from '../../shared/liveFeedback'

interface FeedbackView { project_id?: string; issues?: Array<{ id: string; description: string }>; live_feedback?: LiveFeedbackSnapshot }
export function BackgroundFeedback({ projectId }: { projectId: string }) {
  const [value, setValue] = useState<FeedbackView>()
  useEffect(() => {
    let live = true, busy = false
    setValue(undefined)
    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        const next = await invoke<FeedbackView>('sclip_get_background_feedback')
        if (live) setValue(next.project_id === projectId ? next : undefined)
      } catch { if (live) setValue(undefined) } finally { busy = false }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 2000)
    return () => { live = false; clearInterval(timer) }
  }, [projectId])
  const feedback = value?.live_feedback, observation = feedback?.observation
  const recognition = compactAudioUnderstanding(observation?.audio.understanding)
  const label = !feedback ? 'Unavailable' : feedback.status === 'available' ? 'Partial observations available' : feedback.status === 'observing' ? 'Observing paused edit…' : feedback.status === 'disabled' ? 'Paused' : feedback.status === 'deferred' ? 'Waiting for resources' : 'Waiting for editing to pause'
  return <details className="sclip-background-feedback">
    <summary>Background feedback · {label}</summary>
    {feedback && <button type="button" onClick={async () => {
      try {
        const updated = await invoke<LiveFeedbackSnapshot>('sclip_set_background_feedback', { enabled: !feedback.enabled, project_id: projectId })
        if (updated.project_id === projectId) setValue(current => ({ ...current, live_feedback: updated }))
      } catch { /* Next poll reports availability; a project change cannot toggle the new project. */ }
    }}>{feedback.enabled ? 'Pause local sensing' : 'Resume local sensing'}</button>}
    <p>Partial local observations. Hermes decides what to change; this does not certify the edit.</p>
    {feedback?.reason && <p>{feedback.reason}</p>}
    {value?.issues?.slice(0, 4).map(issue => <p key={issue.id}>{issue.description}</p>)}
    {observation && <>
      <p>Visual: {observation.visual.description || observation.visual.reason || observation.visual.status}{observation.visual.truncated ? ' (description truncated)' : ''}</p>
      <p>Audio: {observation.audio.reason || observation.audio.status}{observation.audio.signal && ` · peak ${observation.audio.signal.peak.toFixed(3)} · ${observation.audio.signal.clipping_sample_count} near-full-scale samples · ${observation.audio.signal.silence_spans_us.length} measured quiet spans`}</p>
      {recognition && <p>Local audio recognition: {recognition.observations[0]?.transcript || recognition.status}. Labels and recognition may be incorrect.</p>}
      <p>Sampled audio range {(observation.timeline_range_us[0] / 1e6).toFixed(1)}–{(observation.timeline_range_us[1] / 1e6).toFixed(1)}s. Unsampled content remains unreviewed.</p>
    </>}
  </details>
}
