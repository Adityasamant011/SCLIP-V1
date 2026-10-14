# SCLIP Phase 1 autonomy repair — 2026-10-11

## Verdict

The editor-to-Hermes connection executes real edits. Shot detection is connected, speech timestamps now have explicit physical bounds, and completion checks use actual project state. These changes do **not** establish reliable autonomous delivery. Native Nemotron runs can produce the requested duration or repair a title while still skipping the completion/review lifecycle. A 20-second timeline is not proof of a coherent 20-second excerpt.

No commit, production installation, or real creator-project edit was performed. Testing used isolated app profiles, data roots, projects and synthetic creator records. Real tutorial/Motorola media were read into disposable projects. The user explicitly approved derived test media reaching OpenRouter after automatic approval review initially blocked that payload.

## Initial state and evidence

- Repository: `/Users/adityasamant/SCLIP V1/editor`.
- Starting commit: `00d48b6fc89932e7ce0fac5f770e5a53f9768035`.
- Pre-existing changes: `apps/desktop/e2e/acceptance-routing/run.mjs` and untracked `docs/audits/`. The routing file's initial SHA-256 still matches. Audit artifacts were preserved.
- Desktop package: 0.1.8; Electron 44.1.1; Vitest 4.1.11; native crate 0.0.0. Hermes comes from the existing local installation, not a replacement agent.
- Read the requested audit/verification reports and their original traces before implementation. Findings were reproduced rather than accepted solely from reports.
- Initial tracked-file hashes and dirty state: [initial-state.json](../../.scratch/sclip-phase-1-autonomy-repair/initial-state.json). Progress: [ledger](../../.scratch/sclip-phase-1-autonomy-repair/ledger.md).

## Confirmed causes and classification

| Finding | Classification | Verified cause/result |
|---|---|---|
| `auto_split_by_shot` unavailable despite native analysis | Production integration defect | Desktop compute facade omitted `analyzeShotsFloor`. The native detector itself works. |
| Source transcript extends beyond physical audio | Production boundary defect | Whisper output was accepted without checking the actual decoded analysis window. Cache reuse also bypassed fresh bounds validation. |
| Rendered 14-second range yields a blank segment ending at 23.84 seconds | Production evidence defect | Whisper non-speech sentinel was exposed as lexical speech; AAC padding was counted as requested rendered audio. |
| Some Whisper words have zero-length or unusable timing | Recognition-output limitation | Preserve segment text/span, disclose original word timing, remove unusable word claims; do not invent intervals. |
| Whole tutorial clip refuses transcription | Additional reproduced production defect | Composition frame rounding produced 575,716,667 µs while source ended at 575,710,839 µs. An omitted audio end now means available source audio. Explicit over-range windows remain rejected. |
| Agent claims completion with wrong output length | State-validation gap plus model behavior | Actual duration was not compared with the submitted explicit target. New grounded checks offer two correction opportunities before returning incomplete. They cannot run if the model never invokes completion. |
| Repair request rejected as stringified JSON | Model/schema error, not a missing JSON transport feature | Hermes already accepts valid stringified argument objects. The historical string contained malformed JSON, then also used wrong aliases/patch structure. Strict rejection was correct. |
| Repair failures provide weak guidance | Contract usability defect | Added explicit operation/patch example and actionable validation errors; no aliases or malformed arrays accepted. |
| Universal cover/framing advice | Confirmed instruction contradiction | Removed universal framing rule and nonexistent coverage-tool claims. Framing remains an editorial choice checked against rendered evidence. |
| Bare `end_agent_session` called as native Hermes function | Reproduced tool-use failure | Tool invocation failed before reaching SCLIP. Added compact guidance to discover and invoke the actual MCP callable name. This guidance has not reliably made the model finish. |
| Dynamic search fundamentally prevents editing | Overstated audit conclusion | Baseline discovery reaches real editing tools. A curated candidate is evaluated below; production discovery remains unchanged. |
| Installed macOS Whisper always has a broken model path | Unsupported/stale generalization | Effective config uses an existing Homebrew binary and WeftCut model. Fresh-start transcription works. Existing startup autofill also checks managed catalog paths. No packaging change justified. |

## Exact implementation

In the table, `src/` and `native/` abbreviate paths beneath `apps/desktop/`; other paths are relative to repository root.

