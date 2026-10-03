# Free Nemotron mechanical efficiency gate

Date: 2026-09-27. Two independent disposable built-app sessions. Existing working-tree production code, tool descriptions, WeftCut skill, Hermes core and selected profile were preserved. No Jev, source-discovery evaluation, vision, captions in A, final video, or export.

## Verdicts

- **BULK EXECUTION: NEEDS WORK**
- **CAPTION-ID CONTEXT: PASS**, narrowly for ID delivery/reuse, not a blanket context-efficiency pass.

Active resolver: `openrouter / nvidia/nemotron-3-ultra-550b-a55b:free`. Exact-model SDK guard blocked substitutions. Reasoning/profile settings unchanged. Normal skill preload, general Hermes toolsets and progressive disclosure retained. Both sessions had a 16-turn ceiling. All 28 observed SDK requests used the selected free model; provider-reported spend was $0. No GLM or Jev calls.

## A — already-decided placement

The user prompt supplied only the six decided intervals/order, imported media ID, efficiency goal and exclusions. It did **not** name the bulk tool or expose the offline expected-state oracle.

Hermes independently chose `apply_rough_cut_plan` immediately. However, it did not successfully execute it:

| Turns | Actual behavior |
| --- | --- |
| 1 | Read `project://current` |
| 2 | Describe `apply_rough_cut_plan` |
| 3 | Malformed `tool_call`: missing `name`; no MCP dispatch |
| 4 | Rejected bulk plan |
| 5 | Describe validator |
| 6–8 | Three invalid-plan validation calls |
| 9 | Rejected bulk plan |
| 10 | Another invalid-plan validation call |
| 11 | Rejected bulk plan |
| 12 | Describe ordinary placement tool |
| 13–16 | Four sequential `add_video_layer` calls, one per model turn |

Totals: **16 main turns**, one separate iteration-limit summary call, one title call. **16 tool invocations**: three describes, zero searches, 13 `tool_call` wrappers. Twelve MCP operations reached the WeftCut path: one resource read, four validations, three rejected bulk edit requests, four successful individual placement requests. The malformed wrapper never reached MCP. **Four actual timeline mutations**, zero successful bulk mutations. No intervention or additional prompt was supplied during the measured session.

The final state contains only the first four requested source ranges:

| Source seconds | Video timeline seconds |
| --- | --- |
| 155.360–158.400 | 0–3.033333 |
| 163.200–168.560 | 3.033333–8.400000 |
| 177.520–182.960 | 8.400000–13.833333 |
| 183.040–190.080 | 13.833333–20.866667 |

The fifth and sixth ranges are missing. Saved composition duration: **20.900000s**. The full six-range production bulk oracle predicts **30.766667s** at the project's 30fps grid, from the nominal 30.800s requested total. Actual final canonical state does **not** match that plan.

Four VideoClip layers, four Audio layers and four two-member links exist; no missing partner in the placed subset. Ordinary placement retained requested source bounds and snapped video/audio endpoints on their respective frame/sample lattices: largest observed A/V boundary difference 13,333µs. This is not proof of six complete, exactly co-bounded bulk pairs. The outcome's `linked_av=false` is the strict complete-six-pair/exact-boundary acceptance check, not evidence that the four existing links disappeared. No playback/sync-quality claim is made without audio/video inspection.

Post-run undo and redo returned successfully; redo restored the exact partial canonical state. One undo did not restore the empty timeline, consistent with separate placement history entries. Atomic whole-cut undo was **not** exercised by this live agent because bulk application never succeeded. Save/reopen preserved the partial canonical state. MCP remained usable afterward.

### Proven usability gap

The bulk mechanics pass local equivalence tests. The advertised `plan` schema, however, only says object/string and does not disclose its nested required contract; the validator description also does not provide that contract. Hermes consequently guessed `items`, `kept_ranges`, wrong source field names and metadata nesting. Validator errors accurately identified missing fields. Later, Hermes repeatedly put top-level `source_summary`, `editorial_thesis` and `estimated_duration_us` inside `brief`, despite those errors, then incorrectly blamed validation.

This is evidence of **incomplete bulk-plan schema presentation plus agent argument/error-recovery failure**, not a need for another batching primitive or a ProjectActor fix. No description/schema or model behavior was patched during or after this evaluation.

