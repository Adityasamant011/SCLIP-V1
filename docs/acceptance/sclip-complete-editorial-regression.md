# Sclip — complete editorial capability regression

Date: 2026-10-10. **Verdict B — MOST CAPABILITIES WORK; INTEGRATION GAPS REMAIN.**

Core execution has substantial current offline/runtime evidence. This is **not**
a bug-free claim or successful autonomous editorial acceptance. The single free
model session produced no edit. Strong-model quality remains untested within
this task's $0.15 ceiling. **Paid cost $0.00.** No subsequent inference or quality
patch was performed.

## 1. Revisions and scope

- Started at `d84ebf87`, branch `sclip/product-validation`, version 0.1.8.
- Actual production build/live model used `0d32aba3`: only display labels and
  documentation/fixtures changed. Actor, skill, perception and review architecture
  were unchanged. Additional audit-fixture correction: `e6698d65`.
- New exercised acceptance fixtures: `7ac801c6`. This report/inventory are a
  separate documentation commit; their commit is available in the final Git log.
- Desktop/CLI/skills/WASM builds passed. Native source/addons were unchanged;
  current installed native artifacts were exercised, and Rust source suites ran.
- `/Applications/Sclip.app` was **not replaced**: display-only changes do not
  require replacement to verify functionality. Its packaged app was tested with
  disposable profile data. All **12 normal skill files** match the rebuilt normal
  bundle byte-for-byte; this does not assert every compiled app file is at the new
  display-label commit.
- Existing dirty `apps/desktop/e2e/acceptance-routing/run.mjs` was preserved,
  SHA256 `f52bf99b33f8fd7fca2272e24acd4c51c53a48aa94ffa4a80e400f4236c17176`.
  User projects, settings, credentials and creator memory were not changed.

Read current implementation alongside Phase 4A product acceptance, Phase 4B
self-review/free-smoke/release-health reports, Phase 4B.2A gap research,
Phase 4B.2B implementation and Phase 4C consolidation documents. Historical
Manchester/product/free-model results are context, not execution evidence for
this checkout or this session.

## 2. Complete dynamic inventory

**116 unique tools** were obtained from the actual built app's live MCP
`tools/list`, not a historical count. Full descriptions and schemas:
`.scratch/complete-editorial-regression/local-tool-health/live-catalog.json`.
The companion [machine-readable inventory](sclip-capability-inventory.json)
maps **every registered name** to current entrypoints, dependencies, source skill
references, test references and verification status. Literal test/document
references are not assertions that those tests execute that capability.

Production routes: `main/mcp/server.ts` + `mutationTools.ts` combine native
catalog, TS definitions, motifs and evidence tools. TS edits route through
`state/mcp-commands.ts` to `state/actor.ts` and `state/mutations/*`; hybrids run
native computation then commit through the same actor. Rust tools live in
`apps/desktop/native/src/mcp/tools.rs`. No second timeline authority was added.

`add_audio_layer` is **not registered**. Audio insertion uses `add_media_layer`
with an Audio media item; `add_video_layer` provides its documented paired A/V
insertion. Full export is intentionally a UI capability, not `export_timeline`
in the MCP catalog; `render_timeline_range` is a real bounded production export.
Optional external-media tools and paid `evaluate_source_passages` are conditional,
not silently missing core tools. Both were disabled for the agent session.

### Capability matrix

P = PASS; PT = PARTIAL; F = FAIL; NT = NOT TESTED; NA = NOT APPLICABLE.
“Connected” means production route/dependencies are exposed, not that invocation
alone demonstrates usefulness. Offline actor tests establish state behavior;
real-render fixtures establish a narrower observable output. No editorial MCP
capability was agent-used in this run: NT is deliberate, not a discovery failure.

