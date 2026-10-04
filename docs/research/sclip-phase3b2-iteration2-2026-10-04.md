# Phase 3B.2 iteration 2 — evidence grounding and review execution

## Implementation

Hermes retains issue selection, repair selection and evaluation. Infrastructure initializes an authenticated, project-bound review session before Hermes starts. The session guard survives MCP reconnects. Four diagnosis inspections reach a decision point; one reasoned extension is bounded. Hermes can select a receipt-grounded issue or conclude no justified repair with current evidence. Repairs require checkpointing, fresh state and relevant reinspection; repair cycles and final inspection are bounded. No issue or creative action is selected by deterministic code.

Timeline frame/range requests reject invalid coordinates before rendering or visual inference. `timeline_t_us` names composition time; legacy `t_us` remains a timeline alias. Source inspection uses existing native media frames through `vision_inspect({media_id, source_t_us, question})`. Responses carry coordinate space, origin and identifiers. Review receipts bind observations to authoritative editorial state; background proxy bookkeeping does not invalidate otherwise unchanged evidence.

## Coordinate inventory

| Path | Coordinates and provenance |
|---|---|
| vision_inspect / inspect_timeline_frame | Current composition timeline; explicit timeline_t_us (legacy t_us); strict bounds |
| vision_inspect with media_id / source_t_us | Original source media; strict media duration bounds |
| render_timeline_range / get_timeline_context | Current composition timeline ranges |
| get_media_context / get_source_observations / media resources | Original source media timings |
| analyze_clip | Original source timing in output |
| describe_clip | Owning composition window input; original source timing in output |
| compare_frames | Original source timestamp for each referenced clip slice |
| transcribe_clip / detect_pauses | Owning composition timings; source-derived evidence |
| extract_clip_audio | Owning composition window, with explicit source bounds where supplied |
| Cached media transcript | Original source timings; differs from transcribe_clip composition output |
| Current layer mapping | t_start_us/t_end_us timeline; source_start_us/source_end_us source |

Source-derived evidence cannot certify current rendered visuals. Current frame receipts are required for frame claims; render receipts for render claims. Empty or stale conclusions cannot pass a grounded review.

## Deterministic checks

Typecheck passed. Seven focused suites, 67 tests passed, covering valid 20s/60s timeline inspection, rejected 200s/60s timeline inspection without inference, valid 200s/600s source inspection, provenance, automatic authenticated initialization, shared lifecycle across connections, bounded diagnosis, no-repair freedom, real ProjectActor mutation/reinspection and stale-state rejection/regrounding. Desktop E2E build passed. No model calls in these tests.

## Live acceptance

**FAIL — AGENT.** One review-only run completed with the normal objective, same OpenRouter NVIDIA model, 24-turn ceiling and external B-roll disabled. Provider remained available. No raw-source rerun or second acceptance was performed.

| Metric | Previous failed review | Iteration 2 |
|---|---:|---:|
| Runtime | 353.838 s | 262.382 s |
| Tool-bearing turns | 24 | 18 |
| Model response turns including final | Not separately measured | 19 |
| Actual MCP tool calls | 21 | 18 |
| CLI-reported tool messages | 48 | 37 |
| Inspection attempts | 15 | 10 |
| Successful inspections | 14 | 6 |
| Geometry calculations | 6 | 0 |
| Grounded issue records accepted | 0 | 0 |
| RoughCutReview validation attempts | Not separately measured | 3 |
| Attempted repairs / actual mutations | 0 / 0 | 0 / 0 |
| Repair verifications / improvements | 0 / 0 | 0 / 0 |

CLI tool-message counts are not actual MCP operation counts. Tool-bearing turns were counted from observable call groups, without retaining reasoning text. Physical provider requests are not exposed by the CLI.

### Evidence and decision

