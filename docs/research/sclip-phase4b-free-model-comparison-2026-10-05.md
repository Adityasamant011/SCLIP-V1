# Phase 4B — parallel free candidates and Apple-media follow-up

## Scope and controls

The user authorized several simultaneous model tests and then requested Apple fold media. Three isolated sessions ran in parallel on the retired Motorola regression source; one follow-up used `Introducing the new iPhone Duo.mp4` from Downloads, inferred as the requested Apple media. No expected edit was supplied. Every session used a fresh project, unchanged production architecture/skill, the natural product-demo prompt, external B-roll disabled, 24 maximum iterations, and no paid-model fallback. No retries of an editorial result and no production corrections.

Prompt: “Make a concise, engaging product demo from this footage that helps viewers understand the phone.”

Motorola SHA256: `f1e749ae820400f5ded5418f9886db2dc2b217c414a2d6c9b03b5739e1a15e74`.
Apple-media SHA256: `b394fb2ba01371d26400698cb71b0b77dff03f00d4adf29b4f0712d2d790d52d`.
Apple input duration approximately 186.675 seconds. This is exploratory testing, not proof of generalization or a quality benchmark.

## Routes and spend

Authenticated catalog and live endpoint checks confirmed zero prompt/completion prices and tools support for:

- `thinkingmachines/inkling:free` — Thinking Machines, dated route `inkling-20260715:free`.
- `poolside/laguna-s-2.1:free` — Poolside, dated route `laguna-s-2.1-20260720:free`.
- `dots-studio/dots-3-note-preview:free` — AtlasCloud, dated route `dots-3-note-preview-20260813:free`.

Main/auxiliary inference pinned to the corresponding free model, auxiliary free-only enabled, fallback disabled. Key usage remained **$1.271188** before/through/after all sessions; key/account deltas **$0.00**. The Apple test independently selected speech synthesis; no OpenAI speech credential was configured, so existing production free TTS fallback supplied narration. **Total paid provider cost: $0.00.** No allowance changes or purchases.

## Comparison

| Model / media | Runtime* | Actual MCP calls | Observed result |
|---|---:|---:|---|
| Inkling / Motorola | 330.2s | 0 | Read repository context, then asked for a brief already supplied. Stalled on interactive clarification; operator terminated this session. No timeline layers. Incomplete; no editorial-quality ranking warranted. |
| Laguna S 2.1 / Motorola | 158.2s | 0 | HTTP 429 upstream rate limit on every bounded attempt. No inference/tool edit. Provider-blocked, not evidence of weak reasoning. |
| Dots3-Note / Motorola | 579.6s | 30 | Inserted entire source as one linked A/V pair, read evidence, attempted a no-op end trim, reached 24 iterations. Final answer described a rough-cut plan that never executed. No result review or targeted repair. |
| Dots3-Note / iPhone Duo | 353.3s | 42 | Eight video/audio pairs, two narration layers, six text layers; requested render and structural critique. Claimed a clean 41s result, but actual export is 64.6s with serious errors. |

*Includes evidence preparation and launcher work. Simultaneous local perception contention makes these unsuitable as pure model speed comparisons. CLI reports 62 tool messages/calls for Dots Motorola and 77 for Apple; authoritative MCP call counts deduplicate operation start/completion events. Inkling's missing summary under SIGTERM means its footer metrics are unavailable; its observable terminal/read/clarify activity is preserved.

Previous Nemotron regression session remains unchanged: 310.3s, 19 actual MCP calls, entire-source placeholder only, no executed rough cut.

## Apple result — independent QA

The rendered MP4 decodes without errors: H.264/AAC, 1280×720 at 30fps, **64.6s**. Authoritative state has **8 VideoClip, 10 Audio, 6 Text** layers. Main video ranges are contiguous from 0–41s; eight paired source-audio ranges match their corresponding video ranges. No internal main-video gaps or overlaps. Source bounds, layer identities and intervals are technically valid.

Material errors:

1. Two identical narration assets/layers were created. First occupies 0–23.573333s; the second was moved to start at 23.573333s but retained an end at 64.573333s, despite the same 23.573333s source duration. No original dialogue/music gain adjustment was made.
2. **23.566667s black tail after 41s**, confirmed by decoding/blackdetect and sampled frame at 50s. Silence starts at 47.072833s and lasts approximately 17.503s.
3. Long captions extend beyond image edges (e.g., 2s and 12s samples).
4. Captions describe different features than the contemporaneous shot: at 17s, a video-calling caption is over an A20 Pro chip close-up.
5. Final model report says seven clips and 41 seconds; actual state has eight video clips and a 64.573333s total timeline.
6. `render_timeline_range` and `get_timeline_critique` were requested, but no observed follow-up pixel/audio inspection occurred. None of `ripple_cut_range`, `inspect_rendered_audio`, or `inspect_timeline_temporal_window` was used. Structural critique returned clean, which Hermes incorrectly treated as readiness.

This is **not a successful verified edit**. The model executed a real assembly, then failed to understand and verify its own result. No repair or rollback occurred after fresh rendered-result evidence. No result was patched.

The tool log also records invalid source observation limits and caption placement on the main video track (rejected before successful placement on an upper track). Ignored/mistaken targeting fields contributed to unnecessary empty caption tracks and duplicate narration. These are observations for later investigation, not permission to alter production in this experiment.

## Agency

Hermes chose source ranges, story wording, tools, synthesis, captions, parameters and its final judgment. Infrastructure supplied evidence, legal-state enforcement and existing insertion primitives. **Deterministic creative leakage: NO.** No creative hints or independent QA were fed back into sessions. No default Hermes model was changed.

## What can be concluded

Dots demonstrated more actual execution on the shorter Apple source, but its verification and final judgment are unreliable. Laguna cannot be ranked because its provider rejected requests. Inkling cannot be ranked editorially from a stalled clarification session. These tests do **not** establish a replacement for Luna or a reliable free default. They also do not show that architecture changes are required to improve creative quality.

## Artifacts and limitations

`apps/desktop/e2e/bench-results/phase4b-editorial-execution/free-parallel/{inkling,laguna,dots-note}/` preserves initial/final projects, packets, observable traces, events, histories, metrics, before/after receipts, cost/preflight/postflight and QA. `free-parallel/comparison.json` contains the compact numerical comparison.

`apps/desktop/e2e/bench-results/phase4b-editorial-execution/apple-fold-dots-followup/` additionally contains `edit.mp4`, six independent sampled frames and `render-qa.txt`.

The Apple final project contains references to generated TTS in the isolated temporary profile. Existing harness exit cleanup removed those original cache files; the exact saved state, receipt history and full rendered audio/video remain preserved, but that project is not self-contained for reopening. This artifact-lifecycle limitation is separate from the model's black tail/caption errors. No reconstruction or project modification was performed.

All four targeted Playwright harness cases completed; their pass status establishes execution/artifact collection, **not behavioral or editorial success**. Production remains at the Phase 4B implementation. Only opt-in harnesses and this report were added. Stop after this report; no further inference or production changes.