| Capability | Implemented | Connected | Executed offline | Agent used online | Output quality | Current evidence / limit |
|---|---|---|---|---|---|---|
| Import, identity, metadata, derivatives | P | P | P | NT | P technical | Real MP4 import, managed paths, native derivatives; saved media exists |
| Source ASR, segments/words, captions | P | P | P | NT | PT | Actual local Whisper → editable captions → 10s portrait export; no calibrated word-perfect accuracy claim |
| Source context/mapping | P | P | P | NT | NT editorial | SourceUnderstanding/context tests, real source map preload; omitted evidence explicit |
| Audio peaks, pauses, RMS/peak | P | P | P | NT | P measurements | Native suites, rendered production PCM; measurements do not establish meaning/emotion |
| Source visual observations | P | P on this Mac | P | NT | PT | Six actual source sample observations in initial packet; coverage sparse/model-fallible |
| Composed visual/temporal inspection | P | P on this Mac | P | NT | PT | Actual local Qwen per-frame observations + compositor; two sampled instants do not certify continuous motion |
| Configurable `describe_clip` VLM | P | PT | PT | NT | NT | Separate configured VLM endpoint, not proof from local timeline Qwen alone |
| Long-source chronological retrieval | P | P | P deterministic | NT | NT | Cached bounded segment/range windows; no best-take ranker |
| Paid semantic retrieval | P optional | NA disabled | P mocked | NT | NT | No Jev inference; no calibrated relevance/quality proof |
| Music/emotion/continuous motion/best-take understanding | PT | PT | NT | NT | NT | Signal/frame primitives exist; no complete semantic capability established |
| Evidence + normal skill reach Hermes | P | P | P | P | F task completion | Final response quotes exact initial state/source facts, but ignores editing tools |
| Story, range choice, speech-boundary judgment | P as Hermes procedure | P | PT fake decisions | NT | NT | Fake authored plans prove integration, not editorial intelligence |
| Add/delete/trim/split/move/tracks/composition | P | P | P actor/native | NT | P technical | Broad actual actor/native suites + live plan/ripple and export |
| Linked A/V, intentional offsets | P | P | P | NT | P technical | Pair receipts, ripple behavior, atomic/stale/intentional-offset tests |
| Undo/redo/checkpoints/rollback | P | P | P | NT | P state | History-panel E2E, rollback grounding suite; runtime history resets on workspace reopen |
| Atomic multi-step repairs | P | P | P | NT | P technical | Whole-batch validation/rollback; verification follows entire transaction, not individual members |
| Save/export/reopen | P | P | P | NT | P technical | 3s production H.264/AAC export + exact reopened authored layer/caption state |
| Caption correction/properties/CJK | P | P | P | NT | PT | Broad correction tests, CJK export, speech-caption fixture; model proofreading untested |
| Crop, position, scale, pan/zoom/keyframes | P | P | P actor/render | NT | P technical | Transform/animation suites, fit metadata validation, color/keyframe E2E |
| Effects/color/chroma/sharpen | P | P | P | NT | P technical | Effects fixtures, undo/persistence; no claim every combination/platform rendered |
| Transitions | P | P | P | NT | P technical | Crossfade/wipe preview/export and downstream-transition ripple guard |
| Graphics/Motifs | P | P | P | NT | P technical | Animated motif render changes, install/schema/state suites |
| Supplied local support media/layout | P | P | P actor | NT | NT editorial | Normal media placement/layer/track tools; no external sourcing used |
| Audio insertion, gain, trims/fades/roles | P | P | P actor/render | NT | P technical | Audio/state/keyframe/native suites and bitrate/mono/range export checks |
| Rendered audio continuity evidence | P | P | PT | NT | PT | Real mix metrics succeed; tone-fixture ASR times out explicitly, not valid speech evidence |
| Local speech synthesis (`synthesize_speech`) | P | PT | F | NT | NT | Three reproducible Kokoro/local TTS timeouts; optional capability unresolved |
| Localized actual range rendering | P | P | P | NT | P technical | Live MCP 3s export; full decode/probe confirms video/audio |
| Technical critique | P | P | P | NT | PT | Layout checks; “clean” is not semantic/editorial certification |
| Issue/repair/fresh verification | P | P explicit review | P | NT | P guard / NT judgment | Real MCP caption repair, early completion blocked, fresh text receipt accepted |
| Automatic ordinary-edit guarded review | PT | PT | PT | F this session | NT | Explicit review initializes guard; ordinary editing must voluntarily enter it |
| Creator attribution/grouping/controls | P | P | P | NT | P infrastructure | Real GUI correction + normal production terminal fixture, installed/workspace restart/isolation |
| Compact creator knowledge/cross-project preload | P | P | P | NT | NT taste | Actual native Hermes preload; fake interpretation is not behavioral learning proof |
| Boundary experiment baseline/intervention | P | P isolated | P | NT | NT | Both actual Hermes preloads/restarts verified offline; no matched A/B or global promotion |

