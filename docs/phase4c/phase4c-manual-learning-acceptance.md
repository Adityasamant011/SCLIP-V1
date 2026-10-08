# Phase 4C.1 — manual creator learning acceptance

2026-10-08. **A — MANUAL LEARNING PIPELINE VERIFIED, LIVE ACCEPTANCE PENDING.**

Provider/model spending: **$0.00**. No real model inference, new editorial holdout, account-limit change, second editor, or Phase 4B quality modification. Real-model adaptation and fewer repeated corrections are **not yet proven**.

## Existing functionality verified

Investigation preceded implementation: the Phase 4C investigation, architecture, design and final report were read alongside their actual production implementations. Reused the existing creator ledger, bindings, scopes, hypothesis/counterexample handling, Settings controls, MCP registration, native Hermes homes, staged evidence skill and ProjectActor observer.

The existing observation path was already automatic, independent of another chat message:

`GUI → renderer/ipc/index.ts → backend:invoke → state/router.ts → ProjectActor User commit → ts-actor-host.emitChange(before, after) → main/index.ts.onProjectChange → CreatorStyleStore.observe → local atomic persistence`.

Authenticated MCP editing uses Agent attribution. ProjectActor remains the sole timeline writer. Its undo, history and transaction semantics were not changed. Saves, exports, selections and project loads do not approve preferences.

Actual installed Hermes is the local checkout at `/Users/adityasamant/SCLIP/hermes-agent-src`, launched through the existing bundled shell launcher. Native skill preload and memory recovery work offline. Generic memory is persistent memory, not automatic, attributed creator-style learning.

## Gaps closed

1. Manual-only changes previously used the same correction label as AI corrections. They now have `manual_edit` / `independent_manual_edit`; linked AI changes have `correction` / `ai_proposal_correction`; restorations remain explicitly ambiguous.
2. Adjacent committed changes to the same properties could lose the original Agent proposal and inflate observation count. Unreferenced, contiguous, same-target/property changes now retain the original before-values/proposal and latest after-values as one observation sequence. No elapsed-time threshold proves intent. The original actor commits remain separate undo entries.
3. Layer projection omitted composition, track and stacking position. Those changes are now observable even when source/timeline values are unchanged.
4. Foreground context previously allowed about 12,000 characters and duplicated raw metadata in tool responses. It now uses compact scoped preferences, bounded property-value summaries and local lexical relevance; detailed retained facts remain available through MCP.
5. Hermes's generic background memory/skill review can invoke a model and defaults on if configuration is missing or invalid. Supported profile generation defaults it off; gateway/terminal launch now rejects an effective enabled/invalid review setting. Explicit settings are not silently flipped. Unsafe curator consolidation is also rejected where present. No background model is introduced.

## Manual correction coverage

| Changes | Captured facts and limitations |
|---|---|
| Clip trim/move, source range, duration and ordering | Layer timing/source values, composition/track/stack position, operation identity and User attribution |
| Captions/text, framing, transforms, animations and effects | Changed authored parameters/effects; bounded original/final values and property paths |
| Add/remove supporting clips, music, audio gain | Layer addition/removal and relevant authored parameters; no automatic taste interpretation |
| Transitions, authored links, track enable/mute/solo/role | Bounded structural before/after facts |
| Undo/checkpoint restoration | Observable restoration with uncertain intent; never automatic approval |
| Independent manual editing | Preserved as demonstrated behavior, not rejection of an AI proposal |

Exact prior Agent after-state matching links a correction to an actual proposal. Subsequent adjacent adjustments retain that link. Loaded edits with no retained matching proposal remain unlinked. Mixed operations carry per-layer links; not every affected layer is assumed Agent-authored.

Not captured as style feedback: selection, viewport/navigation, imports alone, save/export, project opening, or a verbal revision without explicit preference feedback. Redo retains the existing ambiguous restoration evidence rather than adding another independent confirmation. Source-specific reasons, accidental edits and an unfinished sequence cannot be inferred from timeline values. Large changes retain at most eight layer deltas and report omissions/truncation; this is not a complete duplicate event archive.

The actual GUI acceptance exercised caption property entry and clip selection. Manual video import, placement and trim used the same production IPC operations as the UI. Lane changes, undo/redo, independent projects, creator isolation, scopes and controls were additionally checked deterministically. Every possible drag/animation/audio control was not individually driven through the GUI.

## Concrete executed learning path

