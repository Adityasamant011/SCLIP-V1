# Sclip session reliability fixes — 2026-10-10

## Scope and result

Fixes for the confirmed Project 88 inspection/audio/text/review integration defects. Production code commits: `caf1369c` and final font-startup fix `f5630fc6`. No paid provider or editorial acceptance session was run. Model/provider cost: **$0.00**. The user's project and exported video were preserved; no creative repair was applied to their video.

The original investigation and observable evidence are preserved in `.scratch/session88-analysis/`. The original edit's visual/narrative/pacing weaknesses remain a separate editorial responsibility. Infrastructure now supplies better evidence and truthful completion state; this is not proof that every future model will edit well or avoid loops.

## Confirmed issues addressed

| Issue | Implemented change | Verification |
|---|---|---|
| QA opened Export and logged user activity | Existing render engine receives an inspection origin. Temporary progress/errors remain tool-local, with no user export modal, notifications or export-log attribution. Final `export_timeline` remains blocked by the pre-existing user-only gate. | Hook/presentation tests, real Electron audio and video QA; later user exports remain functional. |
| Muted/absent audio produced a generic missing-file error | Native-equivalent role mute/solo, layer mute/lock and enabled placement facts. `no_audible_material` returns current state and no invented audio/speech coverage; rendering/transcription is skipped. | Unit tests and real muted → unmuted MCP/native workflow. |
| Role changes retained stale audio verification | Global audio role settings enter canonical review/output identity. Audio locks also affect completion identity because the native mixer gates locked audio. | Role mute/solo/gain and lock freshness regressions; existing stale-receipt suite. |
| Waveform/layer mistaken for audibility | Compact packet exposes mix selection, gains, exclusion reasons and omitted-layer counts. QA `has_audio` probes actual container streams; PCM tool measures signal separately. | Valid silent stream vs absent stream vs malformed file; silent rendered video plus actual measured mix. No auto-unmute. |
| Center-anchor position mistaken for margin | Packet exposes anchor/box/transform semantics and known static authored geometry; actual frame evidence exposes staged bounds. | General synthetic geometry, signed scale and unknown animated/rotated cases; real compositor. |
| Ordinary text clipping/collisions missed | Current enabled text reports four-edge bounds, auto-height horizontal extents and simultaneous box intersections. Runtime frame facts include clipped edges/intersections. Intentional overlap remains legal. | Unit tests and synthetic overlapping/off-left text via MCP. No automatic relocation. |
| Missing font silently became generic serif | One explicit requested-family → bundled Liberation Sans/Noto Sans chain used by preview/export TextSprite. Preview awaits font registration before constructing the compositor, preventing cached first-frame serif fallback. Packet/critique reports unavailable requested families. | Font-chain tests and real pixel-identical comparison of an unavailable requested font against explicit Liberation Sans. Availability does not certify every glyph/weight. |
| Weak readability insufficiently inspectable | Up to two bounded crops of actual composited text; sampled region luminance facts, clearly including both glyphs and background. | Pixel-fact regressions and real frame/crop artifacts. No arbitrary contrast score or automatically chosen color. |
| Partial “clean” review implied readiness | Critique explicitly returns `not_certified` and coverage limitations; local Agent-panel indicator uses current-state completion receipts, displaying incomplete/unverified work. | MCP completion tests and component test; interruption/no completion never becomes success. |
| Fallible/truncated vision overruled facts | Actual generated-token limit metadata propagates; unknown termination is explicit. Per-frame model observations remain distinct from current geometry/pixels. Capture refuses stale decoder pixels instead of labeling them as the requested frame. | Fake local generator metadata test, per-frame contradiction/freshness tests and real frame capture. No extra model judge. |
| Unreconciled black tail/speech ending | Packet/reviewer exposes trailing intervals without enabled visual layers; cached speech includes bounded neighboring source words. Skill requires actual ending/speech inspection. | Synthetic interval/nested mapping tests, bounded packet and modality tests. Does not automatically shorten a composition or invent the intended last sentence. |
| Excess schema discovery/position loops | Skill reuses discovered schemas/current evidence, calculates geometry before trial edits, and uses existing atomic transactions for explicitly chosen coordinated repairs. Existing bounded decision/verification lifecycle retained. | Real MCP transaction/repair/verification/no-repair tests. Reduced call count/cost remains unproven until a separately authorized live session. |

## Architecture and agency

ProjectActor remains the only timeline writer. Hermes chooses all editorial issues, operations, values and repair/no-repair judgments. Nothing synchronizes A/V, unmutes audio, relocates text, changes narration, trims endings or applies a creative recipe automatically. Deliberately silent video, black endings, intersecting graphics and J/L cuts remain legal.

Internal QA still uses the actual preview/export engine. The native engine was not rewritten. Container presence, signal measurement, speech recognition, geometric facts and model observations have separate meanings; no one fact certifies publishability.

## Validation

