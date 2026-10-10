# Phase 4B.2B — First editorial experiment plan

Status: **proposed, not implemented or run**. Based on the 2026-10-10 research and checkout `667c522d1ef48cb9fd288e9653f3a6f2a24af699`.

## 1. Decision

Test **one focused source/render-grounded speech-boundary decision pass by Hermes after initial assembly**. Use existing evidence and editing capabilities. The experimental change is a small skill procedure, with an observable decision record for evaluation. No new planner, critic, candidate-ranking model, semantic validator or timeline architecture.

Hypothesis: explicitly comparing the received meaning of the current opening, ending and relevant speech joins against omitted source context will help Hermes catch and repair incomplete thoughts that broad review instructions have failed to catch. This is a falsifiable behavioral hypothesis, not an established fix.

Manchester already had a story plan, source transcription, two actual rendered-audio inspections and a verified visual repair. The ending still stopped at “…the one he got against.” The full-source ASR timing made the nominal range appear more complete than the rendered transcript. The experiment therefore tests **comparison and judgment using actual-result evidence**, rather than merely requiring another audio-tool invocation. See [causal trace and uncertainty](sclip-editorial-gap-analysis.md).

It targets the earliest observed boundary-selection error through a recoverable post-assembly comparison. It does not claim to solve multi-take performance selection, argument construction or all publishability. A positive result warrants a later investigation of applying the same comparison during source selection; that is outside this first change.

## 2. Four approaches compared

| Approach | Expected benefit / current evidence | Inference and latency | Complexity / reuse | Failure risk / evaluation |
|---|---|---|---|---|
| A — stronger skills | A focused observable decision procedure could change how existing evidence is used. Generic “review the ending” already exists and is insufficient | More foreground deliberation/context; no separate model required | Low; existing skill/preload/review | Longer prose alone may do nothing. Compare actual decisions and resulting boundaries |
| B — source/candidate representation | Explicit alternatives could help imperfect multi-take creator footage; not demonstrated as Manchester's dominant failure | New grouping, delivery observations or summaries may add local/model work | Medium–high; reuse source index, but equivalence/performance representation is missing | Wrong groupings or rankings may bias Hermes; first measure candidate recall and choice on paired target-domain material |
| C — plan comparison | Could expose omitted essential points and competing structures before commitment | Additional foreground planning tokens/turns; multiple full assemblies unnecessary | Medium; `RoughCutPlan` already represents thesis/purpose/ranges | Polished plans can still hide bad boundaries. Current trace does not show absence of a coherent plan |
| D — rendered critique/repair | Actual audio reveals defects source projections miss | Local rendering/Whisper plus foreground interpretation | Low when reusing current tools; larger if adding a new review subsystem | Manchester already inspected output twice. More inspection without a decision can repeat the failure |

**Choose A as an operational comparison procedure using existing B/D evidence.** Do not implement the broader B/C/D systems together. The new element is a short keep/change/uncertain decision tied to actual words and source omissions, not a new factual evidence service or deterministic completeness score.

## 3. Proposed change and exact boundaries

### Future files to change

1. `skills/weftcut/SKILL.md`: revise only the existing **Purpose, editorial execution, and current-result review** section to point to a compact boundary-comparison procedure. Avoid duplicating the general editorial encyclopedia.
2. New `skills/weftcut/references/editing-knowledge/speech-boundary-decisions.md`: short procedure and a few general counterfactual examples, including an intentional abrupt ending and unavailable/contradictory recognition. No benchmark words, timestamps, cut lengths, genres or prescribed effects.
3. Acceptance-only fixture/parser under a new `apps/desktop/e2e/editorial-boundary-experiment/`: isolated skill-variant selection, collection of observable decisions and source/state references, and deterministic assertions. Preserve the existing acceptance runner's provider routing and clarification behavior. Use supported skill staging rather than altering normal runtime policy.

No production TypeScript/Rust contract changes are proposed for this first experiment. If staging cannot select a variant without global installation, establish the existing packaging/preload path in an offline fixture first; do not silently change the product to make the comparison work.

### Existing source and tools to reuse

