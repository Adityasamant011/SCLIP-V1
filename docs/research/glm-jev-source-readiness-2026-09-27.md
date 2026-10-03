# GLM / optional Jev source-readiness gate — 2026-09-27

Verdict: **DO NOT SPEND ON FULL EDIT YET**.

One real, disposable, source-only Hermes session was run through the existing secure Sclip launcher and built-app MCP path. The resolved active profile and session both used OpenRouter `z-ai/glm-5.2`; no fallback was observed. Existing reasoning configuration was left unchanged (`reasoning_config: null`). Jev was enabled, pinned to `typesafe/jev-1.13`, and available through the normal optional tool catalog. It was not automatically invoked or inserted into context.

## Conditions and observed behavior

- Fresh disposable project, the existing approximately 575.7-second talking-head source, cached production transcript, current WeftCut skill/profile/tool-search behavior.
- Twelve interaction turns; no fixed evidence or creative action order.
- Prompt: “Understand the source material and identify the strongest coherent material for a polished 30–45 second vertical short about the speaker's useful lesson around focus / mentorship. Do not edit yet. Tell me what source material you would use, with exact source ranges and why the setup, point and payoff fit together. Choose your own evidence and tools. This is source understanding only: do not mutate the timeline, run vision, create captions or export. Stop when you have identified a defensible source story.”
- No historical evaluation timestamps or Jev passages were supplied to Hermes.
- Hermes independently chose original transcript evidence, not Jev. It used normal tool discovery, media context, timeline context, resource listing/reading and transcript queries.
- It read the complete 140-segment transcript in two batches of five source queries, then requested detailed word timing for selected material. Two source-range validation errors were followed by corrected reads; tools were not changed.
- It recovered the airport/mentor story and considered, then rejected, the longer Brandon & Caitlin proof story for this duration target.
- It exhausted 12/12 turns. The existing Hermes iteration-limit handler made an additional summary request; the resulting recommendation was not voluntary independent completion.
- Wall latency: 118,496 ms. No timeline mutation, vision, captions or export. Timeline equality and a normal post-run MCP call passed. User profile unchanged; Hermes checkout unchanged. Production code was not changed for this gate.

## Usage and measurement limitations

| Recorded category | Main loop (12 calls) | Title generation (1 call) |
| --- | ---: | ---: |
| Cumulative input, including cache reads | 282,190 | 334 |
| Cache-read input | 242,560 | 0 |
| Uncached input | 39,630 | 334 |
| Output tokens | 4,113 | 114 |
| Reasoning tokens, included in output | 2,482 | 97 |
| Provider-price estimate | $0.0634031872 | $0.0004497088 |

Recorded GLM estimate: **$0.063852896** including title generation. Jev: **$0** (zero requests). This is a **partial recorded estimate, not complete billed spend**.

There were 13 main-model requests (12 normal calls plus the successful automatic iteration summary), and one GLM title request: 14 GLM requests in total. The summary path calls the OpenAI-compatible client directly and bypasses the normal-loop usage accounting observed by the test adapter. Its tokens/cost were not captured. Provider actual-cost fields were unavailable; SQLite's default zero is not evidence of free usage. Consequently this run cannot certify the complete actual total or end-to-end $0.15 cap. No further paid request was made to investigate this gap.

The test-only observer used normal Hermes pricing/accounting, an early conservative $0.10 stop, and a $0.15 actual-cost stop when actual cost is provided. Neither fired on the captured calls. Its uncovered iteration-summary path is a known measurement limitation, not a proven complete hard-budget guard. The Playwright fixture's 1/1 PASS establishes its read-only assertions, not a readiness or fully metered cost PASS. Observer unit tests: 3/3 PASS; these do not cover the missed summary path.

The sanitized tool-call exporter retained the progressive wrapper's tool name but omitted nested arguments. Exact executed transcript query bounds were therefore not preserved in the exported outcome. The CLI trace states intent to obtain detailed evidence around 2:35–3:15 and 3:25–3:31, then the alternative proof story; these statements must not be presented as exact executed API bounds. Full-source access is evidenced by the trace's 140-segment analysis. The disposable profile was cleaned up normally, so missing nested bounds cannot be recovered from its database.

## Final recommendation from Hermes

| Source range (seconds) | Purpose |
| --- | --- |
| 155.360–158.400 | Hook: number-one advice for a young person seeking success |
| 163.200–168.560 | Setup: divided attention between marketing and real estate |
| 177.520–182.960 | Point: find one trusted mentor and put on blinders |
| 183.040–190.080 | Action: unsubscribe from competing gurus; choose one person |
| 190.080–194.960 | Reason: follow a blueprint through to the end |
| 205.600–210.640 | Payoff: one mentor, one person |

Source duration sums to **30.80 seconds**. Hermes also proposed 192.760–194.960 as a tighter replacement for the fifth range to omit stuttering; that version sums to 28.12 seconds. Neither edit was executed. Hermes's additional predicted rendered duration/pacing is not verified.

## Historical comparison and acceptance

The substance of the historical approximately 155–225-second mentor/focus narrative was recovered without revealing those evaluation timestamps. The proposed setup → point → payoff is coherent at transcript level. This supports GLM's ability to understand the source using original evidence.

It does **not** demonstrate GLM using the Jev shortlist intelligently or expanding from Jev's mentor passages: Jev was never called, no ranked passage was considered, and no Jev-guided recall/cost benefit was measured. The central readiness question remains unanswered. Turn exhaustion and incomplete cost instrumentation are additional reasons not to authorize the expensive full edit from this run.

Hermes remained the creative decision-maker, chose its own evidence/order, could ignore Jev, and retained original source access. No workflow controller, production-code change, second agent, or creative orchestration was added.

Next smallest action: repair **test-only** capture of all paid request paths and nested evidence arguments, then obtain approval for another small source-only gate. Do not launch the full edit from this result or silently force Jev into the prompt to manufacture a PASS.

## Saved evidence

- `apps/desktop/e2e/bench-results/jev/glm-readiness.hermes-trace.txt`: redacted CLI trace and exact final recommendation.
- `apps/desktop/e2e/bench-results/jev/glm-readiness.outcome.json`: resolved model, recorded usage, tool names and read-only assertions.
- `apps/desktop/e2e/bench-results/jev/glm-readiness.live-usage.jsonl`: captured normal-loop and title usage receipts.

These generated artifacts are gitignored. Existing dirty production work was preserved. This gate is stopped; no full edit, A/B, vision or export followed.
