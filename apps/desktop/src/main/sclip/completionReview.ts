import { validateOutputState, sourceFingerprint, deliveryProofValid, outputRequirements, type OutputRequirements, type DeliveryProof } from './finalOutput.js'
import { explicitOutputDuration, type DurationRequirement } from './editingBrief.js'
import type { Project } from '../state/model.js'
import { RevisionLoopGuard } from './revisionLoopGuard.js'
import { reviewState } from './evidenceCoordinates.js'

/** Host-scoped existing guards survive MCP transport reconnects. No creative state. */
export interface CompletionReview {
  originalBrief?: string
  requestSerial?: number
  requirements?: OutputRequirements
  epoch?: number
  renderedEpoch?: number
  renderedSources?: string
  reviewedEpoch?: number
  delivery?: { state: string; epoch: number; sources: string; proof: DeliveryProof }
  lifecycle?: { status: 'running' | 'completed' | 'review_required' | 'incomplete' | 'interrupted' | 'cancelled'; turn_id: string; termination: string; reason?: string }
  followupCount?: number
  requirement?: DurationRequirement
  correctionRequests?: number
  baseline: string
  guard: RevisionLoopGuard
  started: boolean
  reviewedState?: string
  limitation?: string
  decision?: { action: string; reason?: string }
}
export function completionReview(project: Project, sessions: Map<string, CompletionReview>): CompletionReview {
  let entry = sessions.get(project.project_id)
  if (!entry) {
    if (sessions.size >= 8) {
      const expendable = [...sessions].find(([, r]) => !r.started || r.guard.status.phase === 'done')
      if (!expendable) throw new Error('Completion review capacity reached; finish the active reviews')
      sessions.delete(expendable[0])
    }
    entry = { baseline: outputState(project), guard: new RevisionLoopGuard(), started: false }
    sessions.set(project.project_id, entry)
  }
  return entry
}
export function hasAuthoredOutput(project: Project) {
  const comp = project.compositions[project.root_id]
  return !!comp && comp.duration_us > 0 && comp.tracks.some(t => t.enabled !== false && t.layers.some(l => l.enabled && l.t_end_us > l.t_start_us))
}

/** Imports and labels alone do not change authored output. Locks affect native audio gates. Guard freshness still uses full reviewState. */
export function outputState(project: Project): string {
  const used = new Set(Object.values(project.compositions).flatMap(c => c.tracks.flatMap(t => t.layers.flatMap(l => 'media' in l.params ? [l.params.media] : []))))
  return JSON.stringify({ compositions: project.compositions, audio_roles: project.audio_roles, settings: project.settings,
    media: Object.values(project.media_pool).filter(m => used.has(m.id)).map(m => ({id:m.id,hash:m.file_hash_blake3,metadata:m.metadata})) },
    (key, value) => ['label', 'markers'].includes(key) ? undefined : value)
}
export function completionDisposition(project: Project, sessions: Map<string, CompletionReview>) {
  const entry = sessions.get(project.project_id)
  const facts=validateOutputState(project,entry?.requirements,entry?.requirement)
  if(entry?.lifecycle && ['running','interrupted','cancelled'].includes(entry.lifecycle.status))return {...entry.lifecycle,readiness:'unverified',current_output:facts.current_output}
  if(entry?.limitation || entry?.lifecycle?.status==='incomplete')return {status:'incomplete',readiness:'unverified',reason:entry.limitation??entry.lifecycle?.reason,current_output:facts.current_output}
  const state=reviewState(project)
  const reviewed=entry?.reviewedState===state && entry.guard.status.phase==='done' && entry.reviewedEpoch===(entry.epoch??0) && entry.renderedEpoch===(entry.epoch??0) && entry.renderedSources===sourceFingerprint(project)
  const delivered=entry?.delivery?.state===state && entry.delivery.epoch===(entry.epoch??0) && entry.delivery.sources===sourceFingerprint(project) && deliveryProofValid(project,entry.requirements,entry.delivery.proof)
  if(reviewed && delivered && facts.valid && !Object.values(entry.guard.status.outcomes).includes('unresolved'))return {status:entry.lifecycle?.status==='completed'?'completed':'considered_in_completed_review',readiness:'current_review_and_media_verified',decision:entry.decision,outcomes:entry.guard.status.outcomes,delivery:entry.delivery?.proof,current_output:facts.current_output,scope:'Measurable recognized requirements, current Hermes decision and decoded output; not an editorial quality certification.'}
  return {status:entry?.lifecycle?'review_required':entry?.started?'review_incomplete_in_this_state':'not_considered_in_this_state',phase:entry?.guard.status.phase??'not_started',readiness:'unverified',reason:entry?.lifecycle?.reason??'Current requirements, fresh Hermes rendered review and complete media proof are required. Idle time or model prose is not completion.',validation:facts}
}

export function setEditingBrief(project: Project, sessions: Map<string, CompletionReview>, brief: string | null) {
  const entry=completionReview(project,sessions)
  entry.requestSerial=(entry.requestSerial??0)+1
  const fresh=brief?explicitOutputDuration(brief):undefined
  if(brief!==null && !/^\s*continue\b/i.test(brief))entry.requirements=outputRequirements(brief,project)
  if(brief!==null && !/^\s*continue\b/i.test(brief))entry.originalBrief=brief.slice(0,8000)
  if(brief===null)delete entry.requirements
  if(brief===null)delete entry.originalBrief
  const stopped=!!entry.lifecycle&&['cancelled','interrupted','incomplete'].includes(entry.lifecycle.status)
  delete entry.lifecycle;delete entry.delivery
  const finished=stopped||entry.guard.status.phase==='done'||!!entry.limitation
  entry.requirement=brief===null?undefined:fresh??(finished?undefined:entry.requirement)
  if(fresh||finished)entry.correctionRequests=0
  if(finished){
    entry.baseline=outputState(project);entry.guard=new RevisionLoopGuard();entry.started=false
    delete entry.reviewedState;delete entry.reviewedEpoch;delete entry.limitation;delete entry.decision
    entry.followupCount=0
  }
}