The per-tool inventory is conservative: tools not individually exercised through
real transport/output are PT even where broad actor tests and a fake handler
fixture pass. It is not “116 tools fully accepted.”

## 3. Current execution architecture and limits

Source: `sourceUnderstanding.ts`, `sourceObservationIndex.ts`,
`sourceUnderstanding` speech-context functions and media resources combine actual
metadata/cached transcripts with bounded observations. Missing transcript/audio
modalities stay unknown. Whisper word timing can be backend-derived/interpolated;
transcript recognition is fallible. Local MLX Qwen sampled frames do not establish
continuous motion, emotional delivery or the best take.

Evidence: `editorialEvidencePacket.ts`, `timelineContext.ts`,
`timelineVisualEvidence.ts`, `timelineTemporalEvidence.ts` expose authoritative
state/source↔timeline mapping, A/V relationships, text and separately labelled
model observations. Source timestamps are not silently used as timeline times.

Review: `revisionLoopGuard.ts`/`editorialRevisionAttempt.ts` enforce current-state
receipts, declared modalities, bounded diagnosis, transaction boundaries and
rollback/regrounding. `hermesTerminalRuntime.ts`/`autonomousReview.ts` initialize
this only for **explicit review mode**. Ordinary edit sessions preload evidence
and have skill guidance, but do not automatically activate the guard. The live
model did not enter it. No global review behavior was changed for the test.

Three different things must not be conflated:

1. Hermes generic auxiliary memory/skill review: disabled in tested profiles.
2. Sclip `BackgroundReviewer`: existing layout/local observation/legacy narrative
   summary, exposed via `get_timeline_critique`; does not commit editorial repairs.
3. Foreground Hermes editorial review with revision lifecycle and typed receipts.

Source audit also found that the optional `SCLIP_JEV_ENABLED` flag gates the public
source-passage tool, **but the legacy BackgroundReviewer receives `jevDecide`
unconditionally** in `main/index.ts`. Its narrative path requires at least two
video clips and inline transcript words; normal cached speech is not equivalent
to that legacy shape. No Jev request occurred here (empty agent timeline and
keyless synthetic fixtures); provider usage did not change. Do not treat that
flag alone as proven universal paid-background isolation for arbitrary projects.
This dormant/legacy integration needs a focused follow-up, not another reviewer.

Creator store: `creatorStyle.ts`, `creatorMemory*`, `creatorStyleTool.ts` and
terminal launch context retain creator/scoped authority, bounded fact admission,
version/control protection, explicit brief precedence and protected instructions.
The real GUI correction was attributed User and linked to the prior Agent proposal;
manual-only changes were not fabricated as acceptance. Cross-project restart,
disable/reset and actual native Hermes context worked on disposable profiles.
No claim that a real model learned taste follows from those tests.

## 4. Minimal fixes and misleading fixtures

| Finding | Fix / classification |
|---|---|
| Current creator-memory tool absent from audit allowance/docs/UI labels | Added current tool, English/Chinese display labels and MCP entry. Focused checks pass. Production changes only label strings |
| Four false legacy handler failures for transcript/subtitle/pause/shot hybrids | Fake host lacked current `mcpHybridDeps`; provide same fake deps through current interface. No production change |
| Speech-caption E2E references missing private media and obsolete setup | Optional approved source/output paths; configure existing local Whisper directly in disposable speech store. Actual transcription/export passes |
| Acceptance app startup drops extra isolated cost/routing fields | Preserve failed pre-inference attempt, apply isolated controls after normal startup, retain generated prompt/MCP settings, verify resolver/auth before CLI. Acceptance-only fix |
| `calculate_video_fit` legacy fixture fails | Fixture video omits dimensions. Current schema rejects correctly; not proven production regression |
| `import_external_media` legacy fixture fails | Deliberately nonexistent candidate without search-cache result. Expected prerequisite rejection; optional tool disabled in real run |
| Three local TTS synthesis tests time out | Reproduced with normal OS/network access; direct worker diagnostic also did not complete. Cause not established; no speculative production patch |

