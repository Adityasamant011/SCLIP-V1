# SCLIP Core V1 technical baseline — approved freeze

User approval authorizes this technical freeze with the documented limitations. It is **not** a declaration of creator readiness or public-launch readiness. Prior acceptance reports describe the candidate at their historical boundary; this record supersedes their approval status without changing tested production source.

## Git identity and preservation

Annotated tag: `sclip-core-v1-baseline`. Baseline branch: `sclip/core-v1-baseline`. Experimental branch, created from the tagged commit: `sclip/editorial-intelligence-v1`. Resolve the exact commit with `git rev-parse sclip-core-v1-baseline^{commit}`. The exact full hash and post-operation checks are also recorded in the durable local `acceptance-artifacts/core-v1-20261014/baseline/freeze-receipt.json` and delivered to the user.

Original development branch `sclip/product-validation` remains at `00d48b6fc89932e7ce0fac5f770e5a53f9768035`. Verified working-tree source is captured on the separate baseline branch. Scratch deletions, generated bundles/bytecode/session files and separate audit documents are preserved as uncommitted work; none is discarded, restored, overwritten or included in this change. No installed application is modified. No push is authorized or performed.

## Integrity and scope

Before the freeze, all 2,243 source snapshot entries match their hashes/symlinks; the source archive agrees with the manifest; all 450 evidence entries match their lengths/hashes; package executable/Info.plist/app.asar match the approved package manifest, and complete strict code-signature verification passes. Every selected pre-existing source/test/config/report change matches the passing snapshot. New freeze records are documentation only. No new production change or untested feature is introduced.

[SCLIP_CORE_V1_BASELINE_MANIFEST.json](SCLIP_CORE_V1_BASELINE_MANIFEST.json) records the selected file hashes, dependency inputs, source/evidence/archive hashes, representative media hashes and exclusions. Large evidence remains locally at `acceptance-artifacts/core-v1-20261014/`, outside `.scratch` and ignored by Git. Raw credentials, private profiles, creator stores, logs, generated packages and acceptance media are not added to Git.

## Verified acceptance

- TypeScript broad boundary: 8,258 PASS, 22 intentional skips; 627 files PASS, 2 skip. Subsequent minimal reviewer-budget repair: 67 affected tests PASS, not added to the overlapping broad total.
- Unchanged capacity: 3 PASS; 10,000 commits across 100 projects. Rust: 619 PASS, 1 ignored. Script tests: 105 PASS. Main-process typecheck and build PASS.
- Actual packaged Hermes gap removal and off-screen title correction complete current trusted review. Final properly isolated valid-title control: 179.051 seconds, 21 guarded free requests, zero paid calls; current review/media verified; compositions and media pool preserved; actual 52 tool-call/result records retained; MP4 decode PASS.
- Required post-mutation visual verification remains reachable after two metadata calls; actual packaged MCP replay PASS without forging a subjective outcome. Synthesis cancellation/60-second late-write observation/recovery, save/reopen and decode have retained package proof.
- Configured Qwen/Whisper/SenseVoice/Kokoro sensing, canonical memory execution routing/provenance, actor ownership and essential MCP workflows have bounded proof. Failed and confounded trials remain explicitly recorded; independent QA cannot promote them to native success.

Exact commands and remaining limits are in [SCLIP_V1_FOUNDATION_COMPLETION.md](SCLIP_V1_FOUNDATION_COMPLETION.md), [SCLIP_V1_FINAL_IMPLEMENTATION_REPORT.md](SCLIP_V1_FINAL_IMPLEMENTATION_REPORT.md) and the durable baseline README. No inference is required for this freeze operation.

## Pins and limitations

Node 24.10.0; Electron 44.1.1; Hermes 0.20.4 with bundled CPython 3.11.15 and source revision `515354038a3c383b38b43aba6959ceddd858bb12`; Whisper 1.9.1/ggml 0.15.2. Configured local sensing uses Python 3.14.2, ONNX Runtime 1.30.0, kokoro-onnx 0.4.7, sherpa-onnx 1.13.4 and Qwen3-VL-2B-Instruct-4bit MLX snapshot `9c4f5209e57b31f4b9dfba735de3fb983739c9cc`. Exact npm/Cargo locks and Hermes/Whisper runtime pins are hash-bound in the manifest; complete local model/resource pins remain in the durable baseline.

General reviewer success rate remains PARTIAL: no new frozen 10-trial/90% reliability cohort is claimed. Positive autonomous style generalization and creator-quality videos are not certified. Complete first-run Qwen/Kokoro provisioning remains PARTIAL; clean supported physical-Mac verification, Developer ID/notarization and distribution approval remain BLOCKED. The package is ad-hoc signed, not distribution-ready. Legacy describe_clip's separate GGUF/mtmd dependency remains unavailable; optional/internal uncertified entrypoints are not silently declared essential or working. Kokoro bounded load/regression passes are not a universal crash-free guarantee.

## Next experiments — no feature changes in this freeze

1. Freeze held-out briefs and evaluate actual finished media separately from objective engineering correctness.
2. Improve footage/speech understanding and grounded moment selection, complete sentence boundaries and coherent beginning/endings.
3. Improve storytelling, pacing, framing/composition, paired video/audio assembly and audio coherence.
4. Improve Hermes's evidence-grounded self-review and supported canonical style interpretation, including abstention, creator isolation and current-user overrides.
5. Compare experiments against this tag; promote only measured quality gains with no core regressions.

Hermes remains the creative decision-maker. ProjectActor remains the sole authoritative timeline writer, WeftCut executes, and SCLIP validates authority, contracts, evidence and output. No hardcoded editing pipeline or second creative agent. Paid inference requires approval; use only the authorized verified free route otherwise. New feature changes start only after this freeze/branch setup has been reported.