| Files | Change and reason |
|---|---|
| `apps/desktop/src/main/state/shotCompute.ts`, `.test.ts`, `src/main/index.ts` | Shared bound native compute adapter includes shot analysis, retains backend receiver and existing reduction/cache/default calls. ProjectActor remains the writer. |
| `apps/desktop/native/src/speech/parse/whisper_json.rs` | Exclude exact `[BLANK_AUDIO]` sentinel from lexical segments, with historical regression. |
| `native/src/speech/audio_extract.rs` | Measure actual PCM WAV duration from RIFF fmt/data chunks, excluding headers. No new dependency. |
| `native/src/speech/transcript.rs` | Validate segment bounds before coordinate shifts; reject wholly invalid speech spans; disclose partial boundary adjustment. Preserve text when word timing is unusable. Validate cached transcripts and version cache keys. |
| `native/src/mcp/tools.rs`, `native/src/mcp/resources.rs` | Apply decoded audio bounds on fresh/cache paths and expose timing adjustment metadata. Bound default clip audio to source end while preserving strict explicit-window checks. |
| `native/src/mcp/clip_audio.rs` | Regression for frame-rounded overhang, nonzero placement, explicit-window refusal and zero-duration refusal. |
| `src/main/sclip/renderedAudioEvidence.ts`, `.test.ts` | Exclude codec padding from requested PCM window before signal, silence, transcription and understanding measurements. Forward timing diagnostics. |
| `src/main/sclip/editingBrief.ts`, `.test.ts` | Recognize narrowly explicit output-duration language, collect native terminal submissions including multiline paste, and describe actual timeline/source facts. Unsupported terminal editing clears inferred requirements. No creative edits generated. |
| `src/main/sclip/completionReview.ts`, `src/main/mcp/index.ts`, `src/main/mcp/server.ts`, `src/main/mcp/completionReview.test.ts` | Host-scoped submitted requirements; actual-state mutation receipts; two correction opportunities; incomplete disposition when exhausted; existing fresh rendered review remains required. |
| `src/main/sclip/hermesTerminalRuntime.ts`, `src/main/index.ts` | Feed submitted native PTY input into the host completion requirement. Hermes still owns its planning/tool loop. |
| `src/main/state/mcp-commands.ts`, `repairTransaction.ts`, `__tests__/repair-transaction.test.ts` | Clarify repair shape and diagnostics. Preserve atomicity, revision guards, stale rejection and strict schemas. |
| `src/main/sclip/hermesRuntime.ts`, `hermesSettings.test.ts` | Disable unsolicited title inference by default; preserve explicit compression/title controls through profile rewrites and creator isolation. Acceptance disables title generation, compression, curator and background inference. |
| `skills/weftcut/SKILL.md`, two editing-knowledge references | Clarify actual output duration, remaining source layers, incomplete outcomes and MCP invocation. Remove universal cover/nonexistent-tool advice. No genre template or predetermined cuts. |
| `src/main/state/__tests__/mcp.skill-conformance.test.ts` | Correct fixture to include optional audio-understanding catalog dependency; classify completion statuses and Hermes discovery wrapper names correctly. |

### Boundary semantics and limitations

Speech is validated in **analysis-audio coordinates before offsets**, then mapped to source or timeline. Returned usable intervals must fit those declared bounds. `timing_adjustments` deliberately retains original invalid observations as diagnostics; these are not usable word/segment evidence. A partial end overlap is bounded with a disclosed original end; a wholly out-of-window speech interval is rejected. Unusable word arrays are cleared with text retained and `word_timing: none`.

The branded Motorola prompt initially exceeded the recognizer’s adjective limit; it is now covered by a regression. Gap/source/transition language is excluded so component durations do not become output targets. Earlier product runs did not have that recognized target; the final branded-brief run below uses the correction.

Default audio analysis excludes the frame-rounded remainder after source audio ends and reports the actual shortened window. Explicit requests past the source still fail. This does not change authored timeline geometry.

Duration recognition is intentionally narrow: numeric seconds/minutes tied to an output request such as “make a coherent 20-second excerpt.” It does not claim to understand every paraphrase, multiple deliverables, arbitrary constraints or unsupported cursor editing. Exact targets allow one composition frame; approximate targets allow 10%, with a one-second minimum. Coverage/gaps/findings remain in existing editorial evidence; new receipts add actual duration and up to 16 source-layer observations. No layers are automatically trimmed or removed.

## Before/after proof

### Shot detection