The older handler fixture now records **95 PASS / 11 BLOCKED / 2 FAIL** across
108 fixture entries. This is a fake-backend/actor audit, not the current live
catalog or 95 full native acceptances. Its two FAIL entries above are bad fixture
inputs; BLOCKED prerequisites are retained transparently in the artifact.

## 5. Tests, builds and exact outcomes

Logs all under `.scratch/complete-editorial-regression/`; counts are per invocation,
not summed into inflated unique totals.

| Invocation | Result |
|---|---|
| Initial broad desktop TS suite, sandbox | 604 files: 591 P / 11 F / 2 skip; **8,040 P / 34 F / 25 skip** |
| Broad desktop TS rerun with required OS/loopback/network access, excluding already-run capacity file | 603 files: 599 P / 2 F / 2 skip; **8,070 P / 4 F / 22 skip** |
| Final tool/catalog/docs/labels focused check | **8 P**, 3 files; resolves the broad run's stale-label failure |
| Final legacy hybrid-fixture check | **1 P**, 1 file |
| Review grounding/runtime/automatic initialization/rollback focused | **37 P**, 4 files |
| Local dependencies targeted rerun | **12 P / 3 F**; all three failures are local TTS synthesis timeouts |
| Node script/offline acceptance tests, actual OS access | **101 P / 0 F / 0 skip** |
| Actual installed-source Hermes memory tests, network blocked | **3 P**; explicit store/update/restart/delete/native preload |
| Observable-session exporter Python | **1 P** |
| Rust engine library | **613 P / 0 F / 1 ignored** (live vision opt-in) |
| Rust evaluator | **59 P / 0 F** |
| Rust decode | **58 P / 2 F / 1 ignored** under sandbox; both hardware-context failures then **2 P** under OS access |
| Electron finishing/history/audio/effects/transition/motif/CJK selection | **24 P / 1 F**; failed obsolete private speech fixture subsequently repaired/replaced |
| Configured real local speech → captions → portrait export | **1 P**, 10s H.264/AAC artifact |
| New live local MCP tool-health | **1 P**; audio speech submodality remains unavailable on tone fixture |
| New full synthetic production workflow | **1 P**; 3s export/save/reopen and guarded text repair |
| Workspace manual-learning GUI/terminal/restart | **P**, receipt; no real model |
| Installed app manual-learning GUI/terminal/restart | **P**, receipt; no real model |
| Free-session harness/artifact collection | **1 P**; **editorial behavior FAIL**, not a quality pass |
| Typecheck, desktop/CLI/skills/WASM builds, final E2E build, diff check | **P** |

Broad-suite failures initially included loopback EPERM, network-denied optional
fixture access, three stale catalog/label/docs checks and TTS timeouts. Retesting
with necessary OS permissions resolved environment failures; isolated focused
fixes resolved catalog/label/docs failures. **A completely green full suite was
not obtained: three TTS tests remain red.** Skipped/provider/ignored tests are not
passed. Provider tests stay outside the routine Vitest glob (`*.provider.test.ts`);
no paid test opt-in was enabled.

The capacity suite ran in the first broad invocation: all **three tests passed**,
including **10,000 actual ProjectActor commits across 100 projects**, continued
admission, exactly 600 retained recent observations/9,400 evictions, protected
other-creator instructions and failed-storage isolation. Its asserted file bound
is <2.5 MB. This run did not enable its optional byte/latency metrics export;
no historical measured size is presented as a new measurement.

The workflow fixture initially had two harness failures: a parser dropped the
second evidence-receipt text block; a first export attempt returned without the
expected file. The parser was corrected to collect receipt blocks; diagnostic
rerun collected successful exporter completion and valid output. That transient
export result's cause was not established. It is not silently converted into a
confirmed production fix. Successful final workflow evidence is preserved.

