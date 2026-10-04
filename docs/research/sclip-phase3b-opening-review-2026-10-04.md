# SCLIP Phase 3B.1 + 3B.2 — Opening Context and Actionable Review

**Outcome: opening PASS on this sample; live review-loop acceptance FAIL because the provider aborted before diagnosis/repair.** The deterministic action path passes. This is not a successful live repair demonstration. No other genre was run and no later feature was implemented.

## Implementation

Commit `7fd9f7d7` adds an opening-context procedure to the existing WeftCut skill: inspect the candidate opening's original transcript before and after its start, judge its meaning without omitted setup, then extend backward, select another passage, or restructure as needed. The brief determines the opening style; no viral-hook requirement, keyword rule, footage-specific sentence, timestamp, new model, or second editorial agent was added.

The existing `get_timeline_context` response now reads bounded surrounding transcript evidence through the production `get_media_context` route when inspecting the opening. It distinguishes omitted preceding source, selected words, and following source. It exposes actual text-layer content and separate layer counts by kind. Missing cached transcript evidence is explicit. Review validation checks the actual VideoClip count and requires located current-layer inspection evidence for actionable issues.

The existing session revision guard now limits initial diagnosis to four evidence calls plus one reasoned two-call extension, then moves into repair. It allows at most three issue cycles and three committed mutations per issue, preserves attempt counts, rejects stale timeline state, bounds additional pre-repair inspection, and requires relevant current-timeline reinspection before another mutation or resolution. Hermes chooses the issues and edits. The skill directs it to activate the guard, prioritize a few verified issues, checkpoint, repair promptly, and verify. **Activation still depends on Hermes calling `revision_control begin`; the aborted live review did not do so.** The deterministic guard can constrain an active session, but this run does not prove reliable autonomous activation.

## Tests and run protocol

- Typecheck: PASS.
- Six focused test files: **60/60 PASS**, covering opening evidence, transcript access, revision guard, actual MCP/ProjectActor repair, rough-cut contract, and skill installation.
- New synthetic opening examples preserve surrounding setup and exact selected words without making a deterministic semantic judgment.
- A controlled integration test supplies a located repairable tail issue, validates it, commits a real trim, rejects premature resolution, reads the changed layer bounds, then resolves it. This is scripted deterministic evidence, not a second autonomous model run.
- Tests reject wrong clip counts, issues without located inspection evidence, stale-state repairs, unrelated verification, and exceeding the bounded cycles.
- End-to-end build: PASS.
- A legacy inspection suite had 6 failures and 14 passes. Its old `Documents/1/Mega test` raw media is absent and its transcript directory has zero JSON files; those environment-dependent failures were not repaired in this phase.

The exact locked source SHA-256 is `43586606dedfcd16c4208860c8336d78e9f9c1de78b3d037170481a280fef857`. The original high-level prompt, source, 1080×1920 canvas, OpenRouter / `nvidia/nemotron-3-ultra-550b-a55b:free`, 50-turn first-pass limit, 18-turn separate-review limit, local perception and native export path were retained. External B-roll was disabled. Baseline first/reviewed projects, renders, traces, metrics and sampled frames were preserved: **25/25 recorded baseline file hashes remain unchanged**.

The first attempt failed after 114.1 s when NVIDIA's upstream service reported temporary overload after three internal retries. It had only imported the full raw clip and read source evidence; no editorial selection, cut or captions existed. That attempt is preserved separately. The single permitted infrastructure retry produced a complete first-pass timeline/render. Its review then also hit upstream overload and aborted. No further retry was made. The first-pass end-of-budget summary additionally failed with a Hermes `NoneType` parsing error; the saved edit and native render survived.

## Opening verdict — PASS

Baseline opening at source 129.48 s:

> They start building a bridge to like their success journey over here and then like also they get distracted And...

Phase 3B opening at source 0.21–7.31 s, from cached source words matching the saved first clip:

> Alright, so I want to spend a few minutes talking about the number one reason why people fail, okay?

The new opening establishes the subject without depending on an omitted antecedent. It is a straightforward tutorial opening, not an enforced viral hook. This is a positive single sample; it does not establish repeatability. No new major opening defect was observed. The overall edit still needs substantial human work.

## Before versus after

| Dimension | Baseline | Phase 3B first pass / saved reviewed state |
| --- | --- | --- |
| Opening/context | Begins mid-thought with unexplained bridge/referents | Clear topic introduction; **PASS** for the targeted opening |
| Content selection | 10 video/audio pairs, mentor/process/analogy material | 6 pairs; failure premise, mentor, analogy, application, close; some course-specific references still need context |
| Story coherence | Missing opening setup; one backward source jump | Chronological source ranges and better opening; downstream fragments remain, so coherence is not fully established |
| Pacing | 60.47 s, slightly above 45–60 s request | 55.87 s, within request; fewer/larger selected passages; no claim of independently heard rhythm |
| Continuity | Paired A/V, no main-video gaps/overlaps; speech cuts need review | Same mechanical checks pass; full audible continuity was not independently listened through end to end |
| Captions | 63 text layers; fragmented phrases | 53 text layers; fragmented phrases remain, serif styling differs; no overlaps detected; no segmentation redesign |
| Framing | Late face clipping in vertical crop | Late face clipping persists at 54.4 s; no framing architecture was implemented |
| Technical validity | Valid 1080×1920 H.264/AAC native render | Valid 1080×1920 H.264/AAC native renders; all six video ranges match their audio pairs |
| Review effectiveness | 18 turns, zero mutation, unchanged project | Aborted early, zero mutation, unchanged project; live acceptance **FAIL** |
| Publishability | NEEDS MAJOR HUMAN EDITING | NEEDS MAJOR HUMAN EDITING; opening improved, remaining context/caption/framing issues prevent publication |

