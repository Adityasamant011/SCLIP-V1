# Independent MausBot repair integration — 15 October 2026

## Decision and preservation

The engineering repairs are accepted **with independent corrections**, integrated uncommitted on `sclip/editorial-intelligence-v1`. This does not establish professional editing quality or public-release readiness.

Reviewed the FINAL 25-file patch (615 insertions / 92 deletions), not the original 12-file candidate. SHA-256 `8249ef9540e44e1414f9c43beb3e6433d12729780df8a0b4213f805155a0ec56` matches the final audit and mirrored patch. Reviewed every changed production file and its callers; MausBot's reported 127 tests were not substituted for our own tests. Its dots-studio health check is not Nemotron editing evidence.

Review/build/runtime work was isolated at `/Users/adityasamant/SCLIP V1/repair-review-20261015`, detached from frozen commit `36987a59e5a0e3bc226fde07bf4ae241594b8f8e`. The 27 reviewed source/test files were then copied to the original experimental checkout, with hashes verified. No conflicts or existing production edits required overwriting. All 17 pre-existing experimental files retain their original hashes. The 51-item stash `6440a8cef1070d7192a031a2ccab617c11fc19c3` and its exact archive remain intact. No commit, tag, push or installed-app replacement occurred.

Final reviewed patch: `INDEPENDENTLY_REVIEWED_REPAIRS.patch`, SHA-256 `e21a91a6d00eac59056d0688b87bbc6bde04e28d06e2c5f17d2b822a6ab5c132`; 27 files, 812 insertions / 112 deletions. It reverse-checks against the integrated source. `post-integration-integrity.json` verifies all 27 source/test hashes, 17 original experimental files, 450 frozen evidence files, prior archive/stash, unchanged HEAD and annotated baseline tag.

## Repair dispositions

Paths below are relative to `apps/desktop/`. Exact source/test hashes are in `integration-receipt.json`.

| Repair | Decision | Independently verified behavior and limits |
|---|---|---|
| Encrypted-key failures | ACCEPT | `src/main/keys.ts`: failed decryption skips in memory without deleting ciphertext. Unit faults and actual packaged startup preserve a synthetic undecryptable entry. Real keychain lock state was not manipulated. Complete corrupt-container recovery is not claimed. |
| Atomic replacement | MODIFY | `src/main/atomicTextFile.ts`: MausBot's fourth `writeFileSync` argument was ignored by Node. Replaced with exclusive owned-fd creation, file fsync, rename and POSIX parent-directory fsync. Cleanup removes only the owned temporary file. Post-rename durability errors explicitly report `destinationReplaced: true`. Filesystem/open/write/rename/fsync faults pass. Hardware power loss and Windows directory durability remain uncertified. |
| Project recovery | MODIFY | `src/main/state/workspace-orchestrator.ts`: preserve original raw bytes by copying, rather than UTF8 decode/re-encode. An IO-unreadable newest backup refuses silent older substitution; corrupt snapshots may be skipped; future-schema data stops fallback. Failed archive/state replacement tests and actual invalid-byte packaged recovery pass. No real project was touched. |
| Recovery reporting | ACCEPT | `src/main/state/ts-actor-host.ts`: report only after actual state replacement. The real LogBus warning identifies backup and damaged-file archive. Notification remains best effort; no guaranteed recovery dialog or transactional recents bookkeeping is claimed. |
| Hermes session isolation | ACCEPT | `src/main/sclip/hermesRuntime.ts` and `hermesTerminalRuntime.ts`: writable packaged gateway directory; private creator/project/session-keyed PTY working directories; stale creator-generation checks. Native free-Nemotron control reached trusted completion in 28 requests and actually wrote under its private hashed workspace. This is namespacing, not an OS filesystem sandbox. Gateway cwd remains shared within a disposable profile. |
| Python package immutability | ACCEPT | `src/main/pythonRuntime.ts`, `index.ts`, `media/external/visualIntelligence.ts`, `sclip/localTts.ts`, `hermesBenchmarkLauncher.ts`, gateway/terminal/vision launchers: `-B` and environment protection. Actual local inference with inherited `PYTHONDONTWRITEBYTECODE=0` preserves strict package signature. Dependencies/model versions are unchanged. Arbitrary user-selected commands are outside this guarantee. |
| Vision lifecycle | MODIFY | `src/main/sclip/visionSidecar.ts`: startup-promise reset, spawn-error handling, bounded startup buffer, listener removal, expected-port check, owned-child guards and bounded health/request HTTP deadlines. Disposal kills its captured child, never a replacement. Real child timeout/retry, missing executable, hanging HTTP and replacement-worker faults pass. Client timeout does not prove preemption of every MLX GPU computation. |
| Creator precedence / forgetting | ACCEPT | `src/main/sclip/creatorMemoryRetrieval.ts`: project > series > creator scope, then approval/relevance within scope. Tombstones, aliases and live/control filtering remain covered. Full memory regressions and actual 10,000-commit capacity test pass. This does not certify positive autonomous style learning. |
| Motif manifest validation | MODIFY | `src/shared/motifs/catalog.ts`: retained final-patch validation and additionally rejected string enum options, coerced numeric bounds and invalid text limits. Valid built-ins/null optional bounds remain compatible. Three new fault tests failed before the correction and pass afterward. All three built-in Motifs render/decode in the final app; malformed enum manifests are refused without history mutation. Missing `motif.define()` in arbitrary generated HTML remains a separate runtime-contract gap. |

