# Phase 4B.1 release health — 2026-10-07

## Verdict

**A — RELEASE-HEALTHY FOR PHASE 4B HOLDOUT.** No editorial/cloud provider inference was run. Paid model cost **$0.00**. This establishes deterministic/runtime readiness on this macOS development checkout, not subjective editorial quality or absence of every possible bug. Applications bundle not updated.

## Confirmed bugs fixed / caption audit correction

- Manuscript spelling alignment now sees adjacent selected cues across intentional appearance boundaries, while resegmentation remains restricted to matching appearances. A split Chinese word is corrected without erasing bold/regular styles, moving timing or inventing text. A new regression verifies spelling, separate styles, original timing and idempotence.
- The two original failing caption tests mixed bold transcript cues with regular imported cues. Matching appearances already merged correctly; their merge fixtures now explicitly match styles. The previous audit overstated the adjacent-fragment merge defect. We did **not** force merging across intentional styles to satisfy an incorrect expectation.
- Live local speech testing uncovered an audio-only QA export error: it asked the existing UI export flow for video on a timeline containing only audio. Audio evidence now uses the same existing audio-only export flow, with an M4A destination. No new mixer/export architecture or timeline edits. Video/visual QA retains its normal export path. Native Whisper successfully transcribed the resulting production mix.

## Eight logging/review failures, individually classified

| Former assertion | Classification / resolution |
|---|---|
| Verified issue → mutation → inspection | STALE TEST EXPECTATION: direct SDK handler fixture omitted request context / AbortSignal |
| Fourth mutation after checkpoint restore | OBSOLETE BEHAVIOR plus missing SDK context: current rollback first requires regrounding; attempts still remain 3 and state is unchanged |
| Mutation row carries history summary | STALE TEST EXPECTATION: omitted request context prevented the edit from executing |
| Templated summary carries interpolation | STALE TEST EXPECTATION: same request-context fixture error |
| Two commits name last change and count | STALE TEST EXPECTATION: same request-context fixture error |
| Undo without matching history entry | STALE TEST EXPECTATION: same request-context fixture error |
| No-commit call keeps mechanical log | STALE TEST EXPECTATION: same request-context fixture error |
| Concurrent hybrids attributed independently | STALE TEST EXPECTATION: same request-context fixture error |

All 27 withLog tests pass. Production logging and review guard unchanged.

## Catalog, skill, docs and copy

Catalog tests assert uniqueness, current tool membership and optional-feature differences, replacing historical counts. Skill/docs/label gates use the registered catalog, including optional source-evidence definitions, rather than incomplete fixture/source-text parsing. Docs and English/Chinese labels now include all current main-process tools, the two newer mutation tools, and `history.repair.transaction`. Phase 4B schema and registration tests pass. The skill itself was not changed.

Legacy inventory accurately describes fixture routing/outcomes, not all-tools live certification. New evidence/transaction tools have focused state/schema and live MCP tests; no missing dependency outcome is relabelled as a successful execution.

## Test safety and fixture cleanup

Real provider suites renamed `*.provider.test.ts`, always excluded by routine Vitest even if the opt-in environment leaks into CI. They also require explicit suite opt-in. Dedicated `vitest.provider.config.ts` refuses to load without `SCLIP_ALLOW_PROVIDER_TESTS=1`. A negative configuration probe verified rejection before inference; file-only discovery verified that the dedicated configuration selects exactly the two intended suites, without executing them. Other cloud E2E acceptances already have explicit opt-in gates and were not selected.

- Agent setup assertions updated for the Sclip name.
- Invalid import E2E now checks structured MCP error instead of a thrown transport exception.
- Terminal E2E uses the real local MCP endpoint and current synthetic project identity, replacing the closed-port/stale-ID assumption. Uses a fake Hermes executable, not an LLM.
- Eight obsolete private-media/empty-composition Phase 2D tests explicitly retired with rationale; supported contracts are tested by current deterministic evidence and real Electron suites.
- Historical private-transcript/creative-hard-gate benchmark retained as `realMediaVerification.test.ts.archived`, outside routine discovery.
- Local private visual fixtures and private saved-project export are explicit opt-in gates; their setup does not run routinely.
- Hermes offline file-tool expectations use canonical filesystem paths on macOS; runtime unchanged. The sibling repository's unrelated existing changes were preserved.
- Routine test workers/timeouts bounded to avoid earlier full-suite contention; production limits unchanged.

