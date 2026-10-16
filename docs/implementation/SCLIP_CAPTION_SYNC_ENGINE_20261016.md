# Caption synchronization engine — 2026-10-16

Functional improvements are implemented and installed at `/Applications/Sclip.app`; acoustic alignment accuracy remains PARTIAL/unestablished. No additional aligner is shipped and no CapCut parity is claimed.

## Implemented

- Cached/supplied caption application refuses unsupported retimed VideoClip inputs before I/O/history mutation, matching the native transcription safety contract.
- Optional Captions → Word display → Reveal with speech uses stored word starts in shared preview/export rendering. Complete phrase shaping, typography, backgrounds and whole-phrase mode remain. Missing/partial/stale/unsupported timing falls back to the complete phrase; uncertainty/provenance is retained.
- New explicit source bindings follow normal-rate moves, trims, splits and deletion within ProjectActor's same undo/redo transaction, without recognition calls. Manual, locked, legacy, animated/complex or stale cases abstain. Cross-composition moves preserve stale cues instead of mistaking relocation for deletion. No creative selections are hardcoded.

## Verification

Evidence root: `/Users/adityasamant/SCLIP V1/maintenance/caption-sync-engine-20261016/`.

- Full suite: 8,363 PASS /22 intentional skips; 639 PASS files /2 skipped. The final defensive relocation guard was added while this ran; its 11-test suite, typecheck/build, final package export and installed app export passed afterward. Earlier-loaded broad tests were not all repeated after that small guard.
- 81 focused caption tests, 15 staging/source tests, 11 final source tests and 105 script tests PASS (overlapping sets, not additive coverage counts).
- Eight real packaged 60fps H.264/AAC exports fully decode. Final rebuilt package and installed app each subsequently exported/decoded another 3-second sample.
- Three phrase/reveal audio comparisons are byte-identical. Three sampled default-render frames match the previous installed app pixel-for-pixel. Edited-source audio correlation .9852 with +5ms lag; all 19 surviving word starts lie in their authoritative source windows.
- Four word appearance frames and their immediately preceding frames visually inspected. Native OCR failed macOS Vision initialization; it is not counted as passing.
- Display discrepancy relative to unchanged engine timestamps: phrase median 570ms early, p90 1,710ms early; reveal median 6.67ms late, p90 13.33ms late (60fps rounding). These are NOT absolute acoustic errors. The <=100ms median /<=200ms p90 acoustic target is unproven.
- Local 88-cue reconciliation: median 4.46ms, p90 5.05ms over 100 trials. No extra model weights or Hermes requests; not a whole-app memory/GPU benchmark.

Exact code/dependency pins: `source-and-dependency-pins.json`; installed hashes/full bundle manifest: `installed-pins.json`, `installed-bundle-manifest.json`; source/Git preservation: `preservation-check.json`. Detailed methods, failed attempts, evidence and media: [engineering report](</Users/adityasamant/SCLIP V1/maintenance/caption-sync-engine-20261016/REPORT.md>).

## Preservation and limits

Whisper.cpp remains primary ASR. No Hermes core/creative architecture replacement, paid inference, new model/version, commit/tag, genuine project/memory edit or frozen-baseline/stash change. One rollback remains in the evidence root as `previous-installed-Sclip.app`. Redundant generated app bundles removed only after installed smoke PASS; exact verified ASAR retained.

Whole phrase remains the default. Existing unanchored/manual captions do not silently gain source-edit ownership. Full paired A/V speed retiming and reliable acoustic word accuracy remain unsupported/unverified. Existing external speech dependencies and ad-hoc signing/notarization limitations remain. Prior default Whisper/DTW/CTC comparisons are retained; algorithm disagreement is not phonetic ground truth.
