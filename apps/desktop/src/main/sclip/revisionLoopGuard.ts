import type { Project } from '../state/model.js'
import { placedLayers } from './audioAudibility.js'
import { createHash } from 'node:crypto'
import { evidenceDimensions, toolDimensions, type EvidenceDimension } from './evidenceModalities.js'
export class ReviewProtocolError extends Error {
  constructor(readonly details: { code: string; fields?: string[]; correction: string; issue_ids?: string[] }) { super(JSON.stringify(details)) }
}
function reject(code: string, correction: string, fields?: string[], issue_ids?: string[]): never { throw new ReviewProtocolError({ code, correction, fields, issue_ids }) }
type RecordedIssue = { id: string; description: string; severity: string; repairable: boolean; evidence_receipt_ids: string[]; affected_range_us: [number, number]; layer_ids: string[]; evidence_dimensions: EvidenceDimension[]; state: string; withdrawal?: { reason: string; evidence_receipt_ids: string[] } }

/** MCP-session-only execution guard. It never inspects content or chooses an edit. */
export class RevisionLoopGuard {
  private static readonly INITIAL_MS = 300_000
  private phase: 'idle' | 'initial' | 'decision' | 'repair' | 'final' | 'done' = 'idle'
  private phaseStartedAt = 0
  private inspectionCalls = 0
  private inspectionLimit = 4
  private extended = false
  private checkpointSeen = false
  private activeIssue: string | null = null
  private reviewedIssueIds: Set<string> | null = null
  private readonly attempts = new Map<string, number>()
  private readonly outcomes = new Map<string, 'resolved' | 'unresolved'>()
  private verificationPending = false
  private repairInspections = 0
  private readonly reservedVerificationAttempts = new Set<EvidenceDimension>()
  private retainedRepair = false
  private rollbackRegrounding = false
  private lastRollback: { checkpoint_id: string; abandoned_state_version: string; restored_state_version: string; invalidated_evidence_ids: string[] } | undefined
  private finalInspections = 0
  private completionInspections = 0
  private completionInspectionLimit = 4
  private coverageConfigured=false
  private readonly verifiedDimensions = new Set<EvidenceDimension>()
  private readonly issueRanges = new Map<string, [number, number]>()
  private readonly recordedIssues = new Map<string, RecordedIssue>()
  private reviewedState: string | undefined
  private readonly regroundedStates = new Set<string>()
  private receiptCounter = 0
  private readonly evidence = new Map<string, { id: string; tool: string; state: string; coordinate_space: string; range: [number, number]; modalities: EvidenceDimension[]; coverage: Partial<Record<EvidenceDimension,[number,number][]>> }>()

  constructor(autoBegin = false, private readonly now: () => number = Date.now) { if (autoBegin) this.begin() }

  get status() {
    return {
      workflow_stage: this.phase === 'initial' ? 'DIAGNOSING' : this.phase === 'decision' ? 'READY_TO_DECIDE' : this.phase === 'repair' ? this.verificationPending ? 'VERIFYING' : 'REPAIRING' : this.phase === 'done' ? 'COMPLETE' : this.phase.toUpperCase(),
      evidence_ids: [...this.evidence.keys()],
      last_rollback: this.lastRollback,
      rollback_regrounding_required: this.rollbackRegrounding,
      verification_dimensions_observed: [...this.verifiedDimensions],
      issues: [...this.recordedIssues.values()].map(({ state: _state, ...issue }) => issue),
      autonomous_authorization: 'Perform justified repairs with ordinary editing tools and verify them; do not ask the user for permission during this autonomous review.',
      phase: this.phase, inspection_calls: this.inspectionCalls,
      inspection_limit: this.inspectionLimit, active_issue: this.activeIssue,
      phase_elapsed_ms: this.phaseStartedAt ? Math.max(0, this.now() - this.phaseStartedAt) : 0,
      phase_budget_ms: this.phase === 'initial' ? RevisionLoopGuard.INITIAL_MS : null,
      attempts: Object.fromEntries(this.attempts), outcomes: Object.fromEntries(this.outcomes),
      verification_pending: this.verificationPending, repair_cycles_limit: 3,
      completion_inspections: this.completionInspections, completion_inspection_limit: this.completionInspectionLimit,
      next_action: this.phase === 'decision' ? 'Decide now: record_issue with receipt IDs, then select it and repair, or conclude_no_repair with a current evidence_id and reason. Further inspection requires one specific unresolved question.' : this.phase === 'initial' ? 'Inspect current timeline briefly, then record_issue for up to three prioritized issues.'
        : this.phase === 'repair' ? this.verificationPending ? 'Reinspect the changed timeline range before another edit or resolving the issue.'
          : this.rollbackRegrounding ? 'Checkpoint restored; the attempted repair was abandoned, not resolved. Gather fresh relevant evidence before another repair, withdraw with current evidence, or finish unresolved and stop.'
          : this.activeIssue ? 'Perform the smallest justified repair; stop planning once evidence is sufficient.'
            : 'Select a registered issue, checkpoint before mutation, or complete after closing all issues.'
          : 'Validate final current-timeline review and report remaining uncertainty.',
    }
  }

