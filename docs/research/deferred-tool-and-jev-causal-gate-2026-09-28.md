# Deferred-tool and optional Jev causal gate — 2026-09-28

Scope: disposable built-Electron projects, production Sclip MCP and secure credential route, external Hermes source CLI, selected `nvidia/nemotron-3-ultra-550b-a55b:free`; no GLM, vision, final video, or export. All pre-existing Sclip dirty work was preserved. Production Sclip tool, skill, MCP, ProjectActor, and Jev files were unchanged during and after diagnosis. The only production behavior change is the narrow Hermes deferred-call guard described below.

## Hypotheses stated before interventions

| Hypothesis | Supporting observation | Falsifying observation |
| --- | --- | --- |
| Bulk execution/schema transport is broken | Directed description still yields invalid args or failed mutation | Directed description and offline validation pass |
| Nemotron cannot comprehend the nested schema | Malformed args even after actual `tool_describe` | Valid offline args and directed bulk success |
| A generic skill reminder alone repairs autonomous behavior | Same autonomous prompt + one generic line causes describe and atomic bulk | It still skips describe or falls back |
| Deferred-call boundary permits harmful blind complex calls | Blind malformed calls pass into downstream validation; a post-selection refusal changes behavior | Bridge already refuses/repairs them, or intervention does not change behavior |
| Jev path is technically unusable | Directed semantic request fails provider/tool/context expansion | Real Jev inference plus original-evidence expansion succeeds |
| Missing optional tradeoff wording is the Jev-selection cause | One test-only skill sentence materially increases matched autonomous selection | Matched selection stays low |

## Exact model-facing protocol

Read-only SDK request-boundary projections: [bulk directed protocol](../../apps/desktop/e2e/bench-results/mechanical/bulk-directed-v1.protocol.json), [source protocol](../../apps/desktop/e2e/bench-results/jev/free-discovery-1-protocol-v1.protocol.json). These whitelist system/developer guidance and bridge definitions; they do not save source/user messages, provider credentials, or request headers. The saved system-context hashes are in those files.

- `weftcut` was preloaded in system context. The skill says tool choices are options, not stages; already-decided assembly can use `apply_rough_cut_plan`, and says to read its contract. The source section lists chronological `get_media_context` first and optional `evaluate_source_passages` second. It does **not** mandate chronological reading.
- Hermes saw a 106-tool deferred Sclip catalog when Jev was disabled and 107 tools when enabled. `apply_rough_cut_plan` appeared by name with a truncated bulk-execution summary; `evaluate_source_passages` appeared by name with a truncated semantic-search summary. Neither nested parameter contract was in the initial model request.
- `tool_search` explicitly says to follow with `tool_describe` for the full schema, then `tool_call`; it also says an already-visible name can skip search but should be described. `tool_describe` says it is required if parameters are unknown. `tool_call` nevertheless has a generic `{name, arguments}` schema and is callable without a preceding description.
- The existing Hermes bridge checked **top-level** required arguments, not nested required fields. A guessed `plan` object therefore reached the Sclip tool even when its nested structure was malformed. Jev and `get_media_context` were both visible before the first source read; in the fresh normal run Hermes selected chronological reading first, then Jev later.

## Historical disclosure behavior

Seven saved pre-intervention outcome traces contained **89** deferred WeftCut invocations. **78/89** had no prior `tool_describe` for that tool in their session; **11/89** followed description, all in one older bulk run with three descriptions. The latest repaired-schema autonomous bulk run had 0 descriptions and three malformed bulk attempts before sequential fallback. The caption run used `read_resource`, `apply_transcripts`, and layer-update tools without description; the source runs likewise used `get_media_context` and sometimes Jev without description. Some simple guessed calls succeeded, while at least the three latest bulk attempts and one fresh Jev attempt failed. The saved projection does not encode every historical result's error flag, so an exact all-tool guessed-success/failure count cannot honestly be reconstructed.

## Controlled bulk results

All runs used the same six user-decided ranges (155.360–158.400, 163.200–168.560, 177.520–182.960, 183.040–190.080, 190.080–194.960, 205.600–210.640 seconds), fresh 1080×1920 projects, the same free model and real source.

| Control | Observation | Conclusion |
| --- | --- | --- |
| Directed protocol (`bulk-directed-v1`) | `tool_describe` returned 4,488 characters of schema; one valid bulk mutation placed all six ranges. Canonical state, linked A/V, one-step undo/redo and reopen passed. | Tool transport, published schema, model comprehension, executor and ProjectActor path are capable. |
| Offline JSON (`bulk-offline-v1`) | The model invoked the **real** `tool_describe`, produced JSON arguments, and the production validator accepted the six-clip plan. No editing invocation or timeline mutation. | Schema comprehension is not the main failure. |
| One generic test-only skill line (`bulk-generic-hint-v1`) | The line was confirmed at the SDK boundary. No `tool_describe`; four malformed bulk calls, sequential fallback, 16-turn exhaustion, only three of six ranges placed. | Generic reminder alone is not a supported fix. |
| Initial nested-error test (`bulk-nested-guard-v1`) | Finished atomically, but the trace showed an initial missing top-level `plan`, already handled by the old bridge. Added nested guard activation was not proven. | **Not** counted as causal evidence. |
| Strict post-selection test-only gate (`bulk-require-describe-v1`) | Hermes itself chose bulk; the guard refused the first undescribed complex call; Hermes then called `tool_describe`, made one successful bulk mutation, and passed canonical/undo/redo/reopen checks. | Strong causal support for a deferred-invocation boundary repair. |