Native detection found known scene changes. Installed-app MCP reproduced the missing-capability error with a valid layer. After the facade fix, actual workspace MCP split a six-second strong-cut fixture at 2 and 4 seconds. Three timeline/source ranges match exactly: 0–2, 2–4, 4–6 seconds. Invalid UUID requests leave the project identical, and save/reopen preserves the composition.

Evidence: [before](../../.scratch/sclip-phase-1-autonomy-repair/shot-before-corrected/calls.json), [after verification](../../.scratch/sclip-phase-1-autonomy-repair/shot-after-strong-cuts/verification.json). A red/blue fixture exactly at the strict score threshold correctly produced no cuts; it was replaced by a stronger fixture, not by changing detection semantics.

### Speech/audio

Historical source: physical duration approximately 14.635 seconds, transcript ended at 15.04 seconds. Historical rendered 0–14-second inspection returned `[BLANK_AUDIO]` through 23.84 seconds. Both were reproduced before changes.

Actual fresh/cache/rendered MCP coverage passed all ten categories: speech at zero, leading silence, trailing silence, short clip, nonzero subrange, silence-only, trimmed long source, different timeline placement, linked A/V, and natural boundary word. Evidence: [ten cases](../../.scratch/sclip-phase-1-autonomy-repair/audio-ten-cases-final/verified-cases.json), [historical before](../../.scratch/sclip-phase-1-autonomy-repair/audio-before-corrected/calls.json). The rendered-padding regression demonstrably fails before its fix and passes after: [before log](../../.scratch/sclip-phase-1-autonomy-repair/audio-padding-test-before.log).

The native tutorial acceptance additionally reproduced the 5,828 µs frame-overhang refusal. After the resolver fix, genuine Hermes `transcribe_clip` succeeds on that footage. [Native regression](../../.scratch/sclip-phase-1-autonomy-repair/audio-overhang-regression.log). This proves timing bounds, not perfect recognition or perfect editorial sentence selection.

### Completion and repair

Actual MCP completion tests verify: wrong duration → two grounded correction opportunities → incomplete; a Hermes-selected trim to the target → required fresh review → legitimate no-repair → reviewed completion. Repair tests verify malformed array/alias rejection without state/history mutation, atomic repair and stale-state rejection. These deterministic tests do not substitute for native acceptance below.

The real off-screen title was repaired by Hermes with normal `update_layer_params`, followed by fresh vision inspection and a fresh evidence packet. Independent render shows centered visible text. It did not invoke the final completion lifecycle. Therefore repair execution passes, end-to-end reviewed completion does not.

### Whisper startup and perception

Observed effective config: `/opt/homebrew/bin/whisper-cli` plus `/Users/adityasamant/Library/Application Support/WeftCut/models/ggml-base.bin`. Disposable fresh app profiles using those configured local assets successfully transcribe. Workspace and installed main code both contain startup `autofillSpeechFromContent`; managed catalog paths are versioned. Managed Whisper downloads currently cover Windows/Linux, while this macOS configuration uses the existing local installation. The legacy default path alone is insufficient evidence of a current startup failure.

Local vision remains the Qwen3-VL-2B MLX sidecar; speech is whisper.cpp/ggml-base; coarse audio understanding remains local SenseVoice Small INT8/sherpa-onnx; TTS remains local Kokoro. These integrations were preserved. Isolated profiles copy only configured speech assets; SenseVoice and Kokoro were not reinstalled or used to certify these video runs. This phase exercises real local vision and Whisper, with existing audio/memory/reviewer regressions; it does not independently re-certify every model or all 118 MCP tools.

## Regressions

Final results and live acceptance are appended below from saved evidence. Initial all-at-once Vitest runs were stopped after prolonged no-progress startup/canvas warnings; sequential suites subsequently completed. Initial script tests hit sandbox headless-browser launch restrictions; the authorized isolated rerun passed. These initial runs are retained and are not counted as passing.

## Native free-model method

The harness launches the workspace Electron app with a separate user-data directory and separate data root. It opens SCLIP's real native PTY session and submits a normal user prompt to the existing Hermes CLI. The acceptance harness does not choose repair parameters or complete the agent's review on its behalf. Independent QA render/inspection occurs **after** recording agent state/disposition and cannot convert the agent outcome to reviewed. QA video is capped at the first 30 seconds; it does not certify a longer failed composition.