## 6. Installed Hermes, skill and discovery verification

Installed launcher delegates to
`/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python` / `hermes_cli.main`.
Actual installed-source offline preload/restart tests ran, not a reimplementation
of its memory loader. Production-terminal fake-Hermes context tests ran through
both workspace and installed app, with disposable creator/userData scopes.

Normal skill main source hash:
`4d232bdfbb3e1104e25864207d43142eaf8887297bf7733c86c81f2714eacc3d`.
Normal knowledge references remain available for foundations, storytelling/pacing,
visual/audio editing, taste and review. Actual native loading of both separately
prepared Phase 4B.2B arms passed the offline script suite. Experimental
`speech-boundary-decisions.md` remains excluded from the normal bundle. No matched
live A/B or improvement claim is made.

Hermes connects and lists the real MCP catalog. Current main skill and initial
state evidence load through the normal supported launch path. MCP text results
collect **all** content blocks in installed `tools/mcp_tool.py`; the 2,000-character
cap found there applies to log notifications, not ordinary result text. This
inspection is not a promise of unlimited model context. Evidence packets and
vision generation are intentionally bounded; two local per-frame descriptions
were visibly truncated by model generation. Transcript absence and omitted
coverage must not be treated as observed semantic facts.

## 7. One real model session and money

Authenticated catalog/endpoint metadata was refreshed immediately before launch.
Current key cap **$0.70**, usage **$0.30147753**, remaining **$0.39852247**: historical
$0.50 figures were stale. The cap was **not changed**.

Exact Luna slug exists and supports tools. Normal pricing is $0.20/M input,
$1.20/M output ($0.02/M cached input). Conservative complete-run bound with 16 ×
50k input and 16 × 8,192 output tokens is approximately **$0.3173**, above this
task's $0.15 authorization. No paid Luna run was launched.

Selected connectivity/execution smoke:
**`nvidia/nemotron-3.5-lightning:free`**, OpenRouter
`https://openrouter.ai/api/v1`, whitelisted **`nvidia/nvfp4`**, advertised input and
output prices **zero**, active tool-capable endpoint. Real credential is supplied
only in the normal secure launcher child environment. Exact model/provider are
asserted per request; provider fallback is disabled, model fallback empty.
Auxiliary inference is disabled process-locally; generic memory/compression and
external sourcing are off in the isolated profile. No paid Jev tool was exposed.

The initial launch attempt failed its configuration assertion **before CLI/model
construction**, made zero model requests and is preserved in `live/`. App startup
had regenerated the profile. A subsequent configuration-only launcher process
validated actual effective base/auth/model/fallback without constructing a model
session. The one actual model session is separate in `live-session/`; there was
no editorial retry or second inference session.

Source (already exposed, approved **regression**, not holdout):
`/Users/adityasamant/Downloads/Raw Talking head tutorial video for editing practice.mp4`.
575.710839s; SHA256
`43586606dedfcd16c4208860c8336d78e9f9c1de78b3d037170481a280fef857`.
New project, empty timeline, imported media only; no expected cuts or style memory.

Exact request:

> Edit this footage into a coherent, engaging video for its intended audience. Select the strongest material, preserve important context and natural delivery, remove unnecessary repetition, use appropriate visual and audio treatments where justified, and review the actual result before finishing. Keep the project editable.

Runtime **134.302s** for launcher/session, full harness ~3.2min. **16 iterations +
one final-summary request = 17 model API requests**. There were **16 actual Hermes
tool invocations: 13 terminal, 3 read_file**. CLI reported 32 tool messages; this is
not 32 MCP calls. **Editorial MCP calls 0**, mutations 0, renders 0, issues 0,
repairs 0, verifications 0. Successful catalog initialization is separate from
editing activity. No premature clarification/idle termination, provider failure,
manual intervention or deadline kill occurred.

The model explored repository directories/JSON fixtures, ran `npx hermes --help`
and tried nonexistent CLI evidence commands. It did not use deferred tool search
or a Sclip editing tool. Its final answer accurately cited empty timeline state,
source duration/samples and missing transcript/audio, then asked whether to
begin. It had already been asked to edit. This is an observable free-model
execution/reasoning failure, not evidence that strong-model Sclip quality cannot
improve.

