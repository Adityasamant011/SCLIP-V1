/** MCP-session-only execution guard. It never inspects content or chooses an edit. */
export class RevisionLoopGuard {
  private static readonly INITIAL_MS = 300_000
  private phase: 'idle' | 'initial' | 'repair' | 'final' | 'done' = 'idle'
  private phaseStartedAt = 0
  private inspectionCalls = 0
  private inspectionLimit = 8
  private extended = false
  private checkpointSeen = false
  private activeIssue: string | null = null
  private reviewedIssueIds: Set<string> | null = null
  private readonly attempts = new Map<string, number>()
  private readonly outcomes = new Map<string, 'resolved' | 'unresolved'>()

  constructor(autoBegin = false, private readonly now: () => number = Date.now) { if (autoBegin) this.begin() }

  get status() {
    return {
      phase: this.phase, inspection_calls: this.inspectionCalls,
      inspection_limit: this.inspectionLimit, active_issue: this.activeIssue,
      phase_elapsed_ms: this.phaseStartedAt ? Math.max(0, this.now() - this.phaseStartedAt) : 0,
      phase_budget_ms: this.phase === 'initial' ? RevisionLoopGuard.INITIAL_MS : null,
      attempts: Object.fromEntries(this.attempts), outcomes: Object.fromEntries(this.outcomes),
    }
  }

  begin() {
    if (this.phase !== 'idle') throw new Error('Revision session already used on this connection; begin cannot reset attempt counts')
    this.phase = 'initial'
    // Model startup/reasoning before its first inspection is outside the
    // inspection window. Start this clock when an inspection is actually made.
    this.phaseStartedAt = 0
    this.inspectionCalls = 0
    this.inspectionLimit = 8
    this.extended = false
    this.checkpointSeen = false
    this.activeIssue = null
    this.reviewedIssueIds = null
    this.attempts.clear()
    this.outcomes.clear()
    return this.status
  }

  beforeInspection(): string | null {
    if (this.phase !== 'initial') return null
    if (this.phaseStartedAt === 0) this.phaseStartedAt = this.now()
    if (this.now() - this.phaseStartedAt >= RevisionLoopGuard.INITIAL_MS) return 'Initial review time budget reached. Stop exploring and validate an honest initial RoughCutReview now.'
    if (this.inspectionCalls >= this.inspectionLimit) return 'Initial inspection budget reached. Validate the initial RoughCutReview now, or request one bounded extension with a concrete reason.'
    this.inspectionCalls++
    return null
  }

  extendInspection(reason: unknown) {
    if (this.phase !== 'initial') throw new Error('Inspection extension is only available during initial review')
    if (this.extended) throw new Error('The single bounded inspection extension has already been used')
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('A concrete reason is required')
    this.extended = true
    this.inspectionLimit += 4
    return this.status
  }

  reviewValidated(issueIds?: string[]) {
    if (this.phase === 'initial') {
      this.reviewedIssueIds = new Set(issueIds ?? [])
      this.phase = 'repair'
      this.phaseStartedAt = this.now()
    }
    else if (this.phase === 'final') { this.phase = 'done'; this.phaseStartedAt = this.now() }
  }

  checkpointCreated() { if (this.phase === 'repair') this.checkpointSeen = true }

  selectIssue(issueId: unknown) {
    if (this.phase !== 'repair') throw new Error('Validate the initial review before selecting an issue')
    if (!this.checkpointSeen) throw new Error('Create a checkpoint before selecting an issue for revision')
    if (typeof issueId !== 'string' || !issueId.trim()) throw new Error('issue_id is required')
    if (!this.reviewedIssueIds?.has(issueId)) throw new Error(`Issue ${issueId} was not identified in the validated initial review`)
    if (this.activeIssue && this.activeIssue !== issueId) throw new Error('Finish the active issue before selecting another')
    if (this.outcomes.has(issueId)) throw new Error(`Issue ${issueId} is already closed`)
    this.activeIssue = issueId
    return this.status
  }

  beforeMutation(): string | null {
    if (this.phase === 'final') return 'Revision is finalizing; no further timeline mutations are permitted'
    if (this.phase !== 'repair') return null
    if (!this.activeIssue) return 'Select one reviewed issue with revision_control before mutating the timeline'
    if ((this.attempts.get(this.activeIssue) ?? 0) >= 3) return `Revision attempt limit reached for issue ${this.activeIssue}. No further mutations permitted for this issue. Mark it unresolved and finalize.`
    return null
  }

  mutationCommitted() {
    if (this.phase !== 'repair' || !this.activeIssue) return
    this.attempts.set(this.activeIssue, (this.attempts.get(this.activeIssue) ?? 0) + 1)
  }

  finishIssue(status: unknown) {
    if (this.phase !== 'repair' || !this.activeIssue) throw new Error('No active revision issue')
    if (status !== 'resolved' && status !== 'unresolved') throw new Error('status must be resolved or unresolved')
    this.outcomes.set(this.activeIssue, status)
    this.activeIssue = null
    return this.status
  }

  finalize() {
    if (this.phase !== 'repair') throw new Error('Finalization requires a validated initial review')
    if (this.activeIssue) throw new Error('Finish the active issue before finalization')
    this.phase = 'final'
    this.phaseStartedAt = this.now()
    return this.status
  }
}