Every proxy verifies OpenRouter's current catalog prices for `nvidia/nemotron-3.5-lightning:free` before use, rejects other models/fallback/plugin routes, forces zero maximum prices and no provider fallback, and rejects auxiliary inference. The real credential stays in the proxy process; Hermes gets only a local proxy token. Production profile controls prevent automatic titles/compression/background inference. Every observed billed usage cost is zero.

Limits: 48 Hermes turns and 64 proxy request attempts. Recorded runs use 360 one-second polling iterations; IPC work can make that longer than 360 wall seconds. The reusable harness now uses a true 360-second prompt-loop deadline. Bootstrap/source indexing and independent QA rendering add latency; report actual elapsed rather than interpreting the configured wall target as measured runtime. Later runs pace requests to avoid the free tier's 20/minute limit. Provider attempts include retries and are not synonymous with agent iterations.

The first harness sent input before terminal raw-mode readiness; no model request occurred. Other exploratory runs used provider quiescence without checking pending local tools; they cannot establish a failed completed agent run. Final runs wait for no pending MCP work before recording quiescence; a further idle-edge correction also waits 18 seconds after the most recent local tool end. The prematurely interrupted product repeat is excluded from model conclusions. One local session-start fetch failure is preserved separately; it made no model request. No failed model output was manually repaired.

## Remaining blockers and product readiness

1. **Completion lifecycle is not reliably invoked by native Hermes.** A natural-language success statement can still omit `end_agent_session`/fresh review. SCLIP stays unverified, but the model can verbally overclaim. The existing validator is effective when invoked; a reliable native completion integration still needs evidence-backed follow-up work.
2. **Editorial selection and rendered judgment remain weak.** The baseline tutorial meets 20 seconds but starts with the source intro, uses an inset with substantial empty canvas, and independent speech ends mid-thought (“…so I've seen a lot”). Duration compliance did not establish a self-contained explanation.
3. **Model contracts/recovery still waste calls.** Real traces include guessed names/IDs, incomplete required fields and malformed rough-cut plans. Diagnostics help recovery but do not guarantee it. Free-route rate limiting also confounds exploratory disclosure comparisons.
4. **Bootstrap/session/perception latency and an intermittent local fetch failure need follow-up.** Keep these separate from timeline engine failure and from model reasoning.
5. **Scope of proof remains bounded.** Ten timing cases, known-cut persistence, atomic/stale repair, one preference regression and these native sessions are not a full creator beta workload.

Readiness: useful editor operations and some autonomous corrections work; reliable small real-world finished-video delivery is **not yet demonstrated**. Preserve Hermes, ProjectActor, native senses, transactions and creator memory; do not substitute scripted creative edits for these failures.

## Why the app enters the preview layout

The screenshot is the lightweight **Agent Mode** layout: preview plus mini timeline and agent panel. `src/renderer/agent/activityStore.ts` automatically selects it when a new MCP work-session ID appears; it also responds to the agent-view event. `AgentMode.tsx` describes the same behavior. Exiting to the editor changes the layout, not the work session or undo lock. A new session/view request can enter it again. The blank preview message means no clip is currently available; it does not prove that editing succeeded. No preview-layout behavior was changed in this phase.

<!-- GENERATED_EVIDENCE -->
## Final regression results

| Suite | Result | Evidence |
|---|---|---|
| Affected main/MCP/state/reviewer/memory/content | 2,616 passed, 19 skipped; 174 files passed, 2 skipped | `affected-regressions-final.log` |
| Renderer/shared/CLI | 4,908 passed; 388 files passed | `renderer-shared-cli-final.log` |
| Remaining main | 628 passed, 3 skipped; 55 files passed | `remaining-main-final.log` |
| Combined TypeScript | **8,152 passed, 22 skipped, no failing tests** | Split suites cover relevant default desktop suite; hosted provider/browser suites excluded |
| Final native Rust | **619 passed, 1 ignored, 0 failed** | `full-rust-final.log` |
| Script/build/UI regressions | **101 passed, 0 failed** | `scripts-regressions-final.log` |
| Final focused terminal/completion/catalog | 22 passed | `completion-final.log`; already included in suite totals |
| Build, native addon, all TS project checks | Passed | `build-final.log`, `native-build-final.log`, empty successful `typecheck-final.log` |

All evidence paths are under `.scratch/sclip-phase-1-autonomy-repair/`. No hosted provider regression tests were run. Some remaining-main tests use keyless Wikimedia and local MLX in temporary fixtures; these are not hosted paid inference.

## Native acceptance results

| Run | Final length | Provider attempts / errors | First useful edit | Disposition | Independent render |
|---|---:|---:|---|---|
| [native-baseline-gap-final](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-gap-final/outcome.json) | 20s | 6 / 0 | 21.125s / attempt 3 | not_considered_in_this_state | yes |
| [native-baseline-tutorial-final](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/outcome.json) | 20s | 27 / 0 | 37.856s / attempt 17 | not_considered_in_this_state | yes |
| [native-baseline-product-authorized](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-authorized/outcome.json) | 30s | 31 / 4 | 95.828s / attempt 12 | review_incomplete_in_this_state | yes |
| [native-baseline-product-stable](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-stable/outcome.json) | 30000s | 44 / 0 | 90.613s / attempt 9 | not_considered_in_this_state | yes |
| [native-baseline-product-verified-brief](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/outcome.json) | 30s | 29 / 0 | 120.662s / attempt 13 | not_considered_in_this_state | no |
| [native-baseline-reviewer-final](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/outcome.json) | 3s | 15 / 3 | 59.941s / attempt 7 | not_considered_in_this_state | yes |
| [native-baseline-no-repair-final](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-no-repair-final/outcome.json) | 3s | 4 / 0 | none | not_considered_in_this_state | yes |
| [native-baseline-preference-final](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-preference-final/outcome.json) | 3s | 8 / 0 | 16.369s / attempt 4 | not_considered_in_this_state | yes |
| [native-candidate-gap-final](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-gap-final/outcome.json) | 25s | 49 / 0 | none | not_considered_in_this_state | yes |
| [native-candidate-tutorial-final](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-tutorial-final/outcome.json) | 20s | 34 / 0 | 157.749s / attempt 20 | incomplete | yes |

Each run uses the verified free route; recorded external cost is $0. `provider_attempts` includes retries; original requests/responses and exact actual MCP arguments are preserved. The old `product-authorized` run is exploratory (older quiescence criterion), not a final completed acceptance.

### native-baseline-gap-final

> There is a five-second empty gap between the first and second clips. Close that gap by moving the second clip earlier, keeping both clips at their current lengths. Check the resulting edit and finish when the gap is gone.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 15; first prompt tokens: 25766. Requests: 6; successful provider responses: 6; distinct surfaced tool-error messages: 1. End reason: `provider_quiescent_no_pending_tools`; recorded elapsed including independent QA: 82.26s. Readiness: **unverified**.

Actual MCP calls: `get_timeline_context` (done), `move_layer` (done), `get_timeline_context` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-gap-final/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-gap-final/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-gap-final/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-gap-final/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-gap-final/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-gap-final/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-gap-final/independent-render.mp4).

