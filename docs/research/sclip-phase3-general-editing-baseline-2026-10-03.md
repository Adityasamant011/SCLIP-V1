# SCLIP Phase 3 — General Editing Quality Baseline

**Status: blocked before the first autonomous edit.** This is a readiness and coverage diagnostic, not an editorial-quality benchmark result. On 2026-10-03 the user chose diagnostics only after the saved provider credential failed. No case was run, no first-pass or reviewed-pass timeline was produced, and no publishability rating can be assigned. Historical Phase 2F and talking-head artifacts are not counted as Phase 3 runs.

## 1. Environment

| Item | Observed result |
| --- | --- |
| Branch / HEAD | `sclip/phase1` / `8d36199fa658459c082a2e20fca876da9899c313` |
| Working tree before diagnostics | Clean |
| Machine | macOS 27.0.1, arm64, Apple M4 (reported by local Whisper backend) |
| Runtime | Node 24.10.0, npm 11.6.0, Python 3.11.15, FFmpeg 8.1.2 |
| Hermes | Existing Electron launcher resolves OpenRouter, `nvidia/nemotron-3-ultra-550b-a55b:free`; launcher starts but the one-turn provider health check fails before a model response or MCP call |
| Provider root cause | The selected secure-store OpenRouter credential is present but contains non-ASCII characters and whitespace. Fetch rejects its Authorization header before an HTTP response. An unauthenticated request to the OpenRouter model endpoint succeeds from both Node and Python, so basic endpoint reachability is proven. The credential value was neither printed nor saved. |
| MCP | The real-Hermes test binds its local MCP server with filesystem/network permission; no editing tool call occurred because the provider call failed. Four focused MCP, observation, and reviewer test files pass: 25/25 tests. |
| Qwen | The existing `VisionSidecarManager` loaded `mlx-community/Qwen3-VL-2B-Instruct-4bit` and answered a neutral question about a local vlog contact sheet. Model load was 4.3 s and reported inference latency was 3,953.5 ms. This verifies the local sidecar, not a full Hermes-to-MCP vision path. |
| Whisper | The configured `whisper-cli` and `ggml-base.bin` transcribed an eight-second real speech excerpt in normal GPU mode. The sandboxed invocation crashed; the permitted normal invocation completed. This verifies local transcription, not project ingestion or word alignment in this run. |
| External B-roll | `SCLIP_ENABLE_EXTERNAL_BROLL` was unset. MCP catalog and freeze tests pass with the three external-media tools absent by default and the explicit opt-in path retained. No external search or download occurred. |
| Typecheck | PASS (`npm run typecheck`) at this HEAD. |
| Core tests | 2,099 passed, 4 failed across 104 files in the focused state/MCP/perception/reviewer run. The two text-correction failures concern joining Chinese caption fragments; the two skill-conformance failures concern backticked identifiers and a stale `range` exemption. These were present before any Phase 3 change and were not repaired here. |

The existing end-to-end editing acceptance test is tailored to a single talking-head source and has assertions for a 30–45 second vertical short. The Phase 2F suite also uses preselected source ranges. Neither is a general-editor benchmark as written: preselected ranges would supply editorial answers. The real-Hermes launcher and app/MCP/export path are reusable once the provider credential works.

## 2. Benchmark coverage

The [fixed case manifest](../../apps/desktop/e2e/bench-results/phase3-general/cases.json) records exact source paths, SHA-256 hashes, durations, streams, canvases, and natural user prompts without copying large media. These four cases were selected before any new output was observed. The source/contact-sheet inspection supports their genre labels, but it does not establish editorial quality.

| Case | Media available | Ran? | First pass | Reviewed pass | Publishability |
| --- | --- | --- | --- | --- | --- |
| Talking head | Yes: 575.7 s raw tutorial | BLOCKED — PROVIDER CREDENTIAL | N/A | N/A | Unassessed |
| Multi-clip talking head | No independent multi-source set found | BLOCKED — NO SUITABLE TEST MEDIA | N/A | N/A | Unassessed |
| Vlog | Yes: 1,314.0 s family/product vlog with varied scenes | BLOCKED — PROVIDER CREDENTIAL | N/A | N/A | Unassessed |
| Tutorial | Same talking-head source only; no independent tutorial source | BLOCKED — NO SUITABLE TEST MEDIA | N/A | N/A | Unassessed |
| Screen recording | Yes: 319.5 s software workflow capture | BLOCKED — PROVIDER CREDENTIAL | N/A | N/A | Unassessed |
| Podcast/interview | No suitable raw podcast/interview set found | BLOCKED — NO SUITABLE TEST MEDIA | N/A | N/A | Unassessed |
| Product video | Yes, with caveat: 845.1 s filmed live device demonstration, already switched between cameras | BLOCKED — PROVIDER CREDENTIAL | N/A | N/A | Unassessed |
| Educational/explainer | A pre-edited creator video exists; unsuitable as independent raw-footage evidence | BLOCKED — NO SUITABLE TEST MEDIA | N/A | N/A | Unassessed |
| Cinematic/montage | A 44.6 s single-shot guitar performance exists; no suitable multi-shot raw montage set found | BLOCKED — NO SUITABLE TEST MEDIA | N/A | N/A | Unassessed |
| Messy mixed footage | The vlog source is mixed, but reusing it as an independent case would overstate coverage | BLOCKED — NO INDEPENDENT TEST MEDIA | N/A | N/A | Unassessed |