Postflight key usage **unchanged** at $0.30147753; remaining/cap unchanged.
**New paid spend $0.00**, auxiliary model calls observed 0, Jev calls observed 0.
No provider QA, second model, background maintenance model or paid retry.

## 8. Independent QA and available-but-unused capabilities

After the model stopped, independently compared projects/history/logs:

- Composition state is identical: **two empty tracks, zero layers, duration 0**.
- Project file hashes differ only because import derivatives completed: media
  waveform, decode route, thumbnail and conform metadata changed. This is **not
  an editorial mutation**. History contains only Initial.
- Managed source exists. No selected ranges, A/V pairs, effects, captions or repair
  intent were authored. There is no final video to assess for story, boundaries,
  pacing, framing, audible continuity or improvement. Export correctly skipped
  the empty timeline. **Quality INCOMPLETE; human work REBUILD.**
- No actual output self-review or post-repair verification occurred.
- Initial evidence demonstrably reached the model, but appropriate tool use did
  not follow. No technical execution rejection prevented a legitimate edit:
  there was no submitted editorial operation to reject.

Separately probed/full-decoded the **offline** exports: workflow 3.000s H.264
640×360 + AAC 48kHz stereo; speech-caption 10.000s H.264 1080×1920 + AAC 48kHz
stereo. The sampled workflow render shows the explicit CORRECT text on the
synthetic chart. These establish rendering/state integration, **not the agent's
editorial success** or quality of synthetic graphic placement.

Agenticness of this task: infrastructure supplied media/state/evidence and safety
bounds, **no creative choices or values**. The model selected its own terminal/file
actions. Story/cuts/repairs/transaction-content agency is **NA: none made**; a
completed autonomous editing loop is not proven. Synthetic fixtures explicitly
supply their own test diagnosis/parameters and are labelled fake decisions.

Available but unused online: transcription, source/deeper speech queries,
rough-cut planning/apply, placement/trim/split/ripple, audio treatment, visual
transforms/effects/captions/Motifs, current timeline/audio/temporal rendering,
issues, repair transactions, rollback, fresh verification and creator maintenance.
Non-use alone does not break those tools, but this run cannot establish their
appropriate use or quality benefit.

## 9. Artifacts, residual gaps and next action

All local task artifacts:
`.scratch/complete-editorial-regression/`.

- `local-tool-health/`: dynamic catalog, technical mutation/audio/temporal results.
- `workflow/`: receipts/logs, saved/reopened project, 3s edit, frame and probe.
- `speech-captions.mp4`, `speech-probe.json`: actual local ASR/caption/native export.
- `manual-learning/`, `installed-manual-learning/`: production-terminal context,
  actual GUI/restart/control receipts and screenshots; disposable creator data.
- `live/`: preserved **pre-inference** configuration failure.
- `live-session/`: exact request/config, initial packet/project, final project,
  safe observable session/trace, MCP/history/lifecycle logs, metrics and independent
  QA. No raw reasoning database or plaintext credential is retained here.
- `preflight-before.json`, `preflight.json` (postflight), `cost.json`,
  `installed-skill-comparison.json`: metadata/cost/skill verification.
- Named suite/build logs and `legacy-handler-matrix-final.json` preserve red,
  blocked and successful checks rather than replacing them with a green summary.

Residuals: local TTS hangs; tone ASR timeout; ordinary editing does not automatically
enter guarded review; legacy critique heuristics and transcript shape need careful
provenance/availability interpretation; optional legacy Jev callback is not gated
by the public-tool flag. Current-platform execution does not establish Windows/
Linux local-vision compatibility. Real taste adaptation, boundary-experiment
improvement and successful strong-model full editing remain unproven.

**Exactly one next action:** reconcile the legacy background review's optional
Jev enablement/availability with the existing paid-inference controls in a focused
$0 regression fix, before authorizing another paid editorial acceptance. Do not
add another reviewer or change creative behavior to address this.

This task stops here: no skill promotion, additional model run, Applications
replacement, memory redesign or new editorial phase.