### native-baseline-tutorial-final

> Use the imported tutorial footage to make a coherent 20-second excerpt. Choose a self-contained explanation, place it on the timeline with its speech, and check that the result starts and ends cleanly.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 15; first prompt tokens: 28464. Requests: 27; successful provider responses: 27; distinct surfaced tool-error messages: 10. End reason: `provider_quiescent_no_pending_tools`; recorded elapsed including independent QA: 135.227s. Readiness: **unverified**.

Actual MCP calls: `get_editorial_evidence_packet` (done), `get_media_context` (done) ×2, `import_media` (done), `transcribe_clip` (error), `add_video_layer` (done), `transcribe_clip` (done), `apply_rough_cut_plan` (error), `add_video_layer` (error), `get_timeline_context` (done), `get_timeline_critique` (done), `list_checkpoints` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/independent-render.mp4).

### native-baseline-product-authorized

> Make a roughly 30-second Motorola Razr product highlight from the imported demo. Choose useful views of the phone and its folding action, make the sequence easy to follow, and inspect the result before finishing.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 15; first prompt tokens: 28476. Requests: 31; successful provider responses: 27; distinct surfaced tool-error messages: 3. End reason: `provider_quiescent`; recorded elapsed including independent QA: 229.599s. Readiness: **unverified**.

Actual MCP calls: `get_timeline_context` (done), `resources/list` (done), `resources/read` (done), `vision_inspect` (done) ×5, `resources/read` (done), `add_video_layer` (done) ×3, `get_timeline_context` (done), `ripple_delete_layers` (done), `inspect_timeline_frame` (done) ×3, `vision_inspect` (done) ×3, `get_timeline_context` (done), `end_agent_session` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-authorized/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-authorized/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-authorized/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-authorized/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-authorized/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-authorized/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-authorized/independent-render.mp4).

