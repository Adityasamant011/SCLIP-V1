# Sclip post-audit repair — 2026-09-28

## Scope and worktree

Work started from the current, extensively dirty `sclip/phase1` checkout. Existing uncommitted work was preserved; no reset, stash, installed-app update, model-setting change, paid inference, or new editing capability was performed. Tests used disposable state. This is a repair baseline, **not** a declaration that the entire editor or full test suite is production-ready.

## Audit findings: confirmed, corrected, or unproven

| Audit claim | Finding |
| --- | --- |
| 42 TypeScript errors in nine files | Outdated count. Current baseline was **158 errors across ten files**; 116 came from the newly added MCP inventory test's incorrectly typed helper. `npm run typecheck` now passes. |
| Skill conformance fails | Confirmed. The test conflated Hermes built-in `tool_search`/`tool_describe` with WeftCut MCP tools and treated documented argument names as tool names. The categories are now separate and checked for collisions. |
| Position-docs test fails | Not reproduced from the normal desktop test directory, but its relative file read was CWD-dependent. It now resolves the real documentation relative to the test module; schema/example assertions remain intact. |
| Tool status says 89 while Hermes sees 102/103 | Confirmed counter defect, **not** missing registered tools. Status counted two TypeScript tables; MCP discovery merges native, TypeScript, Motif and server-owned tools, with optional Jev. The status now counts the same merged catalog used by `tools/list`. |
| 103 tools all verified | Inventory harness covers all 103 names and reported 92 successful fixture executions / 11 blocked external-compute cases. This does not prove every tool works in a real editor session. The original audit also names several tools not in the actual catalog and describes an STDIO production host, while the desktop host uses loopback Streamable HTTP; those prose claims are not reliable evidence. |
| Ripple-gap behavior is too strict | The cross-track refusal is implemented, documented, and tested as an all-or-nothing sync safeguard. Whether an alternate mode is desirable is a **usability proposal**, not a demonstrated correctness bug. No mode was added. |
| Empty `{}` means schema bug | **Unverified.** The inventory's ten `PARTIAL` invalid-input rows include tools with different semantics, including validators that return a valid/invalid result rather than an MCP error. They are not ten proven schema defects. No schema was loosened or tightened from this claim. |
| Flattened batch aliases needed | **Unverified usability hypothesis.** Existing `apply_rough_cut_plan` schema and deterministic placement tests pass. No alias or second batching system was added. The audit's `clear_track_first` description does not match the current tool contract. |

## Repairs

- [`apps/desktop/src/main/index.ts`](../../apps/desktop/src/main/index.ts) and [`apps/desktop/src/main/mcp/server.ts`](../../apps/desktop/src/main/mcp/server.ts): factor the existing merged MCP catalog computation so both Hermes discovery and the status count use it; optional Jev follows the same startup flag. No second registry.
- [`apps/desktop/src/main/mcp/mcpCatalog.test.ts`](../../apps/desktop/src/main/mcp/mcpCatalog.test.ts) and [`apps/desktop/e2e/electron/jev-tool-selection-offline.spec.ts`](../../apps/desktop/e2e/electron/jev-tool-selection-offline.spec.ts): assert 102 tools with Jev off, 103 with it on, and no advertised export tool.
- [`apps/desktop/src/main/state/__tests__/mcp.skill-conformance.test.ts`](../../apps/desktop/src/main/state/__tests__/mcp.skill-conformance.test.ts) and [`mcp.position-docs.test.ts`](../../apps/desktop/src/main/state/__tests__/mcp.position-docs.test.ts): correct the skill vocabulary classification and make documentation/fixture reads module-relative.
- [`apps/desktop/src/main/state/actor.ts`](../../apps/desktop/src/main/state/actor.ts), [`mutations/roughCut.ts`](../../apps/desktop/src/main/state/mutations/roughCut.ts), [`apps/desktop/src/shared/commandErrors.ts`](../../apps/desktop/src/shared/commandErrors.ts), and [`formatCommandError.ts`](../../apps/desktop/src/renderer/errors/formatCommandError.ts): use existing `Backend` error vocabulary for unexpected exceptions and explicitly type the two existing rough-cut consistency rules. Their structured `ValidationFailed` runtime shape remains unchanged.
- Updated stale test fixtures/types in `auditToolInventory.test.ts`, `server.flip.test.ts`, `validatePlanMcp.test.ts`, `hermesVisionInspect.test.ts`, `roughCutExecution.test.ts`, `roughCutInspection.test.ts`, and `hybrids.test.ts`; removed unused vision-runtime arguments without changing inference behavior. The inventory writes its matrix under its disposable temp directory, not over the research artifact. The inspection test now resolves the currently available talking-head project via `SCLIP_SOURCE_PROJECT` or `Documents/1/Mega test`, rather than the deleted `Documents/1/3` path.
- Added missing activity labels for `add_media_layer`, `add_text_layer`, and `restyle_captions` in both English and Chinese locale files after the full suite exposed this catalog/UI parity gap. Updated `jevAgency.test.ts` to assert the unchanged opt-in behavior after the startup flag was factored.

