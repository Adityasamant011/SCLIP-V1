# Caption preservation repair, speech portability and self-review diagnosis — 2026-10-15

## Scope and delivery

Implemented only the confirmed cached-transcript caption fix and synthetic regression tests. Integrated uncommitted on `sclip/editorial-intelligence-v1`, after testing in the existing isolated review worktree. No architecture, MCP schema, ProjectActor ownership, rendering implementation, persistence implementation or reviewer behavior was changed. No hosted inference was needed; all new speech recognition/synthesis was local. No paid calls, commits, tags, installed-app replacement, real creator projects or memories.

Frozen tag still resolves to `36987a59e5a0e3bc226fde07bf4ae241594b8f8e`. The original preserved stash object remains. All pre-existing individually inventoried modified/untracked file hashes were unchanged before the explicitly appended ledger entry. Installed ASAR/executable/Info.plist pins are unchanged. `acceptance-artifacts/caption-repair-20261015/preservation-check.json` records the checks. Earlier editorial/current-status evidence remains intact.

Production change: `apps/desktop/src/main/state/hybrids.ts` (60 insertions, 66 deletions). Regression: `apps/desktop/src/main/state/__tests__/captionCoverage.test.ts` (18 cases). Primary and packaged review source hashes match in `integrated-source.json`. No persistence or reviewer source was edited.

## Reproduction and actual code path

MCP/renderer `apply_transcripts` → `runHybrid` → `applyTranscriptsHybrid` → compute facade `readTranscript` in main/index.ts → native `mcpReadResource(media://ID/transcript/IN/OUT)` → validated cached transcript and `slice_window` in native resources.rs → TS source-to-timeline conversion → one ProjectActor `apply_transcripts` transaction → mutation `textCorrection.ts` → `applyAddCaptionTrack`, caption metadata and normal compositor/export.

The previous hybrid gathered words from all segments and chose one global branch: if any words existed, it emitted only those words; segment-only sentences never entered fallback. The existing diagnostic was run unchanged before editing: 2 passing controls, 1 failing mixed case, first sentence absent (`historical-reproduction.log`). After repair it passes (`diagnostic-after.log`).

The repair chooses timing per segment, sorts source segments/words, maps/clamps to the selected source and timeline span, and retains overlapping speech for the actor to pack in separate lanes. Complete valid word arrays are used where available. Partial/malformed/incomplete word arrays fall back to the complete segment text and its known bounds. Short coarse segments have `none` provenance; long coarse segments use the existing phrase interpolation behavior labeled `interpolated_from_cue`, never borrowing `exact` from another segment. Complete measured words can locate a segment lacking bounds. Nonempty text without any usable bounds produces an explicit error before actor dispatch, rather than inventing times or writing a partial result. Payloads are grouped into the existing three provenance kinds to preserve the bounded mutation interface on long transcripts.

The existing guard against padded/ghost ASR segments whose measured speech lies after a cut is preserved. A first focused test run caught its regression (184 pass, 1 fail); that attempt and its minimal correction are retained, not hidden. The final focused run is 185/185 passing. This fix conserves supplied transcript text; it cannot recreate speech omitted by ASR, certify coarse word alignment, or make editorial trim decisions.

## Regression and build evidence

All logs below are in `acceptance-artifacts/caption-repair-20261015/`:

- `focused-tests-2.log`: captionCoverage, existing hybrids and textCorrection: 185 PASS.
- New coverage: fully timed, fully untimed, both mixed orders, partial word arrays, missing/null/negative/nonfinite word timestamps, missing segment bounds supported by measured words, unlocatable text without partial mutation, reversed segment/word order, overlapping voices, overlapping word intervals, long coarse segments/provenance, trim/offset clamping, unknown precision and undo/redo atomicity.
- `full-regression-authorized.log`: 8,317 PASS / 22 skipped, 635 passing files / 2 skipped. Command: `npx vitest run --exclude '**/*.browser.test.ts' --exclude '**/creatorMemoryCapacity.test.ts'` in review/apps/desktop. The separate capacity stress and browser-only suite were not rerun; no new Cargo suite is claimed for this TS-only fix.
- `full-regression.log` retains the sandbox attempt: 48 failed/8,266 passed/25 skipped, including explicit `listen EPERM` and blocked subprocess/network fixtures. It was not counted as a pass. The unchanged authorized run passed. Paid-provider opt-in tests were not enabled.
- `typecheck.log`, `build.log`: main/renderer project typecheck and build PASS.
- `package.log`: actual electron-builder mac-arm64 directory build with pinned existing native binaries, Hermes and Whisper bundle/license gates; no dependency changes. Package is isolated under `package/mac-arm64/Sclip.app`, not Applications.
- `package-signature.log`: actual post-runtime deep/strict codesign verification PASS. Notarization is explicitly skipped; this is not distribution certification.

## Actual packaged audio/video acceptance

`caption-runtime-2/` contains the real package run using the authorized tutorial source, with the same 100–135s selection and 1080×1920 geometry as the preserved native Hermes failure. This is a controlled replay of its committed range to test caption mechanics, not a new creative model trial or a hardcoded production editing strategy.

Actual native local Whisper transcription → cached resource → real MCP `apply_transcripts` → authoritative project → renderer export. No transcript fixture was injected into the native cache. `native-transcript-resource.json` contains 19 actual segments, 11 with word arrays and 8 without. The fixed project contains 42 cues; normalized concatenated caption text equals all 19 cached segment texts (`coverage-check.json`). The preserved old output had 18 cues and omitted complete phrases. Declared source precision is not promoted: final metadata has 22 `none` cues and 20 `interpolated_from_cue` cues.