| Component | Relevant source / responsibility |
|---|---|
| Source/context | `apps/desktop/src/main/sclip/sourceUnderstanding.ts`: `sourceSpeechContext`; `sourceObservationIndex.ts`; `get_source_speech_context`, `get_media_context`, `transcribe_clip` |
| Assembly/state | `roughCutPlan.ts`: `RoughCutPlan`, `validateRoughCutPlan`; `state/mutations/roughCut.ts`: preflight/compiler; `state/actor.ts`: authoritative commits |
| Current mapping | `timelineContext.ts`: `buildTimelineContext`; `editorialEvidencePacket.ts`: `buildEditorialEvidencePacket` |
| Actual speech | `renderedAudioEvidence.ts`: `inspectRenderedAudio`; `inspect_rendered_audio` and, where useful, `render_timeline_range` |
| Visual relation | `timelineTemporalEvidence.ts`: `inspectTimelineTemporalWindow`; current visual tools only if the selected concern needs them |
| Repair safety | `revisionLoopGuard.ts`: issue/evidence/mutation lifecycle; `evidenceModalities.ts`; `editorialRevisionAttempt.ts`; existing ordinary edits, transactions and rollback |
| Skill activation | `hermesTerminalRuntime.ts`: `HermesTerminalRuntime.ensure`; `autonomousReview.ts`: existing staged evidence/skill path; desktop skill-build scripts |

Abbreviated implementation paths after the first row share `apps/desktop/src/main/`. Do not add a speech-boundary tool simply to restate evidence already available.

## 4. Hermes procedure

After constructing an assembly that contains speech:

1. Reuse fresh actual rendered-speech evidence if already acquired; otherwise choose adequate localized opening/closing coverage. Hermes chooses any additional risky joins worth examining. Do not inspect every join by default.
2. Locate the corresponding source excerpts using current authoritative layer/source mappings. Inspect bounded speech immediately outside the selection where the received meaning is uncertain. Source words are fallible timing evidence, not a completion certificate.
3. State briefly whether the selected material establishes enough context and completes the intended thought, or intentionally leaves it open for the brief. Compare the actual rendered words with omitted context. Do not infer comprehension from punctuation or clean signal measurements.
4. Choose **keep, change or uncertain**. A keep decision may describe an intentional discontinuity. If recognition is unavailable or contradictory, do not claim successful semantic verification without adequate evidence.
5. If changing: Hermes chooses the issue, tool, all ranges/values and participating layers. Use existing review/checkpoint machinery as applicable. A transaction is optional. No automatic partner edit or A/V synchronization.
6. After the complete repair, acquire fresh relevant evidence and decide whether it worked, needs reconsideration/rollback, or remains unresolved. Keep existing bounded repair cycles. A technically clean edit can still be editorially unfinished.

A non-speech edit does not need this speech procedure. Current creative instructions can justify a cold open, intentional fragmentation, silence or an unresolved ending. The runtime does not enforce semantic choices or a mutation quota.

Source context already limits padding to 0–10 seconds on each side, total requested context to 60 source seconds and output to 12 KB. Narrow the request or use another bounded query when needed. Render review has a default 120-second resource ceiling, configurable up to 300 seconds; long projects need localized windows. Those are evidence/resource limits, not creative timing rules.

## 5. Observable input/output contract

This is an **experimental reporting shape**, not a new required ProjectActor schema. Collect existing receipts/results plus concise visible model decisions. Never request hidden chain-of-thought.

Input to Hermes remains existing tool output:

```text
current project/state identity
current layer IDs, timeline ranges, source IDs/hashes and source ranges
actual rendered-speech receipt: timeline range, content hash, transcript/words,
  measurement/recognition provenance and unknowns
surrounding source speech: before/selected/after, source coordinate space,
  recognition provenance and uncertainty
current brief and existing scoped creator context
optional relevant visual evidence
```

Observable decision record:

```text
boundary: opening | ending | selected_join
current state, affected layers and timeline/source ranges
evidence references + actual selected words
omitted context relevant to the decision, or none/unknown
decision: keep | change | uncertain
brief reason tied to viewer meaning and current request
if change: Hermes-selected alternative and actual tool arguments
post-repair evidence references + resulting judgment
```

The harness records what Hermes actually provides, including omissions; it must not fill in a missing rationale or invent a repair. Evidence-reference completeness is an evaluation finding, not a deterministic editorial verdict. Contradictions between source-ASR projections and current rendered recognition remain visible.

## 6. Agenticness and source authority