- Typecheck: PASS.
- Production desktop, CLI and skills builds: PASS.
- Focused regression/integration suite: **20 files / 131 tests PASS**. Includes real local MCP, installed Hermes native loader without inference, stale-state/transaction verification, no-repair freedom and bounded packet behavior.
- **Full desktop suite: 610 files PASS / 2 skipped; 8,112 tests PASS / 22 skipped / 0 failed**, 437.63 seconds. Initial run had 8,105 passing / 4 failing / 22 skipped; all four failures were corrected and the complete final rerun passed. Skips retain existing optional environment/platform-dependent gates; live provider tests are excluded, not disguised as passes.
- Native Rust: **613 PASS / 1 ignored**, no native production changes.
- Script suite: **101 PASS**. Initial restricted run had a Chromium sandbox launch failure; authorized local rerun passed.
- Fake local vision-generation metadata: **1 PASS**, no model weights loaded by this test.
- Real Electron inspection regression: **1 PASS**. Muted actual video has no audio stream; unmuted audio has nonzero signal; QA never opens Export; frame crops/bounds/collisions/fonts are observable; authored layers/roles unchanged.
- Real Electron reviewer/completion workflow: **1 PASS**; a committed repair requires fresh actual pixels before completion.
- Real range/final render parity: **1 PASS / 1 SKIP**. Optional real Hermes discovery skipped without `SCLIP_HERMES_SOURCE`; native-loader/catalog coverage is in the focused suite. Video/audio parity measured in the passing test.
- Final font-race follow-up: typecheck PASS; **9 files / 52 tests PASS**; real Electron inspection regression **1 PASS**, including exact rendered-pixel fallback equality. The 8,112-test full run preceded this narrowly scoped follow-up; relevant affected suites were rerun afterward.
- `git diff --check`: PASS.

No live provider tests were opted into. Routine provider-test exclusions remain intact. One early legacy catalog fixture unexpectedly reached an existing local Qwen runtime and timed out; it was corrected so unavailable external-compute execution is explicitly BLOCKED in that synthetic fixture. Its registration/schema checks remain; local execution is covered separately by real Electron tests. BLOCKED fixture rows are not claimed as successful runtime executions.

Other corrected validation failures: an old assertion expected a no-reviewer environment to be “clean”; current truthful result is `not_reviewed/not_certified`. Skill conformance lacked two already-existing response fields (`review_required`, `review_unavailable_reason`). An isolated layout fixture now includes visual coverage so the newly reported tail does not confound unrelated layout assertions. One focused invocation lacked loopback permissions (EPERM), then passed with permitted local MCP access. These were not hidden product failures.

## Installation and preservation

Final installation verified on 2026-10-11: packaged code **`f5630fc6`**. Backup: `/Users/adityasamant/SCLIP V1/backups/installed-apps/Sclip-backup-20261011-115251.app`. **27,090 protected profile files unchanged**; launcher unchanged; code signature PASS. Asset comparison: **62 compiled files + 14 skill/CLI files + 3 Python workers match**. Final installed font comparison PASS: unavailable requested family produces pixels identical to explicit bundled Liberation Sans.

The production build is installed in `/Applications/Sclip.app`; installed main/renderer, skills/CLI and vision-worker assets are compared byte-for-byte with the tested build. The existing local Hermes launcher is preserved. No projects, credentials, creator memory, provider configuration or local model settings are replaced.

An isolated **production** installed-app check uses a disposable profile and mock OS keychain, with provider credentials absent and a fake offline Hermes executable. It launches normally, creates a synthetic project through the UI, confirms **116 live MCP tools**, renders valid video, returns actual text bounds/crops and keeps internal QA out of the Export dialog. This validates packaged operation without using real provider credentials. It does not test authentication to a paid provider.

Earlier scratch-probe failures were fixture errors: stale MCP session after project creation, creating backend state without entering the renderer editor, guessed dialog labels, waiting for a preview before adding content, and parsing a plain layer ID as JSON. These were corrected without production changes. The first credentialless launch without a mock keychain stalled; the successful probe explicitly isolates OS credential storage. A subsequent actual-pixel font comparison exposed the genuine preview-font race and led to `f5630fc6`, with a permanent real-render regression.

Protected source hashes:

- Project 88 JSON: `b33a0df300539919a916416626b20e0cc8ed35a25dff0c9dec08d661cdf114d4`.
- Original exported MP4: `1b72e0785d606c48312a448d00a31bbb8ac1824654c1c6a4d2cbfabca0e2f0d3`.
- Pre-existing acceptance runner change remains untouched and uncommitted: SHA256 `f52bf99b33f8fd7fca2272e24acd4c51c53a48aa94ffa4a80e400f4236c17176`.

## Artifacts and remaining limits

`.scratch/inspection-reliability/`: `qa.mp4`, `silent-qa.mp4`, `frame.png`, `text-crop.png`, `ui.png`, sanitized tool trace. Synthetic choices here are test inputs, not production creative decisions.

`.scratch/session-reliability-fixes/`: installation/asset verification and disposable installed-app launch evidence. Test logs are preserved alongside it.

Static box intersections are potential concerns, not proof of glyph collisions. Rotated/animated/unboxed or nested text still requires actual composed inspection. Crops are bounded, not exhaustive frame-by-frame coverage. Local vision and ASR remain fallible. Missing-font reports are family-level; requested font appearance cannot be reproduced if the font is absent. Completion receipts are local session bookkeeping and reset to unreviewed after restart. An interrupted provider session is not automatically resumed or retried.

No live behavioral or cost claim is made. The deterministic fixes and existing review workflow are ready for the user's retest; creative quality and reduced repeated calls must be observed in that retest.
