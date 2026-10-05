# Phase 3E — atomic multi-step repair transactions

## Verdict

PASS — deterministic architecture acceptance. No model inference, live editing
acceptance or provider spend. Previous benchmark artifacts remain unchanged.

## Existing primitives reused

ProjectActor already has atomic grouped gestures and a common commit funnel;
`dry_run` exposes the corresponding operation parser/apply primitives but does
not publish. Rough-cut compilation is atomic but is an assembly-specific tool.
History locks restrict undo; they do not fold separate mutations into a repair.
Reused immutable drafts, layer mutation helpers, final validation,
transition/marker reconciliation, history, checkpoints and MCP review guards.
No second editing architecture was introduced.

## Transaction design / atomicity

New `apply_repair_transaction`: current packet state version + Hermes-authored
reason + 1–8 explicit `update_layer` / `update_layer_params` operations.
Every member is parsed before applying; the complete private result is technically
validated before publication. Final legality is required, rather than legality
of every temporary intermediate state. All members publish in one history entry
and one actor event. Invalid or stale batches publish nothing. Simulated failure
after a draft member and failure at the commit boundary both preserve the original
authoritative state; the latter removes its provisional checkpoint.

Receipts preserve requested operations, affected IDs, member before/after values,
checkpoint and state identities, A/V relationship changes and measured gaps or
overlaps. Errors preserve structured rejected/rolled-back provenance through MCP.
No receipt contains an infrastructure-authored creative judgment.

## Verification / A/V freedom

Existing grounded issue and checkpoint prerequisites apply in review. Verification
becomes required once after a changed transaction, and fresh relevant modalities
remain necessary. Rejected/unchanged transactions do not consume a mutation
boundary. Ordinary single edits and evidence-backed no-repair decisions remain
available. Explicit unequal A/V source and timeline values are accepted even for
an authored link; editing only one member does not generate an edit for its partner.
Phase 3D packet contents, evidence types and modality logic are unchanged.

## Tests

- Typecheck: PASS.
- Desktop/CLI/skills build (`build:e2e`): PASS.
- Focused deterministic suite: 10 suites, 152 tests PASS.
- Real local MCP protocol suite: 17 tests PASS; model/perception calls are mocked.
- Total: 11 suites, 169 tests PASS; 12 new transaction tests.
- Initial restricted MCP run could not bind its local test server; rerun with
  local-server permission passed.

Coverage: two valid members; invalid second member; explicit coordinated A/V;
intentional unequal A/V; alternative repair values; single tool path; one
verification boundary; stale/missing/schema/batch-limit rejection; draft and
commit-boundary failure; final overlap rejection; intermediate overlap resolution;
no-effect batch; no generated partner operations. Existing tests retain modality,
stale/fresh evidence and justified no-repair coverage.

## Agenticness audit

| Decision | Owner / answer |
|---|---|
| Operations | Hermes |
| Parameters | Hermes |
| Number of operations | Hermes, within technical maximum 8 |
| Whether the result is good | Hermes |
| Infrastructure auto-syncs A/V | NO |
| Intentional A/V offset possible | YES |
| One operation possible | YES |
| No repair possible | YES |
| Deterministic creative leakage | NO |

## Before → after

Before: mutation A → verification required → intended mutation B blocked.

After: Hermes declares A+B → validate complete draft → one atomic commit → fresh
modality-correct evidence → Hermes judges the completed repair.

## Known limitations

V1 batches existing layer envelopes and params only; arbitrary tool scripts and
layer/track creation/deletion/split are unsupported. Review still requires a
grounded selected issue and checkpoint. Deterministic acceptance proves technical
execution and lifecycle, not live editorial quality. No model acceptance ran.

## Next action

A. Run one Luna acceptance using Phase 3E. Recommendation only; not executed.
