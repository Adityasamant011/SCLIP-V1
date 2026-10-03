# Jev tool-selection root-cause investigation — 2026-09-28

## Verdict

`JEV NON-USE OBSERVED, ROOT CAUSE STILL UNRESOLVED`

The proximate failure in the completed 14-main-call source run was Hermes **not selecting** an available Jev tool. Its initial visible reasoning said it would use semantic passage evaluation after identifying the media, but after its first transcript window it continued chronological reads through all 140 cached segments. It never called `tool_search`, `tool_describe`, or `evaluate_source_passages`. That is observable plan/tool-choice drift; the model's hidden reason is unknown. It is not evidence that Jev registration, search, schema, execution, or provider inference failed. It is also not proof that a full chronological read was the best economic choice.

No production correction was justified or made. The prior one-variable optional tradeoff wording test yielded 0/3 Jev selections; another wording change would be speculative. No free-model session or new paid Jev request was launched in this investigation because the latest free-model trial stopped on unobservable usage.

## End-to-end path and health

| Layer | Evidence and result |
| --- | --- |
| Sclip enablement | `src/main/index.ts` passes the evaluator to MCP only when the launched **Sclip process** has `SCLIP_JEV_ENABLED === '1'`. Ordinary app default remains off. In disposable sessions, the app process received the flag; Hermes received the app's MCP URL/token through its dedicated profile/launcher. Jev's flag is not a Hermes model setting. |
| MCP catalog | Fresh built-app, local-only Playwright diagnostic: Jev present when enabled, absent when disabled; `get_media_context` present in both. Current full schema requires `media_ids` and `request`, with optional range and `limit`. |
| Hermes registration and model visibility | Hermes converts Sclip MCP names to `mcp__weftcut__...` and defers them behind `tool_search`/`tool_describe`/`tool_call`. A saved actual provider-bound request shows Jev's semantic-search description in the bridge catalog and the WeftCut skill preloaded. In the ignored 14-main-call session, the SDK-boundary observer recorded the Jev listing in **14/14** main requests. Mere MCP registration was not the inference here; model-facing presence was measured. |
| Search and schema | Using the current built-app full MCP catalog converted to Hermes's actual schema shape, Hermes's unmodified BM25 `tool_search` ranked Jev **first** for “semantic search transcript passages for focus and mentorship in a long source,” “find passages about focus mentorship,” and “find strongest story in long source.” Chronological-read wording ranked `get_media_context` first, reasonably. `tool_describe` returned Jev's full five-field parameter schema. This was an offline dispatch test with temporary registry entries, not a live model call. |
| Invocation | A prior **directed/forced diagnostic** reached `tool_call` for Jev: first guessed wrong field names, then corrected to `media_ids`/`request`/`limit`, obtained three valid provider batches, and expanded original context. An older unprompted session also selected Jev at turn 10 and corrected an invalid call at turn 11. Therefore execution is possible, though blind argument guesses add friction. |
| Actual provider | Existing production-path shadow receipt: OpenRouter returned HTTP 200 for `typesafe/jev-1.13-20260917`, three full-source requests costing **$0.000911694** with validated answer IDs/types. Top-12 passages included 174.64–190.08 s (rank 4) and 202.32–220.56 s (rank 7), with exact timestamps, references, coverage, and uncertainty. The airport setup at roughly 143.92–168.56 s remained substantially absent; original expansion is necessary. No new request was needed or sent. |
| Local handler and fallback | Fresh built app accepted a valid out-of-range, read-only `evaluate_source_passages` call and returned `insufficient_evidence` **without** provider inference. A subsequent original `get_media_context` transcript read worked; the timeline was unchanged. Production Jev errors are explicit, and the ordinary source tools remain registered independently. This is availability of the fallback path, not proof that every possible provider failure leaves the running agent perfectly recovered. |

The catalog description accurately says optional semantic transcript search, bounded paid Jev evidence, original expansion, fallibility, and no final creative decision. `get_media_context` accurately offers compact chronological source text and precise range/word reads. The skill lists both as options, not required stages. No tool-name mismatch, omitted schema, false cost promise, or compulsory chronology was found. A possible presentation preference for the first-listed chronological tool is **not causally established**; the prior test-only tradeoff sentence did not improve selection.

## Competing hypotheses

