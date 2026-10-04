# SCLIP Phase 3 — General Editing Quality Baseline

**Current status (2026-10-04): preliminary, stopped at the user's request to conserve usage.** One locked case completed a first and reviewed pass. The vlog reached source inspection and planning before interruption; the screen recording and product demo were not run. The historical blocked diagnostic remains below as an explicitly superseded record.

## Credential mismatch: corrected diagnosis

The user's live Sclip app answered a new `KEY_OK` prompt. The packaged app identifies as `Sclip` (app ID `dev.weftcut.desktop`) and decrypts `cloud_keys.json` through Electron `safeStorage` in its Sclip `userData` directory. The development Electron executable used by the benchmark read the same encrypted credential with a different application identity. In that Keychain context, decryption returned unusable text without throwing; the earlier apparent 75-character non-ASCII/whitespace “key” was an artifact of this mismatch. Setting the name to `Sclip` before Electron initialization yielded a 73-character ASCII value without whitespace. Read-only authenticated OpenRouter `/key` and `/models` checks returned HTTP 200. The credential itself was never printed or saved, and the user did not need to replace it.

The benchmark launcher now sets the packaged product name before awaiting input or Electron readiness. The real-keychain Playwright entry does likewise before loading production main. Both use the existing production credential loader and encrypted file. A test keeps the shared identity aligned with package metadata. The real Hermes health test requires an MCP `ping` and a new answer containing `PHASE3_HEALTH_OK`. **Health check: PASS** with OpenRouter / `nvidia/nemotron-3-ultra-550b-a55b:free`, real MCP connection, no timeline mutation, and no credential/header/decryption error. Focused tests passed 18/18; typecheck and end-to-end build passed.

## Locked run and results

The [locked manifest](../../apps/desktop/e2e/bench-results/phase3-general/cases.json) fixed four source hashes, exact prompts, and canvases before these outputs. The opt-in harness checks the hash and prompt, imports raw media into the real app, invokes real Hermes/MCP, preserves the first pass before a separate review, and requests a native render. It copies only encrypted credentials into isolated app data. External B-roll remained disabled. No editorial prompt, skill, perception, or timeline behavior was changed. The first-pass limit was 50 turns; review was a fresh session limited to 18 turns. These limits affected the result.

| Case | First pass | Reviewed pass | Publishability | Biggest failure / limitation |
| --- | --- | --- | --- | --- |
| Talking head | 60.47 s editable cut and H.264/AAC render | Identical timeline project; rerendered, no repair | **NEEDS MAJOR HUMAN EDITING** | Mid-thought opening, late clipped framing, ineffective review |
| Vlog | Interrupted during planning; no first-pass edit | Not run | Unassessed | User stopped to conserve usage |
| Screen recording | Not run | Not run | Unassessed | User stopped to conserve usage |
| Product demo | Not run | Not run | Unassessed | User stopped to conserve usage |

### Talking-head assessment

Hermes inspected and transcribed the 575.7 s source, chose its own ranges, made 10 paired video/audio clips and 63 caption layers, applied a vertical crop, sampled composed frames, and called timeline critique. The main video track has no internal gaps or overlaps. The native render is 1080×1920 H.264/AAC, 60.466667 s, about 60.3 MB. The first pass took 623 s and reported 100 tool calls. A rejected batch parameter update was recovered through individual calls. These are genuine app and tool results.

The opening starts at source 129.48 s with “They start building a bridge to like their success journey…”, which lacks a self-contained premise. The sequence later jumps backward from source 494.68–503.75 s to 394.24–400.01 s; speech/visual continuity across the full render still needs human listening. Captions are visible but split into many short fragments, including “also they get distracted And”. A sampled frame at 59 s shows the speaker's face partly outside the left edge. Duration exceeds the stated 45–60 s target by 0.47 s. Hermes's first-pass “ready to publish” claim is too strong.

| Dimension | Observation |
| --- | --- |
| Technical correctness | Editable project and valid render; paired media ranges; no main-video gaps/overlaps |
| Content, story, pacing | Relevant mentor/process theme, but weak opening context and a sequence needing editorial listening |
| Captions | Readable in sampled frames, yet 63 fragmented phrases |
| Framing, variety | Mostly consistent vertical talking head; subject partly clipped at 59 s; no alternate source shots |
| Audio, continuity | AAC present and paired to video; cut boundaries were not independently listened through end to end |
| Restraint, genre fit | No external media or gratuitous effects; recognizable short-form treatment, but not publication-ready |

