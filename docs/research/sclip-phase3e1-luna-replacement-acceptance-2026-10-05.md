# Phase 3E.1 — replacement Luna acceptance

## Verdict / cost / runtime

**NO IMPROVEMENT. Failure ownership: MIXED.** One valid replacement session,
no further run, patch or architecture/harness modification. The prior manually
interrupted experiment is preserved as `phase3e1-luna-acceptance-invalid-manual-sleep/`.

Exact `openai/gpt-5.6-luna-pro`; availability/tools confirmed by authenticated
metadata. Preflight key allowance $0.31700592 cleared the unchanged $0.30 gate.
Observed key/account usage delta **$0.26844092**; remaining key allowance $0.048565.
Price $0.20/M input, $1.20/M output, $0.02/M cached input below the long-context
tier. No limit changes or purchases by the assistant. Metadata delta is not a
per-request invoice or proof that no concurrent account usage occurred.

Runtime **388.546 seconds (~6m29s)**. **17 MCP calls, 59 Hermes tool calls**,
8 inspection attempts, 3 visual ranges / 14 frame observations. The conditional
extension activated at the normal16 ceiling for the existing mutated issue;
hard20 remained enforced. Exact final iteration count is not emitted by the
unchanged harness, so report **16 normal + up to4 continuation**, not an invented
exact count. No provider interruption or allowance rejection.

## Evidence Packet / issue / repair plan

The bounded Phase 3D packet p0 was supplied at startup; Hermes read current
context and representative visuals, then requested opening-specific evidence.
Current images show fixture at timeline0, signage at1.775s, speaker at3.55s.
This supports an opening visual/context concern, without certifying unsampled
instants. Hermes independently ranked it critical and selected issue-1.

An initial visual/speech/timeline declaration was rejected for unsupported speech
evidence. Hermes corrected it to visual/timeline/text with current e1/e4 receipts.
Its stated repair intent was to trim the linked opening to a speaker-visible point,
then realign captions/downstream timing. The model chose the tool, target and
3,500,000us trim value. `apply_repair_transaction` was available but not used.

## Actual changes / verification / self-correction

One ordinary `trim_layer` in-edge command committed. Existing authored-link
semantics propagated the deliberately selected linked trim to Audio:

| Layer | Timeline start | Source in |
|---|---|---|
| Opening Video | 0 → 3,500,000us | 210,000 → 3,710,000us |
| Paired Audio | 0 → 3,500,000us | 210,000 → 3,710,000us |

Captions were unchanged. The temporary result had a **3.5-second uncovered
video/audio opening**, while original captions remained on screen.

Fresh visual verification sampled timeline0,4.033333,8.066666,12.099999s.
The actual first image is caption-on-black; deterministic near-black fraction
~98.9%. This is relevant visual evidence of the regression, not speech proof.
Hermes noticed the mistake and restored its own checkpoint. It correctly reported
that the original edit was preserved, remained not ready, and the issue unresolved.

Formal guard closure did not succeed. `restore_checkpoint` changes actor state
but is excluded from the MCP mutation funnel. The guard retained the trimmed
state/verification obligation. Fresh restored timeline/text evidence e6 could not
satisfy that state; two `finish_issue: unresolved` attempts returned stale-verification
errors. The last guard still has issue-1 active, verification pending, no outcome.
The existing continuation also blocked one lifecycle action. No patch was made.

## Independent QA

- Final compositions and settings equal the loaded baseline exactly.
- All Video/Audio source/timeline parameters, captions and A/V relationships restored.
- Main Video internal gaps/overlaps:0/0; retained creative mutations:0.
- Temporary regression rolled back; **no retained regression** observed.
- Original native H.264/AAC1080×1920,55.866667s render remains valid. No new render
  was produced because no final creative state changed.
- Original project SHA256 remains
  `e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`.

This demonstrates grounded issue selection, negative-result detection and safe
rollback, **not** a completed improvement or formal review completion.

## Agenticness

Issue/repair/creative parameters/tool selection: **Hermes YES**.
Transaction operations: **N/A**, no transaction used. Infrastructure generated
no new creative operation/value. Paired Audio fanout did occur through the existing
advertised authored-link trim; Hermes explicitly intended a linked Video/Audio trim,
so this was chosen tool semantics, not an inferred/unrequested sync repair.
Alternative issues/repairs and justified no-repair remain possible.
**Agenticness PASS**; editorial success is a separate failed criterion.

## Failure ownership / next step

**MIXED**: model chose an incomplete isolated trim rather than executing its
coordinated repair; infrastructure then failed to reconcile the legitimate
checkpoint rollback with the review guard, blocking honest unresolved closure.
Do not claim that an attempted atomic transaction failed: none was attempted.

**B. One general architecture limitation remains:** checkpoint restoration and
same-issue unresolved closure need consistent review-state handling. Recommendation
only; nothing implemented afterward.

## Artifacts / Git

`apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/phase3e1-luna-acceptance/`
contains initial/loaded/reviewed projects, packet, tool trace, lifecycle/coordinate
logs, mutation before/after evidence, history/checkpoint restore, sampled frames,
continuation events, metrics, cost, causal trace, independent QA and agenticness.
No hidden reasoning or credentials were exported. Production architecture, skill,
prompt, tools, perception, actor, continuation and acceptance harness are unchanged.
This report is the only new tracked file for the replacement run.
