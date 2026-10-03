# Jev first slice — preserved-state local completion

2026-09-27. Local implementation/regression work completed; real retrieval quality, matched cost and finished-edit quality remain gated on provider access. No new paid request in this continuation.

## Current worktree and preserved work

HEAD: `e73e979ad3d78400b5cea63a95a17d020d7ab096`. The tree remains dirty: 51 tracked modified files plus existing/new untracked work (109 porcelain entries, including directory entries). No reset, stash, checkout, commit or original-project replacement.

Preserved native transcription/context fixes, ProjectActor/editor readiness, Qwen/worker and composed-seeking changes, secure Hermes settings/runtime, dashboard/trash work, compact transcript implementation, terminal repairs, honest vision parser/facts and the first optional Jev tool. The initial first-slice baseline diff hash was `00dfa09e3785512340003dc3f2fa54f044d2963808131588ae83cc069141f25e`; that was already a substantial dirty tree, not work produced by this continuation.

The existing ProjectActor dirty hunks were not edited. Actor file SHA-256: `5bb6f84b420a635b35b9b3ff0dedca231a18e9f31fa6cccd49c519c0ec57d679`. Hermes core remains a clean checkout at `8fd95f5c75a97418c983be7baaa55a408bed206a`. No provider/model/reasoning/max-turn or production pruning configuration changed.

Handoff discrepancies: the old report said packaged Qwen was not verified; a subsequent actual packaged check passed. The skill still contained historical mandatory Phase 2B/2D/2E sequences despite its advisory paragraph. Those sequences are now advisory tool options, not editing stages. The old MCP checkpoint description claimed persistent `.vproj` checkpoints; current workspace serialization/open deliberately resets runtime history. The description now states the real behavior; persistence/actor were not changed.

## Changes in this continuation

- Reused **existing production `apply_rough_cut_plan`**. Clarified atomic bulk placement, linked A/V, returned IDs, internal validation, optional dry-run and target-track replacement from zero. No duplicate placement primitive or generic executor.
- `apply_transcripts` now returns NEW `caption_layer_ids`, `caption_track_ids`, count and timeline range alongside existing fields. Handles reused/multiple caption tracks; takes the ID baseline immediately before actor dispatch so unrelated GUI edits during transcript I/O are excluded. No caption mutation/layout/timing changes.
- Jev default K increased to 12, with no confidence cutoff. Added exact neighboring-context references and evaluated/returned/unreturned counts. Uncalibrated Noul values are explicitly not correctness probabilities. Original source remains accessible.
- Added safe Jev usage/error receipts to the existing LogBus (model/request ID, numeric usage/cost/latency, whitelisted error code only). No prompts, transcript bodies, keys or raw provider errors in receipts; unavailable billing remains null.
- Extended the existing benchmark with compact vs Jev source-understanding arms using the same existing 12-turn task and user-selected main profile, optional legacy rollback arm, safe manifests/usage records and retained incomplete outcomes. No export. Added test-only strict winner-window coverage diagnostics at K=3/6/12 for previously selected puzzle and mentorship passages; human relevance/context review remains required. These labels are not creative instructions or quality scores.
- Evaluated the installed Hermes compressor offline on synthetic and saved historical sessions; no new compressor and no production setting applied.
- Added real PTY/xterm, read-only built-app, missing-key, checkpoint/undo/save-reopen, multi-track caption receipt, bulk-equivalence, parser/geometry and structural agency regressions. Corrected test-only loading/legacy return handling errors rather than production tool semantics.
- Concrete new lifecycle finding: test-created Qwen children outlived Electron quit. Added the existing `disposeVisionRuntime()` to the existing awaited graceful-quit block. Built-app child-exit regression passes. No sidecar/model/prompt/vision architecture change. Stopped seven explicitly identified orphan workers from this continuation; no project/model files deleted and no user's app stopped.

## Tests and boundaries

| Check | Actual result |
| --- | --- |
| Focused Vitest (18 files) | **309/309 PASS** |
| Production worker parser AST tests | **5/5 PASS** |
| Real PTY adapter + real xterm, final production build | **2/2 PASS**, including MCP after terminal use |
| Built app, Jev disabled | **PASS**: compact/detailed exact transcript comparison, actual composed local Qwen, factual geometry, unchanged timeline after evidence, normal MCP, checkpoint restore, undo/redo, save/reopen |
| Built app, Jev enabled without credential | **PASS**: clear error, no paid request, timeline unchanged, ordinary MCP still works; same local/history gates pass |
| Built local-Qwen graceful quit | **PASS**: its exact child PID is gone after close |
| Production build + arm64 macOS package | **PASS**; production bundle has no E2E hook; stamped skill matches source and packaged skill matches staging |
| Final packaged local Qwen | **1/1 PASS** actual inference/MCP/renderer and exact child-PID exit after quit; `packaged-app-evidence.json` plus test output |
| Existing compressor, synthetic and saved 52-call session | **PASS** protocol pairing, user/assistant text, unique recent evidence, original archive recovery and SQLite resume/rearm; zero model calls |
| Full repository TypeScript check | **FAIL**, existing actor/rough-cut/vision/test-fixture errors; new retrieval metric include-path error corrected, no new continuation-module error remains |
| Initial broader rough-cut inspection baseline | **240 PASS / 6 FAIL**; deleted `/Documents/1/3` source/transcript fixture causes missing speech cues/valid media. Left unchanged, not claimed passing |

The PTY test uses the production terminal adapter with a controlled local child, not an authenticated paid Hermes conversation. Agency verification here is structural/contract verification, not a new observation of creative completion. A matched real-agent run was not performed.

## Mechanical and context reductions