  /** Size the acquisition allowance from authored coverage, never from a
   * subjective style verdict. Mutations cannot repeatedly reset this budget. */
  configureForOutput(project:Project){
    if(this.coverageConfigured||this.phase==='idle')return
    this.coverageConfigured=true
    const placed=placedLayers(project),foreground=placed.filter(p=>['VideoClip','Motif','ImageOverlay'].includes(p.layer.params.kind))
    const visuals=foreground.length?foreground:placed.filter(p=>p.layer.params.kind==='Text')
    const boundaries=new Set(visuals.flatMap(p=>[p.start_us,p.end_us]))
    const coverageCalls=Math.ceil(Math.max(0,boundaries.size-1)*2/12)+2
    this.inspectionLimit=Math.min(32,Math.max(this.inspectionLimit,coverageCalls))
    this.completionInspectionLimit=Math.min(32,Math.max(4,coverageCalls))
  }

  /** Legal protocol choices only. No issue, edit or editorial verdict is inferred. */
  guidance(state: string, required: EvidenceDimension[] = []) {
    const receipts=[...this.evidence.values()].filter(r=>r.state===state&&r.coordinate_space==='timeline')
    const missing=required.filter(d=>!this.hasCurrentRenderedEvidence(state,[d]))
    const open=[...(this.reviewedIssueIds??[])].filter(id=>!this.outcomes.has(id))
    const actions:string[]=[],examples:Array<{name:string;arguments:Record<string,unknown>}>=[]
    const offer=(tool:string,args:Record<string,unknown>)=>{actions.push(tool+(typeof args.action==='string'?`:${args.action}`:''));examples.push({name:`mcp__weftcut__${tool}`,arguments:args})}
    const current=receipts.at(-1)
    if(this.phase==='idle')offer('end_agent_session',{})
    if(this.phase==='initial'||this.phase==='decision'){
      if(this.inspectionCalls<this.inspectionLimit&&(!this.phaseStartedAt||this.now()-this.phaseStartedAt<RevisionLoopGuard.INITIAL_MS))actions.push('current_rendered_inspection')
      if(!this.extended&&this.inspectionCalls>=this.inspectionLimit&&(!this.phaseStartedAt||this.now()-this.phaseStartedAt<RevisionLoopGuard.INITIAL_MS))offer('revision_control',{action:'extend_inspection',reason:'State the specific unresolved evidence question before extending.'})
      if(current&&this.recordedIssues.size<3)offer('record_issue',{
        description:'Replace with your observed issue and why it matters for the user brief; this example does not certify a defect.',
        severity:'moderate',repairable:true,evidence_receipt_ids:[current.id],
        evidence_dimensions:current.modalities,affected_range_us:current.range,
      })
    }
    if(['initial','decision','repair'].includes(this.phase)&&!this.activeIssue&&!open.length&&this.hasCurrentRenderedEvidence(state,required))
      offer('revision_control',{action:'conclude_no_repair',evidence_id:receipts.find(r=>['vision_inspect','inspect_timeline_frame','inspect_timeline_range_visuals','inspect_timeline_temporal_window','inspect_audio_visual_alignment', 'inspect_rendered_audio','render_timeline_range'].includes(r.tool))!.id,
        reason:'Supply your own judgment grounded in the current inspected result and original brief; this example is not a verdict.'})
    if(this.phase==='repair'){
      if(!this.activeIssue){
        if(open.length)offer('revision_control',{action:'select_issue',issue_id:open[0]})
        else if(!missing.length)offer('revision_control',{action:'complete'})
        else if(this.canInspectCompletion(state,required))actions.push('current_rendered_inspection')
        else offer('end_agent_session',{review_unavailable_reason:'Replace with the actual missing verification and why it could not be acquired; do not claim completion.'})
      }else if(this.verificationPending||this.rollbackRegrounding){actions.push('current_rendered_inspection')}
      else {
        if(!this.checkpointSeen)offer('checkpoint',{label:`Before repair of ${this.activeIssue}`})
        else if(!this.retainedRepair&&(this.attempts.get(this.activeIssue)??0)<3)actions.push('chosen_editing_tool')
        if(this.retainedRepair)offer('revision_control',{action:'finish_issue',status:'resolved'})
        offer('revision_control',{action:'finish_issue',status:'unresolved'})
      }
    }
    if(this.phase==='final')actions.push('validate_rough_cut_review:current_receipt_bound_review')
    if(this.phase==='done')offer('end_agent_session',{})
    // Withdrawal is an existing agent-owned judgment, not an automatic host
    // dismissal. Offer it alongside repair only when its real guard permits it.
    if(this.phase==='repair'&&!this.verificationPending){
      const withdrawable=[...this.recordedIssues.values()].find(i=>i.repairable&&!this.outcomes.has(i.id))
      const receipt=withdrawable&&receipts.find(r=>r.range[1]>=withdrawable.affected_range_us[0]&&r.range[0]<=withdrawable.affected_range_us[1])
      if(withdrawable&&receipt)offer('withdraw_issue',{issue_id:withdrawable.id,evidence_receipt_ids:[receipt.id],reason:'Supply YOUR current evidence-grounded reason for withdrawing or reclassifying this concern; this example is not a verdict.'})
    }
    const issue=this.recordedIssues.get(this.activeIssue??'')
    return {stage:this.status.workflow_stage,phase:this.phase,state_version:createHash('sha256').update(state).digest('hex'),
      legal_next_actions:actions,tool_call_examples:examples.slice(0,3),
      current_timeline_receipts:receipts.slice(-4).map(r=>({id:r.id,tool:r.tool,range_us:r.range,modalities:r.modalities})),
      missing_rendered_modalities:missing,active_issue:this.activeIssue,open_issue_ids:open,
      ...(issue?{inspection_range_us:issue.affected_range_us,missing_repair_modalities:issue.evidence_dimensions.filter(d=>!this.verifiedDimensions.has(d))}:{}),
      editing_tools_allowed:this.beforeMutation(state)===null,
      instruction:'Discover the exact names with tool_search/tool_describe, then invoke tool_call using one legal example shape. Examples supply no editorial decision. record_issue already registers the initial flat diagnosis; select its returned ID, checkpoint, repair, inspect, finish_issue, complete, end_agent_session. Do not add a legacy finalize/validate loop to this flat path. Terminal echo or prose does not invoke these tools.'}
  }