Current edit (55.866667s) → automatic DIAGNOSING → current timeline/context and critique → timeline frames at 51.266667s and 0s → READY_TO_DECIDE → one explicit extension → source transcript windows 0–10s and 510–550s → incomplete review validation → conclude_no_repair → no mutation → no repair verification → unchanged result.

Hermes used the legacy `t_us` timeline alias correctly, and source windows only through `get_media_context`. No source timestamp was passed as a timeline visual position. Four initial inspections reached READY_TO_DECIDE; further unchanged inspection attempts were refused. Two successful source reads used the bounded extension and again reached READY_TO_DECIDE. Shared lifecycle initialized before Hermes, without its begin call; its later begin call did not reset the budget.

Hermes independently identified an opening visual concern and a possible speech/continuity cut at 51.27s. It proposed opening reselection/backward extension and late-cut boundary repair. It submitted three invalid RoughCutReview records: issues lacked the required inspections/identity/range structure and put evidence_id on issue objects. No record was accepted, no checkpoint was made and select_issue was correctly refused. It then invoked conclude_no_repair citing current receipt e1, while its reason continued asserting two critical repairable issues. Its final response asked the user whether to proceed. This is not a grounded no-justified-repair editorial conclusion and not successful autonomous self-correction. The guard can validate observable provenance, but cannot determine whether the model's editorial conclusion is truthful merely from a nonempty reason.

### Independent assessment

The exact frame at timeline 0s does show a ceiling light, so that observation is supported. Hermes overextended one frame into a claim about the entire 0–7.1s opening. Native render samples show signage at 0.7s and the speaker at 3s and 6s. The frame at 51.266667s shows the speaker and caption, not black footage. A still frame cannot verify audible mid-word speech; the current transcript/cut-boundary data warranted investigation, not a claim of completed audio verification. These findings refine the prior report's overly broad statement that opening samples contradicted all signage observations; no previous report/artifact was modified.

Original opening text remains: “Alright, so I want to spend a few minutes talking about the number one reason why people fail, okay?”

Authoritative compositions are exactly unchanged: six video clips, six audio layers, 53 text layers, 55.866667s, no main-video gaps or overlaps. Full project hashes differ through background decode/proxy bookkeeping, not an edit. No output regression was introduced, and existing framing/caption weaknesses remain. No new render was needed; render.json references the preserved native first-pass edit. All 25 original baseline hashes, original first-pass project hash and locked source hash match.

The harness passing means measurement completed; it does not mean editorial acceptance. Runtime fell 25.8%, but there was no verified quality improvement. Remaining opportunities: make grounded issue submission easier to discover/use; avoid repeated invalid records and blocked reads; ensure a declared repairable issue reaches action or an honest unresolved outcome. These are observations for a future iteration, not further implementation here.

### Agenticness audit

| Question | Answer |
|---|---|
| Did deterministic code choose the editorial issue? | NO |
| Did deterministic code choose the creative repair? | NO |
| Did Hermes choose what mattered? | YES, but its whole-opening claim was overgeneralized |
| Did Hermes choose what action to take? | YES, it proposed repairs then chose to stop; none executed |
| Did deterministic code only control evidence correctness, state safety and workflow lifecycle? | YES |

**Next step: A — iterate Phase 3B.2 again.** No next feature or second model run implemented.

### Artifacts

Absolute root: `/Users/adityasamant/SCLIP V1/editor/apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/review-only-iteration2/`.

- starting-project.json, loaded-project.json, reviewed-project.json, project-diff.json
- hermes-trace.txt (observable output only; CLI reasoning removed)
- mcp-events.json, review-lifecycle-events.json, coordinate-validation-events.json
- review-decisions/ (begin, bounded extension, no-repair decision)
- metrics.json, history.json, configuration.json, prompt.txt, preservation.json
- sampled-frames/ (exact frames supplied for visual evidence plus independent native render samples)
- render.json references preserved ../first-pass/edit.mp4; no mutation-evidence files because no mutation occurred

### Git

Implementation: 969806b9. Acceptance report committed separately. Working tree clean after report commit.