## B — caption IDs and follow-up

Separate fresh project with one short preplaced clip from the same cached source. Task: create editable captions from cached transcription, then change only the first newly-created caption to 48px. No tool name/ID-retrieval strategy prescribed.

- **9 main turns**, eight tool invocations, one separate title call; voluntarily completed, no iteration summary.
- One successful `apply_transcripts` returned `caption_track_ids`, **`caption_layer_ids`**, count and timeline range.
- One caption created, spanning 0–3,033,333µs. Returned ID: `01a0e469-c69f-733b-add2-2bf2405b2b82`.
- Hermes immediately reused that returned ID in turn 4, **before any additional read**, for its attempted style update. It ultimately applied the same ID with `update_layer_params` in turn 7. Saved native Text font size is **48px**; the original clip/A/V layers remain.
- Five mutation-intent tool calls: two successful mutations, three schema-rejected attempts (`clip_layer_id`, wrong update tool/shape, then `params` instead of `patch`). Those local argument errors were corrected without production changes.
- No `project://tracks` read; no ~89k-character result. Caption-ID discovery did not require a resource dump.
- **Caveat:** Hermes still read full `project://current` three times: initial context, style-error recovery and final verification. The latter two were 14,752 characters each. It already knew the caption ID before those reads; they were parameter/verification reads, not forced ID discovery. Broad reads could still become expensive on a large caption corpus.

Measured stored tool-result text entering the agent, including normal trust/serialization wrappers:

| Payload | Characters |
| --- | ---: |
| Successful caption-creation result, with IDs | 683 |
| Successful targeted style-update result | 14 |
| All creation-and-follow-up results, turn 3 onward | 33,595 |
| Whole session's eight tool results | 42,499 |
| Largest individual result | 14,752 |

Save/reopen equivalence and a normal post-session MCP context call passed. This demonstrates direct ID delivery and useful reuse, not elimination of all broad context reads or caption quality.

## Round-trip estimate

Old per-range placement would require **six placement reasoning/tool round trips** for six intervals. Successful bulk use could require **one**, a potential reduction of five placement round trips. **Not realized here:** Hermes used four placement turns for four intervals after 12 discovery/format/recovery turns and exhausted its budget. No measured bulk round-trip saving or GLM dollar saving is claimed.

Caption ID lookup could theoretically remove one otherwise necessary read round trip. This run proves the IDs were usable without that read, but it was not a matched old/new caption session; no total turn/token/dollar saving is claimed. Other errors and broad verification reads remained.

## Architecture and verification

ProjectActor remained the sole timeline authority. Actual MCP edits used its normal mutation/history path, and renderer/save/reopen observed the same canonical state. No second state, batching tool, creative controller, compulsory sequence, automatic next-action selector, agent, renderer or export path added. Hermes chose every tool, retry, fallback and stop/continuation decision. The bulk compiler's local oracle performed no creative selection and never fed evidence/actions to Hermes.

Tests actually run:

- Rough-cut execution + hybrid caption suites: **148/148 PASS**.
- MCP skill-conformance + tool-table suites: **41/41 PASS**.
- Test-only observer/redaction/evidence suites: **18/18 PASS**.
- Two live observation harness tests: **2/2 completed**. This means evidence collection completed, **not** that both product gates passed.
- Two initial setup attempts failed before any Hermes inference (test-side eval initialization and wire-role lookup); corrected only in the test harness before the measured sessions. No model rerun/tuning after the observed outcomes.

Changes this continuation: one opt-in mechanical observation spec, narrowly extended read-only evidence projection/tests, this report. No production code/skill/model/provider/Hermes changes. Prior dirty work preserved.

Artifacts under `apps/desktop/e2e/bench-results/mechanical/`: `bulk.outcome.json`, `bulk.project.json`, `bulk.hermes-trace.txt`, `bulk.live-usage.jsonl`, and matching `caption.*`. Credentials are resolved through the existing OS-secure production launcher and redacted; no plaintext credential in these artifacts. Project JSONs are diagnostic snapshots of disposable workspaces, not durable media-complete user projects.

**Next single action:** separately authorize clarifying the existing bulk tool's actual required nested plan contract, then rerun only subtest A. Do not add another bulk executor or creative workflow. Stop here; no GLM, full edit, Jev work, vision or export.