Rejected **as written**: the ignored exclusive-create option, the decoded-text-as-exact-archive claim, unsafe worker cleanup and incomplete runtime property-shape guards. These were corrected before integration. No unrelated recommendations/features were added. Hermes still chooses creative edits; ProjectActor remains the authoritative timeline writer.

## Regression evidence

Evidence root: `/Users/adityasamant/SCLIP V1/editor/acceptance-artifacts/mausbot-repair-review-20261015/`.

- `focused-independent-2.log`: 134 focused tests pass. `fault-injection-confirmed.log`: final 40 filesystem/process fault tests pass.
- `full-vitest-final.log`: 8,288 pass / 25 skip, including all three capacity cases. The 10,000-commit case took 428.696 seconds; stack inspection identified expensive synchronous stress, not a production deadlock.
- `full-final-motif-shape.log`: after the final Motif correction, 8,292 pass / 22 intentional skips, 633 files pass / 2 skipped. The unchanged three capacity cases reuse the immediately preceding full-run proof. `ffmpeg-unskipped.log` explicitly runs the three tests initially skipped during resource staging. Counts overlap and must not be added as independent test coverage.
- `scripts-regression.log`: 105 pass. `typecheck-release-candidate.log` and `build-motif-final.log`: pass.
- Rust source/addon did not change. Prior 619 pass / 1 ignored native proof is retained within that scope; no new Cargo run is claimed.

Failures are retained. Initial dependency/generated-native metadata staging issues and test-only status/tuple-cast errors were corrected. The first recovery fixture incorrectly reopened the already-active project, which flushed its valid in-memory state before the disk fault could be exercised; the corrected fixture switches to another disposable project before corrupting the original file. No production workaround was added for that fixture mistake.

## Actual packaged execution

Final package: `package-3/mac-arm64/Sclip.app`; hashes in `repaired-package-v3-manifest.json`. Normal resource/licensing gates pass; pinned Hermes 0.20.4 / CPython 3.11.15 and Whisper 1.9.1 retained. Package is ad-hoc signed, not notarized for distribution.

`packaged-safety/`, `packaged-recovery-2/`, `native-workdir/` and `final-packaged-smoke/` distinguish non-hosted SDK probes from actual native Hermes execution:

- Real import, advancing playback clock and captured pixels; actor add/undo/redo; save/reopen; H264 **and AAC** export and decode pass.
- Cancellation after a 262,192-byte encoded chunk; the following render completed 3,261 ms after cancellation in the first repaired-package probe. This is the measured recovery result, not a universal latency bound.
- Local TTS abort followed by 60 seconds of unchanged history, a valid subsequent request, three voice aliases and two concurrent requests pass. Actual local Qwen, Whisper and SenseVoice inference succeeds; broad perceptual accuracy is not inferred.
- Synthetic undecryptable ciphertext survives startup. Damaged `FF/FE` project bytes survive exactly, backup compositions restore, and the real recovery warning is recorded.
- Final-package smoke additionally renders/decodes all three built-in Motifs and rejects malformed enum metadata without history mutation.
- Native free-Nemotron workdir control completes the legitimate current-review lifecycle in 28 requests and actually writes within its private hashed workspace. This small control does not establish general reviewer completion rate.
- Strict signatures pass after inference and native control. Post-cohort package-3 and post-placement package-4 strict signatures also PASS.

Package 1 correctly failed a resource-layout/licensing gate caused by our temporary staging layout; its files/log are preserved in a verified archive. Valid intermediate package 2 is also byte-exact archived. Only our generated intermediate directories were retired after archive verification. APFS sharing uses byte-identical files and independent inodes, with signature rechecks; frozen source/package and valuable evidence remain intact.

## Controlled editorial repeat

A/B/C use unchanged frozen briefs, footage hashes and the exact requested `nvidia/nemotron-3.5-lightning:free` route. Pricing is checked before every request; paid fallback, auxiliary inference, compression and curator are disabled. Budgets remain 60 native turns / 90 primary requests / 20 minutes. No host-selected passages, crop, effects or narrative decisions.

Current responses record the returned model ID as well as requested route. The original baseline retained its pinned request route/configuration but did not retain provider-returned model IDs; exact underlying hosted weight/backend revision cannot be retroactively proven or pinned. Reserved held-out D remains uninspected.

