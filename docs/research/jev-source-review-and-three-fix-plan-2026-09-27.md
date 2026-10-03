# Jev source review and Sclip's three reliability/cost problems

Date: 2026-09-27. Research-only follow-up; **no fixes implemented and no Jev inference run**.

## Conclusion

Jev is worth evaluating as a small, optional decision helper that Hermes can consult. It is not a replacement for Hermes, local Qwen, or the editor. Do not copy a demo's action controller into Sclip.

The three observed problems have narrower remedies that do not require Jev:

| Problem | Evidence-backed direction | Jev's possible role |
| --- | --- | --- |
| Expensive, growing context | Compact source discovery; scoped timeline reads; validate existing pruning and cache economics | Later: transcript passage ranking or evidence-retention advice |
| False visual reassurance | Conservative evidence parsing; reuse factual renderer geometry/pixel measurements; acknowledge unreliable semantic head judgments | At most: compare supplied claims against supplied facts; not independently inspect pixels |
| Terminal response characters in input | Existing Hermes background hint; test fresh/resumed/replayed sessions; targeted replay-query handling only if necessary | None |

**Recommended order of engineering attention, not an editing workflow:** validate these narrow fixes first. Then, if justified, evaluate one read-only transcript-ranking helper. Hermes continues choosing what to do, when to inspect, whether to edit, and when to finish.

## Scope and provenance

Read both supplied discussions completely. Their proposals conflict: one proposes an Ultrafast-style editing controller and style memory; the other rejects that controller and proposes an optional Hermes-called helper. This report evaluates both as ideas, not authorization to install them.

Inspected current Sclip code, installed Hermes code, official Jev documentation, and key implementation files in nine public projects. This is not a complete security audit of every repository. Public source was fetched as text, not installed or executed. No private media, transcripts, session history, or credentials were sent to Jev or another model service.

The previous [forensic report](</Users/adityasamant/SCLIP V1/editor/docs/research/sclip-phase2f-efficiency-vision-terminal-investigation-2026-09-27.md>) remains the source of the production-frame, local-Qwen, terminal-reproduction, and historical billing findings. Those live tests were **not rerun** here. New experiments here were offline historical pruning and transcript-size analysis.

The current dirty worktree was preserved. Installed Hermes was clean at `8fd95f5c75a97418c983be7baaa55a408bed206a`. No production files, Hermes core, profile, skill, model setting, actor, compositor, vision runtime, or timeline tool were changed. This report is the only repository addition from this research turn.

## 1. What Jev actually is—and what the discussion overstated