The separate reviewer identified a weak hook and fragmented captions, but its 18 turns expired before any mutation. It also called 10 video clips plus 10 audio clips “20 video clips” and described an opening line that does not match the saved opening caption. First and reviewed `project.json` files have identical SHA-256 (`4aaaa52db240ba9c4c6cae73dda558e0c02e760dcc5d364029510237077d3029`); the rerenders have the same size but different file hashes. **Measured timeline improvement: none.** The review's fresh context and limited turn budget are benchmark limitations as well as evidence of this review workflow's failure in the case.

### Partial vlog evidence

Before interruption, Hermes inspected/transcribed the 1,314 s source and proposed a ~75 s structure spanning family morning, tracksuits, garden/chili jam, and an ending. It had requested the rough-cut tool schema, but no autonomous vlog timeline or render existed. The partial trace and an explicitly labeled interrupted project snapshot were preserved. They are not counted as a completed case.

## Current failure matrix and verdicts

| Issue | Frequency in completed edits | Severity | Classification | Evidence path |
| --- | ---: | --- | --- | --- |
| Mid-thought opening | 1/1 | High | `STORY_REASONING_FAILURE`, `CONTENT_REASONING_FAILURE` | Source choice → timeline → captions/render |
| Face clipped in vertical frame | 1/1 | Medium | `FRAMING_FAILURE`, `REVIEW_FAILURE` | Static crop → composed frame at 59 s → no repair |
| Fragmented captions | 1/1 | Medium | `CAPTION_FAILURE`, `REVIEW_FAILURE` | Transcript phrases → 63 text layers → sampled frames |
| Review detects issues but makes no edit | 1/1 | High | `REVIEW_FAILURE`, `REPAIR_FAILURE`, benchmark turn-budget limit | Review trace → identical project hashes |
| Wrong secure-storage app identity | One prerequisite, fixed | Blocking before edit | `RUNTIME_FAILURE` | Dev Electron name → wrong Keychain context → unusable decrypted value |

**Strengths:** Real source perception, autonomous source selection and editable timeline creation, valid render, and recovery from a rejected tool call. The partial vlog trace also shows a plausible content inventory, but no edit.

**Weaknesses supported by this sample:** Inadequate opening context, failure to keep a moving face in the vertical crop, fragmented captions, overconfident publishability claim, and a review session that spent its budget inspecting and planning rather than repairing.

**Review-loop verdict: INSUFFICIENT EVIDENCE** for general effectiveness; the one completed review produced **no improvement**. **Generalization verdict: TALKING-HEAD BIASED** as a statement about evidence coverage, not a claim that Hermes performs worse in other genres. **Autonomous-editor verdict: EARLY AUTONOMOUS EDITOR**, provisionally: this case shows actual source selection, timeline editing, and rendering from a high-level prompt, while the output still needs substantial human editing.

## Proposed Phase 3B priorities — not implemented

| Priority | Problem → evidence → likely cause → smallest proposed fix → proof |
| --- | --- |
| P0 | Opening lacks context → first caption begins mid-thought → source choice optimizes topic/duration without checking the first line in context → require an opening-context check before finalizing ranges → blinded rerun begins with a complete premise and human raters prefer its structure |
| P0 | Review makes no repair → identified issues, exhausted 18 turns, identical project hashes → inspection and mutation budgets are misaligned → reserve explicit mutation/reinspection budget for verified issues → first/reviewed diffs and blind ratings show improvement without regressions |
| P1 | Face leaves frame → 59 s composed frame → one static crop does not follow movement → check representative frames in each selected range and adjust only failing ranges → no subject clipping or new crop artifacts |
| P1 | Captions fragment speech → 63 text layers, awkward opening phrases → segmentation lacks phrase-level readability check → validate phrase boundaries against speech → fewer awkward breaks without timing loss |
| P2 | Generalization unknown → one completed genre → no output evidence elsewhere → resume the other locked cases only if the user wants further evaluation → independent first/reviewed renders and ratings |

No Phase 3B editorial fix, style learning, packaging, external B-roll, or generation work was started. The local [talking-head artifacts](../../apps/desktop/e2e/bench-results/phase3-general/talking-head/) contain first/reviewed traces, project snapshots, metrics, renders, and sampled frames. The [vlog artifacts](../../apps/desktop/e2e/bench-results/phase3-general/vlog/) contain the partial trace and stop status. These folders are Git-ignored. The section below records what was believed at the original blocked attempt and is **not** the current diagnosis.

---

## Historical 2026-10-03 blocked diagnostic — superseded

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
