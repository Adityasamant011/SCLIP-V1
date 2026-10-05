# Checkpoint restoration abandons repair verification, not issues

Status: Accepted — Phase 3F, 2026-10-05

## Context

ProjectActor restores checkpoints correctly, including complete repair
transactions. MCP previously excluded restoration from ordinary mutation
accounting without notifying the session review guard. Actor state therefore
returned to A while review identity and verification obligations stayed at B.
An honest unresolved finish failed as stale even after acquiring A evidence.

## Decision

Reuse ProjectActor's checkpoint/history restoration unchanged. After a successful
`restore_checkpoint` response, the existing MCP execution funnel notifies the
existing RevisionLoopGuard with checkpoint ID and authoritative before/restored
state identities, then clears visual caches. Failed restores change neither
review obligations nor actor state.

The guard invalidates all pre-restore receipts, including earlier receipts for
identical A content, preventing their accidental resurrection. It clears pending
verification of the abandoned repair, observed verification dimensions, and the
retained-repair flag. Review identity and the selected issue's identity move to
the restored state. The issue, its description, severity, dimensions, and total
attempt count remain. Rollback sets no editorial outcome and generates no edit.
The observable review status includes rollback provenance and invalidated IDs.

Hermes may finish unresolved immediately. It may gather bounded fresh relevant
current-state evidence, create another checkpoint and choose an alternative
repair. Or it may withdraw/reclassify using fresh evidence and its own reason,
then conclude no justified repair. Receiving evidence alone never resolves an
issue. Resolving requires a retained new mutation and modality-correct fresh
verification; the existence of an earlier abandoned attempt is insufficient.
The existing maximum of three mutation attempts remains across restores.

With no selected issue, a restore permits two fresh diagnosis inspections using
the existing lifecycle. Other recorded issues are not silently re-diagnosed.

## Consequences

Single edits and atomic transactions share this restoration boundary. No
transaction members, A/V edits, cut values or framing decisions are generated.
Intentional source offsets remain legal. Evidence Packet contents, perception,
ProjectActor mutations/history, Hermes skill and continuation behavior do not
change. Receipt invalidation is conservative and may require reacquisition even
when restored content equals an earlier snapshot. Direct actor changes outside
this MCP session still use existing stale-state rejection rather than inferred
rollback intent.
