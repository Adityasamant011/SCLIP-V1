# Jev capability-delegation boundary audit — 2026-09-28

## Decision

**No production delegation mechanism was implemented.** The current Sclip/Hermes boundary has no structured semantic question when Hermes performs an ordinary source read. Automatically invoking Jev from that read would have to guess the user's or agent's intent, might charge for a direct factual read, and could silently replace explicitly requested original evidence. That is not a sound capability policy. The smallest missing interface is an **explicit, optional source-discovery request** carrying selected imported media IDs and a semantic question. It can use the existing evaluator; it should not create a new agent or editing pipeline. This is a proposal, not an implemented feature.

The [completed tool-selection investigation](jev-tool-selection-root-cause-2026-09-28.md) supports a narrower conclusion than “Jev is broken”: in the 14-main-call ignored run, Jev was in **14/14** provider-bound catalogs, search/schema/MCP/provider had working paths, and Hermes's initial visible reasoning intended to use semantic search. After a first transcript read it continued chronologically through **140/140** segments. That observed tool-choice drift is the proximate cause; the model's private reason and whether Jev would have saved work are unknown. No description tweak was justified.

## Observable boundaries

| Boundary | Information actually present | Semantic delegation? |
| --- | --- | --- |
| Current Sclip agent panel → `HermesTerminalRuntime.input` | Raw PTY keystroke bytes, project/session identity. Sclip does not parse a typed user brief or hold a structured question/media selection. | **No.** Interpreting terminal text would be a new prompt parser/router. |
| Alternate `sclip_start_hermes_run` bridge | An unstructured `prompt` string, project ID and session ID, forwarded as Hermes run input. It is not the current terminal path and is bypassed by the disposable CLI benchmark. | **No reliable generic classification.** A prompt may ask for a full transcript, a known range, a creative edit, or several tasks. Keyword matching is forbidden and insufficient. |
| `get_media_context` | `media_id`, optional `detail` (`overview`, `segments`, `range`) and optional `start_us`/`end_us`. It returns exact 60-second-or-shorter original-source windows. | **No.** A broad/no-range request still lacks a semantic question; a bounded range is explicitly direct inspection. Replacing or augmenting it with paid ranking would change its contract. |
| `media://.../transcript` resource reads | Exact source URI/range, no semantic question. | **No.** The caller explicitly asked for original evidence. |
| `evaluate_source_passages` | Explicit `media_ids`, semantic `request`, optional scope and top-K. | **Yes, already.** This is the only current boundary that can make the semantic decision without guessing; it still requires the caller to select the capability. |
| `RoughCutPlan.brief` / `apply_rough_cut_plan` | Structured goal/selected clips submitted **after** source/editorial decisions. | **No.** Using it for pre-selection would be too late and would mix creative/mutation mechanics with retrieval. |
| `begin_agent_session.reason` | Free-form label for history/session ownership, not a typed semantic question. | **No.** |
| `vision_inspect`, editing mutations, export | Explicit visual, mechanical or delivery operations. | **No Jev.** Jev is text-only evidence, not a visual model or editor. |

ProjectActor stays sole timeline authority. It does not store an active semantic brief, and it should not be changed to do so. Hermes's own reasoning is not observable until it chooses a tool; Sclip cannot automatically know the question it is considering.

## Narrow policy if an explicit interface is later added

No automatic eligibility rules are live today beyond `SCLIP_JEV_ENABLED=1` exposing the existing tool. The proposed **opt-in** interface would carry `{kind: 'semantic_source_discovery', media_ids, question, optional_source_scope}` as typed request metadata, not infer `kind` from verbs in a chat. Delegation would be allowed only when:

1. Jev is enabled in that disposable/opt-in Sclip process and a conservative spending allowance is available;
2. the caller explicitly requested semantic discovery/ranking, supplied a nonempty question, and selected 1–4 imported media IDs;
3. the selected media have cached transcript coverage; and
4. the request is not an exact timestamp read, full-transcript request, media-metadata read, visual/audio inspection, mechanical edit, or export.

The existing evaluator can then perform its **two already implemented responsibilities**: rank bounded transcript passages against that question and flag where surrounding context may be needed. Its source-fingerprint/request cache already avoids repeating identical unchanged evaluations. Return exact references, top-K plus coverage/uncertainty and an explicit advisory/non-exhaustive label. Keep original transcript resources and direct reads unmodified. Hermes must decide the story, expand/reject evidence, edit or abstain, and decide completion. Jev errors must leave the ordinary source path available. No fixed duration threshold or hard confidence cutoff is proposed without quality evidence.

