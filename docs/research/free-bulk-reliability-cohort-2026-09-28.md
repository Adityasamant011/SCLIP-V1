# Free Nemotron bulk reliability cohort — 2026-09-28

Scope: disposable built-Electron/Sclip MCP + patched external Hermes source runtime; selected OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free`, unchanged reasoning config and WeftCut skill, 16-turn ceiling, Jev disabled, no GLM, vision, captions, export or real-project edits. Main-model route was guarded against fallback. The user's live profile SHA-256 remained `2e0596fa2bcaa5d3457d0690ff845371c561a9d4ca27e84b730c44f8b54c2718` before and after. This source-checkout result does **not** repair or verify the separate packaged-Hermes omission.

The existing test-only mechanical fixture was reused. Only its range-count allowance (3–9 rather than hard-coded six), read-only timestamp projection, and N-relative link oracle were changed. No production tool, ProjectActor, Hermes code, skill, prompt guidance, model setting, or creative architecture changed. The first three varied results were rechecked from their saved canonical project data after discovering that the old link oracle expected six links even for 3/9-range plans. No agent session was rerun or altered to hide this fixture error. `npm run build:e2e` passed afterward.

## Results by independent session

“Main” counts actual recorded main-model SDK requests; “bulk attempts” counts visible selected `apply_rough_cut_plan` calls, including refused/malformed attempts. Each successful row has **one successful** bulk mutation and **zero** `add_video_layer` fallbacks. Time is from the first recorded assistant tool call to the successful bulk result, not full session wall time.

| Trial | Decided clips | Main | Bulk attempts | Describes | Bulk turn | Time to bulk | Canonical / linked A/V / undo / redo / reopen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| identical-01 | 6 | 9 | 2 | 2 | 7 | 141s | all pass |
| identical-02 | 6 | 10 | 1 | 2 | 8 | 201s | all pass |
| identical-03 | 6 | 8 | 2 | 1 | 6 | 83s | all pass |
| identical-04 | 6 | 5 | 1 | 1 | 3 | 33s | all pass |
| identical-05 | 6 | 8 | 2 | 1 | 6 | 184s | all pass |
| identical-06 | 6 | 6 | 2 | 1 | 4 | 64s | all pass |
| varied-01: reworded six | 6 | 9 | 4 | 1 | 7 | 191s | all pass; recovered a malformed JSON call |
| varied-02: three | 3 | 8 | 2 | 1 | 6 | 72s | all pass; links recomputed from saved state |
| varied-03: nine | 9 | 8 | 3 | 1 | 6 | 204s | all pass; links recomputed from saved state |
| varied-04: reversed six | 6 | 4 completed + one unknown | 0 completed | 0 | — | — | **inconclusive**: stream stopped with `stream_failed_usage_unknown`; no mutation; test timed out |
| varied-05: shuffled six | 6 | 0 | 0 | 0 | — | — | **inconclusive**: auxiliary request failed with `request_failed_usage_unknown`; no mutation |
| varied-06: five | 5 | — | — | — | — | — | **not run** after two consecutive external failures |

Artifact set: `apps/desktop/e2e/bench-results/mechanical/bulk-cohort-{identical,varied}-NN.{outcome.json,project.json,hermes-trace.txt,live-usage.jsonl}` for completed runs; failed trials retain traces/usage but did not reach the outcome save step. No expected-state JSON or tool name was in the user prompt. The varied prompt only stated the already-decided order/ranges and a short placement-only wording variant.
The identical cohort used the same prompt template and six ranges; each fresh imported source necessarily had a new media UUID, so the literal prompt bytes were not identical. This was the only per-project variable in that cohort.

## Reliability and efficiency, not video quality

- **Completed valid trials: 9/9 atomic-bulk passes** (identical 6/6, varied 3/3). **Attempted: 11**, with two infrastructure-inconclusive and one planned variant not run. There were no genuine product-failure trials; this is **not** a completed 12-valid-trial estimate or proof of production-scale consistency. A 9/9 observed rate has a wide lower confidence bound and should not be called universal reliability.
- The first selected operation was a `read_resource`-style project read in seven runs and `get_media_context` in two. Hermes then independently chose bulk in every completed run. All nine stopped voluntarily before the 16-turn ceiling. Each made one successful timeline mutation (the bulk call); some also made non-timeline checkpoints.
- Bulk independently selected in **9/9 valid runs**; ordinary sequential placement in **0/9**. One successful mutation per run; 6–9 linked A/V pairs in exact supplied order. Canonical expected timeline, one-step atomic undo, redo, save/reopen and post-run MCP checks passed in all nine. No unrelated timeline edits or export.
- Mean/median main requests: **7.89 / 8** overall; identical **7.67 / 8**; varied **8.33 / 8**. Mean/median turn of successful bulk: **5.89 / 6** overall. Mean/median time to bulk: **130 / 141 seconds**. These are still many main turns for a purely mechanical request, despite removing one-per-clip placement.
- **Zero `tool_search` calls**, **11 `tool_describe` calls** across the nine valid runs (nine for bulk, two for other tools). Seven runs first tried an incomplete bulk call and then described it; one additionally recovered a malformed JSON/tool-use retry. In two runs Hermes described bulk before its first bulk invocation. This supports the patched deferred-tool safeguard as a recovery mechanism, but does not prove that every description was caused by it.
- Across nine valid runs, **19 visible bulk attempts**, **nine successful**; ten earlier attempts were refused or malformed. This is recovered protocol/tool-use friction, not ten failed sessions. The exported read-only evidence does not retain every exact error string, so these ten cannot honestly be split into precise schema-versus-JSON counts. One malformed JSON error is explicit in varied-01's trace. No `validate_rough_cut_plan` response with a recorded `valid:false` was observed in the safe projection.
- The reversed-order trial reached the free model after source inspection, but its next stream supplied no usable accounting and never reached a bulk call. The following fresh trial failed at the auxiliary request before main reasoning. There is no evidence of a wrong-tool choice or bulk executor failure in either. Exact upstream cause (rate limit, availability, or transport) was not returned; classify **provider/runtime interruption, inconclusive**. The timed-out test-only Electron process was stopped; no test Hermes process remained. No retries were used to manufacture a pass.

## Spending and ownership

Successful receipts report **$0** for the exact free Nemotron route. The two interrupted requests have unknown usage/billing receipts; no paid fallback was observed. **GLM calls: 0. Paid main-model calls: 0. Jev provider calls: 0.** OpenRouter lists this Nemotron route as [free but rate-limited](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free); the traces do not establish that rate limiting caused either interruption.

Hermes chose its tools and order; the bulk executor placed only user-decided ranges; ProjectActor remained canonical. No external creative selector, compulsory workflow, new batching system, second timeline or renderer was added. The existing macOS distribution still lacks its expected bundled Hermes executable, so these results apply to the tested external source runtime only.

## Verdict and next validations

`BULK RELIABILITY STILL NEEDS WORK` **as a requested 12-trial evidence gate**, not as a demonstrated editor defect. Nine valid runs passed; two were external interruptions and one was intentionally not launched while the free route appeared unhealthy. The tested free runtime is promising, but the requested 10/12 completed-trial target was not established.

- **Bulk next step:** when the exact free route is healthy, finish only the three missing varied conditions (reversed six, shuffled six, five ranges) as fresh disposable sessions under the same model/tool/turn settings. Preserve the nine completed outcomes; do not repeat them.
- **Jev next step:** the separate [responsibility audit](jev-responsibility-audit-2026-09-28.md) recommends one matched, source-only compact-transcript versus optional Jev K12 comparison with original context expansion and story/cost accounting. Do not enable Jev by default or implement other proposed roles first.
