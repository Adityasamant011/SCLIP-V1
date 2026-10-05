# Phase 4B deterministic report

## Verdict

**A. DETERMINISTIC PHASE 4B READY FOR FINAL HOLDOUT**

This is an engineering result, not an editorial quality or generalization claim.
No holdout and no live model test were run. Paid provider spend: **$0.00**.

## Implementation / tools

- `ripple_cut_range`: caller-authored range/scope, authored links, existing
  split/ripple primitives, atomic actor draft/validation/history, one undo,
  current-state requirement and before/after interval/relationship/geometry receipts.
- `inspect_rendered_audio`: production rendered mix, actual decoded PCM facts,
  normalized local Whisper speech/word timing or explicit unavailability;
  strict local-only recognizer, no cloud fallback, no editorial scores.
- `inspect_timeline_temporal_window`: bounded chronological composed samples,
  independent existing Qwen observations, source mappings, sampled text and
  authored chronology, provenance and explicit unknown/omitted regions.
- Range review resource ceiling: default 120s; process-start configuration
  `SCLIP_REVIEW_MAX_SECONDS`, hard maximum 300s. Not a desired edit duration.
- Existing source understanding, Evidence Packet shape, ProjectActor ownership,
  repair transactions and checkpoint/rollback architecture retained. Packet's
  deeper-tool labels now expose the new evidence paths. Mixed-lane receipt geometry
  corrected to distinguish audio from visual intervals.

The verified audit, exact file list and semantics are in `spec.md` beside this report.

## Skill / Hermes

Purpose + assembly -> deliberate finer editorial execution -> current-result
review -> optional justified localized repair -> fresh relevant verification.
Thinking lenses impose no mutation/effect/genre quota. Existing trim/split/ripple,
fit/transform/crop/keyframe, imported upper-track media, caption styling and audio
controls are discoverable options. Technical/background critique is explicitly
not an editorial readiness certificate; existing fallible diagnostics remain
observations. Framing instructions no longer mandate cover cropping universally.

## Tests

**197 PASS / 0 FAIL in 16 suites** (16-suite focused run, 2026-10-05):

Paths below are relative to `apps/desktop/src/`.

1. main/state/__tests__/range-cut.test.ts — 6 new tests
2. main/sclip/renderedAudioEvidence.test.ts — 7 new tests
3. main/sclip/timelineTemporalEvidence.test.ts — 4 new tests
4. main/sclip/reviewRangeBounds.test.ts — 5 new tests
5. main/mcp/editorialExecution.test.ts — 8 new tests
6. main/state/__tests__/mcp.tool-table.test.ts
7. main/mcp/reviewGrounding.test.ts
8. main/sclip/revisionLoopGuard.test.ts
9. main/sclip/timelineVisualEvidence.test.ts
10. main/state/__tests__/repair-transaction.test.ts
11. main/sclip/editorialEvidencePacket.test.ts
12. main/sclip/renderingTruth.test.ts
13. main/state/mutations/split.test.ts
14. main/state/mutations/ripple.test.ts
15. renderer/ripple/plan.test.ts
16. renderer/ripple/gap.test.ts

**3 additional PASS / 0 FAIL**, main/sclip/roughCutInspection.test.ts,
selected by `configured mechanical duration limit|rejects invalid timestamp bounds|deterministic content-addressed cache keys`.
17 unrelated tests in that file deliberately not executed.

Total: **200 passing**, including 30 new capability/integration tests.

- `npm run typecheck`: PASS
- `npm run build`: PASS (desktop/main/preload/renderer, CLI and skills)
- `git diff --check`: PASS

Tests cover explicit alternative ranges/repairs and no-repair, linked A/V and
intentional offsets, overlays/downstream shifts, before/after receipts, history,
rollback, stale rejection, rendered speech/word timing, real codec/PCM decoding,
quiet/signal facts, no audio, malformed data, state/byte/range cache identity,
chronology, contradictions, observation bounds, cancellation, MCP schemas and
real local MCP review -> cut -> fresh verification. Synthetic recognizer/vision
responses are injected; no local or cloud model inference is claimed by these tests.

## Free model test

**NOT RUN.** Deterministic schema/routing and actual local MCP-session tests cover
mechanical integration. No provider catalog/credential request was necessary.
No final editorial-quality verdict.

## Agenticness

- Hermes sole creative brain: YES
- Hermes chooses range/scope, issue, repair, parameters, tools and final judgment: YES
- Alternatives and justified no repair possible: YES
- Deterministic creative leakage: NO
- Genre-specific or benchmark-specific production logic added: NO
- No automatic silence/filler edit, A/V source synchronization or forced visual treatment.

## Limits

- 2–5 frame samples do not certify continuous motion. Local perception and
  recognition remain fallible; readiness still needs Hermes judgment.
- Signal measurements are mono 16kHz; thresholds and near-full-scale samples do
  not establish an audible defect. Missing local Whisper is explicit.
- Recognition uses the existing native Whisper cache/configuration behavior.
- Conflicting overlays/locks/transitions can reject the explicit cut; Hermes must
  select a technically valid scope or alternative operation. Non-unit-speed video
  is refused rather than pretending existing speed-1 splitting supports it.
- Cancellation stops evidence publication and removes the temporary output after
  an in-flight production export settles; this phase adds no new renderer abort
  mechanism. Only the root composition supports production range export.
- No actual model-driven editorial acceptance yet; none authorized for this step.

## One next action

Separately authorize one strong-model Phase 4B holdout acceptance.
Do not implement Phase 4C or run acceptance as part of this step.