For the current terminal-first product, that typed request would require a deliberately chosen user action (for example, “Find source moments” with selected media and a question) or another explicitly typed session request. It would also require a truthful delivery path into Hermes's context, separate from normal transcript responses. Neither exists today. Merely adding another hidden parameter to `get_media_context` would still depend on Hermes selecting it and would not solve the observed non-use.

## Why no production change was made

The tempting alternatives fail the stated constraints:

- Automatically evaluate the **initial chat prompt**: the active terminal path exposes raw PTY bytes, and prompts can contain mixed source, editing, visual and delivery goals. A pre-model classifier would guess and could create a mandatory paid first stage.
- Evaluate on **every overview or first transcript read**: those requests contain no semantic question. Supplying a remembered/free-text brief would be speculative; direct/full reads would gain unnecessary inference, cost and latency.
- Silently replace `get_media_context` results with a shortlist: this would violate exact-source access and could conceal the airport setup already missed by Jev's top 12.
- Delegate at **rough-cut application**: the ranges/story are already selected; Jev should not evaluate or alter mechanics.
- Change Hermes BM25/catalog/skill again: current live catalog, full schema and local search work. Previous one-line tradeoff counterfactual did not improve selection. No correction layer was demonstrated.

An explicit source-discovery request would automate bounded **capability** execution, not hook/story/pacing or workflow order. It would be optional alongside ordinary reads, leaving Hermes free to skip, revisit, or disagree. Implementing it before the request/delivery contract is defined would be new architecture rather than a small proven repair.

## Offline/runtime evidence and tests

- Built-app local-only MCP probe: Jev present with opt-in flag, absent with flag off; full required schema available; valid non-overlapping read-only Jev handler request returned `insufficient_evidence` without provider inference; subsequent original transcript read succeeded; timeline unchanged. **1/1 PASS**.
- Hermes's unmodified BM25 against the current built-app catalog ranked Jev first for three semantic/source-story queries, while ranking `get_media_context` first for a chronological-read query. `tool_describe` returned the expected five Jev fields. This proves a query *would* find it, not that Hermes chooses to query.
- Prior real provider receipts prove the existing evaluator can return ranked evidence and exact references: three successful full-source Jev batches cost **$0.000911694** in the shadow run. Mentor passages were surfaced at ranks 4 and 7. Much airport setup remained outside the top 12, so shortlist quality is **partial**, not an adequate replacement for original reads.
- In the latest completed Jev-enabled agent run, Hermes made 14 main calls and 0 Jev calls, reading all 140 original segments. A separate earlier **forced** directed run used Jev and expanded original evidence, but did not yield a quality-safe final range. No matched Jev-used-versus-direct saving is established.
- Focused Jev/source local tests: **35/35 PASS**. `npx electron-vite build`: **PASS**. Full `build:e2e`: **BLOCKED**, not passed, by missing offline Rust dependency `libm v0.2.16`; an earlier normal attempt failed DNS to `static.crates.io`. No production source was modified here. Existing bulk-tool code was untouched; no new bulk run was necessary for this no-change decision.

Because **no delegation was implemented**, the proposed offline tests “eligible semantic request automatically invokes Jev,” “direct/visual/mechanical request bypasses delegation,” and “Hermes consumes system-delegated evidence” cannot honestly be marked PASS. The existing optional tool/fallback paths were tested; the missing typed interface is the unresolved prerequisite.

## Free-model validation, cost and remaining uncertainty

No new free-model or Jev provider session was launched. The latest free Nemotron attempt had stopped before its main turn on `response_usage_missing`; the instruction here says to stop if safely accounted free responses are unavailable. A system-delegation A/B would also be invalid without a sound integration point. **New GLM calls: 0; new paid primary-model calls: 0; new Jev requests/spend: 0/$0.** That prior failed auxiliary request has unknown potential upstream charge and is not included as a known $0.

Thus Jev eliminated **no measured transcript reads** in this work. It also added no new inference calls. Unproven: whether an explicit source-discovery action preserves the best story after context expansion; Jev's latency and total primary-model token effect in a matched real session; GLM dollar savings; and whether the installed packaged Hermes contains the separate dirty deferred-call safeguard. Do not enable Jev globally or infer readiness for a full edit.

**Single next justified experiment:** in a disposable, local-only prototype, define a typed user-requested `semantic_source_discovery` action with media IDs and question, pass its output as explicitly advisory evidence to an otherwise unchanged Hermes source-only session, and test that direct/full source reads remain available. Only after that contract is validated and the free route is healthy should a small metered source-only comparison be attempted. This is not a new editing workflow or second agent.

**Architecture invariant preserved:** Jev narrows; Hermes chooses; deterministic code executes; Hermes reviews.