## Verification

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | **PASS**, 0 errors after repair; before: 158/ten files. |
| Skill conformance and position docs | **PASS**, both reported tests. Initial normal-CWD run had only the skill failure; the position failure was not reproducible there. |
| MCP catalog / Jev off-on | **PASS**, 102/103 in unit catalog tests and rebuilt-app MCP smoke. |
| Inventory harness | **PASS**, 103/103 names exercised; fixture statuses 92 PASS, 11 BLOCKED. The harness's classification is not a real-world proof for each tool. |
| ProjectActor, linked/ripple operations, rough-cut, transcript, Jev local regressions | **PASS** in focused runs: 56/56, 342/342, and 262/262 across overlapping selections. `roughCutInspection.test.ts` separately passed 20/20 after its stale source path was corrected. These are not summed as unique tests. |
| Built-app, provider-free MCP smoke | **PASS** with disposable project: Jev opt-in catalog, read-only empty-evidence handler, original transcript, actionable nested-range rejection, corrected flat-range read, unchanged timeline, and Jev-off catalog. The first launch was sandbox-blocked; permitted local rerun passed. |
| MCP loopback/CLI checks | **PASS** outside the sandbox: 14/14 bind/lifecycle/tool-label tests and 3/3 CLI bridge tests. Sandbox-only `listen EPERM` was not a product failure. |
| Electron/CLI/skill build | **PASS** (`npm run build`); existing ineffective-dynamic-import warnings remain. Native app packaging was not run. |
| Rust | **PASS** (`cargo check --offline` in `apps/desktop/native`). |
| Full desktop suite | **NOT GREEN**: 7,809 passed, 22 failed, 17 skipped across 570 files on the first sandboxed run. Targeted reruns resolved the six stale-path rough-cut failures, six local-bind failures, and the one tool-label failure. The full suite was not rerun; live-Hermes/vision acceptance tests were intentionally not authorized as part of this no-paid-inference repair. |

## Remaining boundaries

The full-suite result is not a clean global gate. Live-Hermes tests are unguarded historical integration tests and need an explicit, controlled provider run rather than inclusion in a no-paid default sweep. Local-vision acceptance tests expect `/tmp` frames or the deleted `Documents/1/3` media path; they need a separate fixture/precondition cleanup and appropriate local Qwen runtime validation. The first sandboxed run also failed local bind tests solely because loopback listening was denied; permitted reruns passed. The inspection performance fixture can label a persisted cached range as “cold” on a later run, so its printed timing table is not a benchmark claim. No evidence here proves or fixes semantic head-crop perception. No new Jev cost/quality claim is made.

**Next single action:** before the next acceptance cycle, separate opt-in live-provider/local-vision fixture tests from the ordinary no-provider desktop suite and rerun that ordinary suite under loopback-capable permissions. Do not start a new editing feature from this report.