1. Actual authenticated MCP creates synthetic caption size **76**, attributed Agent.
2. Actual desktop property control commits **70 → 60 → 54**, attributed User. No Hermes chat is sent.
3. Local evidence retains Agent operation, original 76, final 54, property path, creator/project IDs, timestamps, state identities and three User operation IDs. One observation; zero automatically created preferences.
4. The offline test submits a **simulated Hermes-authored** hypothesis through real MCP: “Possibly prefers smaller captions where readable.” The creator approval path activates it. This text is test input, not model-generated evidence of learning.
5. A new project imports and manually edits a generated three-second video. Its observations are independent manual edits.
6. The production terminal launcher stages the approved preference and current-request precedence into the next project's context. An offline child captures the actual launch inputs; the real installed Hermes `build_preloaded_skills_prompt` consumes that staged skill in a fresh process. Native `load_background_review_settings` confirms review is disabled.
7. Closing/reopening the app and project recovers the preference and evidence. Disable/reset remove effective context. Existing creator control handling stops old terminals and rotates recalled-session identity.

Separate real-actor tests produce supporting corrections in two independent projects, reopen the store, and retrieve a supported **candidate**, not an approved rule, in a third project. Operations within one sequence do not count as independent confirmations.

## Context, scope and creator controls

Creator/series/project isolation is retained. Current request outranks memory; project directions outrank series/global preferences. Hermes may adapt, ignore irrelevant history, reject a hypothesis, choose another edit or make no repair. Infrastructure never dispatches preferred values to ProjectActor.

Explicit instructions and creator approvals are distinguishable from tentative hypotheses. Supporting/counterexample IDs and uncertainty accompany compact context. MCP `context` accepts an optional current request for local memory relevance; it does not rank footage. At terminal initialization no new brief is available yet, so scope/status/support/recency determine initial context; Hermes can retrieve fresh request-relevant context later.

Existing Settings supports inspection, explicit preferences, approval, revision, disable/forget, project opt-out and reset. Tests check effective ledger/context changes, not only labels. Grouping never rewrites evidence already used by a hypothesis or counterexample. Creator changes during asynchronous terminal setup now reject stale launch ownership.

Generic Hermes USER/MEMORY files have separate retention semantics. They are preserved, not cleared by creator-style reset. Context explicitly forbids copying this ledger into those files; legacy generic facts are not migrated or treated as approved style. Existing legacy-style gateway restrictions remain. Already generated edits cannot be retroactively “forgotten.” No claim of purging arbitrary historical native chat/memory is made.

## Cost and storage

Measured in the deterministic real-actor adjustment test:

| Committed adjustments in one sequence | Extra observation model calls | Records | Ledger bytes | Context characters | Local token count |
|---|---:|---:|---:|---:|---:|
| 10 | 0 | 1 | 4,516 | 1,337 | 335 |
| 100 | 0 | 1 | 4,517 | 1,338 | 335 |
| 1,000 | 0 | 1 | 4,518 | 1,339 | 336 |

Tokens were measured locally with `o200k_base`; they are a proxy, **not observed Luna provider billing**. Fetching its public tokenizer table required no inference or credentials. Actual installed GUI context measured 1,368 characters. No background model requests occurred; cloud fetch was forbidden in the stress test and the GUI used a child that cannot perform inference.

The final stress run took 7.35 seconds for 1,000 commits including actor work and synchronous memory writes while other tests ran. This is approximately 7.35 ms/commit in that fixture, not a hardware-independent UI performance guarantee. An earlier quieter run took 1.89 seconds.

For 10/100/1,000 corrections, automatic observation inference cost is **$0.00**. Context incurs input cost only when a separately authorized foreground model request sends it. Formula: `extra uncached tokens × input price × model requests`. At the cached October 7 illustrative input rate of $0.20/million tokens, 336 tokens cost approximately **$0.0000672 per request**; 10/100/1,000 projects with one such request each would add about $0.000672/$0.00672/$0.0672. These are estimates, not current price quotes or actual spend. Multi-turn retransmission and hypothesis output/tool activity add model-dependent costs inside the existing foreground session; caching may reduce them. Live acceptance must measure those separately.

Context payload targets at most 3,600 characters, with a fixed policy prefix, up to eight preferences and three evidence summaries. MCP avoids duplicating full preference/event records; deeper evidence is requested explicitly. Ledger limits remain 600 evidence records, 100 preferences, 4 MB, 200 proposal associations. A grouped sequence retains its first operation plus the latest eight member IDs/count; detailed undo stays in existing bounded actor history. The above storage result applies to grouped adjustments, not 1,000 unrelated corrections. At capacity capture warns/refuses a memory write while preserving existing memory and the committed timeline; automatic pruning or indefinite history retention is not implemented.

Reference registration reads valid cached local Source Understanding only. Repeated registration tested two cache reads, zero analysis calls. Missing observations remain unknown. Memory does not analyze footage or launch a separate interpretation session. Explicit unsafe automatic-review configuration blocks Hermes launch with a useful error rather than spending credits. Foreground editorial inference remains separately authorized/costed.

## Tests and installation

