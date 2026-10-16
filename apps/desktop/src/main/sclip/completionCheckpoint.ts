import type { ActorHandle } from '../state/actor.js'
import { completionReview, completionDisposition, setEditingBrief, requiresDeliveryReview, type CompletionReview } from './completionReview.js'
import { validateOutputState, requiredRenderedDimensions, sourceFingerprint, deliveryProofValid, type DeliveryProof } from './finalOutput.js'
import { reviewState } from './evidenceCoordinates.js'
import { currentCritique } from './reviewer/currentCritique.js'
import { RevisionLoopGuard } from './revisionLoopGuard.js'
import { reviewProgress } from './reviewProgress.js'
import type { TimelineReviewSummary } from './reviewer/reviewerTypes.js'
export interface HermesTurnEvent {
  kind: 'start' | 'end'; turn_id: string; user_message?: string
  completed?: boolean; failed?: boolean; interrupted?: boolean; turn_exit_reason?: string; background_jobs_pending?: boolean | null
}
export interface TerminalBinding { projectId: string; sessionId: string; actor: ActorHandle; opening: string; connections: Set<string>; activeSerial?: number; activeTurn?: string; closed?: boolean }
export interface RequestAuthority { (): void; signal: AbortSignal; release(): void }
export interface CheckpointDeps {
  current(): {actor: ActorHandle; opening: string; pending: boolean} | undefined
  review(): TimelineReviewSummary | undefined
  verify(project: ReturnType<ActorHandle['snapshot']>, requirements: CompletionReview['requirements'], signal?: AbortSignal): Promise<DeliveryProof>
  endWork(binding: TerminalBinding): void
}
/** Technical lifecycle only. No agent, inference, tool impersonation or edits. */
export class CompletionCheckpoint {
  private observed?: ActorHandle
  private opening?: string
  private lastState?: string
  private unsubscribe?: () => void
  private epoch=0
  private readonly finalizations=new Map<string,Promise<any>>()
  private readonly requests=new Map<TerminalBinding,Set<AbortController>>()
  private abortRequests(binding: TerminalBinding) {
    for (const controller of this.requests.get(binding) ?? []) controller.abort()
    this.requests.delete(binding)
  }
  closeBinding(binding: TerminalBinding) { this.abortRequests(binding); binding.closed=true }
  constructor(private readonly sessions: Map<string,CompletionReview>,private readonly deps: CheckpointDeps) {}
  observe() {
    const c=this.deps.current();if(!c){for(const binding of this.requests.keys())this.abortRequests(binding);this.unsubscribe?.();this.unsubscribe=undefined;this.observed=undefined;this.opening=undefined;return}
    if(c.actor!==this.observed||c.opening!==this.opening){
      for (const binding of this.requests.keys()) if(binding.actor!==c.actor||binding.opening!==c.opening)this.abortRequests(binding)
      this.unsubscribe?.();this.observed=c.actor;this.opening=c.opening;this.epoch++;this.lastState=reviewState(c.actor.snapshot())
      const entry=completionReview(c.actor.snapshot(),this.sessions);entry.epoch=this.epoch
      delete entry.reviewedState;delete entry.delivery;delete entry.lifecycle
      this.unsubscribe=c.actor.subscribe(()=>{
        const live=this.deps.current()
        if(live?.actor!==c.actor||live?.opening!==c.opening){this.observe();return}
        const state=reviewState(c.actor.snapshot());if(state!==this.lastState){this.lastState=state;this.epoch++;completionReview(c.actor.snapshot(),this.sessions).guard.invalidateAcquiredEvidence()}
        completionReview(c.actor.snapshot(),this.sessions).epoch=this.epoch
      })
    }
  }
  bind(projectId:string,sessionId:string):TerminalBinding {
    this.observe();const c=this.deps.current()
    if(!c||c.actor.snapshot().project_id!==projectId)throw new Error('Lifecycle binding requires the current project opening')
    return {projectId,sessionId,actor:c.actor,opening:c.opening,connections:new Set()}
  }
  private current(binding:TerminalBinding) {
    this.observe();const c=this.deps.current()
    if(binding.closed||!c||c.actor!==binding.actor||c.opening!==binding.opening||c.actor.snapshot().project_id!==binding.projectId)throw new Error('Stale native terminal/project opening; no completion recorded')
    return c
  }
  start(binding:TerminalBinding,event:HermesTurnEvent) {
    const c=this.current(binding)
    if(binding.activeTurn===event.turn_id)return
    this.abortRequests(binding)
    const entry=completionReview(c.actor.snapshot(),this.sessions)
    if(event.user_message && !event.user_message.startsWith('[Sclip completion checkpoint]')){
      setEditingBrief(c.actor.snapshot(),this.sessions,event.user_message)
      entry.followupCount=0
    }
    binding.activeSerial=entry.requestSerial??0
    binding.activeTurn=event.turn_id
    entry.lifecycle={status:'running',turn_id:event.turn_id,termination:'active_native_turn'}
  }
  captureRequestAuthority(binding: TerminalBinding): RequestAuthority {
    const c = this.current(binding), entry = completionReview(c.actor.snapshot(), this.sessions)
    const serial = entry.requestSerial ?? 0, turn = binding.activeTurn
    const controller=new AbortController(),requests=this.requests.get(binding)??new Set<AbortController>()
    requests.add(controller);this.requests.set(binding,requests)
    const assert = (() => {
      controller.signal.throwIfAborted()
      this.current(binding)
      if (binding.activeTurn !== turn || (entry.requestSerial ?? 0) !== serial ||
          ['cancelled', 'interrupted'].includes(entry.lifecycle?.status ?? ''))
        throw new Error('REQUEST_AUTHORITY_EXPIRED: native request was cancelled, interrupted or superseded; no placement authorized.')
    }) as RequestAuthority
    assert.signal=controller.signal
    assert.release=()=>{requests.delete(controller);if(!requests.size&&this.requests.get(binding)===requests)this.requests.delete(binding)}
    return assert
  }
  finish(binding:TerminalBinding,event:HermesTurnEvent,allowContinuation:boolean,cancelled=false):Promise<any> {
    const key=`${binding.opening}/${binding.sessionId}/${event.turn_id}`
    const prior=this.finalizations.get(key);if(prior)return prior.then(()=>completionDisposition(this.current(binding).actor.snapshot(),this.sessions))
    if(this.finalizations.size>=64)this.finalizations.delete(this.finalizations.keys().next().value!)
    const work=this.finishOnce(binding,event,allowContinuation,cancelled)
    this.finalizations.set(key,work);return work
  }
  private async finishOnce(binding:TerminalBinding,event:HermesTurnEvent,allowContinuation:boolean,cancelled:boolean) {
    let c=this.current(binding)
    if(binding.activeTurn!==event.turn_id)throw new Error('Task end does not match a started native Hermes turn')
    const entry=completionReview(c.actor.snapshot(),this.sessions)
    if(binding.activeSerial!==(entry.requestSerial??0))return completionDisposition(c.actor.snapshot(),this.sessions)
    const serial=entry.requestSerial??0
    const termination=event.turn_exit_reason??'unknown_termination'
    const normal=!cancelled&&event.completed===true&&!event.failed&&!event.interrupted&&/^text_response\((?:finish_reason=)?(?:stop|end_turn)\)$/.test(termination)
    // Structured end is required FIRST. Settling is not an idle-completion heuristic.
    const deadline=Date.now()+30000
    while(c.pending&&Date.now()<deadline){await new Promise(r=>setTimeout(r,20));c=this.current(binding);if(binding.activeTurn!==event.turn_id)throw new Error('New turn superseded the completion checkpoint')}
    if(binding.activeTurn!==event.turn_id)throw new Error('New turn superseded the completion checkpoint')
    if(serial!==(entry.requestSerial??0))return completionDisposition(c.actor.snapshot(),this.sessions)
    if(!normal){
      const status=cancelled?'cancelled':event.interrupted||event.failed?'interrupted':'incomplete'
      entry.lifecycle={status,turn_id:event.turn_id,termination,reason:'Native Hermes stopped without a normal completed task; output remains unverified.'}
      delete entry.delivery;this.deps.endWork(binding);return completionDisposition(c.actor.snapshot(),this.sessions)
    }
    // Hermes's on_session_end is a conversational-turn event, not an assertion
    // that media was authored. Never manufacture an editing assignment here.
    if(!requiresDeliveryReview(c.actor.snapshot(),entry) && !c.pending && event.background_jobs_pending===false){
      entry.lifecycle={status:'response_only',turn_id:event.turn_id,termination,reason:'Native response finished without an editing deliverable; no media completion is claimed.'}
      delete entry.delivery;this.deps.endWork(binding)
      return completionDisposition(c.actor.snapshot(),this.sessions)
    }
    const facts=validateOutputState(c.actor.snapshot(),entry.requirements,entry.requirement)
    const state=reviewState(c.actor.snapshot()),epoch=entry.epoch??0,sources=sourceFingerprint(c.actor.snapshot())
    const problems=[...facts.errors]
    if(c.pending)problems.push('AUTHORIZED_MCP_OPERATIONS_PENDING')
    if(event.background_jobs_pending!==false)problems.push('NATIVE_BACKGROUND_WORK_PENDING_OR_UNKNOWN')
    const critique=currentCritique(c.actor.snapshot(),()=>this.deps.review()!)
    if(critique.availability!=='available')problems.push('CURRENT_CRITIQUE_UNAVAILABLE')
    const dims=requiredRenderedDimensions(c.actor.snapshot(),entry.requirements)
    const reviewed=entry.reviewedState===state&&entry.guard.status.phase==='done'&&entry.reviewedEpoch===epoch&&entry.renderedEpoch===epoch&&entry.renderedSources===sources&&entry.guard.hasCurrentRenderedEvidence(state,dims)
    if(!reviewed)problems.push('CURRENT_HERMES_RENDERED_REVIEW_REQUIRED')
    if(Object.values(entry.guard.status.outcomes).includes('unresolved'))problems.push('HERMES_REVIEW_HAS_UNRESOLVED_ISSUES')
    if(!facts.errors.length&&!c.pending&&event.background_jobs_pending===false){
      // Host render proof is separate from the agent's evidence/decision.
      const authority=this.captureRequestAuthority(binding)
      let proof: DeliveryProof
      try {proof=await this.deps.verify(c.actor.snapshot(),entry.requirements,authority.signal)}finally{authority.release()}
      c=this.current(binding)
      if(serial!==(entry.requestSerial??0))return completionDisposition(c.actor.snapshot(),this.sessions)
      if(binding.activeTurn!==event.turn_id||state!==reviewState(c.actor.snapshot())||epoch!==entry.epoch||sources!==sourceFingerprint(c.actor.snapshot())){
        entry.lifecycle={status:'review_required',turn_id:event.turn_id,termination,reason:'Project or sources changed during final validation; reacquire current evidence.'}
        delete entry.delivery;return completionDisposition(c.actor.snapshot(),this.sessions)
      }
      if(deliveryProofValid(c.actor.snapshot(),entry.requirements,proof))entry.delivery={state,epoch,sources,proof};else problems.push(`OUTPUT_RENDER_OR_DECODE_FAILED:${proof.reason}`)
    }
    if(!problems.length){entry.lifecycle={status:'completed',turn_id:event.turn_id,termination};delete entry.limitation;this.deps.endWork(binding);return completionDisposition(c.actor.snapshot(),this.sessions)}
    const canContinue=allowContinuation&&!entry.limitation&&!c.pending&&event.background_jobs_pending===false&&(entry.followupCount??0)<2&&(entry.correctionRequests??0)<2
    if(canContinue){
      entry.followupCount=(entry.followupCount??0)+1
      if(facts.errors.length)entry.correctionRequests=(entry.correctionRequests??0)+1
      // Finished guards may be reopened for a new correction task, never while
      // an active repair or its verification remains pending.
      if(entry.guard.status.phase==='done'&&(!reviewed||facts.errors.length)){entry.guard=new RevisionLoopGuard();entry.started=false;delete entry.reviewedState}
      if(!entry.started&&!facts.errors.length){if(entry.guard.status.phase==='idle')entry.guard.begin();entry.started=true}
      entry.lifecycle={status:'review_required',turn_id:event.turn_id,termination,reason:problems.join('; ')}
      return {...completionDisposition(c.actor.snapshot(),this.sessions),followup:`[Sclip completion checkpoint] CONTINUE the original creator request; it remains OPEN and UNVERIFIED. Original request: ${entry.originalBrief??'Continue the current editing brief.'}\nYour committed edit is retained. Required validation findings: ${problems.join('; ')}. Actual output: ${JSON.stringify({duration_seconds:facts.duration_seconds,layer_count:facts.current_output.layer_count,errors:facts.errors})}.\nYour next action must address the missing evidence or legal review stage using a discovered Sclip tool. Discover/describe the exact name, then use tool_call with the actual callable shape in tool_call_examples below and read its result: ${JSON.stringify(reviewProgress(entry.guard,c.actor.snapshot(),entry,binding.opening))}.\nMemory summaries, terminal echo and a final prose answer do NOT inspect the output or close this request. After current observation, make YOUR grounded issue/repair or no-repair judgment, then invoke end_agent_session. If inspection cannot finish, use end_agent_session with review_unavailable_reason and report incomplete. No additional creative edit is prescribed; you own every edit and review decision.`}
    }
    entry.limitation=problems.join('; ');entry.lifecycle={status:'incomplete',turn_id:event.turn_id,termination,reason:entry.limitation};delete entry.delivery;this.deps.endWork(binding)
    return completionDisposition(c.actor.snapshot(),this.sessions)
  }
  cancel(binding:TerminalBinding) {
    const c=this.current(binding),entry=completionReview(c.actor.snapshot(),this.sessions)
    this.abortRequests(binding)
    entry.requestSerial=(entry.requestSerial??0)+1
    entry.lifecycle={status:'cancelled',turn_id:binding.activeTurn??'',termination:'user_cancel',reason:'User cancelled the task; output remains unverified.'}
    delete entry.delivery;this.deps.endWork(binding)
  }
  interrupt(binding:TerminalBinding,reason:string,cancelled=false) {
    this.abortRequests(binding)
    try {const c=this.current(binding),entry=completionReview(c.actor.snapshot(),this.sessions);if(entry.lifecycle?.status==='completed'||entry.lifecycle?.status==='response_only'){binding.closed=true;return}entry.lifecycle={status:cancelled?'cancelled':'interrupted',turn_id:binding.activeTurn??'',termination:reason,reason:'Native process exited/restarted without a verified completion.'};delete entry.delivery;this.deps.endWork(binding)}catch{/* Old opening cannot affect the new project. */}
    binding.closed=true
  }
  close(){for(const binding of this.requests.keys())this.abortRequests(binding);this.unsubscribe?.()}
}