  begin() {
    if (this.phase !== 'idle') throw new Error('Revision session already used on this connection; begin cannot reset attempt counts')
    this.phase = 'initial'
    // Model startup/reasoning before its first inspection is outside the
    // inspection window. Start this clock when an inspection is actually made.
    this.phaseStartedAt = 0
    this.inspectionCalls = 0
    this.inspectionLimit = 4
    this.extended = false
    this.checkpointSeen = false
    this.activeIssue = null
    this.reviewedIssueIds = null
    this.attempts.clear()
    this.outcomes.clear()
    return this.status
  }

  private canInspectCompletion(state: string, required: EvidenceDimension[]) {
    return this.phase === 'repair' && !this.activeIssue && !this.verificationPending &&
      this.reviewedState === state && ![...(this.reviewedIssueIds ?? [])].some(id => !this.outcomes.has(id)) &&
      this.completionInspections < this.completionInspectionLimit &&
      required.some(d => !this.hasCurrentRenderedEvidence(state,[d]))
  }

  beforeInspection(name = 'get_timeline_context', args: Record<string, unknown> = {}, completion?: { state: string; required: EvidenceDimension[] }): string | null {
    if (this.phase === 'repair') {
      if (!this.activeIssue) {
        // Closing a visual repair invalidates the old state's audio receipts too.
        // Permit only bounded acquisition of still-missing final modalities, not
        // a new diagnosis, source inspection, mutation or automatic repair.
        if (completion && this.canInspectCompletion(completion.state,completion.required)) {
          const timeline = !('media_id' in args || 'source_t_us' in args || 'image_path' in args) &&
            (name === 'inspect_timeline_frame' || typeof (args.timeline_t_us ?? args.t_us ?? args.start_us) === 'number')
          const potential: EvidenceDimension[] = name === 'inspect_audio_visual_alignment' ? ['visual','geometry','audio','speech','alignment'] : name === 'inspect_rendered_audio' ? ['audio','speech']
            : ['vision_inspect','inspect_timeline_frame','inspect_timeline_range_visuals','inspect_timeline_temporal_window'].includes(name) ? ['visual','geometry']
            : name === 'render_timeline_range' ? ['visual','audio'] : []
          if (timeline && completion.required.some(d => potential.includes(d) && !this.hasCurrentRenderedEvidence(completion.state,[d]))) {
            this.completionInspections++
            return null
          }
        }
        return 'Diagnosis is complete. Select a registered issue before focused inspection; only bounded current rendered checks of missing completion modalities are allowed after all issues close. If verification is unavailable, report it honestly.'
      }
      if (this.verificationPending && !this.isRelevantTimelineInspection(name, args)) return 'Verification requires current timeline evidence overlapping the changed issue range, not unrelated/source-only evidence.'
      if (this.repairInspections >= 2) {
        // Metadata can consume the exploratory budget without satisfying the
        // mandatory changed-output modalities. Reserve one bounded attempt per
        // missing modality; permission to inspect is never evidence of success.
        const potential: EvidenceDimension[] = name === 'inspect_audio_visual_alignment' ? ['visual','geometry','audio','speech','alignment'] : name === 'inspect_rendered_audio' ? ['audio', 'speech']
          : ['vision_inspect', 'inspect_timeline_frame', 'inspect_timeline_range_visuals', 'inspect_timeline_temporal_window'].includes(name) ? ['visual', 'geometry']
          : name === 'render_timeline_range' ? ['visual', 'audio'] : []
        const issue = this.recordedIssues.get(this.activeIssue)
        const missing = issue?.evidence_dimensions.filter(d => !this.verifiedDimensions.has(d) && potential.includes(d) && !this.reservedVerificationAttempts.has(d)) ?? []
        if (this.verificationPending && missing.length) {
          missing.forEach(d => this.reservedVerificationAttempts.add(d))
          return null
        }
        return this.verificationPending
          ? 'Focused inspection budget reached, including required verification attempts. Report review unavailable honestly; do not claim resolution or completion without current evidence.'
          : 'Focused inspection budget reached. Make the justified repair now, or finish this issue honestly as unresolved.'
      }
      this.repairInspections++
      return null
    }
    if (this.phase === 'final') return this.finalInspections++ < 2 ? null : 'Final verification budget reached; validate the final review and stop.'
    if (this.phase !== 'initial' && this.phase !== 'decision') return this.phase === 'done' ? 'Review is complete; stop.' : null
    if (this.phaseStartedAt === 0) this.phaseStartedAt = this.now()
    if (this.now() - this.phaseStartedAt >= RevisionLoopGuard.INITIAL_MS) { this.phase = 'decision'; return 'Initial review time budget reached. Decide now: validate a grounded issue, or conclude_no_repair with fresh evidence and reason.' }
    if (this.inspectionCalls >= this.inspectionLimit) return 'Initial inspection budget reached. Use record_issue with existing evidence_receipt_ids now, or conclude_no_repair if none is justified. One extend_inspection with a specific unresolved question remains available.'
    this.inspectionCalls++
    if (this.inspectionCalls >= this.inspectionLimit) this.phase = 'decision'
    return null
  }