The exact expected bulk timeline duration is **30,766,667 µs** after 30-fps snapping, not the raw interval sum of 30,800,000 µs.

### Bulk candidate causes

| Candidate | For / against | Confidence |
| --- | --- | --- |
| Execution, validator, schema transport, or nested published schema broken | Against: directed live execution, offline validator, local oracle and two post-fix executions pass. | High against |
| Schema too complex even after loading | Against: directed and offline valid first loaded-schema attempts. | High against |
| Bulk tool undiscoverable | Against: Hermes independently selected it repeatedly. | High against |
| Generic missing instruction | Against: instruction was present in bridge/skill and one stronger generic test-only line failed. | High against as a sufficient cause |
| Model skips deferred description; bridge allows malformed nested guesses | For: 78/89 historical blind calls, live failures, direct request-boundary protocol, and strict post-selection causal success. | High |
| Tool-call wrapper cannot execute bulk | Against: directed and post-fix bulk calls succeed. | High against |

## Jev controls and cause assessment

- Directed source-only session (`free-discovery-1-directed-v1`): real `typesafe/jev-1.13` inference succeeded, cost **$0.000913248**; Hermes first guessed invalid Jev argument names, corrected them, then requested original context (including 174–234 s). It did not edit. Its final proposed “40-second” range was internally inconsistent (202.32–526.80 s); this is **not** a story-quality pass.
- Fresh normal protocol session (`free-discovery-1-protocol-v1`): chronological first, Jev only at turn 10 (valid retry at 11), then original-resource expansion; Jev cost **$0.000907536**. Jev was visible from the first model request.
- Historical optional selection: **1/3** broad free-model sessions. One-variable test-only optional tradeoff sentence: **0/3** matched broad sessions selected Jev; the sentence was verified in the actual model request. Fresh post-bulk-fix sessions: **0/2** selected Jev. Ordinary source tools remained functional and projects unchanged.

| Jev candidate | For / against | Confidence |
| --- | --- | --- |
| Provider/client, ranking, availability broken | Against: shadow ranking, directed real inference and original-context expansion worked. | High against |
| Jev schema/call path impossible | Against: valid corrected calls in directed and normal runs; for: first guessed attempts failed without description. | Medium against technical impossibility |
| Skill makes chronology mandatory | Against: skill explicitly makes Jev optional and permits original reads; chronology is listed first. | Low as a cause |
| Jev benefit not visible | Against: first-request manifest and skill expose semantic long-source benefit; extra tradeoff line did not improve selection. | Medium against a wording-only fix |
| Free-model/tool-choice variability | For: 1/3 baseline, 0/3 hint, 0/2 post-fix despite visibility; directed request works. No GLM causal comparison in this task. | Medium as observed behavior; low as a general model-root-cause claim |

No Jev production change is justified by these controls. Jev remains optional evidence, original transcript access remains available, and Hermes still chooses the story.

## Evidence-backed production change and acceptance

Changed only the existing Hermes deferred-call validator in `/Users/adityasamant/SCLIP/hermes-agent-src/tools/tool_search.py`: a malformed call to a deferred tool with a nested required contract now returns a concise `tool_describe` instruction **after** the model selected the tool. Simple-tool missing-top-level behavior is unchanged. Valid calls and alternate representations pass through; no model/tool routing, editing decision, stage controller, or timeline mutation was added. Regression tests were added in the same Hermes checkout.

Two fresh, unprompted built-Electron/project tests (`bulk-postfix-v1`, `bulk-postfix-v2`) each showed guessed malformed bulk → `tool_describe` → one successful atomic bulk mutation. Both passed six-range canonical equivalence, linked A/V, one-step undo/redo, save/reopen, and MCP usability. Both finished without a six-call placement fallback. The tests launch the external Hermes source CLI via the production secure Sclip profile/MCP path; they do **not** prove that an already-installed packaged Hermes binary has been rebuilt with this change.

Tests actually run: 47 focused Sclip Vitest tests pass; `npm run build:e2e` passes; 18 test-harness unittest checks pass; Hermes nested-validator direct smoke (three malformed shapes and one valid shape) passes; seven controlled bulk sessions above and seven source-only sessions completed. Hermes `pytest` could not run because its existing `.venv` has no pytest module; the added pytest regression cases remain unexecuted by that runner. No paid GLM was run. New Jev charges in this investigation total approximately **$0.001820784**; free main-model provider cost was zero. No dollar savings from these tests is claimed.

## What is not proven / readiness

- Jev's optional autonomous selection has **not** improved; the tradeoff counterfactual failed to change it. Its directed final story was not quality-safe. Do not patch Jev/skill or launch a full edit based on this run.
- Bulk behavior is validated in the external Hermes source CLI used by the test harness, not a freshly repackaged installed Sclip/Hermes binary. The guarded path has two successful free-model repetitions; GLM transfer is untested.
- Exact historical blind-call success/error counts and any commercial edit-quality or cost savings are unproven.

**BULK READY FOR TINY GLM CONFIRMATION.**

**JEV STILL NOT READY.**

**FULL GLM EDIT NOT READY.**

Next single action: before any full edit, decide whether to run a tiny, separately approved GLM confirmation of the guarded bulk path while keeping Jev optional; do not treat Jev selection or story quality as resolved.