### native-baseline-product-stable

> Make a roughly 30-second Motorola Razr product highlight from the imported demo. Choose useful views of the phone and its folding action, make the sequence easy to follow, and inspect the result before finishing.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 15; first prompt tokens: 28503. Requests: 44; successful provider responses: 44; distinct surfaced tool-error messages: 11. End reason: `provider_and_tools_quiescent`; recorded elapsed including independent QA: 405.048s. Readiness: **unverified**.

Actual MCP calls: `get_editorial_evidence_packet` (done), `get_media_context` (done), `get_source_observations` (done) ×2, `import_media` (done), `add_video_layer` (done), `delete_layer` (done), `add_video_layer` (error), `add_track` (done), `add_video_layer` (done), `get_timeline_context` (done), `vision_inspect` (error), `vision_inspect` (done) ×4, `trim_layer` (done), `delete_layer` (done), `import_media` (done), `delete_layer` (done), `import_media` (done), `add_video_layer` (done), `vision_inspect` (done), `delete_layer` (error), `get_timeline_context` (done), `delete_layer` (done), `add_track` (done), `add_video_layer` (done), `trim_layer` (done), `get_timeline_context` (done), `render_timeline_range` (error) ×2, `render_timeline_range` (done), `inspect_rendered_audio` (done), `get_editorial_evidence_packet` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-stable/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-stable/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-stable/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-stable/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-stable/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-stable/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-stable/independent-render.mp4).

### native-baseline-product-verified-brief

> Make a roughly 30-second Motorola Razr product highlight from the imported demo. Choose useful views of the phone and its folding action, make the sequence easy to follow, and inspect the result before finishing.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 15; first prompt tokens: 28493. Requests: 29; successful provider responses: 29; distinct surfaced tool-error messages: 7. End reason: `provider_and_tools_quiescent`; recorded elapsed including independent QA: 271.584s. Readiness: **unverified**.

Actual MCP calls: `get_editorial_evidence_packet` (done), `get_media_context` (done), `get_source_observations` (done), `vision_inspect` (done) ×3, `import_media` (done), `add_video_layer` (done), `get_timeline_context` (done), `import_media` (done), `split_layer` (done) ×2, `split_layer` (error), `vision_inspect` (error), `inspect_timeline_frame` (done), `delete_layer` (done) ×4, `import_media` (done), `get_media_context` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/completion-disposition.json).

### native-baseline-reviewer-final

> Review this draft, consider any current critique, repair a real problem if justified, and verify the updated result. Finish only with an honest account of what you checked.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 15; first prompt tokens: 26497. Requests: 15; successful provider responses: 12; distinct surfaced tool-error messages: 2. End reason: `provider_quiescent_no_pending_tools`; recorded elapsed including independent QA: 121.571s. Readiness: **unverified**.

Actual MCP calls: `get_editorial_evidence_packet` (done), `get_timeline_context` (done), `vision_inspect` (done), `update_layer_params` (done), `vision_inspect` (done), `get_editorial_evidence_packet` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/independent-render.mp4).

### native-baseline-no-repair-final

> Review this draft, consider any current critique, repair a real problem if justified, and verify the updated result. Finish only with an honest account of what you checked.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 15; first prompt tokens: 26057. Requests: 4; successful provider responses: 4; distinct surfaced tool-error messages: 0. End reason: `provider_quiescent_no_pending_tools`; recorded elapsed including independent QA: 50.726s. Readiness: **unverified**.

Actual MCP calls: `get_editorial_evidence_packet` (done), `get_timeline_context` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-no-repair-final/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-no-repair-final/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-no-repair-final/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-no-repair-final/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-no-repair-final/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-no-repair-final/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-no-repair-final/independent-render.mp4).

### native-baseline-preference-final

> Add a simple three-second title reading "A fresh start", consistent with my usual title style. Inspect the result before finishing.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 15; first prompt tokens: 27227. Requests: 8; successful provider responses: 8; distinct surfaced tool-error messages: 2. End reason: `provider_quiescent_no_pending_tools`; recorded elapsed including independent QA: 52.474s. Readiness: **unverified**.