Hermes chooses the story, which additional joins matter, whether context is sufficient, whether a repair is justified, its tool/parameters and whether it succeeded. Alternatives include retaining the edit, extending/replacing/reordering material, another valid repair or stopping as uncertain. No infrastructure-ranked best take or mandatory caption/crop/rhythm treatment.

ProjectActor still validates technical legality and writes the timeline. Existing guards still reject stale state and require relevant post-mutation modalities for registered issues. Source evidence supplements current-result evidence; it does not certify the changed composition. Creator memory remains unchanged and the current brief retains priority. Evaluation profiles should disable style memory to isolate this experiment without resetting personal creator data.

## 7. Offline validation before any model run

Use synthetic media/state and fake observable decisions; no inference. These tests establish contracts and agency, **not real editorial improvement**.

| Fixture | Required result |
|---|---|
| Opening refers to omitted antecedent | Before/selected/after source evidence and actual rendered words remain available to the decision; no automatic trim |
| Closing selection ends before a thought completes | Actual-result evidence remains distinct from surrounding source; fake Hermes can select different legal repairs |
| Source timing projects a complete phrase, render recognition is incomplete | Both observations/provenance remain visible; parser cannot silently substitute source text for output |
| Coherent standalone opening / intentionally abrupt ending under current brief | Keep/no-repair is accepted; no forced completeness recipe |
| Missing or contradictory recognition | Explicit uncertainty survives collection; no fabricated successful verification |
| State changes after inspection | Existing stale receipt/state checks require reacquisition before repair/verification |
| Explicit coordinated repair vs intentional A/V offset | Only Hermes-supplied operations commit; offsets remain legal; verification follows full transaction |
| Speech repair with only visual reinspection | Existing modality gate rejects completion of the registered speech issue; fresh relevant rendered speech is accepted |
| Variant activation/restart | Actual isolated Hermes preload contains the intended variant; baseline and user profile remain unchanged |

Reuse focused tests `openingContext.test.ts`, `sourceUnderstanding.test.ts`, `renderedAudioEvidence.test.ts`, `evidenceVerification.test.ts`, `revisionLoopGuard.test.ts`, `rollbackCoherence.test.ts` and `hermesTerminalRuntime.test.ts`. Check `mcp.skill-conformance.test.ts`, `build-skills.test.mjs` and `after-pack-skill.test.mjs` if the skill bundle changes. Add only fixture/parser assertions missing from those contracts. Typecheck/build and `git diff --check` are implementation gates. Do not invoke provider-test globs to test this procedure.

## 8. Controlled editorial evaluation — separately authorized later

### Baseline and intervention

Freeze production/tool versions, provider route/model, fallback policy, source hash, natural brief, creator-memory setting and run limits. The only intended variable is the isolated skill procedure. Do not add boundary hints to the user's brief. Use one predeclared run per arm; no editorial retry or post-result patching. Model randomness remains a limitation.

The Manchester artifacts can be a read-only regression case, with all historic weaknesses preserved. They are not unseen or target-domain proof. Its historical run also predates current changes, so an old-vs-new result alone is not a controlled causal comparison.

For the decisive target-domain comparison, obtain consented raw educational/expert footage containing imperfect speech and genuine choices. Use the same source and natural brief for fresh baseline and variant. If available, obtain the creator's own final edit and explanation/correction notes for independent evaluation; keep them out of model context. Do not create an expected timeline, mandatory take choice or prescribed pacing.

### Separate unseen validation

Predeclare a second, previously unexposed educational/expert source and natural brief. Run matched baseline/variant in isolated new projects, neither seeing the other's output or evaluator notes. Each arm's first exposure is blind; after exposure the footage is retired as unseen. This is one held-out paired comparison, not two independent unseen samples. No sources or inference are acquired/run in this research phase.

If only the exposed regression improves, report regression improvement, not generalization. If suitable source-to-final notes are unavailable, limit performance-selection conclusions explicitly.

### Independent review

Inspect actual exports and exact source/project diffs after Hermes stops; never feed QA back. A consenting creator/editor can blind-review A/B where practical. Until that happens, no human assessment is claimed. Recognition and technical receipts are supporting evidence, not an LLM-only publishability score.

