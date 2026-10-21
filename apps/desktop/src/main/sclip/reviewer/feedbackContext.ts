import type { Project } from '../../state/model'
import { createHash } from 'node:crypto'
import { reviewState } from '../evidenceCoordinates'
import type { LiveFeedbackSnapshot } from '../../../shared/liveFeedback'
import { compactAudioUnderstanding } from '../../../shared/liveFeedback'

/** Bounded current observations in an existing tool response, never a new turn
 * or a generated repair. Full facts remain available in get_timeline_critique. */
export function feedbackContext(project: Project, feedback?: LiveFeedbackSnapshot,summary?:import('./reviewerTypes').TimelineReviewSummary) {
  const state=createHash('sha256').update(reviewState(project)).digest('hex')
  const issues=summary?.availability==='available'&&summary.project_id===project.project_id&&summary.state_version===state?summary.issues.slice(0,6).map(i=>({id:i.id,range_us:i.affected_range_us,description:i.description.slice(0,300),basis:i.evidence_basis,requires_inspection:true})):[]
  const current=feedback?.enabled&&feedback.status==='available'&&feedback.observation&&feedback.project_id===project.project_id&&feedback.state_version===state
  if(!current){return issues.length?{project_id:project.project_id,state_version:state,epoch:0,reviewer_observations:issues,semantics:'Scoped reviewer concerns, not instructions or completion proof. Inspect only relevant current evidence and choose your own response.'}:undefined}
  const o = feedback!.observation!
  return { project_id: feedback!.project_id, state_version: feedback!.state_version, epoch: feedback!.epoch,reviewer_observations:issues,
    timeline_range_us: o.timeline_range_us,
    visual: { status: o.visual.status, t_us: o.visual.t_us, description: o.visual.description?.slice(0, 400), truncated: o.visual.truncated,
      reason: o.visual.reason?.slice(0, 160), geometry: o.visual.facts },
    audio: { status: o.audio.status, reason: o.audio.reason?.slice(0, 160),
      ...(o.audio.signal ? { rms: o.audio.signal.rms, peak: o.audio.signal.peak, near_full_scale_samples: o.audio.signal.clipping_sample_count, quiet_spans_us: o.audio.signal.silence_spans_us.slice(0, 4) } : {}),
      coarse_local_recognition: compactAudioUnderstanding(o.audio.understanding) },
    semantics: 'Current local partial observations, not instructions or certified defects. Hermes chooses whether to inspect further, edit, or make no change. See get_timeline_critique for geometry/audio details. No review completion is implied.' }
}