  private technicalRefunds=0
  /** Failed acquisition is not evidence. Permit a bounded recovery route, never
   * an unlimited rescan loop or automatic reopening of completed review. */
  inspectionFailed(error:unknown) {
    if(this.technicalRefunds>=3||!/(?:timeout|timed out|CURRENT_FRAME_UNAVAILABLE|CAPTURE_|RESOURCE_|INSPECTION_BINDING_CHANGED)/i.test(String(error)))return
    this.technicalRefunds++
    if(this.phase==='initial'||this.phase==='decision')this.inspectionLimit++
    else if(this.phase==='repair'){this.repairInspections=Math.max(0,this.repairInspections-1);this.completionInspectionLimit++;this.reservedVerificationAttempts.clear()}
    else if(this.phase==='final')this.finalInspections=Math.max(0,this.finalInspections-1)
  }

  extendInspection(reason: unknown) {
    if (this.phase !== 'initial' && this.phase !== 'decision') throw new Error('Inspection extension is only available during initial review')
    if (this.extended) throw new Error('The single bounded inspection extension has already been used')
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('A concrete reason is required')
    this.extended = true
    this.inspectionLimit += 2
    this.phase = 'initial'
    return this.status
  }

  reviewValidated(issueIds?: string[], ranges: Record<string, [number, number]> = {}, currentState?: string) {
    if (this.phase === 'initial' || this.phase === 'decision' || (this.phase === 'repair' && !this.activeIssue)) {
      if ((issueIds?.length ?? 0) > 3) throw new Error('Prioritize at most three verified issues for this bounded repair session')
      this.reviewedIssueIds = new Set([...(issueIds ?? []), ...[...this.recordedIssues.values()].filter(i => i.repairable && !this.outcomes.has(i.id)).map(i => i.id)])
      this.reviewedState = currentState
      for (const [id, range] of Object.entries(ranges)) this.issueRanges.set(id, range)
      this.phase = 'repair'
      this.phaseStartedAt = this.now()
    }
    else if (this.phase === 'final') { this.phase = 'done'; this.phaseStartedAt = this.now() }
  }

  checkpointCreated() { if (this.phase === 'repair') this.checkpointSeen = true }

