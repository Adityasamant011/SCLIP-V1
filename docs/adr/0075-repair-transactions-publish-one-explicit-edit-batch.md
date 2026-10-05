# Repair transactions publish one explicit edit batch

Status: Accepted — Phase 3E, 2026-10-05

## Context

The review guard correctly requires fresh modality-relevant evidence after a
mutation. A repair can nevertheless need several explicitly chosen operations
before its result is meaningful to inspect. Publishing each member separately
leaves a legitimate coordinated repair half-applied.

## Decision

`apply_repair_transaction` accepts a current packet `expected_state_version`,
a Hermes-authored reason, and 1–8 explicit operations. V1 supports existing
`update_layer` envelope patches and `update_layer_params` patches. Hermes supplies
the operation kind, layer, fields, values and count. There are no inferred
partners, generated operations or creative defaults.

Reuse ProjectActor's existing apply primitives, immutable Immer draft,
transition/marker reconciliation, validator, named checkpoints and commit/history
boundary. Parse every member before applying anything. Apply all members on a
private draft and validate the final state. Intermediate overlap can be resolved
by a later member; invalid final overlap, illegal ranges, missing layers, invalid
schemas, locked tracks or stale identity reject the whole batch.

Only after successful validation create a checkpoint and publish the prepared
state through one commit. Prepare the observable receipt before publication.
Exceptions during draft execution discard the draft. Exceptions before history
publication also remove the provisional checkpoint. There are no independently
published member states to undo. Existing subscriber exception isolation remains
in effect. One undo or checkpoint restore returns the entire repair boundary.

MCP's existing mutation funnel sees the transaction once, preserving grounded
issue selection, stale-state protection and post-commit modality requirements.
No verification runs between members. A rejected batch does not start
verification. An unchanged batch creates no history mutation or verification
obligation. Hermes still decides whether to resolve, reconsider or conclude no
justified repair.

Receipts include transaction/checkpoint IDs, start/end identity, requested
operations and member before/after values, affected IDs, measured A/V relationship
changes and adjacent timeline gaps/overlaps. Error receipts distinguish rejected
and rolled-back attempts. Observations do not judge the creative result.

## Consequences

Explicit paired A/V edits can commit together. Unequal source or timeline values
remain legal when technically valid, including authored links and intentional
J/L offsets. Editing only Video never generates an Audio operation.

V1 does not batch creation, deletion, splitting, track moves, media imports,
keyframe tools or arbitrary tool invocations. Those operations retain their
existing individual interfaces. A transaction is one bounded submission, not a
persistent staging session or general scripting language. Phase 3D evidence,
Hermes skill and editorial principles are unchanged.
