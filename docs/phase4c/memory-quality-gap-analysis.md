# Phase 4C.2 — Memory quality gap analysis

Scope: source audit plus isolated offline probes, 2026-10-08. No production changes or real memory access. Verdict **B**, supported by specific failures below rather than an assumption that more infrastructure is needed.

## 1. Audited source map

Line references describe production revision `07419ec4`; documentation HEAD is `a9f80d76`. Paths are relative to the editor repository unless marked Hermes.

| Boundary | Source / function | What is actually implemented |
|---|---|---|
| Store / limits | `apps/desktop/src/main/sclip/creatorStyle.ts:9`, constructor 41–49, `mutate` 51–60 | Version-1 JSON; **global**, not per-creator, limits: 600 evidence, 100 preferences, 4 MB. Atomic local replacement; whole write refused on overflow. No migration/pruning. |
| Scopes / ownership | Same file `binding`, `sessionKey`, `relevantScope`, `relevantEvidence`, `home`, 62–84 | Creator, project and manually bound series; other creators get separate Hermes homes. Creator controls rotate a shared generation. Unbound projects default to local creator. |
| Retrieval | Same file `context`, 85–100 | At most eight preferences / three summarized observations; removes entries until payload approaches 3,600 characters. Policy header additional. Character bound, not tokenizer guarantee. Active status ranks before lexical relevance and project specificity. |
| Creator controls | Same file `user`, 102–165 | Explicit statements, approve/revise/disable/remove/reset and bindings. Explicit instructions create fresh evidence/preference IDs, including repeated text. Suppression does not free slots. |
| Model updates | Same file `agent`, 168–213 | Actual evidence IDs required; explicit/approved text protected. Candidates and counterexamples are Hermes-authored. No semantic validation or canonical merge. |
| Evidence capture | Same file `observe` / `observeChange`, 214–259 | Committed User changes become bounded deltas. Agent changes update proposal hashes, capped at 200 proposal entries. No automatic taste extraction. |
| Physical grouping | `creatorEvidence.ts:4–34`, `changedProperties`, `summarizeCreatorEvidence`, `canGroupAdjustments` | Adjacent unreferenced observations can group when creator/project/series/summary/properties/state chain match. Retains first-before/latest-after, count and latest eight operation IDs. Not proof of one gesture or shared taste. |
| Types | `apps/desktop/src/shared/creator-style.ts` | Evidence authority, scope, actor facts; preference origin/status/support/counterexamples/strength/timestamps. No preference version, semantic aliases, validity/supersession, capsules or forgetting tombstones. |
| Authoritative actor | `state/actor.ts`, commit/history and `mcpCall`; `state/ts-actor-host.ts:308–315` | Single timeline writer. Subscriber exception isolated; timeline can proceed when learning capture fails. |
| History | `state/history.ts:67–134` | Runtime undo snapshots default cap 200; known-effect lineage capped 4,000; reset on project replacement. Not a persistent cross-project learning archive. |
| Runtime integration | `main/index.ts:892–897,1294–1313,1335–1352`; `sclip/hermesBridge.ts:167–171`; `hermesTerminalRuntime.ts:60–118` | Store attached to commits; gateway appends request-ranked context. Native terminal stages context at open without future typed request; MCP can refresh using request. User memory controls stop sessions and rotate generation. Existing PTY may be reused rather than restaged. |
| Memory tool / reference | `creatorStyleTool.ts`; `creatorReference.ts` | Tool exposes context/detail/hypothesis/counterexample, not timeline operations. User-selected cached local reference observations retain relationship and intent; no new reference analysis in memory registration. |
| Skill / cost boundary | `skills/weftcut/SKILL.md:263`; `hermesRuntime.ts:339–342` | Canonical ledger guidance; do not mirror style into generic memory. Configuration guard rejects enabled automatic background review / curator model consolidation. |

### Hermes source checked directly

Checkout `/Users/adityasamant/SCLIP/hermes-agent-src`, revision `515354038a3c383b38b43aba6959ceddd858bb12`:

- `tools/memory_tool.py:148–220,390–448,562–680,682–692`: default 2,200 MEMORY / 1,375 USER characters, persistence, exact duplicate prevention, atomic batches, frozen loaded prompt snapshot.
- `agent/agent_init.py:1770–1805,1877–1888`: requested memory toolset can create builtin file memory even with skipped external providers. Legacy Sclip provider is inside the external-provider block.
- `agent/style_preference_engine.py:94–185,230`: legacy numeric clustering/winner values, fixed tolerances and weighting. Not suitable for activation as the new sole-editor-preserving learning system.
- `agent/style_memory_provider.py:109,175–232`: legacy consolidation/profile injection; a separate source of style authority if activated elsewhere.
- `agent/background_review.py:72–94`: background model review defaults must be explicitly controlled. `agent/curator.py:204–217` distinguishes optional model consolidation from its non-model maintenance.