| Hypothesis | Supporting / contradicting evidence | Focused falsification result | Demonstrated? |
| --- | --- | --- | --- |
| A. Jev undiscoverable | Contradicted by 14/14 provider-bound catalog listings, actual skill guidance, offline first-place search, and an older spontaneous Jev call. The ignored run never issued a search query, so no failed search result exists. | Actual Hermes search against current catalog returns Jev first for semantic queries. | **No discovery-path defect shown.** |
| B. Schema inaccessible | Full `tool_describe` schema returns locally; prior actual attempts corrected arguments after validation. Ignored run never requested schema. | Local `tool_describe` returned `media_ids`, `request`, `start_us`, `end_us`, `limit`. | **No schema-access failure shown.** |
| C. Affordance misleading | Chronological reads are an easy visible option, and Jev costs extra/needs expansion. Against: current description and skill state the relevant semantic benefit; extra test-only tradeoff wording yielded 0/3 selection. | Existing tradeoff counterfactual did not change selection. | **Not demonstrated as a correctable wording defect.** |
| D. Execution broken | Prior first guesses used wrong field names. Against: corrected real Jev calls and provider results succeeded; ignored run did not attempt Jev. | Prior forced/direct and spontaneous calls reached provider; fresh local handler worked. | **No execution failure explains this non-use.** Blind-call friction is real elsewhere. |
| E. Model/tool choice | Ignored-run reasoning explicitly planned Jev, then switched to repeated chronological reads. Other matched-ish sessions sometimes chose Jev late and often chose original reads. | Prior forced diagnostic invoked Jev; current offline search works, isolating failure to selection in the ignored run. | **Observed proximate cause; hidden reason/model generality unresolved.** |
| F. Jev value insufficient | Shadow top-12 omitted airport setup and would require original expansion. Direct compact reads can be sensible, particularly for a complete source review. Against: the ignored run never tested Jev, so it could not compare its actual evidence/latency in that session. | No completed matched Jev-used-vs-direct agent pair exists. | **Unresolved economic/editorial hypothesis.** |

## Controlled counterfactual and safety

- **A, current behavior:** saved 14-main-call run, 0 Jev calls, 140/140 source segments read, 345,263 cumulative input tokens and 173.3 s wall. Its final Mr. Miyagi candidate is coherent, but the extra full read does not establish that Jev would have made it cheaper or better.
- **B, corrected discoverability:** not run, because no discoverability defect was demonstrated. No test-only fake description was promoted to production.
- **C, forced tool-use diagnostic:** existing earlier directed session is the valid counterfactual that the same free model can consume real Jev output and request surrounding original evidence. It first used incorrect arguments, then recovered; it is **forced**, not autonomous adoption. Its final proposed durations were internally inconsistent, so it is not a story-quality pass.
- **Local-only counterfactual:** current full catalog + unmodified Hermes BM25/describe dispatch ranks and resolves Jev. Built-app MCP handler and original read passed in a disposable project, with no provider/model inference.

No new free-model session was attempted after the latest `response_usage_missing` guard stop. New Jev spend **$0**; new GLM calls **0**; new free-model calls **0**. The earlier missing-usage auxiliary request has unknown possible upstream charge and was not relabeled free/costless. No timeline mutation, vision, captions, export, or user profile change.

## Changes and verification

Production Sclip, Hermes core, Jev descriptions/ranking, skill, ProjectActor, bulk tool, MCP protocol and model settings: **unchanged** in this investigation. Added only the test-only local catalog/handler probe `apps/desktop/e2e/electron/jev-tool-selection-offline.spec.ts` and this report. Existing dirty work in both repositories was preserved.

- Built-app local-only catalog/handler probe: **1/1 pass**, Jev enabled/disabled visibility, full schema, handler, original read, no timeline change.
- Current Hermes BM25/describe offline dispatch against built-app catalog: Jev top-ranked for three relevant semantic/source-story query forms; `get_media_context` ranked first for a chronological-read query; schema accessible. This is deterministic code, not evidence Hermes chose to issue such a query.
- Focused Jev/source Vitest: **35/35 pass**.
- `npx electron-vite build`: **pass** (main/preload/renderer), with pre-existing dynamic-import warnings.
- Full `build:e2e`: **blocked**, not passed: local Rust cache lacks `libm v0.2.16` and the offline build cannot fetch it. An earlier normal build also failed DNS resolution for `static.crates.io`. The local probe used the current built app; its production source did not change in this turn.

Remaining risks: initial Jev K12 lacks the complete airport setup; actual Jev-assisted quality/cost versus compact reads is unmeasured; GLM selection behavior is untested; the installed packaged Hermes may not include the separate dirty Hermes deferred-call guard. No bulk regression was caused here because bulk code was untouched; a full packaging/bulk run was not repeated.

**Next justified test:** define and validate an explicit, optional semantic source-discovery request before another provider trial; see the [capability-delegation boundary audit](jev-capability-delegation-2026-09-28.md). The present tool-selection evidence does not justify another descriptor tweak, a full edit, or a paid GLM test.