The six source ranges are 0.21–7.31, 205.64–210.64, 425.6–438.9, 494.68–503.746667, 504.25–521.05, and 540–544.6 seconds (exact values are in saved projects/QA). Chronological source ordering alone does not prove semantic continuity. Sampled frames and actual caption text still show phrase fragmentation and late subject clipping. Audio measurement is mean -19.8 dB and peak -2.7 dB; this checks levels, not semantic audio continuity.

## Review-loop verdict — FAIL for live acceptance

The review completed five tool-bearing iterations (below its 18-turn limit), including two MCP timeline-context calls: an invalid guessed composition ID `root`, then the actual composition ID. It did not activate the revision guard, validate an issue, attempt a repair, or reinspect a changed state before upstream overload ended the session.

| Review measure | Baseline | Phase 3B |
| --- | ---: | ---: |
| Completed tool-bearing turns | 18 | 5; next provider request failed |
| CLI-reported tool calls | 36 | 10 |
| Verified issues submitted to validation | None in baseline workflow | 0 before abort |
| Attempted repairs | 0 | 0 |
| Successful timeline mutations | 0 | 0 |
| Verified improvements | 0 | 0 |
| Repair regressions | None; no repair | None; no repair |

The new first/reviewed project SHA-256 is identical: `e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`. The second render is a preservation of that unchanged state, not a repaired output. Deterministic tests prove the guarded action/reinspection mechanics; they do not substitute for the failed live acceptance. Provider failure prevents judging how this review would have proceeded with a healthy endpoint, and autonomous guard activation remains unproven.

## Cost and efficiency observation

| Measure | Baseline | Phase 3B retry that produced the edit |
| --- | ---: | ---: |
| First-pass turns | 50, limit reached | 50, limit reached |
| First-pass CLI-reported tool calls | 100 | 100 |
| First-pass runtime | 622.7 s | 530.4 s |
| Review turns | 18, limit reached | 5 completed, provider aborted |
| Review CLI-reported tool calls | 36 | 10 |
| Review runtime | 202.3 s | 73.7 s, aborted |
| Review timeline mutations | 0 | 0 |

The initial infrastructure failure adds 114.1 s and 20 CLI-reported tool calls. The shorter failed review is not an efficiency improvement. Monetary cost/credits were not measured. An audit of the existing Hermes CLI found that its displayed “tool calls” count includes both assistant tool-call messages and tool responses (`cli.py` counts either role); 100 displayed corresponds to 50 dispatched top-level tool operations in this trace, and 10 to five. The table retains the baseline's original reporting convention for comparison. Saved MCP events provide actual underlying tool names and outcomes.

Later Phase 3B.5 opportunities observed, without implementing them: repeated source reads, repeated schema discovery, invalid guessed composition/argument fields, and sequential per-clip framing/caption operations. Changing these now would confound the targeted sample.

## Regressions and recommendation

No review mutation occurred, so it introduced no project regression. Existing late framing and caption fragmentation remain; font styling changed in this sample, without enough evidence to call that a quality gain or regression. Provider overload and the first-pass summary parsing exception are new runtime failures in this comparison. A valid render and improved opening do not imply a publishable edit.

**Next recommendation: D — Address an unexpected blocker first.** Restore a reliable live provider execution path before assessing autonomous repair. A later review validation must also verify that Hermes activates the existing guard. No blocker fix, additional rerun, Phase 3B.3/3B.4/3B.5, or style-learning work was started.

## Artifacts and Git

Artifact root: `/Users/adityasamant/SCLIP V1/editor/apps/desktop/e2e/bench-results/phase3b-opening-review/`.

- [First-pass project](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/first-pass/project.json), [render](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/first-pass/edit.mp4), [metrics](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/first-pass/metrics.json), [QA and opening words](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/first-pass/qa.json), [sampled frames](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/first-pass/contact-sheet.jpg).
- [Saved reviewed-state project](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/reviewed-pass/project.json), [render](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/reviewed-pass/edit.mp4), [metrics](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/reviewed-pass/metrics.json), [QA](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/reviewed-pass/qa.json), [sampled frames](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/reviewed-pass/contact-sheet.jpg), [late clipped-face frame](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/reviewed-pass/frame-54.4.jpg).
- [First trace](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/first-pass.hermes-trace.txt), [review trace](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/reviewed-pass.hermes-trace.txt). Each pass folder also contains `mcp-events.json`.
- [Comparison](../../apps/desktop/e2e/bench-results/phase3b-opening-review/comparison.json), [baseline hashes](../../apps/desktop/e2e/bench-results/phase3b-opening-review/baseline-hashes.json), [failed infrastructure attempt](../../apps/desktop/e2e/bench-results/phase3b-opening-review/infrastructure-attempt-1/), [run status](../../apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/run-status.json).

Large artifacts remain local and Git-ignored. Implementation commit: `7fd9f7d7`. The benchmark harness/report are committed separately.