Nine preselected ranges can already be placed with **one Hermes-visible operation instead of nine**. The new test compares the full canonical composition/layer/link state against nine normal `add_video_layer` operations, ignoring generated ID names and bulk-only audit/history metadata. Dry-run, single undo/redo and serialization/reopen pass. This could avoid eight primary-model execution turns if the agent uses it; actual turn/spend reduction is **not yet measured**. Existing RoughCutPlan schema wrapper still applies; the assembler makes no creative decisions.

Actual real-source 60–120s payload: **20,889 → 3,252 JSON characters (84.43% smaller)** with exact segment text/time preserved. Detailed words/modalities remain available. Caption creation now answers the generated-ID question directly instead of requiring an ~89k-character unrelated tracks resource. No billed token/dollar saving is inferred from either change; Hermes can still choose to read full resources.

## Separate pruning evaluation

Saved session: `sclip-01a0ddaa-2d18-7879-8d1c-b6aec29cfc93-924ffdce-f831-411b-9030-63ac93ffed57`, opened read-only. All pruning/archive/resume writes use disposable SQLite; network/summarizer calls are blocked. The script uses the installed `prune_tool_results_only`, not a substitute implementation.

| Trigger | First prune before call | Results truncated | Message tokens after prune, proxy | Final message tokens, proxy | Cumulative input/cache-read removal, proxy | Rewritten suffix refill, proxy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 48k | 19 | 2 source results | 58,767 | 105,203 | 400,384 | 48,505 |
| 80k | 19 | 2 source results | 58,767 | 105,203 | 400,384 | 48,505 |
| 120k | 29 | 10 source + 1 tool description | 23,039 | 59,748 | 1,373,544 | 22,006 |

Original final message-token proxy: 116,979. Provider-input proxies immediately after the prune: 98,753 / 98,753 / 64,930; they include original non-message overhead. Earliest rewritten message indices: 34 / 34 / 5. Earlier prefix may stay cached; the changed suffix must refill. The cumulative cache-read column assumes removed tokens would otherwise be cached, not a measured billing result. The script reports exact rewritten source time windows without bodies/credentials.

All original bodies are recoverable from the archived disposable DB; unique recent evidence and the tested skill/user goal survive. Older source evidence is absent from active model context and may need refetching. Actual refetches, reasoning quality, provider prefix-cache behavior and net billing cannot be established by offline replay. **No threshold selected; proactive pruning remains disabled.**

Reproduce with Hermes's Python: `e2e/check-existing-pruning.py HERMES_SOURCE HISTORICAL_DB SESSION_ID FORENSIC_REPORT`. The earlier forensic report supplies the 52 recorded usage rows; stdout is bounded metadata, not chat content.

## Jev role and agenticness

Jev: optional **cached transcript/source evidence comparison only**, pinned `typesafe/jev-1.13` through OpenRouter Decisions with the existing secure credential resolver. Default off. No routing, transcribing, timeline mutation, creative recipe, image understanding, review/stopping or export. Errors/uncertainty do not remove ordinary source tools. Generous K exposes low/borderline candidates without silently declaring unreturned source irrelevant.

Verified code/catalog/contract invariants: no automatic Jev inference on discovery; no external next-action selector or mandatory rough-cut/caption/review stage; no Jev actor dispatch/alternate timeline; normal tool catalog and full detailed source remain accessible; user-selected main model/provider, max-turn semantics and BM25 tool search remain independent; no production export tool. Hermes may skip, reorder, revisit, ignore Jev and independently decide completion. ProjectActor remains canonical. No general Hermes core modification.

## Remaining gates and known problems

- Last paid gate: **OpenRouter HTTP 403 credit/key spending limit**. Zero successful Jev inferences; matched Hermes comparison NOT RUN. Failed-attempt billed cost unknown/null. No credit workaround, model substitution or further paid retry here.
- **Winner recall@K, neighboring-context usefulness, irrelevant rate, real malformed/error rate, actual Jev latency/cost and incremental Hermes savings: NOT MEASURED.** Offline metric tests are not model-quality evidence.
- Qwen3-VL-2B can still wrongly reassure about partially cropped heads. Honest parsing/null confidence/factual envelopes do **not** solve semantic head completeness. No new finished-video or perception-quality claim.
- Packaged app logs **missing bundled Hermes runtime**. Qwen/package checks do not certify complete Hermes distribution readiness; the existing installed Sclip development launcher was not replaced.
- Packaged Playwright launches were sometimes slow (final run ~1.6 minutes) and logged a Chromium network-service restart before MCP started. The eventual checks passed; no root cause or transport fix is claimed. Existing worker SIGTERM disposal also produces a Python resource-tracker cleanup warning, despite verified process exit; no Qwen/runtime redesign was made.
- Full typecheck and six fixture-dependent old tests remain red as above. Runtime checkpoints reset on workspace reopen by existing design; project state saves/reopens correctly.
- No full Phase 2F edit, final MP4, commentary/product case or creator-style learning. The prior ~$0.924 unfinished main-model run and the $0.30–$0.45 goal remain diagnostic baseline/engineering target, not achieved cost per acceptable edit.

## Next single action

When the existing OpenRouter spending allowance is usable, run the already-approved **small shadow Jev retrieval gate** with generous K and human recall/context review. Stop on 403. Only after adequate recall run the existing matched compact-without/with-Jev source task, unchanged main model/skill/prompt/permissions/12-turn budget and no export. A real edit follows only after that bounded comparison passes; never declare victory from payload reduction alone.

**JEV NARROWS. HERMES CHOOSES. DETERMINISTIC CODE EXECUTES. HERMES REVIEWS.**
