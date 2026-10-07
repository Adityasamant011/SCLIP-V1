# Sclip tool health audit — 2026-10-07

## Verdict

**Not bug-free; broad core coverage passes, but release checks are not green.** This audit tests the current checkout at `ea7ce676`, built for Electron, not the previously installed Applications bundle. No production behavior was changed, and no cloud/editorial model acceptance was run. Local Qwen perception and Kokoro synthesis were exercised.

## Results

| Check | Result |
|---|---|
| Typecheck | PASS |
| Desktop / CLI / skills build | PASS |
| Native Rust engine | 613 passed, 1 ignored |
| Build scripts | 85 passed |
| Broad desktop TypeScript suite | 7,976 passed, 36 failed, 14 skipped; 576 passing / 18 failing files |
| Isolated caption / grid / history / layout checks | 132 passed, 2 caption failures; earlier grid, history and layout timeouts did not reproduce |
| Local Kokoro TTS | 4 passed in isolation, including voices/cache; earlier full-suite timeout did not reproduce |
| Evidence / source understanding / revision / rollback / transactions | 47 passed |
| Phase 4B execution / autonomous review / editorial revision / ripple cuts | 44 passed |
| Hermes offline tools and MCP integration | 164 passed, 2 failed, 2 skipped |
| Existing live Electron MCP/audio/text/motif/export checks | 23 passed, 2 failed |
| Button contrast check | PASS |
| New live recent-tool audit | PASS, 34.9 s |
| Real xterm interaction | PASS |
| Legacy terminal adapter E2E | FAIL: fixture points MCP at closed port, while launch now requires initial evidence |

These counts overlap; they are not a single aggregate total. Loopback and browser tests were rerun with sandbox permission after sandbox-only failures.

## Tool coverage

The real Electron server exposed **115 unique tools** with external B-roll disabled. The old inventory count assertions are obsolete. A temporary audit copy bypassed only the obsolete inventory count/completeness gates to produce actual outcomes: 108 legacy tools exercised, 90 successful executions, 12 blocked and 6 error outcomes. It uses mocked computation/perception and is not an all-tools live certification. Missing host dependencies, obsolete `layer_id` arguments, absent media dimensions and missing motif runtime explain those unsuccessful fixture executions; they do not establish 18 broken production tools. The temporary copy was removed and original tests left unchanged.

A new synthetic Electron regression test calls the current MCP transport and checks:

- Import, linked A/V insertion and one-second ripple removal; resulting duration 5 s, authoritative relationship/geometry receipts.
- Explicit transaction parameter write; receipt records successful commit and opacity 0.8.
- Rejection of stale state and out-of-range timeline audio requests.
- Actual production-mix audio render: nonzero RMS, timeline provenance.
- Two composed temporal samples with successful local Qwen observations and current state provenance.
- Evidence Packet, catalog discovery and revision status.

The newer multi-operation atomicity, rollback, A/V freedom, stale evidence and modality gates are covered by focused deterministic tests. This is not an autonomous Hermes editorial quality acceptance.

## Reproduced defects and release gaps

1. **Caption correction:** two synthetic state tests consistently fail in isolation. Adjacent manuscript fragments remain split, and a split Chinese word is not corrected to the manuscript spelling. See `src/main/state/mutations/textCorrection.test.ts:76` and `:158`.
2. **Missing integration copy/docs:** `ripple_cut_range` and `apply_repair_transaction` lack expected documentation/tool labels. `history.repair.transaction` is missing locale copy. These are real completeness gaps, even though execution passes.
3. **Stale validation infrastructure:** catalog counts, skill conformance, renamed WeftCut setup text and older review fixtures drifted from the current implementation. Several legacy inspection tests reference missing private media/transcripts or use empty compositions. The export acceptance fixture is missing. MCP flip E2E expects a thrown exception instead of the current structured tool error.
4. **Unresolved logging/review assertions:** eight `withLog` tests fail, including mutation attribution and old review expectations. Their host fixtures need reconciliation before asserting whether production logging or just fixtures are wrong.
5. **Test policy risk:** the normal unit glob includes `realHermesValidation.test.ts`, which can launch real provider inference without an explicit opt-in gate. The elevated broad rerun excluded it and `hermesVisionInspect.test.ts`; this must be gated before routine unrestricted CI runs.

## Hermes and dependencies

The two Hermes offline failures are `/tmp` versus macOS canonical `/private/tmp` expectations in file-tool tests. They do not demonstrate broken writes/patches. Discovery, toolset configuration, MCP pagination/schema cache, file and terminal tests otherwise passed.

An isolated, credential-free Hermes inventory produced 33 definitions across 15 available toolsets. Optional web, remote vision, generation, messaging, browser and other integrations reported missing setup. These are not all configured or live-tested. No messages or external creative actions were sent.

In the fresh synthetic Sclip profile, rendered audio correctly returned measurements but explicitly reported local speech recognition unavailable because no Whisper binary was configured. This does not prove the user's existing profile is broken, but speech transcription was not end-to-end certified by this live test.

## Limits / next work

This is a broad deterministic and synthetic runtime audit, not proof of absence of bugs, every OS configuration, all optional services, subjective perception accuracy or provider behavior. The Applications bundle was not replaced. Fix reproduced caption defects and integration copy, reconcile failing fixtures/logging assertions, and gate inference tests before calling the release healthy.

## Artifacts and Git

Artifacts: `apps/desktop/e2e/bench-results/tool-health-2026-10-07/` contains logs, live catalog, legacy handler matrix and recent-tool outcomes (ignored test artifacts).

Added: `apps/desktop/e2e/electron/tool-health-audit.spec.ts` and this report. Production files unchanged. No new commit created during this audit.
