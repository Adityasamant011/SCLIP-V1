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
  private finalInspections = 0
  private readonly issueRanges = new Map<string, [number, number]>()
  private reviewedState: string | undefined
  private readonly regroundedStates = new Set<string>()
  private readonly evidence = new Map<string, { id: string; tool: string; state: string; coordinate_space: string; range: [number, number] }>()

  constructor(autoBegin = false, private readonly now: () => number = Date.now) { if (autoBegin) this.begin() }

  get status() {
    return {
      workflow_stage: this.phase === 'initial' ? 'DIAGNOSING' : this.phase === 'decision' ? 'READY_TO_DECIDE' : this.phase === 'repair' ? this.verificationPending ? 'VERIFYING' : 'REPAIRING' : this.phase === 'done' ? 'COMPLETE' : this.phase.toUpperCase(),
      evidence_ids: [...this.evidence.keys()],
      phase: this.phase, inspection_calls: this.inspectionCalls,
      inspection_limit: this.inspectionLimit, active_issue: this.activeIssue,
      phase_elapsed_ms: this.phaseStartedAt ? Math.max(0, this.now() - this.phaseStartedAt) : 0,
      phase_budget_ms: this.phase === 'initial' ? RevisionLoopGuard.INITIAL_MS : null,
      attempts: Object.fromEntries(this.attempts), outcomes: Object.fromEntries(this.outcomes),
      verification_pending: this.verificationPending, repair_cycles_limit: 3,
      next_action: this.phase === 'decision' ? 'Decide now: validate a grounded issue and repair it, or conclude_no_repair with a current evidence_id and reason. Further inspection requires one specific unresolved question.' : this.phase === 'initial' ? 'Inspect current timeline briefly, then validate up to three prioritized issues.'
        : this.phase === 'repair' ? this.verificationPending ? 'Reinspect the changed timeline range before another edit or resolving the issue.'
          : this.activeIssue ? 'Perform the smallest justified repair; stop planning once evidence is sufficient.'
            : 'Checkpoint and select the highest-impact verified issue, or finalize an honest clean/unresolved result.'
          : 'Validate final current-timeline review and report remaining uncertainty.',
    }
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

  beforeInspection(name = 'get_timeline_context', args: Record<string, unknown> = {}): string | null {
    if (this.phase === 'repair') {
      if (!this.activeIssue) return 'Diagnosis is complete. Select a verified issue after checkpoint before further inspection, or finalize if clean.'
      if (this.verificationPending && !this.isRelevantTimelineInspection(name, args)) return 'Verification requires current timeline evidence overlapping the changed issue range, not unrelated/source-only evidence.'
      if (this.repairInspections >= 2) return 'Focused inspection budget reached. Make the justified repair now, or finish this issue honestly as unresolved.'
      this.repairInspections++
      return null
    }
    if (this.phase === 'final') return this.finalInspections++ < 2 ? null : 'Final verification budget reached; validate the final review and stop.'
    if (this.phase !== 'initial' && this.phase !== 'decision') return this.phase === 'done' ? 'Review is complete; stop.' : null
    if (this.phaseStartedAt === 0) this.phaseStartedAt = this.now()
    if (this.now() - this.phaseStartedAt >= RevisionLoopGuard.INITIAL_MS) { this.phase = 'decision'; return 'Initial review time budget reached. Decide now: validate a grounded issue, or conclude_no_repair with fresh evidence and reason.' }
    if (this.inspectionCalls >= this.inspectionLimit) return 'Initial inspection budget reached. Validate the initial RoughCutReview now, or request one bounded extension with a concrete reason.'
    this.inspectionCalls++
    if (this.inspectionCalls >= this.inspectionLimit) this.phase = 'decision'
    return null
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
      this.reviewedIssueIds = new Set(issueIds ?? [])
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
    if (!this.checkpointSeen) throw new Error('Create a checkpoint before selecting an issue for revision')
    if (this.reviewedState !== undefined && this.reviewedState !== currentState) throw new Error('Timeline changed since review. Validate a fresh current-timeline review before selecting an issue')
    if (typeof issueId !== 'string' || !issueId.trim()) throw new Error('issue_id is required')
    if (!this.reviewedIssueIds?.has(issueId)) throw new Error(`Issue ${issueId} was not identified in the validated initial review`)
    if (this.activeIssue && this.activeIssue !== issueId) throw new Error('Finish the active issue before selecting another')
    if (this.outcomes.has(issueId)) throw new Error(`Issue ${issueId} is already closed`)
    if (!this.activeIssue && this.outcomes.size >= 3) throw new Error('Three repair cycles completed; finalize with remaining issues reported honestly')
    if (!this.activeIssue) this.repairInspections = 0
    this.activeIssue = issueId
    return this.status
  }

  beforeMutation(currentState?: string): string | null {
    if (this.phase === 'initial' || this.phase === 'decision') return 'Validate a grounded initial review before mutating during a revision session'
    if (this.phase === 'final' || this.phase === 'done') return 'Revision is finalizing; no further timeline mutations are permitted'
    if (this.phase !== 'repair') return null
    if (!this.activeIssue) return 'Select one reviewed issue with revision_control before mutating the timeline'
    if ((this.attempts.get(this.activeIssue) ?? 0) >= 3) return `Revision attempt limit reached for issue ${this.activeIssue}. No further mutations permitted for this issue. Mark it unresolved and finalize.`
    if (this.reviewedState !== undefined && this.reviewedState !== currentState) return 'Timeline changed outside this repair. Mark the issue unresolved, then validate a fresh current-timeline review before another edit.'
    if (this.verificationPending) return 'Reinspect the changed timeline range before another mutation'
    return null
  }

  mutationCommitted(currentState?: string) {
    if (this.phase !== 'repair' || !this.activeIssue) return
    this.attempts.set(this.activeIssue, (this.attempts.get(this.activeIssue) ?? 0) + 1)
    this.reviewedState = currentState
    this.verificationPending = true
    this.repairInspections = 0
  }

  inspectionCompleted(name: string, args: Record<string, unknown>) {
    if (!this.verificationPending || !this.activeIssue) return
    if (this.isRelevantTimelineInspection(name, args)) this.verificationPending = false
  }

  private isRelevantTimelineInspection(name: string, args: Record<string, unknown>): boolean {
    const range = this.issueRanges.get(this.activeIssue ?? '')
    const t = args.timeline_t_us ?? args.t_us
    const start = typeof t === 'number' ? t : typeof args.start_us === 'number' ? args.start_us : 0
    const end = typeof t === 'number' ? t : typeof args.end_us === 'number' ? args.end_us : Infinity
    // Source evidence or a background critique alone cannot verify the changed timeline.
    if (!['get_timeline_context', 'vision_inspect', 'inspect_timeline_frame', 'render_timeline_range'].includes(name)) return false
    if (name !== 'get_timeline_context' && typeof t !== 'number' && typeof args.start_us !== 'number') return false
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

  recordEvidence(tool: string, coordinate_space: string, range: [number, number], state: string) {
    const receipt = { id: `e${this.evidence.size + 1}`, tool, coordinate_space, range, state }
    this.evidence.set(receipt.id, receipt)
    const { state: _state, ...observable } = receipt
    return observable
  }

  validateEvidence(review: any, state: string): string | null {
    if (!review?.inspections?.length) return 'Review conclusions require at least one fresh CURRENT_TIMELINE evidence inspection.'
    for (const inspection of review?.inspections ?? []) {
      const receipt = this.evidence.get(inspection.evidence_id)
      if (!receipt || receipt.state !== state || receipt.coordinate_space !== 'timeline') return 'Each review inspection needs an evidence_id from fresh CURRENT_TIMELINE evidence; reacquire evidence after a state change.'
      const [start, end] = inspection.timeline_range_us ?? []
      if (receipt.range[1] < start || receipt.range[0] > end) return 'Inspection range does not overlap its observed evidence.'
      if (inspection.method === 'frame' && !['vision_inspect', 'inspect_timeline_frame'].includes(receipt.tool)) return 'A frame claim requires an actual current-timeline frame evidence_id.'
      if (inspection.method === 'range_render' && receipt.tool !== 'render_timeline_range') return 'A render claim requires a current-timeline range render evidence_id.'
    }
    return null
  }

  concludeNoRepair(reason: unknown, evidenceId: unknown, state: string) {
    if (!['initial', 'decision', 'repair'].includes(this.phase) || this.activeIssue || this.reviewedIssueIds?.size) throw new Error('Conclude no repair only before selecting an actionable issue; close existing issues honestly instead.')
    const receipt = this.evidence.get(String(evidenceId))
    if (typeof reason !== 'string' || !reason.trim() || !receipt || receipt.state !== state || receipt.coordinate_space !== 'timeline') throw new Error('No-justified-repair conclusion requires a reason and fresh current timeline evidence_id.')
    this.phase = 'done'
    return this.status
  }

  finishIssue(status: unknown) {
    if (this.phase !== 'repair' || !this.activeIssue) throw new Error('No active revision issue')
    if (status !== 'resolved' && status !== 'unresolved') throw new Error('status must be resolved or unresolved')
    if (this.verificationPending) throw new Error('A committed mutation requires relevant timeline reinspection before closing the issue')
    if (status === 'resolved' && (!(this.attempts.get(this.activeIssue) ?? 0) || this.verificationPending)) throw new Error('Resolving a repair issue requires a committed mutation followed by relevant timeline reinspection')
    this.outcomes.set(this.activeIssue, status)
    this.activeIssue = null
    this.verificationPending = false
    return this.status
  }

  finalize() {
    if (this.phase !== 'repair') throw new Error('Finalization requires a validated initial review')
    if (this.activeIssue) throw new Error('Finish the active issue before finalization')
    if (this.reviewedIssueIds?.size && !this.outcomes.size) throw new Error('Verified issues need an attempted repair or an explicit unresolved outcome before finalization')
    this.phase = 'final'
    this.phaseStartedAt = this.now()
    return this.status
  }
}
