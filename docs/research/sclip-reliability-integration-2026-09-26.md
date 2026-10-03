# Sclip reliability/integration correction — 2026-09-26

Scope: three proven integration problems only. The existing dirty worktree was inspected before changes and preserved. No full Phase 2F edit, commentary/UGC benchmark, style learning, or new editing architecture was run or added. Changes described below are relative to the starting worktree, not a claim that these files were previously clean.

## Iteration allowance

ITERATION LIMIT ROOT CAUSE: Sclip's dedicated profile used `agent.max_iterations: 30`; its terminal launcher resolved that value and explicitly passed Hermes `--max-turns 30`. This was a Sclip-imposed ceiling, not an unavoidable Hermes limit. Current Hermes supports `agent.max_turns` and CLI `--max-turns`; its existing loop supplies exhaustion warnings and summary behavior.

PREVIOUS LIMIT: 30.

NEW SCLIP EDITING LIMIT / BEHAVIOR: finite default 60, via the existing `agent.max_turns` setting and terminal CLI argument. Legacy Sclip `max_iterations: 30` migrates to 60. An explicitly saved modern limit, or a different legacy limit, is preserved. Existing exhaustion warnings/summary behavior remain unchanged. Existing running processes need a restart to adopt new launch arguments.

USED EXISTING HERMES CONFIGURATION: YES.

NEW CONTINUATION ORCHESTRATOR: NO.

## Transcript access

TRANSCRIPTION BACKEND CHANGED: NO.

TRANSCRIPT CACHE CHANGED: NO.

TRANSCRIPT ACCESS ROOT CAUSE: the ~575-second source already had a successful cached Whisper transcript with segment text and word timing. The full `transcribe_clip` result was about 229 KB; the full transcript resource about 378 KB. Hermes's existing result-storage threshold is 100,000 characters, causing spillover with `read_file` instructions. Sclip's terminal toolset omitted `file` and `terminal`. Separately, bounded `get_media_context` requests without `detail` defaulted to overview, returning availability/counts instead of text. The native cached-range implementation already existed.

TRANSCRIPT ACCESS FIX: improve the existing MCP handler/description, not the cache or backend. Time bounds imply `detail: range`; range replies expose actual cached segments and word timing in source microseconds, at most 60 seconds per request. Explicit overview stays available. Oversized MCP transcription replies become a cache summary with range-access instructions. Short MCP transcription replies and the UI/caption compute result remain intact. Existing bounded transcript resource URIs remain available.

LONG SOURCE TRANSCRIPT RANGE TEST: PASS, for functional production-path access. Built-app preflight returned actual text/word timing for 0–60, 180–240, and 420–480 seconds. The real Hermes session independently retrieved ten accepted windows covering the source. Individual agent replies were approximately 13–25 KB, rather than one enormous transcript.

MANUAL SPILLOVER FILE ACCESS REQUIRED: NO. No shell, Python, terminal, or file-read calls occurred in the acceptance session.

NORMAL HERMES FILE/TERMINAL TOOL STATUS: restored to the Sclip CLI toolset; existing tools and permissions, not new implementations.

WERE THEY CHANGED: YES — Sclip's explicit toolset list now includes `terminal,file`.

WHY: direct code/trace evidence showed a Sclip whitelist mismatch, not an upstream toolset rename. Hermes's ordinary file and terminal tools exist; the development benchmark could expose them, while the Sclip terminal could not. This restoration preserves the requested full-Hermes integration. Transcript acceptance does not depend on those tools.

## One real source-assessment session

Model/provider: `z-ai/glm-5.2` / `openrouter`, from the normal Sclip profile and secure credential resolver. No fallback model or credential output.

Prompt: “Understand this source well enough to identify three different candidate 30–45 second sections. Use transcript evidence from different parts of the source. Do not edit.” No prescribed action order.

Session: `20260926_123137_62a925`.

Runtime evidence from the existing Hermes log:

```text
Turn ended: reason=text_response(finish_reason=stop)
model=z-ai/glm-5.2 api_calls=9/60 budget=9/60 tool_turns=8
```

