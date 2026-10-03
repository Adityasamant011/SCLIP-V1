# Sclip: first Jev integration slice

Date: 2026-09-27. Status: implemented behind an opt-in flag; real-provider evaluation blocked, not an established cost win. Continued local verification and the newer mechanical/context work are documented in `jev-local-completion-2026-09-27.md`.

## Delivered

- Terminal: existing Hermes background hint matches xterm. Historical OSC 11 / primary device-attribute queries are suppressed only during asynchronous history replay. Live responses and queued typing remain enabled. No Hermes core changes.
- Source: `get_media_context(detail="segments")` retains chronological segment text/timing and references while omitting verbose word arrays and other modalities. Original detailed APIs remain available. On the real 60–120-second source window: 20,889 → 3,252 JSON characters, **84.43% smaller**. This is payload reduction, not billed token/dollar savings.
- Vision evidence: the existing worker no longer invents confidence from prose length or infers affirmative facts from negated/contradictory text. Confidence is uncalibrated/null. Existing composed capture adds factual RGB/alpha and staged transform-envelope metadata. No model, prompts, drawing, seeking or export changes.
- Jev: one optional read-only `evaluate_source_passages` MCP tool backed by a thin OpenRouter Decisions client for `typesafe/jev-1.13`. Existing cached source resources and secure credential resolver are reused. Input/response/time/batch/cache limits, cancellation, content invalidation and explicit coverage are tested. No retries or model fallback. Usage unavailable from the provider stays null.

`SCLIP_JEV_ENABLED=1` exposes the helper; default is disabled until real-provider quality/cost validation passes. Hermes may call or ignore it, read any original passage, and choose every edit and next action. It does not transcribe or mutate the timeline. No new settings database, credential store, sidecar, MCP server, creative scheduler, workflow or persistent memory was introduced. Existing context pruning is unchanged.

## Real paid gate: blocked

The built app resolved the existing encrypted OpenRouter credential using the normal Sclip resolver. The disposable Playwright profile needed a thin test entry removing Playwright's `--use-mock-keychain` switch before importing the unchanged production entry. No plaintext key was passed to renderer IPC or written to project/report files.

The first real Jev request returned **HTTP 403: credit/key spending limit**. No successful Jev inference; no fallback; no further paid retries. Provider-billed cost is unavailable, not assumed zero. The matched bounded Hermes comparison was **not run**. At that gate the main profile was `openrouter / z-ai/glm-5.2`; this work does not pin it or change the user's subsequent model/profile/reasoning selection.

Next action: top up or raise the existing OpenRouter key's spending limit, or replace it securely in Sclip Settings. Do not paste credentials into chat. Then resume the approved small Jev shadow quality gate, followed only if recall/context quality is adequate by compact-only vs compact-plus-Jev source understanding with identical agent task/budget and no final export. A 50% cost reduction remains an ambition to measure, not a result.

## Important unresolved perception limitation

The historical cropped-head image actually cuts the upper head/face at the **top** and has a large lower black region. Local Qwen's neutral answer still incorrectly described the cut edge and a nearby graphic. The repaired parser returned `framing_ok=false`, `confidence=null`; it did **not** establish accurate semantic head completeness. Partial subject visibility is not proof of an intact face/head. Factual envelopes/black fractions are not a face detector or proof that black content is unintended. **Do not mark Qwen perception or false reassurance fully solved.** No Qwen prompt/model or creative heuristic was changed to manufacture a pass.

## Verification

- Focused TypeScript regressions: **62/62 PASS**, eight files (Jev client, passage evaluator, terminal runtime/renderer, factual geometry, transcript access, MCP routing and settings).
- Production parser tests: **5/5 PASS**, extracted from the actual worker without importing model dependencies.
- Built-app local test: **2/2 PASS** (real xterm historical/live protocol behavior; compact real source, actual composed Qwen inference, factual metadata, unchanged timeline and normal MCP inspection afterward).
- Production build: **PASS**.
- macOS arm64 package creation: **PASS**. Packaged worker bytes match current source (SHA-256 `274ff3afb2e899432623bbd7e5d3aa2edffac3fc80e15ff794dd81a4b578592a`). The first executable launch timed out, but a subsequent **actual packaged runtime recheck PASSED**: packaged Electron launched the bundled worker, loaded external local Qwen weights, returned inference, and retained working MCP/renderer. The earlier timeout was not classified as a VLM crash. Separate limitation: this generated package logs that its bundled Hermes runtime is missing; packaged Qwen PASS is not proof of complete Hermes distribution readiness. No packaging/runtime redesign was made.
- Full typecheck remains blocked by pre-existing errors in actor/rough-cut/vision-runtime and old test fixtures; no new production-module errors appeared in the last check. An additional old vision suite refers to the deleted `/Documents/1/3` fixture; another old Hermes/vision integration test failed binding its loopback listener in the sandbox before inference. These are not passed regressions and were not patched or rerun with paid models.
- Hermes source working tree remains clean. Existing dirty Sclip work was preserved. ProjectActor, native transcript backend, edit commands, Qwen prompts/model, compositor draw/seek and export were not changed by this slice.
- No original project edited/deleted; no full Phase 2F, product/UGC, final MP4 or style learning.

Local diagnostic artifacts (gitignored): `apps/desktop/e2e/bench-results/jev/built-app-evidence.json`, `provider-blocked.json`, `packaged-app-evidence.json`. The older `packaged-app-check.json` records the earlier failed launch and is not the latest runtime result. These contain source/vision evidence and safe status, not credentials.

## Agenticness

Hermes chooses its own next action: YES. May skip/reorder editing categories: YES. External code chooses creative order: NO. Mandatory editing pipeline: NO. Full general Hermes preserved: YES. Model-quality/completion and total cost have not been re-evaluated because the provider gate blocked the comparison.