The native terminal's `--ignore-rules` bypasses the legacy external provider, but not necessarily builtin memory. Generic-memory activation depends on configuration/toolsets. Existing policy discourages duplicate style writes; it does not technically delete old duplicates from generic memory or conversation history. No private profile contents were read to infer such duplicates.

## 2. What is correct today

- Local persistence, atomic writes and creator-scoped reads.
- ProjectActor remains sole timeline authority; learning cannot silently alter edits.
- Actual actor attribution and before/after facts, with limited, hash-based proposal relationships.
- Undo/restoration is explicitly uncertain; AI editing, saving and exporting do not count as approval.
- Creator controls retain explicit authority; Hermes cannot overwrite approved/explicit hypothesis text.
- Compact recall and on-demand details instead of injecting entire histories.
- Explicit series/project isolation and current-brief precedence in context instructions.
- No per-edit model calls; only foreground Hermes interprets candidate style.

This foundation should be preserved. Context availability and policy text do not by themselves prove obedience, taste inference or fewer corrections.

## 3. Confirmed weaknesses

| ID | Finding | Evidence | Consequence / priority |
|---|---|---|---|
| G1 | Capacity halts evidence intake and explicit preference admission | `mutate`; probes A/F | Long-term blocker. Writes stay safe, but future learning stops. Global capacity lets one creator's activity block another's admission. |
| G2 | Identical or paraphrased preferences need not converge | `user explicit`, `agent hypothesis`; B | 100 identical candidates fill all slots. Reusing IDs helps but has no semantic consolidation contract. |
| G3 | Support remains an accumulating ID list / raw snapshots | `agent support`; B | One reusable preference can retain 100 full evidence rows; no compact explanatory capsule. |
| G4 | Disabled can become retrievable again | `agent counterexample` sets `disputed`; G | Creator-control bug: model counterexample bypasses disable intent. Essential first fix in a later implementation. |
| G5 | Rewording/rescoping inherits old support without version revalidation | Existing hypothesis assignment and union of IDs; scope probe | Series A text evidence can support a different series B music candidate. Semantic and scope contamination. |
| G6 | “Supported” is a structural count, not validated editorial support | Two distinct manual/correction projects + current supplied non-undo evidence; E | Unrelated caption changes can label a music claim supported. Remains candidate, so not automatic approval, but label can overstate reliability. Old attached undo evidence is not comprehensively rechecked. |
| G7 | Conflicts lack validity/exception/supersession structure | Types and controls; C/G | Both old/new explicit tastes remain active; revised hypothesis retains old contradiction IDs. The model must repeatedly reason around stale context. |
| G8 | No durable forgetting lineage | Remove suppresses associated rows; no tombstone; G | Removed text can be recreated from fresh evidence. No proof of purge from generic memory or recalled sessions. New evidence versus resurrection must be distinguished. |
| G9 | Relevant contextual information can be displaced | `context` sorts active first; retrieval adversary | Eight unrelated globals exclude a matching project candidate. Long/conflicting text consumes bounded recall budget. |
| G10 | Context and response IDs do not describe one selection | `context` ranks then trims; `agent response` returns insertion-order last eight/six | A caller can receive metadata IDs different from those inside the actual packet; selection provenance should be unified. |
| G11 | Generic/native memory is a separate forgetting and authority boundary | Hermes initializer/snapshot; native probe | No claim that ledger reset clears all historic style. Existing context policy is advisory. |
| G12 | Shallow version-1 load and whole-document writes limit evolution | Constructor / `mutate` | Need validated migration, linked-record integrity, checkpoint recovery and CPU/I/O measurement before increasing sizes. No rewrite justified. |

Related risk: `approve` unsuppresses all supporting rows. Evidence shared with another removed belief may return as raw context. This is source-supported, not separately executed in this task. Suppression ownership needs explicit reasons rather than one shared boolean.

### Answers to the architectural questions

1. **Event log?** Partly: an observation log plus preferences, bounded by refusal. No automatic semantic condensation.
2. **Reusable preference?** A contextual, creator-relevant hypothesis grounded in attributable evidence or an explicit instruction; not merely a numerical change.
3. **How much support?** No universal number. Independent projects/time and contrary observations matter. Today's two-project label is not epistemic confidence.
4. **Unrelated changes separated?** Separate factual rows/properties, but hypothesis-to-evidence relevance is left to Hermes and can be mislabelled structurally.
5. **Equivalent preferences reconciled?** Only voluntary ID reuse; no exact canonical admission or semantic merge lifecycle.
6. **Changing taste?** User revision/counterexamples exist; no version-bound support or explicit supersession.
7. **Capacity?** Refuse write; observer warning; timeline continues. No ongoing admission policy.
8. **Weak crowding?** Noise occupies evidence slots; active irrelevant entries can displace relevant candidates.
9. **Paraphrases?** Can multiply; even exact duplicates do.
10. **Irrelevant token use?** Yes, despite bounded characters.
11. **Deleted/superseded return?** Disable revival confirmed; removal has no tombstone; overlapping memory remains a separate risk.
12. **Thousands of projects?** Evidence stops early; bindings and distinct explicit information also lack a long-horizon archive policy.
13. **Hermes duplication?** Possible conditional native-memory path; not proven in real private data. Legacy provider bypass differs from native file memory disablement.
14. **No continuous extra calls?** Possible with bounded factual maintenance and optional foreground interpretation. Continuous capture is achievable; automatic semantic learning with no foreground model is not promised.