The agent exited voluntarily after 48 seconds, not by exhaustion. It recovered from a missing resource URI and an over-60-second request using normal errors. Accepted transcript windows: 0–60, 60–120, 120–180, 180–240, 240–300, 300–360, 360–420, 420–480, 480–540, and 540–575.71 seconds. It selected candidates 0–38.9, 70.56–112.56, and 459.04–503.76 seconds, supported by transcript quotations. This proves navigation/completion for this small task, not polished-video quality. Its final answer contains abbreviated/incorrect end timestamps inside some late-section quotations and calls ten windows “nine”; the primary candidate boundaries are stated correctly. These are answer-quality defects, not hidden transcript access failures.

The authoritative session database shows only tool discovery, ping, resource reads, and media-context calls: no editing mutation, export, terminal, or read-file call. The original user project was not edited; the test used an isolated project and copied the existing transcript cache.

Evidence artifacts:

- `apps/desktop/e2e/bench-results/phase2f/talking-head-foundation-long-source.hermes-trace.txt`
- `apps/desktop/e2e/bench-results/phase2f/long-source-range-evidence.json`
- Existing Hermes `state.db` and `logs/agent.log`, session above. No credentials copied into this report.

Important test caveat: the focused Playwright wrapper exited with failure after the real session and all transcript/vision/catalog checks passed. Its newly added no-edit assertion compared the entire serialized project, including asynchronously populated media derivative paths. It was corrected to compare every authored project field and undo history, excluding only proxy/conform/waveform/thumbnail cache paths. Source identity, route kind, metadata, all compositions, parameters and settings remain checked. This corrected assertion was **not rerun with a second real agent session**. The original wrapper run must not be counted as a green end-to-end test. The session's no-mutation conclusion is based on its complete tool-call trace, not on a passing before/after snapshot assertion.

## Final export exposure

HERMES FINAL EXPORT TOOL BEFORE: `export_timeline`.

HERMES FINAL EXPORT TOOL AFTER: ABSENT from the MCP catalog. Stale direct calls are explicitly refused, including when no project host is present. No native export implementation was deleted.

USER EXPORT UI: PASS — existing built-app UI export checks.

PRODUCTION EXPORT: PASS — existing production exporter, H.264/AAC, repeat export and composed parity checks.

BENCHMARK EXPORT: PASS — test-owned internal production export callback verified in the built-app parity test; the full Phase 2F benchmark was not run. Its existing harness now uses that same internal callback after editing instead of agent-visible MCP export.

VISION_INSPECT: PASS — actual built-app preflight returned local Qwen evidence through the production MCP path. Hermes did not call vision in this transcript-only task; the preflight verified it independently.

TEMPORARY QA RENDERING: PASS — `render_timeline_range` remains available and passed production composition/export parity. Frame inspection remains available too.

## Protected systems and agenticness

PROJECTACTOR: UNCHANGED by this task.

VISION ARCHITECTURE: UNCHANGED by this task.

WHISPER BACKEND: UNCHANGED by this task.

COMPOSITOR: UNCHANGED by this task.

HERMES CORE: UNCHANGED.

WeftCut skill, model/provider configuration, editor commands, timeline ownership/serialization, rough-cut compiler, caption engine and export implementation were not changed by this task. Earlier unrelated local changes remain present.

HERMES CHOOSES OWN NEXT ACTION: YES.

HERMES CHOOSES OWN EDIT ORDER: YES — no new ordering restriction; the acceptance request deliberately prohibited edits.

HERMES MAY SKIP/REORDER: YES.

EXTERNAL CREATIVE ORCHESTRATOR: NO.

MANDATORY PIPELINE: NO.

CREATIVE STATE MACHINE: NO.

AUTO-REPAIR WORKFLOW: NO.

FULL GENERAL HERMES PRESERVED: YES — no core changes or replacement loop. Standard tools are restored beside WeftCut; existing Sclip integration otherwise remains as it was.

## Regression results