| Validation | Final result |
|---|---|
| Desktop typecheck | PASS |
| Desktop main/preload/renderer, CLI and skills build | PASS |
| Focused TypeScript suites | **13 files / 106 tests PASS**, no skips |
| Native Hermes offline memory/preload tests | **3 tests PASS**; no model client |
| Workspace production GUI/manual-only/restart/context check | PASS |
| Installed production GUI/manual-only/restart/context check | PASS |
| Actual installed MCP discovery | **116 tools**; `creator_style_memory` present |
| Installed bundle comparison | **50 compiled JS/CSS/HTML assets + 13 skill files match** |
| Packaging/signature verification | PASS, local arm64 build, ad-hoc signing; not notarized |
| `git diff --check` | PASS |

Focused suite: `creatorManualLearning`, `creatorStyle`, `creatorStyleMcp`, `creatorReference`, `CreatorStyleSection`, `hermesTerminalRuntime`, `hermesSettings`, `hermesBridge`, `autonomousReview`, `ts-actor-host`, `mcp.skill-conformance`, `repair-transaction`, `revisionLoopGuard`. Existing tests cover isolation, overrides, counterexamples, control changes, schema, review and atomic repairs. New tests cover the real UI operation boundary, grouping, independent lane changes/projects, stress/cost safety and cached-reference reuse.

Initial GUI probe failures were test setup errors: bypassing startup navigation, selecting a hidden caption track, treating domain/wire summaries identically, using raw input fill on Base UI NumberField, and reading the wrong status property. They were corrected in the test using actual project/clip selection and keyboard entry. No product changes were made to satisfy those failures. macOS GUI launch required execution outside the sandbox. Final workspace and installed checks pass.

Installed `/Applications/Sclip.app` version **0.1.8**, source/build commit **07419ec48e0a10c1920bd814abb68bbe06af3309**. Compiled main SHA256: `f2a41436dbd691551412a231bf6e4372748fe5812909b4e81079f746f16ba0e1`. The version string alone does not distinguish this build from the old installation; the build manifest and asset comparison do.

Previous app backup: `/Users/adityasamant/SCLIP V1/backups/installed-apps/Sclip-backup-20261008-170805.app`. Existing Hermes launcher copied unchanged. **27,035 non-cache/log profile files were hash-checked after normal shutdown and remained identical during bundle replacement.** Installer never writes project/profile data. Installed acceptance uses a disposable temporary profile, which is removed afterward; the actual user profile is not replaced with an empty one.

Reproduce the offline GUI check from the repository root with `node apps/desktop/e2e/phase4c/manual-learning.mjs`; set `SCLIP_LEARNING_INSTALLED=1` for the installed app. It requires macOS GUI access, the existing local Hermes checkout and local FFmpeg. Native tests use that checkout's Python environment.

Local artifacts: `.scratch/phase4c1/{workspace-result.json,installed-result.json,workspace-gui.png,installed-gui.png,cost-metrics.json,installation.json,build-verification.json}`. They contain synthetic evidence/metadata, not credentials or hidden reasoning.

## Changed files and commits

Implementation commit **07419ec4**:

- `apps/desktop/src/main/sclip/creatorEvidence.ts`: observable property differences, cautious grouping, compact before/after summaries.
- `creatorStyle.ts`, `creatorStyleTool.ts`, `shared/creator-style.ts`: manual attribution, grouping, structural identity and bounded relevant context.
- `hermesBridge.ts`, `main/index.ts`: current-request relevance in foreground gateway context.
- `hermesRuntime.ts`, `hermesTerminalRuntime.ts`: no automatic review/consolidation launch and refreshed creator ownership validation.
- `creatorManualLearning.test.ts`, `creatorReference.test.ts`, `e2e/phase4c/manual-learning.mjs`, `offline-hermes.py`: offline production-path and GUI acceptance.

This report is a subsequent documentation commit; installed executable source remains 07419ec4. Pre-existing edits to `apps/desktop/e2e/acceptance-routing/run.mjs` are preserved and excluded from these commits.

## Remaining limitations and agenticness

**Proven:** local capture without chat/inference, attributed proposal correction and independent edits, cautious grouping, persistent scoped preferences/evidence, applicable context loading, effective controls, bounded storage/context, unchanged timeline authority/history, and installed runtime integration.

**Not proven:** a real Hermes model notices useful patterns, formulates accurate hypotheses, obeys/appropriately overrides them, or reduces repeated human corrections. Offline hypotheses were simulated and explicitly labeled. Semantic intent and source-specific causes remain unknown. Grouping describes adjacency, not confirmed intent. Reference observations cannot reconstruct original editing decisions. Separate native generic memory remains outside creator-ledger reset.

Hermes chooses hypotheses, creative meaning, tools, repairs and every edit value. The creator controls approval/scope. Infrastructure only records facts, ranks memory relevance and enforces lifecycle/identity/cost safety. **Deterministic creative leakage: NO.** No engine rewrite, genre recipe or creative preference enforcement.

**Exactly one next action:** separately authorize one small real-creator learning acceptance across three different projects: genuine corrections first, relevant retrieval/adaptation second, and a contradictory explicit brief third. Measure repeated corrections and actual incremental memory cost. Do not run it automatically.