Actual MCP calls: `get_editorial_evidence_packet` (done), `get_timeline_context` (done), `add_text_layer` (done), `get_timeline_context` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-preference-final/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-preference-final/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-preference-final/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-preference-final/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-preference-final/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-preference-final/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-preference-final/independent-render.mp4).

### native-candidate-gap-final

> There is a five-second empty gap between the first and second clips. Close that gap by moving the second clip earlier, keeping both clips at their current lengths. Check the resulting edit and finish when the gap is gone.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 25; first prompt tokens: 29666. Requests: 49; successful provider responses: 49; distinct surfaced tool-error messages: 0. End reason: `wall_timeout`; recorded elapsed including independent QA: 398.574s. Readiness: **unverified**.

Actual MCP calls: `get_editorial_evidence_packet` (done), `inspect_timeline_frame` (done) ×46.

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-gap-final/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-gap-final/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-gap-final/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-gap-final/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-gap-final/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-gap-final/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-gap-final/independent-render.mp4).

### native-candidate-tutorial-final

> Use the imported tutorial footage to make a coherent 20-second excerpt. Choose a self-contained explanation, place it on the timeline with its speech, and check that the result starts and ends cleanly.

Model: `nvidia/nemotron-3.5-lightning:free`. Initial callable tool count: 25; first prompt tokens: 32336. Requests: 34; successful provider responses: 34; distinct surfaced tool-error messages: 18. End reason: `provider_quiescent_no_pending_tools`; recorded elapsed including independent QA: 309.039s. Readiness: **unverified**.

Actual MCP calls: `get_editorial_evidence_packet` (done), `trim_layer` (error) ×2, `get_editorial_evidence_packet` (done), `trim_layer` (error) ×9, `add_video_layer` (error), `get_editorial_evidence_packet` (done), `add_video_layer` (done), `get_editorial_evidence_packet` (done), `inspect_timeline_frame` (done), `inspect_timeline_frame` (error), `inspect_timeline_frame` (done), `end_agent_session` (done), `end_agent_session` (error), `revision_control` (done), `revision_control` (error), `inspect_timeline_frame` (done) ×2, `end_agent_session` (done).

[Prompt](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-tutorial-final/prompt.txt), [provider trace](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-tutorial-final/provider-trace.json), [actual activity/arguments](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-tutorial-final/activity.json), [before](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-tutorial-final/agent-before.json), [after](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-tutorial-final/agent-after.json), [review disposition](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-tutorial-final/completion-disposition.json). [Independent video](../../.scratch/sclip-phase-1-autonomy-repair/native-candidate-tutorial-final/independent-render.mp4).

## Tool-disclosure decision

Baseline retains normal Hermes dynamic discovery. The scratch-only candidate exposes ten core WeftCut tools immediately (evidence packet, add video, trim, delete, move, update params, inspect frame, atomic repair, revision control, completion), with specialist tools still deferred. It runs the existing Hermes loop; it is not a second agent. Initial provider requests prove that the candidate exposes 25 callable tools versus baseline 15, rather than all 118.

The comparison records first useful edit latency/attempt, initial prompt tokens, actual selections, errors, duration and review disposition in [acceptance-summary.json](../../.scratch/sclip-phase-1-autonomy-repair/acceptance-summary.json). Exploratory candidate gap run encountered free-tier 429s and exhausted its request budget; do not treat its timing as a controlled comparison. Final comparisons use paced requests. Specialist tools retain their original deferred classification; the search wrappers remain exposed. These candidate sessions did not demonstrate a successful specialist invocation, and frequently attempted deferred names directly. Do not claim successful specialized-tool recovery from this comparison.

**Production discovery deliberately remains unchanged.** Neither disclosure method establishes reliable reviewed completion. Two fixture comparisons, exploratory rate-limit confounding and higher initial schema/context cost do not justify a production policy change. Immediate completion access can help invoke the gate, but does not solve rendered judgment or lifecycle decisions.

## Quality and final interpretation

The baseline gap edit is correct; the title is visibly repaired; the cross-project title uses the fake creator’s green preference. The tutorial timeline is 20 seconds with two linked layers and no entire original source left behind, but retains source handles and uses the opening 20 seconds. Its independent contact sheet shows intro/talking-head footage inset into the canvas; independent local Whisper ends with “so I've seen a lot,” an incomplete thought. These artifacts do not support a coherent, polished excerpt claim.