The first A attempt was interrupted by a verification-proxy error after an upstream timeout. Its actual project/history/traces are retained in `A-repaired/` and are not scored as a native creative result. The proxy was corrected to handle errors after headers and to stop at explicit SSE DONE; two stream/localhost fault tests pass. The owned interrupted app/worker were stopped. The one retry uses unchanged app, brief, media, model and budgets in `A-repaired-retry/`. Driver/helper snapshots are saved per trial. No creative retry with a friendlier prompt is permitted.

### Cohort Results and Editorial Assessment

All three repeat trials (A retry, B, C) completed under identical frozen conditions (prompt, footage, zero paid calls, `nvidia/nemotron-3.5-lightning:free` route).

| Trial | Target Brief & Footage | Requests / Time | Native Status | Readiness | Rendered Output | Quality Verdict |
|---|---|---|---|---|---|---|
| **A-repaired-retry** | 45s landscape tutorial highlight | 55 req / 546.4s | `incomplete` | `unverified` (`CURRENT_HERMES_RENDERED_REVIEW_REQUIRED`) | `independent-qa-partial.mp4` (45s, H.264+AAC) | **FAIL**: 55.56% empty canvas (unscaled 1280x720 in 1920x1080); cut speech ends mid-thought on "you've seen people,". |
| **B-repaired** | 35s portrait tutorial video | 38 req / 401.0s | `completed` | `current_review_and_media_verified` (`conclude_no_repair`) | `finished.mp4` (34.97s, H.264+AAC, 15 caption layers) | **TECHNICAL PASS / QUALITY FAIL**: 15 captions generated, target duration met; BUT video unscaled/unframed in 9:16 portrait canvas (`scale_x: 1, scale_y: 1, pos: (0,0)`), speech is only introductory preamble without lesson. |
| **C-repaired** | 60s educational interview highlight | 48 req / 445.7s | `incomplete` | `unverified` (`CURRENT_HERMES_RENDERED_REVIEW_REQUIRED`) | `independent-qa-partial.mp4` (60s, H.264+AAC) | **FAIL**: Zero editing intelligence (verbatim 0–60s slice); speech cuts off mid-sentence ("That's the way that organic matter is."). |

Across all three cases, technical pipeline integration and error recovery were demonstrated, but editorial reasoning under the free Nemotron model consistently fails to deliver professional rough cuts.

## Remaining boundaries

Clean physical supported Mac, Developer ID/notarization, Windows-specific durability and blinded professional-editor review remain unverified/external gates. Canonical positive style learning, broad perceptual accuracy and arbitrary authored Motif JavaScript remain uncertified. No paid comparison or major architecture change occurred. No creator-ready/public-launch claim is made.


## Final system status and next action

| System / exact scope | Status | Remaining boundary |
|---|---|---|
| Patch integrity, preservation and integrated-source identity | PASS | Uncommitted experimental checkout only; frozen refs/archives intact. |
| Tested atomic writes and project recovery on current macOS | PASS | Hardware power-loss and Windows directory durability unverified. |
| Encrypted-key nondeletion | PASS | Synthetic failed-decryption startup; no real locked-keychain test. |
| Hermes creator/session namespace and stale-generation handling | PASS | Not an OS security sandbox; shared gateway cwd scope documented. |
| Supported Python launch immutability and package signature | PASS | No guarantee for arbitrary terminal commands that rewrite a bundle. |
| Vision startup/HTTP bounds and owned-child cleanup | PASS | GPU-compute preemption and universal perceptual accuracy unverified. |
| Memory precedence, tombstones and alias/control filtering | PASS | Positive autonomous correction-to-style learning remains PARTIAL/uncertified. |
| Valid Motif manifests and three built-ins | PASS | Arbitrary generated HTML runtime validity remains PARTIAL; missing define case unresolved. |
| Centered-cover initial video/image placement | PASS | Unknown probe dimensions safely keep identity; encoded black bars/subject-aware reframing are separate. Later framing remains editable. |
| Packaged local workflow on this Mac | PASS | Clean physical-machine install and complete all-model first-run provisioning remain BLOCKED/PARTIAL respectively. |
| Consistent native reviewer completion | PARTIAL | Small trusted control passes; matched editing cohort only 1/3 completes. Guards retained. |
| Faithful complete captions | PARTIAL | Real B trial exposes mixed usable/missing word-timing segment omission; not repaired here. |
| Coherent professional rough cuts | FAIL in this cohort | 0/3 demonstrated; source grounding, execution and self-review remain. |
| Public distribution / professional acceptance | BLOCKED | Developer ID/notarization, clean physical device and consenting professional-reviewer studies absent. |

Stop for review before a major architecture change or paid-model comparison. The recommended next small experiment is the existing-Hermes evidence/claim workflow in the editorial diagnosis, alongside an objective caption-preservation regression. No second creative agent, automatic subjective approval or hardcoded montage is proposed. No paid inference or architecture redesign occurred.

Final evidence seal: `final-evidence-manifest.json` plus its `.sha256` pin covers retained files and symlink targets. Test/QA tooling snapshots are in `tooling/`; original per-trial drivers remain intact. The final owned-process scan found no remaining app/worker/test process matching this isolated review. No background work remains running.