The intended minimum of three real, materially different **completed** cases was not met: completed cases = **0**. The available sources would support talking head, vlog, screen recording, and a limited product-demo case after provider recovery. Their exact high-level prompts are in each case's `prompt.txt` file beside its source manifest.

## 3. Detailed case results

No executed cases. There are no project snapshots, tool traces, renders, turns, tool-call counts, review cycles, or dimension scores for Phase 3. `N/A` means **not evaluated**, not a pass. In particular, technical validity, content selection, pacing, structure, continuity, captions, framing, visual variety, audio, editorial restraint, and genre fit all remain unknown.

## 4. Aggregate failure matrix

| Failure | Frequency | Severity | Layer | Universal / preference / genre | Likely cause |
| --- | ---: | --- | --- | --- | --- |
| Hermes provider health check cannot send a request | 1/1 diagnostic attempt; 0 editorial runs | Blocking | Runtime / local credential | Neither editorial quality nor creator preference | Selected secure-store key contains non-ASCII characters and whitespace; Authorization header construction fails before HTTP response |

No editorial failure frequency can be estimated. The four core-test failures are separate existing regressions, not observed defects in a Phase 3 edit.

## 5. What Hermes is actually good at

No new evidence about Hermes's editorial decisions. The diagnostic proves that the launcher resolves the selected model and that supporting local perception services can operate independently.

## 6. What Hermes is actually bad at

No new evidence about Hermes's editorial decisions. The runtime cannot complete a provider call with the currently saved credential.

## 7. Perception bottlenecks

No edit was produced, so no perception failure can be attributed to Hermes. Qwen answered one contact-sheet question and Whisper transcribed one speech excerpt. The full project observation-to-Hermes path remains unmeasured. The separate model settings file reports no active `vlm` profile while the legacy local MLX sidecar still responds; a live MCP call is needed to establish which product route Hermes receives.

## 8. Reasoning / editorial knowledge bottlenecks

Unmeasured. The model never answered the health prompt or saw a benchmark project.

## 9. Tool / engine bottlenecks

Unmeasured for editorial work. MCP catalog tests pass, but no live editing mutation or render was attempted in Phase 3.

## 10. Self-correction results

First-pass problems, reviewer detections, repairs, misses, false positives, and regressions: **unmeasured**. Whether review materially improves edits: **INSUFFICIENT EVIDENCE**.

## 11. Generalization verdict

**UNPROVEN.** Four distinct local source types are available, but no new autonomous edit completed. Historical talking-head success cannot establish cross-genre quality.

## 12. Autonomous editor verdict

**INSUFFICIENT EVIDENCE.** Tool availability and a past talking-head render do not resolve whether Hermes behaves as a competent general-purpose editor today.

## 13. Phase 3 priority list

| Priority | Problem → root cause → smallest fix → proof |
| --- | --- |
| P0 benchmark prerequisite | Provider call fails before model response → saved selected credential has non-ASCII/whitespace characters → replace it through SCLIP Settings with a valid key (do not store it in benchmark files) → run the existing one-turn real-Hermes health test; require a model reply and no credential warning. |
| P1 coverage prerequisite | Six target genres lack independent raw media → local asset inventory is insufficient → obtain user-provided, legitimate raw footage for those genres when available → record source hashes and complete at least three independent genre runs. |

No editing heuristic, prompt, reviewer, perception, or engine change is justified by this blocked baseline. The existing test failures should be handled as separate maintenance and are not Phase 3B editorial priorities.

## 14. Proposed Phase 3B — Editing Quality Improvement

**Deferred.** First restore Hermes provider health, run the fixed cases with first-pass and bounded reviewed-pass snapshots, inspect renders, then order the smallest fixes by observed severity and recurrence. No Phase 3B change is proposed from absent editorial evidence.

## 15. Artifacts and Git changes

The ignored [Phase 3 artifact directory](../../apps/desktop/e2e/bench-results/phase3-general/) contains `cases.json`, `environment.json`, `readiness.json`, and per-case `source-manifest.json`, `prompt.txt`, and a small source contact sheet. It contains no project, render, or trace because none was produced. No production code, external B-roll system, Hermes skill, or model configuration was changed. This report is the only tracked addition.