## Whisper readiness

Real Sclip profile: `~/Library/Application Support/Sclip/speech_config.json`, preferred engine `whisper_cpp`; binary `/opt/homebrew/bin/whisper-cli`; model `~/Library/Application Support/WeftCut/models/ggml-base.bin`. Both files exist. Explicit configuration is applied to the native backend before MCP starts; startup only auto-discovers a standard Homebrew binary plus `<userData>/models/ggml-base.bin` when no explicit config exists. No discovery change was necessary.

Isolated synthetic profiles intentionally lack user settings. Without configuration, inspection reports transcript unavailable explicitly; it still supplies measured audio evidence. For the live readiness check, only the existing nonsecret local Whisper configuration was copied, with no provider keys. Actual rendered synthetic speech was recognized: “This is a local speech recognition test, the phone folds neatly and fit”. This proves local recognition/mix plumbing, not perfect ASR accuracy. No cloud fallback or downloads.

## Final results

| Gate | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Desktop TypeScript (594 files) | 8,007 | 0 | 22 |
| Native Rust engine | 613 | 0 | 1 ignored |
| Build scripts | 85 | 0 | 0 |
| Hermes offline selected tool/MCP/CLI suites | 166 | 0 | 2 |
| Phase 4B focused suites (12 files; subset of desktop total) | 108 | 0 | 0 |
| Live local MCP + contrast + Whisper | 3 | 0 | 0 |
| Relevant Electron editing/audio/export | 24 | 0 after environmental rechecks | 1 |
| Terminal/xterm | 2 | 0 | 1 |

Typecheck, production desktop build, CLI build, skills build, test build and `git diff --check`: **PASS**.

### Earlier failures, not concealed

The final concurrent checks exhausted disk space. One unit run and a terminal runner were interrupted; two export cases failed with explicit ENOSPC/muxer errors. Rebuildable Rust incremental compiler cache was removed (no user projects, benchmark originals or binaries removed), restoring 2.6 GB. The full desktop suite, terminal suite and exactly those two export cases passed after cleanup. Main Electron suite had 22 passes, 2 disk failures, 1 skip; the targeted recheck added 2 passes. No product patch was based on disk exhaustion. A focused MCP run without sandbox loopback permission failed EPERM; the authorized run passed all 108 tests.

### Intentional skips / exclusions

All are nonblocking for this macOS Phase 4B holdout; detailed names are in `skipped-tests.json`:

- 8 retired Phase 2D private fixture cases: current evidence/render/speech contracts covered elsewhere.
- 8 private local vision cases + 3 text-clipping cases: manual subjective/private-frame acceptance; live synthetic Qwen temporal inspection passed.
- 2 Windows case-insensitivity cases + 1 Windows short-path watcher case: not applicable on macOS.
- 1 ignored Rust live GGUF vision test: requires separate llama/Qwen GGUF setup; current local MLX Qwen path exercised successfully.
- 2 Hermes optional MCP-catalog cases: `optional-mcps/` absent; Sclip MCP discovery/integration passes.
- 1 private saved-Hermes-project export + 1 historical offline Hermes skill probe: explicit manual fixtures; synthetic export and fake-Hermes terminal initialization pass.
- 2 provider suites excluded entirely, as required; not claimed as tested.
- Archived obsolete private creative-hard-gate benchmark excluded entirely; not claimed as tested.

## Production scope and agenticness

Production files changed: caption mutation implementation, range-export adapter, rendered-audio evidence export request, renderer export bridge, English/Chinese locales. Test configuration, fixtures/tests and documentation also changed. No ProjectActor, MCP tool schema, perception model, Hermes skill, creative procedure or review lifecycle changed. Hermes still chooses story, issue, operations, parameters, repairs and final quality judgment; no deterministic creative leakage introduced.

Artifacts: `apps/desktop/e2e/bench-results/release-health-4b1/` (logs, exact unit results/skips and local Whisper result). Original audit report retained separately. Git commits recorded in the final response.

## Exactly one next action

Run one final Phase 4B editorial holdout. Do not infer editorial quality from this deterministic cleanup. No holdout was executed here.
