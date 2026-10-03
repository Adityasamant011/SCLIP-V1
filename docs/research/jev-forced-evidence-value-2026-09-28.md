# Jev evidence-value gate — 2026-09-28

## Verdict

**INCONCLUSIVE — provider/accounting stop before a matched pair.** The recorded Jev result passed the offline authenticity/source-access checks, but the first (DIRECT) free-Nemotron session stopped on its third main-model request after the stream failed without observable usage. The guard exited with code 86. Per the predeclared stop condition, the JEV-EVIDENCE condition was **not launched** and the direct condition was **not retried**. No conclusion about Jev's effect on Hermes efficiency, story quality, or GLM cost is warranted. No production delegation should be built from this result.

## Recorded evidence and question match

The immutable captured fixture is `apps/desktop/e2e/bench-results/jev/shadow-retrieval-current.json` (SHA-256 `e9f97213c78a6427ad1b2f34098993bad6e9904be24f24a4f36adb43b963a5ba`). It contains three OpenRouter Decisions receipts, all HTTP 200, for requested `typesafe/jev-1.13` / returned `typesafe/jev-1.13-20260917`, with positive input-token and cost usage. Their provider-reported cost totals **$0.000911694**. These are saved provider receipts, not an independently reconciled invoice. The result has 12 ordered, exact-timed passages out of 35 evaluated candidates, original `media://` references, coverage, and an explicit warning that the shortlist is fallible and non-exhaustive. All 12 passage texts matched the unchanged 140-segment cached transcript; its source hash and cached time range matched the capture.

The original Jev question was broad: find the strongest self-contained section of the complete source for a useful 30–45-second vertical short while preserving the speaker's message/personality. This **materially differs from the prior focus/mentorship cohort brief**. For this gate, both predeclared conditions use the recorded question verbatim, followed by the same request for exact ranges, setup/point/payoff, and source-only safety limits. Neither condition is given the historical final cut or 155–225-second evaluation label.

The captured shortlist includes the one-mentor advice at 174.64–190.08 s (rank 4) and 202.32–220.56 s (rank 7), but does **not** contain the complete airport encounter/setup at 143.92–168.56 s. Rank 6 only hints at it in neighboring text. The missing material remains in the original cached transcript. This is a discovery hit, not proof that the shortlist alone preserves a coherent story. Noul values remain uncalibrated semantic judgments, not probabilities of editorial correctness.

## Matched design and offline gates

The two planned conditions used the same current Sclip build, disposable imported source/cached transcript, copied Hermes profile, exact OpenRouter free Nemotron model, WeftCut skill, source-only brief, 16-turn cap and original-source tools. Editing tools remained available in the normal Hermes catalog, but the task prohibited edits and timeline equality was checked. The only planned condition difference was a once-delivered, stable projection of the **previously recorded** Jev result in the JEV-EVIDENCE prompt. That projection preserved passage values/order/references, coverage and uncertainty, and would explicitly map the captured source ID to the identical source imported into the disposable project. It would label Jev as advisory, non-exhaustive, text-only evidence. The captured fixture itself was not edited. This is **forced evidence delivery**, not autonomous Hermes Jev selection or system delegation.

Offline built-app preflight: **1/1 PASS**. With live Jev disabled, the app still exposed `get_media_context`, successfully returned the airport source material excluded from the shortlist, and kept the timeline unchanged. The pair harness also checks this original-source access for each condition before its agent starts, verifies Jev is absent from the catalog, and checks timeline equality/MCP usability afterward. The fixture's passage text, IDs, references, source hash, provider receipts, coverage and uncertainty were asserted. The benchmark DB projection now records UTF-8 transcript bytes as well as characters; readiness-guard unit tests passed **18/18**. No new Jev provider request or model inference occurred in these offline checks.

## Attempted free-model comparison

| Measure | DIRECT | JEV-EVIDENCE |
| --- | ---: | ---: |
| Exact main route | OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` | Not launched |
| Completed main calls | 2, then third stream/accounting failure | 0 |
| Completed-call input tokens | 36,270 (cached 0; uncached 36,270) | Not measured |
| Completed-call output / reasoning tokens | 399 / 176 | Not measured |
| Transcript segments delivered | 13 unique of 140; same window twice | Not measured |
| Original transcript delivered | 3,218 characters / 3,218 UTF-8 bytes | Not measured |
| Repeated source reads | 1 duplicate first-window read | Not measured |
| Wall time | 26.689 s to guarded stop | Not measured |
| Source story/ranges | None; stopped before selection | None |
| Voluntary completion | No | Not tested |
| New Jev requests / cost | 0 / $0 | 0 / $0 |
| Timeline / MCP afterward | Unchanged / usable | Not launched |

On the second completed turn, Hermes attempted a range nested under `range` rather than the flat tool arguments, and the source tool returned the first 0–60 s window again. This is one observed duplicate read, **not** evidence about Jev. The third main-model stream failed with `stream_failed_usage_unknown`; the guard could not establish token usage and stopped immediately. Its possible upstream charge is unknown, so the two completed free receipts must not be represented as a fully accounted three-call session. No fallback model, GLM call, timeline mutation, vision, caption or export occurred.

Saved direct-run artifacts (gitignored): `apps/desktop/e2e/bench-results/jev/forced-value-direct.{outcome.json,live-usage.jsonl,hermes-trace.txt}`. No `forced-value-jev-evidence` artifact exists because that condition was not run. The test-only harness is `apps/desktop/e2e/electron/jev-reliability.spec.ts`; the benchmark projection and its tests are under `apps/desktop/e2e/electron/helpers/readiness_guard/`. Existing dirty production work was preserved; no Sclip production source, Hermes core, ProjectActor, Jev ranking, skill or model setting was changed for this gate.

## Architectural decision

- **Existing provider capability:** demonstrated by the saved real Jev receipts and exact source-referenced shortlist.
- **Forced evidence delivery:** designed and locally validated, but **not observed by Hermes** because the matched pair stopped in DIRECT.
- **Autonomous Hermes Jev selection:** not tested here.
- **Future system-level delegation:** not implemented and not justified by this incomplete value test.

Whether Jev reduces transcript reads, preserves the best story after original expansion, changes total latency/tokens, or improves GLM-dollar economics remains **unproven**. Jev eliminated **zero measured transcript reads in this run** and added **zero new inference calls**. No run-to-run difference is attributed to Jev because there is no completed pair.

**Single next justified action:** when this exact free Nemotron route again returns complete, usage-accounted streams, run the one preregistered DIRECT/JEV-EVIDENCE source-only pair once with the unchanged fixture and brief. Do not implement automatic delegation before that evidence exists.