  selectIssue(issueId: unknown, currentState?: string) {
    if (this.phase !== 'repair') throw new Error('Validate the initial review before selecting an issue')
    if (!this.checkpointSeen && !this.recordedIssues.has(String(issueId))) throw new Error('Create a checkpoint before selecting an issue for revision')
    if ((this.recordedIssues.get(String(issueId))?.state ?? this.reviewedState) !== undefined && (this.recordedIssues.get(String(issueId))?.state ?? this.reviewedState) !== currentState) throw new Error('Timeline changed since review. Acquire fresh evidence and record the current issue before selecting it')
    if (typeof issueId !== 'string' || !issueId.trim()) throw new Error('issue_id is required')
    if (!this.reviewedIssueIds?.has(issueId)) throw new Error(`Issue ${issueId} was not identified in the validated initial review`)
    if (this.activeIssue && this.activeIssue !== issueId) throw new Error('Finish the active issue before selecting another')
    if (this.outcomes.has(issueId)) throw new Error(`Issue ${issueId} is already closed`)
    if (!this.activeIssue && this.outcomes.size >= 3) throw new Error('Three repair cycles completed; finalize with remaining issues reported honestly')
    if (!this.activeIssue) { this.repairInspections = 0; this.reservedVerificationAttempts.clear(); this.retainedRepair = false }
    this.activeIssue = issueId
    return this.status
  }

  beforeMutation(currentState?: string): string | null {
    if (this.phase === 'initial' || this.phase === 'decision') return 'Validate a grounded initial review before mutating during a revision session'
    if (this.phase === 'final' || this.phase === 'done') return 'Revision is finalizing; no further timeline mutations are permitted'
    if (this.phase !== 'repair') return null
    if (!this.activeIssue) return 'Select one registered issue with revision_control before mutating the timeline'
    if (!this.checkpointSeen) return 'Create a checkpoint before mutating the timeline'
    if ((this.attempts.get(this.activeIssue) ?? 0) >= 3) return `Revision attempt limit reached for issue ${this.activeIssue}. No further mutations permitted for this issue. Mark it unresolved and finalize.`
    if (this.reviewedState !== undefined && this.reviewedState !== currentState) return 'Timeline changed outside this repair. Mark the issue unresolved, then validate a fresh current-timeline review before another edit.'
    if (this.verificationPending) return 'Reinspect the changed timeline range before another mutation'
    if (this.rollbackRegrounding) return 'Checkpoint restored. Acquire fresh relevant evidence before choosing another repair.'
    return null
  }

  /** Host verified that an unused media-pool import changed no authored output. */
  rebaseUnchangedOutput(previous:string,current:string) {
    if(this.reviewedState===previous)this.reviewedState=current
    for(const receipt of this.evidence.values())if(receipt.state===previous)receipt.state=current
    for(const issue of this.recordedIssues.values())if(issue.state===previous)issue.state=current
  }

  mutationCommitted(currentState?: string) {
    if (this.phase !== 'repair' || !this.activeIssue) return
    this.attempts.set(this.activeIssue, (this.attempts.get(this.activeIssue) ?? 0) + 1)
    this.reviewedState = currentState
    const issue = this.recordedIssues.get(this.activeIssue)
    if (issue && currentState !== undefined) issue.state = currentState
    this.verificationPending = true
    this.retainedRepair = true
    this.rollbackRegrounding = false
    this.verifiedDimensions.clear()
    this.repairInspections = 0
    this.reservedVerificationAttempts.clear()
  }

  /** Called only after ProjectActor successfully restores a checkpoint. No editorial outcome is inferred. */
  checkpointRestored(checkpointId: string, abandonedState: string, restoredState: string) {
    if (this.phase === 'idle' || this.phase === 'done') return
    this.lastRollback = {
      checkpoint_id: checkpointId,
      abandoned_state_version: createHash('sha256').update(abandonedState).digest('hex'),
      restored_state_version: createHash('sha256').update(restoredState).digest('hex'),
      invalidated_evidence_ids: [...this.evidence.keys()],
    }
    // Invalidate even old A receipts: returning to equal content must not resurrect observations.
    this.evidence.clear()
    this.reviewedState = restoredState
    this.verificationPending = false
    this.retainedRepair = false
    this.verifiedDimensions.clear()
    this.repairInspections = 0
    this.reservedVerificationAttempts.clear()
    this.checkpointSeen = false
    this.rollbackRegrounding = Boolean(this.activeIssue)
    if (this.activeIssue) {
      const issue = this.recordedIssues.get(this.activeIssue)
      if (issue) issue.state = restoredState
    } else {
      // No selected issue: allow a bounded new diagnosis of the restored state.
      this.phase = 'initial'
      this.phaseStartedAt = this.now()
      this.inspectionLimit = this.inspectionCalls + 2
    }
    return this.status
  }