`caption-runtime-2/caption-fixed.mp4` is the actual 35-second H.264/AAC export. Full decode PASS. `export-qa/audio-preservation.json`: decoded 16kHz mono floating-point audio is byte-identical to the earlier actual edit. Independent local Whisper transcript and beginning/middle/ending exported PNGs are retained; exported frames at 7.5, 15 and 34 seconds were visually inspected, showing previously absent captions. This proves text conservation in this real mixed-timing case, not perfect ASR fidelity, all-cue readability, or improved storytelling. The original weak narrative boundaries remain deliberately unchanged.

The first packaged CDP connection timed out; its logs/sample are preserved in `caption-runtime/`. The unmodified controlled retry `caption-runtime-2/` completed. No startup fix was introduced and no definitive root cause for that initial connection timeout is claimed.

## Generated speech portability: independently reproduced, persistence untouched

Used the unchanged installed app, synthetic projects, fresh disposable profiles and one local Kokoro sentence. An explicit solid-color visual control was added to make an A/V export; the initial audio-only attempt was correctly refused by the video exporter and is preserved in `portable-create/`.

1. Same-profile save, process restart and export: PASS (`portable-same-profile/`). Generated MP3 remains only under profile `data/cache/voiceover`; asset has `path_rel: null`. Project-local `Cache/audio/*.conform` exists; project Media does not contain the MP3.
2. Copy the ENTIRE project to a new location/fresh profile, with original synthetic MP3 unavailable: PASS using the copied conform.
3. Make ALL original synthetic source/conform/waveform paths unavailable by safely renaming their owned parent directories. Fresh receiver plus whole-project conform: PASS again (`portable-full-isolated/`), with decoded audio exactly equal to the same-profile control. This shows ordinary complete-folder transfer is not automatically broken.
4. Cold copy with its conform/waveform cache withheld, ALL original references verified absent (`cold-isolation-check.json`), fresh receiver: FAIL to regenerate/export (`portable-cold-isolated/speech-reopened-render.json`). Actual conform/waveform jobs report missing original MP3; exporter refuses instead of delivering a silent success. The original/generated file and withheld caches are retained elsewhere, not deleted.

The intermediate `portable-cold/` still found an old absolute conform path and therefore played; it is explicitly NOT counted as the isolated cold-cache result. Its success led to checking every absolute reference and correcting test isolation. All attempts and files remain.

Conclusion: ordinary same-profile reopening works, and whole-project copying including the conform works. The generated source is NOT self-contained in project Media; recovery/rebuilding after derived-cache loss is broken when the originating profile cache is unavailable. This is a reproduced source-portability/recovery defect, not proof that every moved project loses speech. `portability-audio-comparison.json` records the positive controls; `portable-cold-isolated/` preserves the refusal and real job errors. No production persistence fix was made in this task.

## Why the native self-review missed defects

Read actual `current-status-20261015/fresh-native/actual-native-tool-records.json` and outcome, then current reviewer/packet/tool source:

- Hermes inspected one composed visual frame at 17.5s and the full 0–35s rendered audio. It did not invoke the existing chronological multi-frame inspection tool, despite that tool supporting bounded 2–5 samples.
- Qwen's single-frame description hit its 96-token cap and was marked possibly truncated, with no calibrated confidence or overall framing verdict. That cannot establish start/end composition or whole-video caption accuracy.
- The audio observation contained the fuller speech; Hermes did not compare it against the authored caption content. It asserted faithfulness without that comparison.
- `RevisionLoopGuard.hasCurrentRenderedEvidence` checks current evidence/modality presence, not sufficient temporal visual coverage for every claim. `concludeNoRepair` requires a current receipt and reason; it does not certify subjective correctness. The guard therefore legitimately accepted Hermes's bad judgment. No forged receipt or stale-state bypass is demonstrated here.
- Initial review has four inspection calls and a five-minute budget; metadata/critique calls consume that allowance. The model spent calls on timeline/context and critique, then chose one middle visual sample. This is an observed workflow/contract mismatch, not proof it was forcibly prevented from choosing the multi-frame tool. Existing packet text indexes at most 12 layers and speech excerpts at 180 characters; 18 original cues required deeper inspection. Scope/truncation warnings existed, but Hermes generalized beyond them.
- The opening and ending required semantic comparison against source context/original brief. A clean timeline and decodable artifact cannot establish a complete narrative.

## One proposed minimal self-review experiment — NOT IMPLEMENTED

Change only the existing review guidance/`review_next` example to a brief-grounded pre-conclusion evidence checklist: for claims about a complete short video, prefer the ALREADY EXISTING bounded multi-frame range inspection for beginning/middle/ending; compare authored captions with the rendered transcript and inspect relevant source speech context at trim boundaries; state any missing coverage or uncertainty before deciding repair/no repair. Point to exact current tool names and receipts. Use targeted follow-up reads if the bounded packet omitted captions or speech. Do not add another agent, automatic subjective verdict, creative pipeline, receipt bypass, universal aesthetic template or new model.

Evaluate that single guidance change, if approved, against the preserved failures and valid held-out controls using the same verified free route and comparable budgets. Measure broader current evidence acquisition, supported detection of missing text/bad boundaries, false positives on valid edits, legitimate completion and added calls/latency. Hermes retains authority to diagnose, abstain, select repairs, keep valid work and conclude. Do not call more samples proof of general quality. This proposal has not been implemented or tested as an improvement; await user review.