[Tutorial render contact sheet](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/render-contact-sheet.png), [independent speech](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-tutorial-final/independent-speech.json), [visible repaired title](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-reviewer-final/call-4-0.png). The independent speech check used local CPU Whisper after a sandbox Metal launch failed; it is QA, not an agent-selected cut.

Final scenario-specific interpretation is recorded in the completion section below.

## Final scenario judgments

| Required scenario | What actually happened | Verdict |
|---|---|---|
| Gap removal | Second ten-second clip moved from 15–25s to 10–20s. Both lengths preserved. | Edit passes; verified session completion fails. |
| Tutorial | Actual 20s video/audio timeline; whole original removed. Independent render includes intro/inset footage; speech ends mid-thought. | Duration passes; coherent finished excerpt fails. |
| Motorola | Final branded-brief run reaches 30s, but deletes all video layers and leaves two Audio layers at 7–20s and 20–30s. QA export refuses “No video to export”; frame at 0.5s is entirely transparent/black. | **Fails to deliver a video highlight.** Duration alone is insufficient. |
| Reviewer repair | Real current-state caption-placement warning received; Hermes chooses and commits x=960; fresh local vision and independent frame show title visible. | Autonomous correction passes; reviewed completion fails. |
| Legitimate no-repair | Valid centered title left unchanged; model reads state, but no fresh agent render/lifecycle completion. | No unnecessary repair; completion not proven. |
| Cross-project preference | Synthetic creator preference recorded in project A; native creator context injects it into project B; title uses RGB(0,200,0). | Preference regression passes; completion remains unverified. |

The Motorola model also confused source units in its explanation. An earlier stable repeat left a **30,000-second** composition. The first exploratory run reached 30 seconds but used the older stopping criterion. Neither is proof of reliable highlight delivery. The final run contains the recognized 30-second requirement in real mutation receipts; it still fails because video content is absent and completion is not invoked. No manual repair followed.

Final Motorola negative evidence: [saved project](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/agent-after.json), [QA refusal and frame facts](../../.scratch/sclip-phase-1-autonomy-repair/native-baseline-product-verified-brief/calls.json). There is no final Motorola video artifact because export correctly refused the audio-only timeline. Final provider quiescence records an unfinished/unverified outcome, not a guarantee the agent produced a final answer.

Disclosure measurements: baseline gap first edit 21.125s / request 3 versus candidate no edit in 49 attempts; baseline tutorial first edit 37.856s / request 17 versus candidate 157.749s / request 20. Candidate initial context rises from 25,766 to 29,666 tokens on the gap and from 28,464 to 32,336 on the tutorial (about 15.1% and 13.6%). Both tutorial timelines reach 20s, neither is reviewed-ready. No native acceptance in this report establishes fully verified completion. The candidate is not adopted.

## Answers to the eleven requested questions

1. Fixed verified shot wiring, decoded-audio/transcript/cache bounds, blank sentinel handling, rendered padding, default source-end mapping, explicit duration validation/receipts, repair diagnostics and inference-control persistence.
2. No general installed Whisper packaging failure reproduced. Valid stringified JSON was already supported. Dynamic discovery already reaches edits. The missing optional catalog tool in a unit fixture was a fixture problem.
3. Shot splitting works through native → desktop facade → actual MCP → actor splits → save/reopen on known-cut footage.
4. Ten timing categories pass. Unusable word timing is disclosed and not invented. Recognition accuracy remains fallible.
5. Hermes can reach 20s/30s timelines, but duration compliance and finished-video delivery are unreliable. Motorola's final 30s state has no video.
6. Hermes autonomously repairs the title, but does not reliably finish review/verification lifecycle.
7. Instructions remain agentic: Hermes chooses edits, framing and repair; deterministic code reports facts and validates bounds/requirements.
8. Production discovery remains unchanged after an unsuccessful curated comparison.
9. Relevant split suites pass: 8,152 TypeScript tests, 619 native tests, 101 script tests; 22 TypeScript tests skipped and one native test ignored. Final focused changes/build/typechecks pass. Hosted provider/browser suites were excluded.
10. A visible title repair improved the rendered result; polished coherent video quality was not demonstrated.
11. Before beta: reliably trigger/finish current-state review from native Hermes, validate complete video briefs including useful visual/audio coverage, improve source selection/units/framing/recovery, resolve session/bootstrap latency, then repeat sustained creator workloads. Do not declare readiness from unit tests or one duration match.

Implementation and bounded verification are complete. No commit or production deployment was performed. Stop here pending further instructions.