  inspectionCompleted(name: string, args: Record<string, unknown>) {
    if ((!this.verificationPending && !this.rollbackRegrounding) || !this.activeIssue) return
    // Legacy RoughCutReview compatibility; flat declared issues verify only through typed receipts.
    if (!this.recordedIssues.has(this.activeIssue) && this.isRelevantTimelineInspection(name, args)) { this.verificationPending = false; this.rollbackRegrounding = false }
  }

  private isRelevantTimelineInspection(name: string, args: Record<string, unknown>): boolean {
    const range = this.issueRanges.get(this.activeIssue ?? '')
    const t = args.timeline_t_us ?? args.t_us
    const start = typeof t === 'number' ? t : typeof args.start_us === 'number' ? args.start_us : 0
    const end = typeof t === 'number' ? t : typeof args.end_us === 'number' ? args.end_us : Infinity
    // Source evidence or a background critique alone cannot verify the changed timeline.
    if (!['get_editorial_evidence_packet', 'get_timeline_context', 'inspect_timeline_range_visuals', 'vision_inspect', 'inspect_timeline_frame', 'render_timeline_range', 'inspect_audio_visual_alignment', 'inspect_rendered_audio', 'inspect_timeline_temporal_window'].includes(name)) return false
    if (!['get_timeline_context', 'get_editorial_evidence_packet'].includes(name) && typeof t !== 'number' && typeof args.start_us !== 'number') return false
    return !range || (end >= range[0] && start <= range[1])
  }

  reground(reason: unknown, currentState: string) {
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('Reground requires the unresolved state-change question')
    if (this.reviewedState === undefined || this.reviewedState === currentState) throw new Error('Reground is only for an authoritative state change after diagnosis')
    if (this.activeIssue) throw new Error('Finish the active stale issue honestly before regrounding')
    if (this.regroundedStates.has(currentState) || this.regroundedStates.size >= 2) throw new Error('Bounded regrounding exhausted; report remaining uncertainty and stop')
    this.regroundedStates.add(currentState)
    this.phase = 'initial'
    this.phaseStartedAt = this.now()
    this.inspectionLimit = this.inspectionCalls + 2
    this.checkpointSeen = false
    return this.status
  }

  recordEvidence(tool: string, coordinate_space: string, range: [number, number], state: string, modalities: EvidenceDimension[] = toolDimensions(tool), receiptId?: string, coverage: Partial<Record<EvidenceDimension,[number,number][]>> = Object.fromEntries(modalities.map(d=>[d,[range]]))) {
    const receipt = { id: receiptId ?? `e${++this.receiptCounter}`, tool, coordinate_space, range, state, modalities, coverage }
    this.evidence.set(receipt.id, receipt)
    const issue = this.activeIssue ? this.recordedIssues.get(this.activeIssue) : undefined
    if ((this.verificationPending || this.rollbackRegrounding) && issue && coordinate_space === 'timeline' && state === this.reviewedState && range[1] >= issue.affected_range_us[0] && range[0] <= issue.affected_range_us[1]) {
      for (const dimension of modalities) if(coverage[dimension]?.some(r=>r[1]>=issue.affected_range_us[0]&&r[0]<=issue.affected_range_us[1])) this.verifiedDimensions.add(dimension)
      if (issue.evidence_dimensions.every(d => this.verifiedDimensions.has(d))) { this.verificationPending = false; this.rollbackRegrounding = false }
    }
    const { state: _state, ...observable } = receipt
    return { ...observable, state_version: createHash('sha256').update(state).digest('hex'), freshness: 'current_at_acquisition' }
  }

  /** A host-observed revision invalidates observations even if content later returns to A.
   * Keep agent decisions and active repair state; only reacquisition is required. */
  invalidateAcquiredEvidence() { this.evidence.clear() }

  hasCurrentRenderedEvidence(state: string, required: EvidenceDimension[] = []): boolean {
    const current=[...this.evidence.values()].filter(r => r.state === state && r.coordinate_space === 'timeline' &&
      ['vision_inspect', 'inspect_timeline_frame', 'inspect_timeline_range_visuals', 'inspect_timeline_temporal_window', 'inspect_audio_visual_alignment', 'inspect_rendered_audio', 'render_timeline_range'].includes(r.tool) &&
      r.modalities.some(d => ['visual', 'audio', 'speech'].includes(d) && r.coverage[d]?.length))
    return current.length>0 && required.every(d=>current.some(r=>r.modalities.includes(d)&&r.coverage[d]?.length))
  }

