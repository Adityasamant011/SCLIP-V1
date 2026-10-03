# Jev V1 final integration — 2026-09-28

## Final engineering decision

**OPTION 1 — RETAIN OPTIONAL JEV V1.** Its read-only transcript-ranking path is registered, discoverable, callable and has returned authentic provider evidence. Hermes now receives concise, accurate tool-use guidance in the actual launched runtime. The demonstrated silent transcript-range failure is corrected. Keep `SCLIP_JEV_ENABLED` **off by default** and close active Jev V1 engineering work. Do not build automatic delegation or claim efficiency savings until a reliable, usage-accounted provider permits a completed end-to-end value comparison.

Architecture remains: **Jev narrows; Hermes chooses; deterministic code executes; Hermes reviews.** Jev does not route prompts, choose edits, mutate ProjectActor, control a workflow or replace original evidence.

## Five separate conclusions

| Question | Result | Basis |
| --- | --- | --- |
| **A. Integration correctness** | **PASS for optional capability** | Opt-in built-app MCP catalog contains `evaluate_source_passages`; disabled catalog omits it. A valid local read-only request reaches its handler, and historical OpenRouter Decisions receipts show real `typesafe/jev-1.13` ranking with source references/coverage. Original transcript reads remain available after Jev use or absence. |
| **B. Agent guidance** | **PASS for loaded instructions** | The existing WeftCut skill now explains when semantic ranking/context-sufficiency can help, exact `media_ids`/`request` and optional scope/top-K fields, discovery/description, cost/fallibility, original-source expansion and direct-read exceptions. A disposable **real Sclip launcher → Hermes CLI** run captured the first main-model SDK-bound prompt containing the new skill lines. A test-only route mismatch stopped before network dispatch. This proves load, not model compliance. |
| **C. Tool correctness** | **PASS for the observed defect** | `get_media_context` now rejects a nested `range` or any unsupported field before a cache/backend read, with an error naming flat `start_us`/`end_us`. Correct flat calls still return the requested window. Unit and built-app MCP tests reproduced the bad call and verified recovery. |
| **D. Agent adoption** | **INCONSISTENT / post-change unverified** | An older agent session invoked Jev; another 14-call run saw Jev in every catalog but read all 140 transcript segments without invoking it. No agent-model response was run after this skill update. **AGENT-LEVEL VERIFICATION BLOCKED BY PROVIDER:** the exact free Nemotron route recently failed with `stream_failed_usage_unknown` under the existing guard. No unguarded retry, GLM or substitute model was used. |
| **E. Economic benefit** | **NOT DEMONSTRATED** | Historical Jev shadow inference cost $0.000911694 and surfaced relevant passages, but its top 12 omitted substantial airport setup. The forced-evidence matched pair stopped in DIRECT before its Jev-evidence condition. No complete matched token, latency, quality or dollar saving exists. |

## Changes in this finalization

- `skills/weftcut/SKILL.md`: replaced vague optional Jev advice with a practical, still advisory description of its two existing roles, actual tool schema, tradeoffs, original-source checks and flat transcript bounds. No mandatory tool order was added.
- `apps/desktop/src/main/mcp/server.ts`: strictly validate `get_media_context` top-level fields before execution and clarify flat bounds in both advertised catalog variants. Existing valid calls keep their behavior.
- `apps/desktop/src/main/mcp/transcriptAccess.test.ts` and `apps/desktop/src/main/sclip/jevAgency.test.ts`: cover rejected nested bounds, corrected calls and the updated advisory guidance.
- `apps/desktop/e2e/electron/jev-tool-selection-offline.spec.ts`: exercise invalid and corrected bounds against the rebuilt app through the normal MCP connection.
- `apps/desktop/e2e/electron/jev-reliability.spec.ts`: provider-free disposable launcher probe captures Hermes's actual prompt and fails before dispatch; it does not alter production Hermes or the user's profile.

All pre-existing dirty Sclip and Hermes work was preserved. No Jev ranking algorithm, ProjectActor, bulk rough-cut architecture, model configuration, default enablement, or Hermes core was changed.

## Verification

- Focused Jev/skill/transcript/bulk/editor-tool tests: **82/82 PASS** across seven Vitest files.
- Rebuilt-app MCP Jev enabled/disabled, handler, original-source access, nested-range rejection and corrected read: **1/1 PASS**.
- Recorded Jev fixture/source-hash/passages/omitted-airport original access: **1/1 PASS** (no new provider request).
- Disposable real Hermes launch with updated skill in first SDK-bound main request: **1/1 PASS**. Guard blocked dispatch intentionally (`unexpected_model_route`); **0 model inference** in this probe.
- Actual Hermes progressive disclosure against current built-app catalog: semantic transcript/context query ranked Jev **#1**; `tool_describe` returned required `media_ids`, `request` and optional `start_us`, `end_us`, `limit`. This proves discoverability, not autonomous selection.
- `npm run build:skills`: **PASS**. `npx electron-vite build`: **PASS** (existing dynamic-import warnings).
- Full `CARGO_NET_OFFLINE=true npm run build:e2e`: **BLOCKED**, not passed, because the local Rust cache lacks `libm v0.2.16` and offline mode cannot download it. This is not a Jev regression; the updated Electron build and MCP tests did pass.
- `npx tsc -p tsconfig.main.json --noEmit`: **NOT GREEN** on the current dirty tree, with diagnostics in unrelated tests and state/vision/rough-cut files (for example `server.flip.test.ts`, `validatePlanMcp.test.ts`, `actor.ts`); none was reported in the files changed for this Jev finalization. Those separate type errors were not altered to broaden this task.

Provider-free protocol evidence is in the gitignored `apps/desktop/e2e/bench-results/jev/jev-v1-skill-offline.protocol.json`; its filtered system/developer lines contain the new Jev guidance and flat-bound note. Prior provider receipts and the incomplete value gate are recorded in [shadow retrieval](jev-shadow-retrieval-2026-09-27.md) and [forced-evidence value](jev-forced-evidence-value-2026-09-28.md). No new Jev or paid main-model calls were made here.

## Remaining boundary

The skill makes Jev understandable, but cannot force a model to choose it; forcing it would compromise the current agentic design. The existing original-source path remains the fallback when Jev is unavailable, uncertain or not useful. There is **no evidence-based reason to enable Jev by default** or to build system-level delegation now. A future completed matched source-only run could establish whether the optional capability actually saves context while preserving the story; it is not a prerequisite to closing this V1 integration task.