Jev answers bounded questions: choose an option, return a yes probability, or score against ordered levels. It does not generate explanations or free-form editing plans. Typed output constrains the **shape** of an answer; it does not make the answer factually correct. Its confidence is derived from its output distribution, not a Sclip-specific guarantee. [Primitives](https://docs.typesafe.ai/introduction), [confidence](https://docs.typesafe.ai/confidence).

The current direct model is `jev-1.13.0`. It is **text-only**: no images, audio, or video. Direct documentation permits 64k total request tokens but only 32k for state plus the longest question. Published input price is $0.042/million tokens; output is free. Customer-specific fine-tuning/LoRA is not offered. No public local-weight distribution was established in this review; public SDK/demo code does not imply an open-weight model. [TypeSafe model documentation](https://docs.typesafe.ai/models).

OpenRouter exposes `typesafe/jev-1.13` through its Decisions or System One APIs, billed through an OpenRouter key. These are **not ordinary chat-completions calls**. OpenRouter currently documents 32k state-plus-question context; use that conservative limit for a gateway experiment until verified. Pin versions and record the actual responding version rather than relying on a moving latest alias. [OpenRouter Jev documentation](https://openrouter.ai/docs/guides/community/jev).

Exact arithmetic, precise counts/timestamps, negation, and large irrelevant contexts are documented weak spots. Therefore Jev should not calculate transform coordinates, word boundaries, caption geometry, or timeline alignment. Independent questions can be batched, but dependent decisions still need refreshed evidence. [Model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [fan-out](https://docs.typesafe.ai/patterns/fan-out).

Jev would be an additional **cloud** processor even if the key and billing account are already OpenRouter. No customer training is not the same as zero retention; enterprise ZDR is separately described. Any later experiment needs an explicit data scope, secure existing credential access, and no transcript-bearing diagnostic logs by default. No such call was made here. [Data/legal documentation](https://docs.typesafe.ai/legal).

## 2. Cost/context: fix the large inputs before buying another decision layer

### What the old run proves

The historical GLM session made 52 successful main calls and returned 110 tool results, then hit a spending-limit error. It did not produce a final completion assessment/export. Cumulative main input was 5,311,253 tokens, of which 92.42% was cached. Peak request input was 158,695. Cached input still costs money.

Historical usage/rate metadata reproduces a **$0.9260574176 estimate** including title generation. This is not a provider invoice or proof of the user's total credit expenditure. The precise historical reasoning-effort setting was not established.

The large growth events were transcript/source responses and a full-track read—not Qwen output or screenshots. Eleven source-context responses occupied 230,951 saved characters, and the final full-track response occupied 89,059. Deferred tool discovery already worked; normal tool schemas were not all eagerly loaded. Tool-call batching already worked too. Adding another tool router or batching scheduler is not a proven remedy.

### New offline result A: compact transcript discovery

Decoded the ten historical transcript windows from the read-only session DB, including nested JSON inside the untrusted-result wrapper. Constructed an **experimental projection**, not a new production response:

- retain media ID, source range, transcript status and language;
- retain every segment's exact text and source start/end microseconds;
- omit word arrays and non-transcript modalities from this discovery view.

| Measurement | Result |
| --- | ---: |
| Segments retained | 149/149 |
| Word-level records omitted from this view | 2,735 |
| Original ten decoded result JSONs | 201,121 characters |
| Compact projection | 24,797 characters |
| Character reduction | 87.67% |

Both sizes use compact JSON serialization with Unicode preserved. They exclude the outer tool-result wrapper and escaping. This is **not an 87.67% reduction in total session tokens or dollars**. It is not a drop-in substitute for multimodal source context: audio pauses, frame references, metadata, and word timing were deliberately omitted.

The opportunity is a two-level evidence representation: inexpensive segment-level reading when discovering the message, exact cached word timing and other modalities when Hermes needs them. Preserve authoritative transcription/cache data and selected-range access. Do not truncate the source silently, replace exact timings with Jev estimates, or make the code select the story.

Current `get_media_context` supports overview and time-bounded range access; overview is not equivalent to the compact segment-text projection tested here. A future implementation would need a narrow, compatible detail option or equivalent existing response selection, with tests. It was not added. [Current MCP documentation](</Users/adityasamant/SCLIP V1/editor/docs/mcp.md:735>).

### New offline result B: 48k vs 80k vs 120k pruning

Ran the installed `ContextCompressor.prune_tool_results_only` on incremental, in-memory copies of the same 163 saved messages. Network was disabled; no session DB was attached to the compressor. Used the existing 20-message protected tail, 8,000-character large-result floor, 4,096-token minimum reclaim, and actual hysteresis logic.

The trigger proxy was each historical provider input count minus accumulated rough message-token reclaim. It is **not reconstructed wire input**. The historical future actions/results were frozen; no model evaluated the pruned context.

| Candidate trigger | Commits | First commit before call | Large results changed | Source results changed | Rough message-token reclaim | Final rough message tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 48,000 | 1 | 19 | 2 | 2 | 11,776 | 105,203 |
| 80,000 | 1 | 19 | 2 | 2 | 11,776 | 105,203 |
| 120,000 | 1 | 29 | 11 | 10 | 57,231 | 59,748 |

Unpruned final rough message tokens: 116,979. All variants preserved message count, user text, assistant prose, and the protected tail at commit time.

Why the surprising result: the early prune can only touch older eligible results, then requires substantial history growth before another cache-breaking rewrite. At the later 120k trigger, the transcript readings have aged out of the protected tail. That allows a larger single reclaim. **Lower threshold does not necessarily mean greater cumulative benefit.**

This corrects the earlier provisional preference for 48k. It does not prove 120k optimal. No evidence here establishes that early pruning would disrupt source understanding: much of the fresh source context is protected. Nor does unchanged text prove downstream task quality is unchanged.

The offline diagnostic is [available here](</private/tmp/sclip-prune-threshold-research-20260927.py>) while the temporary file remains. It imports the installed compressor; it does not implement a second compressor. The installed hysteresis is [here](</Users/adityasamant/SCLIP/hermes-agent-src/agent/context_compressor.py:3730>).

### Narrow implementation proposal—not applied

Use the existing dedicated profile writer to persist only the validated non-secret compression options. It currently rebuilds a limited YAML profile on launch, so manually editing generated YAML is not a durable fix. Do not create another settings database or import arbitrary old configuration. [Profile writer](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/sclip/hermesRuntime.ts:251>).

Prefer compact source discovery and scoped timeline reads before aggressive history removal. Test threshold candidates against source coverage, selected-boundary accuracy, caption access, refetches, and actual billed usage. Retained archive recovery must work with the real session store; the in-memory diagnostic does not test persistence/resume.

Measure **net** cost: main input/output + Jev/other helper charges + cache refill + extra refetches. Prompt-prefix changes can invalidate cached suffixes. A useful simulator accounts for the earliest changed position; do not import another provider's cache-write ratio. The old GLM uncached/cache-read rate ratio was approximately 5.38, not the 10/12.5 defaults used in some examples. [Reviewed simulator accounting](https://github.com/QuentinDanblon/pi-fast-jev-compaction/blob/679041b8511515c9a0fcebd617afebabd87ae7f6/tools/simulate-session.ts#L320), [its token model](https://github.com/QuentinDanblon/pi-fast-jev-compaction/blob/679041b8511515c9a0fcebd617afebabd87ae7f6/tools/token-model.ts).

The installed Sclip launcher does not explicitly persist reasoning effort. Installed Hermes resolves per-model/global settings, then provider default if unset. Do not diagnose an unproven extreme-mode setting or automatically reduce reasoning. Modern upstream compression documentation is useful context but differs from this checkout; installed code determines what Sclip actually does. [Local resolver](</Users/adityasamant/SCLIP/hermes-agent-src/hermes_constants.py:1312>), [upstream documentation](https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching/).

## 3. Vision: Jev cannot supply missing eyes

The prior forensic investigation established correct production composed frames and successful Qwen execution. The failure was false evidence, not a broken MCP/worker/capture path: visible eyes/head-top were cropped, yet Qwen described a complete head. The historic frame had a full-width black lower region covering 65.625% of pixels. Saved-state captures remained mostly black.

Balanced wording and a higher-resolution/longer local diagnostic did not fix this specific complete-head claim. The earlier good/bad caption A/B success cannot be generalized to reliable head completeness. Avoid either blanket conclusion: Qwen is not useless, and Qwen is not universally trustworthy.

### Two separate problems

1. **Parser overstatement:** `_parse_response` assigns high confidence based on answer length (>40 characters), not measured model correctness. Substring matching can report “center” for “not centered,” and visible-content keywords are not proof of presence. Positive clauses can win over contradictory negative clauses. [Current parser](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/vision/sidecar/vlm_worker.py:246>).
2. **Semantic perception failure:** the raw model answer itself wrongly says the full head is present. A better parser cannot recover facts that the model did not recognize.

### Smallest defensible repair direction

Keep raw observations and make ambiguous/contradictory structured fields unknown. Remove invented certainty; distinguish missing evidence from negative evidence. Test negation, mixed clauses, incomplete answers, and known-good as well as known-bad frames. This is a bounded parser correction, not a new VLM/prompt pipeline.

Reuse existing read-only renderer geometry to report canvas dimensions, actual layer footprints/intersections, and staged text/glyph bounds. Derive facts at the same inspected frame from the current render state; do not create a parallel geometry authority. ADR0049 matters: video top-left and text anchors differ, and a text box is not a glyph bound. Existing `CompositionNode` probes and geometry helpers should remain authoritative. [Text-fit probe](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/render/CompositionNode.ts:1013>).

Geometry can establish occupancy or text overflow, **not whether the head is complete**. Black-pixel measurements can establish black regions, not whether they are unintended: footage itself can be black, letterboxing can be intentional, and graphics can cover blank canvas. Handle rotation, crop, transparency, groups, unavailable staged assets, and unknowns explicitly. No fixed beauty score, safe-margin recipe, or issue-to-transform mapping.

Jev could compare a supplied claim with independently supplied facts—for example, “canvas fully occupied” versus a measured uncovered rectangle. It cannot validate the head from Qwen prose alone. Feeding it the false Qwen claim and asking whether framing is good would launder the same error through a second model. A typed confident answer would not constitute new visual evidence.

Do not promise that these small repairs solve semantic face/head inspection. Keep that limitation visible and require actual rendered-frame evidence when judging quality. No new tracker, auto-reframe, compositor, VLM, or creative controller is justified by this research.

## 4. Terminal: protocol lifecycle, not intelligence

The leaked characters `]11;rgb:0b0b/0d0d/1212[?1;2c` correspond to background-color and device-attribute responses, not arbitrary user text. The prior real-xterm/production-terminal reproduction showed live replies being consumed correctly, while historical query replay and delayed replies after Hermes's query deadline contaminated input.

That reproduction established a failure class, not which exact timing triggered the user's historical incident. Credit exhaustion itself does not generate terminal queries.

The narrow first proposal is the existing `HERMES_TUI_BACKGROUND=#0b0d12` hint, matching Sclip's current terminal background. Hermes already checks the hint before asking the terminal to discover its color. This avoids the unnecessary startup query without Hermes core changes. Test a fresh PTY, typing/paste, resizing, remount, and resume. [Hermes detection](</Users/adityasamant/SCLIP/hermes-agent-src/cli.py:3072>), [Sclip theme/input/history](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/agent/HermesTerminal.tsx:29>).

The hint alone does not neutralize query bytes already in saved history. If those still reproduce leakage, handle precisely those historical queries during replay using existing xterm parser hooks; preserve legitimate live answerbacks, keyboard/paste, and OSC setters. Do not drop all input during replay or strip all CSI/OSC data. [Official xterm hook documentation](https://xtermjs.org/docs/guides/hooks/).

Jev adds latency, a network dependency, and uncertainty to a deterministic protocol issue. It has no useful role here.

## 5. What the actual use-case code teaches us

All links below are pinned to the reviewed revisions. “Useful” means inspiration for a later bounded design—not code installed, proven Sclip performance, or a recommendation to copy a whole project.

### A. Browser Use — Jev Ultrafast

Revision `1231850a0bf1a0c0341fe408ef1668dbbfdfac46` (MIT).

- The decision state is page text and indexed observed controls; optional screenshots are recorded, not Jev visual input.
- It batches operation choice with speculative target questions and uses only the selected operation's answers. Targets cannot be invented outside the supplied candidates.
- It checks observation freshness before acting; pending decisions are consumed to avoid double execution. Uncertain execution failures are not blindly replayed.
- A separate flight example checks route/date/results. The agent's generic DONE path is not a universal independent success verifier.
- Its code-owned loop, browser-specific action priorities, stagnation guard, and budgets would become a new editor controller if transplanted. Do not do that.

Borrow bounded IDs, fresh evidence, and independent outcome checks. Do not borrow next-action ownership. Its limited browser speed comparison is not proof of better edited videos. [Agent](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py), [decision model](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py), [questions](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/questions.py), [flight verifier](https://github.com/browser-use/jev-ultrafast/blob/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/examples/flights.py).

### B. fast-jev-compaction

Revision `e3f262a7f4d42bd8dd32ced30d26176f7cb545b0` (MIT).

It asks whether to keep a tool call and its full result, preserves retained content verbatim, and maintains call/result pairing. The critical limitation is its evidence projection: **tool-result bodies are omitted**; Jev sees metadata such as success and character count, plus call arguments. State fitting can further abridge old text/arguments.

This is cheap structural selection, not informed evaluation of all discarded evidence. Verbatim retained messages do not make selection lossless. A truncated first 300 characters can omit the only relevant fact. Re-reading an old observation may return a different project state; deleted mutation history cannot be reconstructed by repeating the mutation.

Borrow pairing/provenance/pinning. Do not blindly prune Sclip evidence using this exact metadata-only view. [State projection](https://github.com/tamaratran/fast-jev-compaction/blob/e3f262a7f4d42bd8dd32ced30d26176f7cb545b0/src/state.ts), [pruner](https://github.com/tamaratran/fast-jev-compaction/blob/e3f262a7f4d42bd8dd32ced30d26176f7cb545b0/src/compact.ts).

### C. system-one-connector

Revision `2124fe6aa247090b89e024261bbf9a69103bb1a4` (MIT).

A read-only MCP evaluation tool is a good demonstration of letting an existing agent call Jev. However, its `items` mode makes a separate provider request per item; this is not the same as batching independent questions over one shared state. It supports abstention, but its derived Noul confidence is adapter-specific. Unexpected answer shapes can pass through as raw JSON, so transport success is not decision validity.

Some connector limits differ from current official API limits; use the provider contract. A standalone connector would also add a process/configuration path, and Sclip's generated profile currently configures only WeftCut. Do not install it or embed a key in MCP JSON just for inspiration. [Tool implementation](https://github.com/itsmostafa/system-one-connector/blob/2124fe6aa247090b89e024261bbf9a69103bb1a4/cmd/evaluate/tools.go), [HTTP client](https://github.com/itsmostafa/system-one-connector/blob/2124fe6aa247090b89e024261bbf9a69103bb1a4/cmd/evaluate/client.go).

### D. hermes-jev-context-engine

Revision `f1869f4da94f55f0acdca5919bb082dbac05927a` (MIT license file).

This is an actual Hermes context-engine plugin, not a default Hermes feature. Activation replaces the compressor. Its window-based 75% trigger would still be far above Sclip's historic 159k peak on a 1M window; it does not itself solve early cost growth. It inherits a no-op cheap-prune hook rather than the installed compressor's proactive behavior.

Its fallback truncates long middle-message strings without restricting the operation to tool roles; user/assistant prose can be affected outside the protected edges. Tests using host stubs do not prove Sclip session/archive compatibility.

Conclusion: useful integration reference, **not a safe drop-in recommendation**. Keep the existing compressor for the first fix. [Engine](https://github.com/dryob/hermes-jev-context-engine/blob/f1869f4da94f55f0acdca5919bb082dbac05927a/jev/engine.py), [state](https://github.com/dryob/hermes-jev-context-engine/blob/f1869f4da94f55f0acdca5919bb082dbac05927a/jev/state.py).

### E. pi-jev

Revision `cd168457a8b340352d1ae1e9e4785305954b5751` (MIT).

The examined files implement model difficulty routing and compaction decisions. Missing/low-confidence results can conservatively preserve state. A compatibility trap: code treats scores at or below 1 as normalized, although the current API's ordered score uses level indices. On a three-level scale, index 1 is the middle—not maximum difficulty. Avoid guessing units from numerical magnitude.

Borrow conservative unknown handling and explicit contracts. Do not import automatic main-model switching or claim every advertised integration is tested for Sclip. [Routing](https://github.com/iefnaf/pi-jev/blob/cd168457a8b340352d1ae1e9e4785305954b5751/src/routing/decide.ts), [compaction](https://github.com/iefnaf/pi-jev/blob/cd168457a8b340352d1ae1e9e4785305954b5751/src/compaction/decision.ts).

### F. pi-fast-jev-compaction

Revision `679041b8511515c9a0fcebd617afebabd87ae7f6`.

Its simulator explicitly charges cache-prefix rewrite penalties and offers conservative accounting excluding ambiguous message details. This is a useful evaluation pattern. Its local character/image token estimator, provider ratios, and frozen historical trajectory are assumptions—not Sclip billing measurements. The simulator itself calls Jev unless decisions are cached; it was **read, not executed** here.

Borrow the net-cost methodology, not its thresholds, provider ratios, or claimed savings. No code-copy licensing decision is needed for this research-only use. [Simulator](https://github.com/QuentinDanblon/pi-fast-jev-compaction/blob/679041b8511515c9a0fcebd617afebabd87ae7f6/tools/simulate-session.ts), [token estimator](https://github.com/QuentinDanblon/pi-fast-jev-compaction/blob/679041b8511515c9a0fcebd617afebabd87ae7f6/tools/token-model.ts).

### G. Macbrow

Revision `aa2041912d1b747134986f795c1d595e86a8b2f3` (MIT).

The router selects from available tools and batches candidate enum-argument questions. It consumes only the selected tool's speculative arguments; free text requires a second span-selection call. This demonstrates constrained extraction from user-provided text.

Its confidence constants and computer-control workflow are application-specific, not transferable creative policy. Do not import generated AppleScript/actions or its code-owned task/confirmation/learning loop. A relevant Sclip analogy is selecting an existing transcript candidate ID, not generating timeline coordinates. [Router source](https://github.com/timpratim/macbrow/blob/aa2041912d1b747134986f795c1d595e86a8b2f3/macbrow/router.py).

### H. jev-memory

Revision `ef3d199ee2889a3397fa0e1c30ceb0d1d7aaeb85`.

The caller supplies candidate fact text; Jev gates durability, scores retrieval relevance, and assesses staleness. It does not create memories by generating facts. Its budget selector preserves pinned records and reports pinned overflow, then greedily selects relevance per estimated token. Shortness can beat context completeness under that heuristic.

This is useful inspiration for explicit pinning/provenance, not permission to start creator-style learning. A one-off caption change is not automatically a durable creator preference. No LICENSE file was found in the reviewed repository tree; obtain a clear license before copying its code. [Gates](https://github.com/NicolasMontone/jev-memory/blob/ef3d199ee2889a3397fa0e1c30ceb0d1d7aaeb85/src/gates.ts), [budget selector](https://github.com/NicolasMontone/jev-memory/blob/ef3d199ee2889a3397fa0e1c30ceb0d1d7aaeb85/src/budget.ts).

### I. jev-engineering

Revision `e24d02338af38186daa7213dff8f3d036a9aa318` (MIT).

Its safety hook evaluates hard policy rules before model judgment and can run in observe mode. State construction intentionally avoids using an agent's own persuasive reasoning as evidence for authorizing its action. On model failure it returns to normal permission handling; that is not an automatic permission bypass.

Borrow the shadow-test discipline and separation of proposal from factual evidence. Do not install another permission gate or import risk thresholds as editing-quality rules. [Gate source](https://github.com/eugeniughelbur/jev-engineering/blob/e24d02338af38186daa7213dff8f3d036a9aa318/jev_gate.py).

## 6. The most promising first Jev experiment

### Read-only transcript passage ranking, chosen by Hermes

This is the strongest fit: text is the actual input, IDs are bounded, and wrong answers need not mutate the project. The official reranking cookbook provides a candidate-shortlist pattern, but its retrieval benchmark is not evidence of editorial quality. [Reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe).

Proposed behavior, **not implemented**:

- Hermes decides it wants help comparing relevant transcript passages for the user's brief.
- The helper receives the brief and compact, exact candidate text, including enough adjacent context to detect missing setup/payoff. Candidate IDs map to authoritative source ranges.
- Independent questions assess relevance/completeness against the supplied goal. Preserve “none adequate”/uncertain outcomes; no forced winner.
- Return a bounded shortlist plus probabilities and provenance. Do not return invented quotes, new timestamps, editing instructions, or beauty scores.
- Hermes reads the evidence, chooses or rejects suggestions, and uses existing ordinary tools if it wants to edit.

Jev does not choose the next category, perform cuts, change transforms, advance a stage, or issue STOP. ProjectActor remains the only mutation authority. No controller, reviewer agent, new timeline, new settings store, or mandatory skill sequence.

A secondary candidate is **shadow-only context retention evaluation**. Before using it to remove evidence, compare its selections with known needed source passages, latest mutation facts, unresolved errors, and human-labeled future questions. Include actual relevant result text or faithful bounded excerpts—not only “ok, 23k chars.” Keep provenance/state version and archive recovery. Existing deterministic pruning is the baseline, not something Jev automatically replaces.

Claim-versus-fact checks may be useful later, but not as independent vision. Skill routing is low priority: Sclip already has confirmed WeftCut loading, and choosing among a large skill catalog is a different problem. [Official skill-suggestion experiment](https://docs.typesafe.ai/cookbooks/skill_suggestion).

### What not to build

No Jev reflex editor loop, automatic main-model cascade, permanent creator memory, auto-reframe, transform lookup table, “confidence > 0.8 means mutate,” automatic completion gate, or per-turn external action chooser. No more architecture merely because a model makes a poor creative judgment.

## 7. Small validation plan before any new full benchmark

1. **No-Jev reliability changes, separately authorized:** parser tests/factual inspection evidence; terminal fresh/replay tests; compact-source coverage and durable profile compression settings. No full creative run needed to verify these mechanics.
2. **Offline cost replay:** retain the 48/80/120k comparison, exercise actual archive/resume separately, compare cache-invalidated suffixes and refetch requirements. Do not optimize solely for minimum prompt bytes.
3. **Optional paid Jev shadow test, separately authorized:** use a small labeled set of transcript candidates. Include misleading self-contained snippets, negation, irrelevant passages, and insufficient context. Compare compact-text/no-Jev baseline, Jev, and Hermes selection. Measure main calls avoided, total charged usage, wall time, and lost context—not only Jev latency.
4. **Only if the helper adds value:** one controlled small Hermes task, same main model, skill, task wording, permissions, and turn budget. Helper availability is the experimental variable. No forced tool usage/action order, no extra reminder given to just one arm, and no automatic edits. Judge independent completion and defensible saved state.

For scale only: 25,000 billable Jev input tokens at the published $0.042/million price would cost $0.00105. This does not imply a cheaper Sclip session; several helper calls, longer context, refetches, or unchanged main-call count can erase the benefit. Use reported provider usage/cost. Pricing/limits are time-sensitive.

No experiment above was paid/executed in this turn. No full Phase 2F, export, commentary/product case, or style-learning work occurred.

## Final recommendation

**Fix proven deterministic/integration defects without Jev. Reduce verbose evidence before adding a classifier. Then test Jev as a helper Hermes may consult, with narrow text inputs and no creative authority.**

Research has identified a plausible use—not proven better Sclip videos or lower end-to-end cost. The next smallest engineering step is the narrow no-Jev reliability patch and its isolated tests, after approval of that scope.