| Measure | How to assess |
|---|---|
| Story coherence / essential information | Source-grounded point/qualifier checklist prepared for evaluation only; assess logical progression and missing meaning |
| Take selection | Compare available delivery/context alternatives; acknowledge that this intervention does not add performance perception |
| Opening / ending / speech joins | Actual audio review, source context and rendered transcript; separately identify acoustic timing vs semantic completion |
| Pacing / visuals | Human viewer experience, motivated visual support and preserved useful pauses; not minimum cuts |
| Rendered defects / A/V | Decode/metadata, mappings, pair offsets, gaps/overlaps, affected audio and frames |
| Human correction burden | Necessary corrections and, if actually measured, correction time; record evaluator and uncertainty |
| Self-review | Actual evidence, observed decision, complete repair, fresh relevant verification and honest final judgment |
| Time / cost | Wall time, model/MCP calls, local inspection latency and provider usage; report every arm |

Quality success requires a supported improvement to targeted boundaries, no new meaningful speech/context/visual/A/V regression and lower necessary correction burden without degrading the story. Keep decisions can be correct; changed timelines are not inherently better. A mixed result remains mixed. One positive pair is progress, not proof of excellent autonomous editing across creators or genres.

## 9. Cost, latency and implementation size

Estimated implementation: **one–two focused engineering days**, plus source acquisition and human evaluation; not a delivery guarantee. The variant is a small main-skill addition and compact reference, ideally hundreds of words, not another thousands-word instruction dump.

No separate model session is inherent. Existing fresh rendered evidence should be reused. A planning envelope is 0–3 additional localized rendered-audio inspections and 0–3 source-context queries per edit; actual need depends on speech and uncertainty. Do not impose those as a creative quota. Local rendering/Whisper may add seconds to tens of seconds per window; benchmark on the actual machine rather than promising latency. Foreground deliberation can add turns and paid tokens.

Measure serialized context plus tokenizer counts when available. An initial overhead envelope of roughly 1,000–4,000 additional evidence/instruction tokens is a planning estimate, not measured consumption; repeated conversation input can bill the same context again. Report total across all requests:

```text
incremental cost = sum(extra input tokens × current input price
                     + extra output tokens × current output price)
                  + any separately billed inference
```

Verify prices/allowance immediately before later authorization. Freeze paid fallback and disable optional Jev retrieval and paid auxiliary calls for a Hermes-only comparison. Local rendering, deterministic validation and existing local transcription require no provider inference; foreground interpretation is not free merely because it uses the same session. No dollar forecast or live authorization is implied here. Current research cost: **$0.00 provider inference**.

## 10. Failure interpretation and rollback

- Fresh relevant evidence available, but Hermes ignores incomplete meaning or approves it: reasoning/editorial review hypothesis failed; do not automatically add infrastructure.
- Requested actual speech cannot be obtained: isolate the concrete evidence-path failure before attributing the result to intelligence.
- Source recognition wrong but render evidence resolves it: judge whether Hermes notices, rather than demanding a particular transcript or timestamp.
- Procedure produces mechanical expansions, loses a qualifier, harms pacing or conflicts with an intentional brief: reject the variant even if sentences become longer.
- Repairs cannot execute despite technically valid explicit operations: record the precise capability/ergonomics limitation; do not patch mid-test.
- Decision records become verbose without changing quality: remove the procedure; additional bookkeeping is not improvement.

Rollback is removal of the isolated variant/reference and restoration of the original skill bundle. Production state/memory schemas never change. Preserve before/after projects, rendered output, hashes, observable trace, decision records, metrics and independent QA; do not manually improve a failed result or erase it. Normal user profiles and installed assets remain untouched during the comparison.

## 11. Next implementation steps and verdict

1. Implement only the isolated skill variant and offline fixture/collection path.
2. Validate preload, provenance, technical safety and no-repair freedom without inference.
3. Obtain the two appropriate evaluation sources/briefs and separate bounded inference authorization.
4. Run the predeclared matched comparisons, inspect independently and retain or discard the variant based on quality.

**Verdict B — LIKELY BOTTLENECK IDENTIFIED; LIMITED VALIDATION NEEDED.** The single highest-leverage next change is making Hermes explicitly compare actual rendered boundary meaning with omitted source context and record a keep/change/uncertain decision before declaring readiness. Current tools support that experiment; research does not yet establish that the procedure changes real model behavior.
