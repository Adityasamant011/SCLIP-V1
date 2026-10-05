# Phase 3E.1 — one Luna acceptance, interrupted before repair

## Verdict

**INCOMPLETE — INFRASTRUCTURE.** Exactly one Luna session was attempted. No retry,
editorial patch, other model, architecture change or second session followed.
Quality result: **NO IMPROVEMENT**; no creative edit committed.

## Model / cost / runtime

Exact `openai/gpt-5.6-luna-pro` was available in the authenticated catalog with
support for tools. Price $0.20/M input, $1.20/M output, $0.02/M cached input below
the published long-context tier. Preflight key remaining $0.32079286 cleared the
conservative $0.30 headroom requirement; account remaining $1.446416949.

Observed key/account usage delta **$0.10378694**. CLI stored estimate **$0.0617575**;
these are different measurement bases. There is no request invoice establishing
why they differ or excluding other concurrent key use. Postflight key remaining
$0.21700592. No limit changed or credits purchased by this task.

Hermes session timestamps span **1,271.699 seconds (~21.2 minutes)**; Playwright
reports ~21.4 minutes. Persisted session metadata records **5 completed API
iterations / 24 Hermes tool calls**; the next API call was interrupted.
**8 actual MCP tool calls**, plus one project resource read and two catalog reads.
Five initial timeline frames and one source frame were sampled. Extension: **NO**.
No issue registered, transaction, mutation or post-repair verification occurred.

## Packet / issue / repair

The existing compact Evidence Packet was supplied at startup; Hermes did not
re-fetch it. Hermes read the current project/timeline and requested a representative
five-frame visual range, source observations and a source frame. Timeline/source
coordinates stayed explicit. After exhausting the initial inspection allowance,
Hermes independently requested bounded additional inspection to investigate the
opening fixture/no-speaker frame without losing speech context.

The current compositor frame and an independent frame from the preserved native
render both support that concern at timeline zero. This does not establish an
unsampled interval or a complete editorial diagnosis. Hermes did not register an
issue, choose a repair or use the atomic transaction capability before interruption.

## Infrastructure interruption

The observable trace ends with `Interrupted during API call` / KeyboardInterrupt.
The harness later failed on its final save with `Target page, context or browser
has been closed`, followed by worker teardown timeout/forced termination.
Elapsed progress messages show long gaps. Exact initiating cause is unconfirmed;
there is no key-limit rejection in the trace. Do not infer provider availability,
a model editorial failure or a Phase 3E transaction defect from this termination.

## Independent QA / recovery

After page loss, recovered the last autosaved project and persistent workspace
MCP logs. This is explicitly a recovered autosave, not a successful final actor
save. Its compositions and settings equal the loaded starting state; only
background media bookkeeping differs. No mutation audit exists. A/V ranges,
relationships, captions and creative parameters are unchanged. Main Video track
gaps and overlaps remain zero. Original render remains valid H.264/AAC,
1080×1920, 55.866667s; no new render was needed for an unchanged edit.

No repair, post-repair verification, self-correction or final editorial success
claim exists. Regressions: none observed in the preserved creative state.
Starting SHA256 remains
`e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`.

## Agenticness

Issue investigation and tool selection: **Hermes**. Registered issue: none.
Repair, transaction operations and creative parameters: **N/A**, not selected.
Infrastructure-generated creative edits / auto-sync: **NO / NO**.
Alternative grounded issues, valid repairs and justified no-repair: **possible**.
Final agenticness: **PASS — agency preserved; completed editing not established**.

Failure ownership: **ARCHITECTURE**, specifically acceptance/runtime infrastructure;
no production editorial architecture limitation is diagnosed by this run.
Reliable editing and self-correction remain **unproven by live Phase 3E acceptance**.

## Artifacts

`apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/phase3e1-luna-acceptance/`
contains starting/loaded/recovered projects, initial packet, safe observable trace,
recovered MCP/lifecycle/coordinate logs, sampled frames, independent native opening
frame, observable session metrics, cost metadata, causal trace, independent QA and
agenticness audit. No hidden reasoning fields or credentials were exported.

## Next step

**D. Experiment incomplete — resolve the infrastructure/provider interruption only.**
Recommendation only; not implemented. Production Phase 3D/3E, Hermes skill,
objective, tools, perception, actor and continuation logic remain unchanged.
The opt-in Phase 3E.1 harness copies the prior acceptance and changes only its
phase label, opt-in flag and separate output directory.
