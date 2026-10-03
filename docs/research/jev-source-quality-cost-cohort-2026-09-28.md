# Jev source-quality and cost cohort — 2026-09-28

## Verdict

**Jev's incremental source-quality or economic value was not measured in this cohort.** In the first Jev-enabled, explicitly directed session, Hermes did not call the advertised evaluator. The second directed session was stopped by the existing fail-closed free-model usage guard before any main-model turn. The two planned autonomous sessions were not run, as instructed when the free provider became unusable for a safely metered run. No production code or model setting was changed to force a favorable result.

This is a partial experiment, not a negative Jev retrieval-quality result. The earlier production shadow test established that Jev can return exact-timed mentor passages cheaply, but its initial top 12 omitted much of the airport setup. This cohort neither repeated nor resolved that limitation because it made **zero Jev provider calls**.

## Controls and current behavior

- The actual disposable Sclip configuration resolved to OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` in all four started sessions. The SDK-boundary guard allowed only that exact model/provider. GLM calls: **0**. User's live model and Jev configuration were not changed.
- Production Jev remains disabled unless `SCLIP_JEV_ENABLED=1` in the launched process. The two completed direct conditions had no `evaluate_source_passages` in `tools/list`; the Jev-enabled conditions did. `get_media_context` remained listed in both. The evaluator reads imported cached transcript data, not timeline state. The previous shadow source had 140 cached segments over approximately 575.7 s; its result included timestamps, ranked excerpts, neighboring references, coverage and uncertainty. No ranking code changed here.
- Each run used a fresh disposable profile/project, copied the same historical source and cached transcript, preloaded the same WeftCut skill, used a 16-turn ceiling and the same source-only creative brief. The direct condition additionally requested compact transcript evidence; the directed Jev condition additionally requested semantic passage evaluation as an *initial aid*. This routing sentence is an experimental difference, not a perfectly controlled causal comparison. Historical winner timestamps and Jev's previous ranking were **not** in any agent prompt.
- No timeline mutation, captions, vision or export. Post-run timeline equality and normal MCP request passed in all four started sessions. The test adapter used secure production credential resolution and retained numeric Jev receipts only. Its opt-in per-session cap was set from the remaining $0.02 cohort allowance and now fails closed if cost becomes unobservable. This is test-only instrumentation.

## Measured runs

All token counts are SDK/provider usage receipts, including any auxiliary request. `Main` excludes that auxiliary request. Input is cumulative over calls, **not peak context**. Source characters count ordinary transcript text returned to Hermes; Jev's internal transcript read would not be counted there. Times include disposable-session setup and agent execution. All completed runs voluntarily returned a final source choice below 16 turns.

| Run | Result | Main calls | Input / cached / uncached | Output | Original text to Hermes | Unique transcript segments | Jev requests / cost | Wall |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pair 1 direct | Completed | 11 | 253,347 / 90,720 / 162,627 | 3,286 | 11,126 chars | 105/140 | 0 / $0 | 119.4 s |
| Pair 1 directed Jev | Completed, **Jev ignored** | 14 | 345,263 / 168,480 / 176,783 | 4,787 | 14,667 chars | 140/140 | 0 / $0 | 173.3 s |
| Pair 2 direct | Completed | 13 | 311,305 / 181,440 / 129,865 | 4,743 | 13,925 chars | 132/140 | 0 / $0 | 212.3 s |
| Pair 2 directed Jev | **Provider/accounting stop before main turn** | 0 | 0 / 0 / 0 | 0 | 0 | 0 | 0 / $0 observed | 9.4 s |

Pair 1 Jev-enabled used **3 more main calls, 91,916 more cumulative input tokens, 3,541 more ordinary transcript characters and 53.8 s more wall time** than its direct counterpart. Since it never invoked Jev, these differences are ordinary run-to-run/model-path variation under different guidance, **not Jev overhead or savings**. Pair 2 has no valid Jev comparison. The failed auxiliary request had missing usage and an unknown possible provider charge; the guard stopped with exit 86 rather than treating that as a metered success. No paid-model fallback occurred.

### Selected source and editorial quality

- **Pair 1 direct:** Selected 125.760–140.800 s (people jumping between programs), 177.520–190.080 s (choose one mentor), and 275.520–330.000 s (student proof). It recognized the airport story while reading but did not put its setup into the final selection. Its exact selected ranges total about **82.1 s**, despite a 30–45 s brief; it proposed a future trim rather than providing final 30–45 s ranges. Setup/point/payoff are present as an outline, but the output is not a ready-to-cut short. It incorrectly claimed to have read the full source; the trace shows 105/140 unique segments.
- **Pair 1 directed Jev:** With the Jev tool advertised and explicit routing guidance, Hermes still read **all 140 segments chronologically** and never invoked Jev. It selected a distinct Mr. Miyagi explanation: 425.600–430.080, 430.560–434.800, 439.200–444.140, 484.080–499.280, 534.800–542.640 s. These total about **36.7 s** and form a plausible setup → apparently pointless training → realization → viewer takeaway. This is a coherent alternative, though it is not the historical airport/one-mentor story. It cannot be credited to Jev.
- **Pair 2 direct:** Selected 155.360–158.400 s (airport question), 177.520–182.960 s (one-mentor advice), 425.600–454.220 and 494.560–503.760 s (Karate Kid analogy), and 534.800–542.640 s (trust-the-guide payoff). The airport hook and mentor point were recovered, but the exact ranges total about **54.1 s**, exceeding the target until further trimming. The very large jump to the later analogy may be editorially workable, but no actual edit was made to validate it. The trace covers 132/140 unique segments, not the entire transcript it claimed to review.
- **Pair 2 directed Jev:** No source choice. The first auxiliary free-model response lacked usable usage data (`response_usage_missing`); the cost guard stopped before the first main turn. The trace does not establish whether the upstream cause was rate limiting, transport or provider behavior.

No completed run made a timeline edit or verified spoken-word cut boundaries. Source-story ratings above are transcript-level judgments only, not video-quality judgments. The held-out historical approximately 155–225 s mentor/airport narrative was partially rediscovered by both direct runs but not chosen intact; the Jev-enabled completed run chose a coherent alternative after reading the whole source, without Jev. The current cohort therefore cannot determine whether Jev preserves or harms historical-story recall.

## Capability, autonomous usage, economics and root cause

**A. Capability when intentionally used:** **Unresolved.** The directed prompt did not cause a Jev call in the only completed Jev-enabled run. The prior shadow test demonstrates provider/tool capability, not agent-level efficiency or final story quality.

**B. Autonomous selection:** **Not measured here.** Both planned autonomous sessions were withheld after the free-model guard stop. Historical optional-discovery evidence remains separate: 1/3 older free sessions selected Jev, late and with tool-argument friction. Do not combine those with this cohort as if they shared the same prompt/control.

**C. Source-quality preservation:** **Unresolved for Jev.** The one Jev-enabled completed session produced a coherent short candidate, but did so by ordinary full chronological reading. Direct sessions found the mentor lesson, although both overspecified total duration.

**D. Economic value:** New observed Jev spend **$0**, because there were **0 Jev requests**. Three completed sessions used the exact free main-model route; observed main-model provider cost was $0. The failed auxiliary request has unobserved usage/cost. There is **no measured primary-model saving, Jev-assisted token delta, or GLM-dollar estimate**. The historical shadow Jev cost under $0.001 is not a substitute for this missing comparison.

**E. Root cause:** The concrete directed-run failure is **agent non-use of an available tool**: catalog assertion passed, prompt asked for semantic passage evaluation, trace shows only `get_media_context`/resource reads and no Jev provider request. The model's private reason is unknown; this does not prove a catalog or evaluator defect. The fourth run's `response_usage_missing` is a separate **free provider/accounting interruption**, not a Jev failure. No tool argument errors or retries were observed in the three completed source runs.

**F. Next smallest change:** **None to production yet.** When this exact free route can again return metered responses, run the interrupted directed condition under a fresh artifact label (preserving this failed trace), then the two predeclared autonomous source-only conditions under the unchanged prompts/cap. If directed non-use repeats, a separate tool-selection investigation is warranted before touching retrieval ranking or enabling Jev normally. Do not infer cost savings or start a paid edit from this incomplete cohort.

## Verification and artifacts

- Three completed read-only production-path sessions: **3/3** timeline unchanged and MCP usable afterward; one additional pre-main guarded stop also left both unchanged.
- Exact model guard: all observed SDK requests were for free Nemotron/OpenRouter; **0 GLM**. Jev adapter recorded **0 requests**, cost available, no budget stop. No live profile edits.
- `npm run build:e2e` was attempted but stopped in the Rust dependency phase because `static.crates.io` DNS was unavailable; no compiled app output was replaced. The experiment used the existing built Sclip output from earlier on 2026-09-28. The test-only Playwright file loaded and executed normally against that build.
- Redacted traces, numeric receipts and projected tool evidence: `apps/desktop/e2e/bench-results/jev/source-quality-{pair-1-direct,pair-1-jev,pair-2-direct,pair-2-jev}.{outcome.json,hermes-trace.txt,live-usage.jsonl}` (gitignored). Two autonomous artifacts do not exist because those sessions were not launched.

**Stop condition honored:** no retry after the free-model accounting failure, no GLM, no edit and no new Jev responsibility.
