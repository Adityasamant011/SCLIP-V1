# Optional Jev discovery and benchmark accounting — 2026-09-27

Verdict: **JEV DISCOVERABILITY STILL NEEDS WORK**.

This is a behavioral acceptance failure, not proof that another description patch or architecture change is necessary. The optional capability is demonstrably visible and usable, but the current free model chose it in only one of three fresh broad-source tasks, after substantial local stalling. No GLM call or full edit was run.

## Diagnosis, established before edits

- `evaluate_source_passages` was already conditionally advertised by production `tools/list` when Jev is enabled, and its existing WeftCut skill paragraph already mentioned Jev. There was no missing tool, wrong skill installation destination, new router requirement or evidence of a disconnected Jev implementation.
- Hermes indexes tool names, full descriptions and parameter names through its existing deterministic BM25. Full schemas remain deferred. Its catalog summary clips the first sentence to **60 characters**, not 160.
- The old full description began: “Optional read-only Jev evidence helper: compare cached transcript passages against your own request without reading verbose word arrays.” Its short catalog line was consequently “Optional read-only Jev evidence helper: compare cached…”, losing the transcript/search purpose.
- The old description ended “Prefer segments for chronological source understanding; this tool is for comparisons.” The skill likewise presented normal `get_media_context` segment reads as source understanding and Jev as optional source comparison, not broad semantic retrieval across a long source. A full chronological read was therefore a prominently presented strategy, even when a shortlist might be more efficient.
- The previous GLM trace shows searches for media-pool/resource discovery, then explicit intent to read the complete transcript in chunks. It never searches for semantic source retrieval or mentions Jev. The exact old model-facing request/manifest was not captured, so the trace does **not** prove GLM was unaware of the tool or establish its private reason for ignoring it. The proven problem was weak/misleading capability presentation, combined with an observed choice of the full-read path.

## Minimal changes

1. Changed only the evaluator's descriptive prose, not its schema/handler/ranking/model. New first sentence: **“Semantic transcript search: shortlist relevant source passages.”** Its real Hermes short listing is “Semantic transcript search: shortlist relevant source…”. The rest explains optional long-source retrieval, original context expansion, freedom to ignore the shortlist, and normal tools for known ranges/word timing.
2. Replaced the existing skill's comparison hint with a short optional semantic-discovery hint: shortlist when more efficient, expand original context as useful, or use normal transcript tools directly. No mandatory order, automatic invocation, final-story choice or creative decision was added.
3. Added prose/agency regression assertions. Updated the existing skill conformance test's stale catalog union to include the production main-process tool definitions and optional evaluator, and removed two already-dead non-tool vocabulary entries. Its previous failures concerned references already present before this task; production catalog behavior did not change.
4. Fixed test-only accounting and sanitized evidence capture, detailed below. No Hermes checkout, BM25, ProjectActor, MCP handler/schema, vision, transcription, timeline, compositor or export implementation was changed in this continuation.

## Free validation conditions