  private currentReceipts(ids: unknown, state: string, range?: [number, number]) {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) reject('INVALID_ISSUE', 'Supply evidence_receipt_ids: ["e1"] using observed receipt IDs, not evidence_id inside a nested issue.', ['evidence_receipt_ids'])
    const receipts = (ids as string[]).map(id => this.evidence.get(id))
    if (receipts.some(r => !r || r.state !== state)) reject('STALE_OR_UNKNOWN_EVIDENCE', 'Reacquire current evidence and use its receipt IDs.', ['evidence_receipt_ids'])
    const timeline = receipts.filter(r => r!.coordinate_space === 'timeline')
    if (!timeline.length) reject('CURRENT_TIMELINE_EVIDENCE_REQUIRED', 'Include at least one fresh CURRENT_TIMELINE receipt; source evidence may supplement it.', ['evidence_receipt_ids'])
    if (range && timeline.some(r => r!.range[1] < range[0] || r!.range[0] > range[1])) reject('EVIDENCE_RANGE_MISMATCH', 'Use current timeline receipts overlapping the affected range.', ['affected_range_us', 'evidence_receipt_ids'])
    return ids as string[]
  }

  recordIssue(args: Record<string, unknown>, state: string, duration: number, layers: Map<string, [number, number]>) {
    if (!['initial', 'decision', 'repair'].includes(this.phase) || this.activeIssue) reject('INVALID_REVIEW_STAGE', 'Finish the selected issue before registering another; completed reviews cannot reopen.')
    const missing = ['description', 'severity', 'repairable', 'evidence_receipt_ids', 'evidence_dimensions'].filter(k => args[k] === undefined)
    if (missing.length) reject('INVALID_ISSUE', 'Supply the missing flat record_issue fields. No nested RoughCutReview is needed.', missing)
    if (typeof args.description !== 'string' || !args.description.trim()) reject('INVALID_ISSUE', 'Describe the issue you observed.', ['description'])
    if (!['minor', 'moderate', 'critical'].includes(String(args.severity))) reject('INVALID_ISSUE', 'severity must be minor, moderate, or critical.', ['severity'])
    if (typeof args.repairable !== 'boolean') reject('INVALID_ISSUE', 'Set repairable to your editorial judgment: true or false.', ['repairable'])
    const layerIds = args.layer_ids ?? []
    if (!Array.isArray(layerIds) || layerIds.some(id => typeof id !== 'string' || !layers.has(id))) reject('INVALID_ISSUE', 'layer_ids must identify existing current-composition layers.', ['layer_ids'])
    let range = args.affected_range_us
    if (range === undefined && layerIds.length) range = [Math.min(...layerIds.map(id => layers.get(id)![0])), Math.max(...layerIds.map(id => layers.get(id)![1]))]
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger) || range[0] < 0 || range[1] < range[0] || range[1] > duration) reject('INVALID_ISSUE', 'Provide affected_range_us: [timeline_start_us, timeline_end_us], or current layer_ids so Sclip derives their bounds.', ['affected_range_us', 'layer_ids'])
    const bounded = range as [number, number]
    const receipts = this.currentReceipts(args.evidence_receipt_ids, state, bounded)
    let dimensions: EvidenceDimension[]
    try { dimensions = evidenceDimensions(args.evidence_dimensions) } catch(e) { reject('INVALID_EVIDENCE_DIMENSIONS', String(e), ['evidence_dimensions']) }
    const observed = new Set(receipts.flatMap(id => {const r=this.evidence.get(id)!;return r.modalities.filter(d=>r.coverage[d]?.some(x=>x[1]>=bounded[0]&&x[0]<=bounded[1]))}))
    if (dimensions.some(d => !observed.has(d))) reject('UNSUPPORTED_EVIDENCE_DIMENSION', 'Selected receipts must observe each declared dimension. Acquire relevant evidence; infrastructure does not infer your issue from its description.', ['evidence_dimensions','evidence_receipt_ids'])
    if (this.recordedIssues.size >= 3) reject('ISSUE_LIMIT', 'Three issues are already registered; prioritize those and finish this bounded session.')
    const id = `issue-${this.recordedIssues.size + 1}`
    const issue: RecordedIssue = { id, description: args.description as string, severity: String(args.severity), repairable: args.repairable as boolean, evidence_receipt_ids: receipts, affected_range_us: bounded, layer_ids: layerIds as string[], evidence_dimensions: dimensions, state }
    this.recordedIssues.set(id, issue)
    this.reviewedIssueIds ??= new Set()
    if (issue.repairable) this.reviewedIssueIds.add(id)
    this.issueRanges.set(id, bounded)
    this.reviewedState = state
    this.phase = 'repair'
    const { state: _state, ...observable } = issue
    return { accepted: true, issue: observable, review_session: this.status }
  }

  withdrawIssue(args: Record<string, unknown>, state: string) {
    const issue = this.recordedIssues.get(String(args.issue_id))
    if (!issue || this.phase !== 'repair' || this.outcomes.has(issue.id)) reject('INVALID_ISSUE', 'Supply an open recorded issue_id.', ['issue_id'])
    if (this.verificationPending) reject('VERIFICATION_REQUIRED', 'Reinspect the committed repair before withdrawing its issue.')
    if (typeof args.reason !== 'string' || !args.reason.trim()) reject('INVALID_ISSUE', 'Explain your editorial reason for withdrawing or reclassifying the issue.', ['reason'])
    const receipts = this.currentReceipts(args.evidence_receipt_ids, state, issue.affected_range_us)
    issue.repairable = false
    issue.state = state
    issue.withdrawal = { reason: args.reason as string, evidence_receipt_ids: receipts }
    this.reviewedIssueIds?.delete(issue.id)
    if (this.activeIssue === issue.id) { this.activeIssue = null; this.rollbackRegrounding = false; this.retainedRepair = false }
    return { accepted: true, review_session: this.status }
  }

  complete() {
    if (this.phase !== 'repair' || this.activeIssue || this.verificationPending) reject('INCOMPLETE_REVIEW', 'Finish and verify the active issue before completing.')
    const open = [...(this.reviewedIssueIds ?? [])].filter(id => !this.outcomes.has(id))
    if (open.length) reject('ACTIVE_REPAIRABLE_ISSUES', 'Repair, explicitly finish unresolved, or withdraw each open issue before completing.', undefined, open)
    this.phase = 'done'
    return this.status
  }

  validateEvidence(review: any, state: string): string | null {
    if (!review?.inspections?.length) return 'Review conclusions require at least one fresh CURRENT_TIMELINE evidence inspection.'
    for (const inspection of review?.inspections ?? []) {
      const receipt = this.evidence.get(inspection.evidence_id)
      if (!receipt || receipt.state !== state || receipt.coordinate_space !== 'timeline') return 'Each review inspection needs an evidence_id from fresh CURRENT_TIMELINE evidence; reacquire evidence after a state change.'
      const [start, end] = inspection.timeline_range_us ?? []
      if (receipt.range[1] < start || receipt.range[0] > end) return 'Inspection range does not overlap its observed evidence.'
      if (inspection.method === 'frame' && !['inspect_timeline_range_visuals', 'vision_inspect', 'inspect_timeline_frame'].includes(receipt.tool)) return 'A frame claim requires an actual current-timeline frame evidence_id.'
      if (inspection.method === 'range_render' && receipt.tool !== 'render_timeline_range') return 'A render claim requires a current-timeline range render evidence_id.'
    }
    return null
  }

  concludeNoRepair(reason: unknown, evidenceId: unknown, state: string) {
    const open = [...(this.reviewedIssueIds ?? [])].filter(id => !this.outcomes.has(id))
    if (this.activeIssue || open.length) reject('ACTIVE_REPAIRABLE_ISSUES', 'Act on the issues you classified as repairable, or withdraw_issue with current evidence and a reason before concluding no repair.', undefined, open)
    if (!['initial', 'decision', 'repair'].includes(this.phase)) throw new Error('Review is already finalizing or complete')
    const receipt = this.evidence.get(String(evidenceId))
    if (typeof reason !== 'string' || !reason.trim() || !receipt || receipt.state !== state || receipt.coordinate_space !== 'timeline') throw new Error('No-justified-repair conclusion requires a reason and fresh current timeline evidence_id.')
    this.phase = 'done'
    return this.status
  }

  finishIssue(status: unknown, currentState?: string) {
    if(currentState !== undefined && currentState !== this.reviewedState) reject('STALE_VERIFICATION', 'State changed after observation. Acquire current evidence and reground before resolving.')
    if (this.phase !== 'repair' || !this.activeIssue) throw new Error('No active revision issue')
    if (status !== 'resolved' && status !== 'unresolved') throw new Error('status must be resolved or unresolved')
    if (this.verificationPending) throw new Error('A committed mutation requires relevant timeline reinspection before closing the issue')
    if (status === 'resolved' && (!this.retainedRepair || this.verificationPending)) throw new Error('Resolving a repair issue requires a committed mutation followed by relevant timeline reinspection')
    this.outcomes.set(this.activeIssue, status)
    this.activeIssue = null
    this.verificationPending = false
    this.rollbackRegrounding = false
    this.retainedRepair = false
    return this.status
  }

  finalize() {
    if (this.phase !== 'repair') throw new Error('Finalization requires a validated initial review')
    if (this.activeIssue) throw new Error('Finish the active issue before finalization')
    if ([...(this.reviewedIssueIds ?? [])].some(id => !this.outcomes.has(id))) throw new Error('Close every verified repairable issue or explicitly withdraw it before finalization')
    this.phase = 'final'
    this.phaseStartedAt = this.now()
    return this.status
  }
}