- Selected Vitest regression suite: **282/282 PASS across 17 files**. Covers editor commands, undo/history navigation, checkpoints, linked transforms, text bounds, media/caption hybrids, timeline context, MCP routing/catalog/resources, secure settings/redaction, terminal launch/input, renderer serialized typing and replay deduplication, and composed rendering safeguards.
- Built-app manual/effects smoke checks: **6/6 PASS**, including inspector UI add/edit/reorder/remove, undo, rendered effects and user export.
- Built-app Hermes discovery probe: **1/1 PASS**. 106 WeftCut tools registered; normal Hermes file/terminal/skills/memory tools coexist; WeftCut context call and ordinary `read_file` succeeded. This probe did not call a model provider.
- Built-app export-repeat and readiness/parity checks: **2/2 PASS**. Agent export absent/refused; user/test-owned production export and temporary QA render still work. Mean range-vs-final pixel difference ~0.001; inspection-vs-final ~11.44, within the unchanged test threshold; audio RMS matched.
- Focused real-Hermes session: functional transcript/vision/catalog checks and voluntary completion **PASS**; wrapper **FAIL**, as explicitly documented above. No second real session run.
- Separate standalone `visionInspect.test.ts`: **8 failures**, at `result.ok` checks. This fixture suite uses old absolute source/frame paths and runs outside Electron. Its precise runtime failure was not diagnosed or fixed in this narrow task. It is **not** counted as a pass. Actual built-app Qwen preflight passed; no production vision-path failure was observed.
- TypeScript project-wide check remains **FAIL** with errors in existing unrelated test fixtures/vision/rough-cut/actor code; no new errors in the changed production handlers were reported. No unrelated repairs made.
- E2E build and final normal production build: **PASS**. Final build is the normal build, not a test-hook build. `/Applications/Sclip.app` currently launches this repository's `out/main/index.js`, so the rebuilt app loads on its next launch.
- Scoped changed-file whitespace check: PASS. Full-worktree check still reports two pre-existing extra EOF blank lines in `server.flip.test.ts` and `hybrids.test.ts`; neither was cleaned up.

## Files changed by this task and why

Paths below are relative to `editor/`; only the described hunks belong to this task.

| File | Narrow reason |
| --- | --- |
| `apps/desktop/src/main/sclip/hermesRuntime.ts` | Resolve/write existing Hermes finite budget; migrate legacy Sclip 30 default. |
| `apps/desktop/src/main/sclip/hermesTerminalRuntime.ts` | Restore file/terminal in existing toolset. |
| `apps/desktop/src/main/sclip/hermesBenchmarkLauncher.ts` | Existing thin test adapter uses normal profile budget/toolsets and prints non-secret resolved model/budget evidence. |
| `apps/desktop/src/main/mcp/server.ts` | Correct existing bounded transcript access, compact oversized MCP transcription replies, unregister/refuse final export. |
| `apps/desktop/src/main/index.ts` | Remove unused MCP final-export directory callback only. |
| `apps/desktop/src/main/sclip/hermesSettings.test.ts` | Cover finite default/migration and preservation of explicit limits. |
| `apps/desktop/src/main/sclip/hermesTerminalRuntime.test.ts` | Assert restored tools and normal finite CLI budget. |
| `apps/desktop/src/main/mcp/transcriptAccess.test.ts` | Cover bounded access, validation, UI result preservation, export removal and stale-call refusal. |
| `apps/desktop/e2e/electron/sclip-phase2f-mvp.spec.ts` | Add focused source-assessment mode to existing harness; use existing internal final-export callback; correct new no-edit guard. |
| `apps/desktop/e2e/electron/sclip-readiness-parity.spec.ts` | Check export absence/refusal and use existing test-owned production export callback. |
| `docs/mcp.md` | Describe corrected context semantics and user-only final export. |
| This report | Record evidence, limitations and task-scoped changes. |

READY FOR NEXT REAL USER EDIT TEST: YES, for a small observed user editing session, not a claim that the full test tree is green or video quality is proven.

REASON: all three requested friction points have narrow fixes and production-path evidence; Hermes completed the source-only request in 9/60 calls with bounded editor-provided transcript evidence. Protected production subsystems were not redesigned. Outstanding standalone/harness/type-check failures are disclosed above.

NEXT SMALLEST STEP: save and relaunch Sclip from Applications, then try a normal user editing request with the existing GLM profile. Observe completion and actual composed output. No automatic full benchmark or further architecture work initiated.