All three used the currently selected production profile: **OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free`**, unchanged reasoning configuration. Each had a fresh disposable profile/session/project, the same source and cached transcript, the rebuilt production MCP catalog and refreshed/preloaded current WeftCut skill. State/history was not copied between sessions.

The three user briefs varied modestly: focus/mentorship source selection; coherent 30–45s section about choosing one path/mentor; strongest focus story. None mentioned Jev, its tool name or historical winner timestamps. All forbade timeline edits, vision, captions and export. Sixteen interaction turns per session; no turn allocations or outside steering. Any SDK inference request to a different model/provider was blocked before dispatch.

The captured SDK request manifests **directly prove** that the main model received the new short evaluator description in all three sessions. The tool could be called by its deferred name; no BM25 modification or schema exposure was needed. No session used `tool_search`/`tool_describe`; they invoked known deferred names through the normal `tool_call` bridge.

| Run | Jev chosen | First attempt / successful call | Normal turns | Original source actually read | Full original transcript? | Completion |
| --- | --- | --- | ---: | --- | --- | --- |
| A | Yes | 10 / 11 | 16/16 | 0–60s repeated ten times, then valid resources 180–240s and 290–330s | No: 40/140 unique segments | Limit summary, not voluntary |
| B | No | — | 11/16 | Six consecutive windows, 0–360s | No: 88/140 unique segments | Voluntary final answer |
| C | No | — | 14/16 | Nine consecutive windows, 0–540s | No: 132/140 unique segments; near-full scan | Voluntary final answer |

Counts are unique source segment timestamp pairs; window overlap can repeat segments. Jev's internal local cache read of the complete source is not counted as Hermes reading the full original transcript. No full transcript was automatically injected into Hermes.

### Run A

Hermes first attempted ordinary transcript reads. It guessed `range_start_us` / `range_end_us` instead of the documented `start_us` / `end_us`; consequently those calls returned the default first-minute window. It misdiagnosed that as an incomplete cache/tool problem. The trace then explicitly proposes the optional evaluator as an alternate way to search focus/mentorship evidence. It did not receive an external reminder.

The first Jev invocation had incorrect `media_id` / `query` / `max_passages` fields. The normal validation error led to a corrected `media_ids` / `request` / `limit` invocation on the next turn. Request: “focus mentorship mentor guidance discipline attention”; K=10. Three production Jev batches evaluated all 35 cached candidates. Their total provider-reported cost was **$0.000891156**; all HTTP 200. Jev was still pinned to `typesafe/jev-1.13`.

Actual shortlist:

| Rank | Source seconds |
| --- | --- |
| 1 | 489.76–509.44 |
| 2 | 363.12–378.32 |
| 3 | 404.72–418.16 |
| 4 | 202.32–220.56 |
| 5 | 509.44–526.80 |
| 6 | 174.64–190.08 |
| 7 | 298.88–311.84 |
| 8 | 391.52–404.40 |
| 9 | 220.88–236.64 |
| 10 | 311.84–330.00 |

Hermes identified the mentor passages, not just rank 1. It attempted context expansion at 165–230s, 180–240s and 300–350s, but again used invalid range aliases and reread the first minute. It then independently switched to correctly formed original resource URIs for **180–240s** and **290–330s**, receiving 16 and 11 segments respectively.

After Jev: 7,430 transcript characters including failed-range repeats; the two genuinely expanded resources contributed 2,603 characters. Total ordinary transcript text received: 18,693 characters including repeats; corresponding source responses were 206,282 characters with word timing/envelopes. Those are observations, not cost-saving claims.

Its limit-summary recommendation combined **0–7.3, 202.32–225.28, 225.84–240.56, 489.76–509.44, 298.88–330, 363.12–378.32s**, describing a 60–90s focus/trust story. No edit verified that duration. It did not simply select rank 1, but did not efficiently recover the airport setup. Its claim to have analyzed the full source was false: only 40 unique original segments plus Jev excerpts were received. Remaining failures: agent tool/schema use, repeated local stalling, overbroad editorial selection and unsupported whole-source reassurance. No tool was patched to compensate.

### Run B

Hermes ignored Jev despite the visible listing and independently chose compact chronological transcript reads. It requested **0–60, 60–120, 120–180, 180–240, 240–300, 300–360s** using correct arguments. Total 9,626 transcript characters; 93 segment entries including overlap, 88 unique segments. It stopped voluntarily after 11 model turns.

Final source: **177.520–220.560s** (43.04s), the one-mentor/blinders argument, conflicting-blueprint failure mechanism and follow-through payoff. Optional longer proof-story extension: **240.880–330.000s**. This is a useful, focused transcript-level choice, not a Jev efficiency demonstration. Its “full transcript” wording is unsupported by the actual six-minute read.

### Run C

Hermes independently chose a near-full chronological scan, **0–540s** in nine 60-second windows. Total 13,925 transcript characters including overlapping segments; 140 returned entries but only **132 of 140 unique source segments**. The final approximately 36 seconds were not read. It stopped voluntarily after 14 model turns, without considering/calling Jev in the trace.

It proposed broad material spanning **0–7.3, 10.18–15.54, 70.56–97.44, 143.92–182.96, 248.88–330, 391.52–414.32, 425.6–542.64s**, combining the airport story, proof story, framework and Miyagi analogy into a claimed 60–90s short. This is a multi-story source proposal, not a demonstrated tight 30–45s selection. Its whole-source claim again exceeded the observed coverage.

## Overall behavior / agenticness

The optional path became demonstrably callable without prompt injection, but **1/3** usage does not meet “useful in most broad long-source runs.” The one Jev run was late, error-prone and exhausted its budget. This does not justify a paid GLM confirmation yet. It also does not establish that GLM would repeat Nemotron's particular failures.

Jev remained optional: B/C skipped it; A selected it itself and then chose original context/resources. A considered non-top-ranked mentor evidence and made its own narrative choice, rather than delegating final editorial selection. No automatic Jev call, stage controller, second timeline, mutation permission or mandatory creative behavior was added. Original transcript/resource access remained available. All three before/after timelines matched and normal post-run MCP inspection passed.

## Benchmark accounting / redaction

The opt-in test adapter now observes `SyncAPIClient.request` and `AsyncAPIClient.request` at the SDK boundary, rather than Hermes's normal-loop pricing hook. It sees the configured OpenRouter benchmark's normal streamed calls, direct iteration summaries, title/auxiliary calls, and sync/async Chat Completions/Responses paths. Original results/chunks are passed through; production accounting is untouched. There is no double counting from the former normal-loop/auxiliary observers.

Real free-run evidence: A captured **18** receipts = 16 normal + 1 title + **1 iteration summary**; B captured **12** = 11 normal + 1 title; C captured **15** = 14 normal + 1 title. The previously missed summary now has its own **107,122 input / 2,563 output token** receipt. All 45 requests used the selected free model and carried provider-reported cost 0. GLM requests: **zero**. Total measured spend across this continuation's external validation: **$0.000891156**, solely Jev. This is not evidence of GLM editing savings.

Unknown model/provider/endpoint inference is blocked before dispatch. Missing usage, provider/stream failure or unknown accounting fails closed rather than permitting another unmetered request. Cost checks apply to auxiliary and summary receipts as well as normal calls; local mock tests prove a summary can trigger the cap and block subsequent requests. This covers the current benchmark's OpenRouter SDK paths, not arbitrary future providers or raw HTTP implementations. Provider failures may leave billed cost unknown; the observer stops rather than labeling it zero. A post-response spend check is not a guaranteed bound on an already in-flight paid request, so the old $0.15 gate is not represented as a prepared $0.05 confirmation harness.

The read-only SQLite exporter now preserves nested `tool_call` arguments, valid numeric ranges and mistaken numeric aliases/structural fields, while dropping secret/config/header fields. It understands Hermes's external-result trust wrapper and records source volume/coverage and whitelisted Jev passages without dumping full original transcripts. Credentials are redacted; synthetic secret tests pass. A's source metrics were reprojected from the same local database before disposable cleanup, without any model call. Minor observer role/latency metadata improvements during the tests did not alter prompts, tool choices, responses, budgets or production guidance.

## Local verification and preserved state

- Baseline relevant tests before changes: **15/15 PASS**.
- Final relevant Vitest tests: **47/47 PASS**, including agency/prose, source evaluator, ordinary transcript reads, Jev client, skill installation and skill conformance.
- Python observer/evidence tests: **17/17 PASS**; SDK mock transport only, no provider calls. Includes normal/summary/auxiliary accounting, streaming, async/Responses, cap enforcement, missing usage, provider failure, early stream close, blocked paid fallback, numeric/nested arguments and secret redaction.
- Rebuilt app/skill: **PASS** (`npm run build:e2e`); no packaging/install or user-app replacement was requested/performed.
- Three production-path disposable agent fixtures: **3/3 read-only safety assertions PASS**. This is not a behavioral Jev acceptance PASS.
- User's model remained the selected free Nemotron profile; Hermes Git checkout remained clean. Existing dirty Sclip work was preserved, including prior terminal, vision, compact transcript, rough-cut and ProjectActor changes. Those implementations were not revised here.
- No timeline edit, captions, Qwen inference or export in this task. Vision quality and video quality were not evaluated.

## Next paid test

**Not ready / not executed.** The conditional requirement of healthy optional usage in most free runs was not met, so no new $0.05 GLM confirmation was armed. Do not run the existing older GLM gate as a substitute: it is not the requested tiny confirmation. Next smallest action is a local review of these optional-tool selection and schema-use failures before choosing whether another advisory presentation change is justified. Do not force Jev, add stages or change the editor to manufacture success.

Saved, gitignored evidence for each A/B/C validation (not a model A/B):

- `apps/desktop/e2e/bench-results/jev/free-discovery-{1,2,3}.hermes-trace.txt`
- `apps/desktop/e2e/bench-results/jev/free-discovery-{1,2,3}.outcome.json`
- `apps/desktop/e2e/bench-results/jev/free-discovery-{1,2,3}.live-usage.jsonl`

Stopped after the three approved free-model source-only sessions. No paid GLM run, full edit, commentary/product test or style learning followed.