## 4. Executed adversarial probes

`research/memory-probes.mjs` bundles **existing production** store/actor code into a temporary directory, initializes the existing local WASM evaluator, creates disjoint synthetic entity/operation IDs and asserts every requested edit changes state. All stores are temporary and removed afterward. Fetch is blocked. No model clients, user media, app process or provider credentials are used.

| Scenario | Executed result | Assessment |
|---|---|---|
| A — 10,000 mixed-property adjustments / 100 projects | 10,000 committed; 600 captured; 9,400 missed; 0 preferences; 2,084,535-byte ledger; ~111.7 s synthetic run | Fails continuous learning, preserves editing. Context 635 proxy tokens. |
| B — 100 recurring demonstrations | Same ID: 1 candidate, 100 support IDs/rows, reload preserved. New IDs: 100 identical candidates, 101st rejected | Compact belief count only with operator/model discipline; no convergence guarantee. Labels are simulated tool submissions, not learned meaning. |
| C — changed stated taste | Two opposite explicit statements both active | No automatic reconciliation. Retaining both is safer than deleting approved text, but requires contextual conflict handling. Gradual taste inference was **not** behaviorally tested. |
| D — three styles | Explicit series binding isolated all three; unbound context excluded series preferences | Existing scope machinery works. No automatic footage/category inference tested. |
| E — noise and misleading support | 1,000 effective adjustments plus attempted undo/redo: 600 records, 0 automatic preferences, 608 uncaptured observation events. Unrelated text facts yielded `supported` music candidate | No automatic taste pollution, but noisy capacity use and misleading strength label. Event count includes restorations, so differs from adjustment count. |
| F — capacity | 600 records blocked new explicit information and another creator's explicit information. Disabling did not free slots. Existing approved text stayed intact | Safe failure, unacceptable long-term intake. |
| G — control lifecycle | Disable hid text and rotated epoch; counterexample revived it. Remove hid old record; fresh evidence could recreate text. Revision retained old counterexample | Control/lineage gaps confirmed. |
| Retrieval adversary | Eight irrelevant active globals excluded relevant project candidate; 1,169 proxy tokens | Current ordering can spend context on inappropriate evidence. |
| Scope adversary | Candidate moved A→B, retaining A support, then labelled supported | Existing support must be validated against the new version/scope. |
| H — cost / workload arithmetic | 10/100/500/1,000-video projections; cached tokenizer; no inference | Projection, not production usage or provider quote. See research document. |

The initial A fixture accidentally overlapped seeded operation IDs across projects. That fixture result was discarded; the corrected measured run uses disjoint namespaces. Scenario A was preserved and reused while refining the smaller scope fixture, avoiding a second 10,000-edit run. There was no production fix or favourable-result selection.

Native Hermes probe verified temporary-file persistence, exact deduplication, successful atomic batch and rejection without partial write. It also verified **removed text remains in an already-loaded prompt snapshot**, while a new MemoryStore excludes it. This is expected cache behavior, not evidence that a new session ignores deletion.

### Reproduce safely

From the editor root, with existing local dependencies:

```sh
node docs/phase4c/research/memory-probes.mjs
/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python docs/phase4c/research/native-memory-probe.py
python3 docs/phase4c/research/memory-cost-projection.py
```

The cost script requires the previously cached `o200k_base` tokenizer at `.scratch/phase4c1/tokenizer-cache`; network access is blocked. Token counts are a proxy, **not** a verified Hermes/provider tokenizer. Current measured context examples: 315–1,169 tokens. No claim of an all-language maximum follows.

Artifacts: [store results](research/memory-probe-results.json), [native memory results](research/native-memory-probe-results.json), [cost projection](research/memory-cost-projection-results.json). Assertions passed, including assertions that demonstrate undesirable current behavior. They are research probes, not a declaration that production passes the proposed future acceptance gates.

## 5. Pending validation, not hidden successes

The proposed consolidation system has not been implemented or tested. Required later tests include paraphrase versus near-opposite meaning, independent versus repeated evidence, evolving exceptions, bound sweeps across many series, forgetting across resumed/compressed sessions, legacy imports, malformed-ledger recovery, and migration with approved information preserved.

No live behavioral result establishes compact knowledge convergence or reduced correction burden. No broad builds/release suite were rerun: this task changed only research artifacts. Existing production behaviour was exercised directly in temporary stores; syntax/diff checks apply to the new research files.
