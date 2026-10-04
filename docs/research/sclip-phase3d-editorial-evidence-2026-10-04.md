# Phase 3D — editorial evidence architecture

## Verdict

**READY FOR LIVE ACCEPTANCE — MODEL BUDGET REQUIRED.** Deterministic implementation complete; no live-model result claimed.

## Implementation / packet contents

Commit `a265c9f1` adds a bounded editorial observation index using ProjectActor, existing timeline context and cached transcripts. It is automatically preloaded through a session-specific Hermes skill for edit/review launches, preserving the configured system prompt/personality and model. Review startup supplies receipt p0; the guard persists across reconnects. Temporary context is removed on normal session exit. A new `get_editorial_evidence_packet` tool supports targeted timeline ranges after state changes or when initial sections are omitted.

The packet includes composition/state identity and source hashes; ordered video/audio ranges and current transform summaries; track counts; A/V links, overlapping shared-source candidates and offsets; cached transcription and boundary projections for both video and Audio layers; timed text; technical interval gaps/overlaps/transitions; current cached visual observations when available; explicit unavailable/truncated sections; and deeper-tool entry points. It contains no nominated issue, desired edit, repair value, genre recipe or quality score.

On the unchanged saved edit: **27,697 serialized UTF-8 bytes**, 12 source-layer entries, 12 speech entries, six A/V relationships and 12 of 53 text layers. Hard limit 28,000 bytes plus section limits. No initial visual inference is forced: when no current visual cache exists, it explicitly says not_observed and supplies the targeted range-inspection entry point. The packet is an initial summary/index, not a dump of the entire project/transcript.

## Evidence types / verification logic

Receipts identify visual, audio, speech, text, geometry and timeline dimensions, coordinate space, state hash, freshness and actual coverage. Hermes declares the dimensions its issue depends on; multimodal claims list each relevant dimension. Registration rejects unsupported dimensions. After mutation, fresh current-timeline receipts must cover all declared dimensions in the affected area. Source-only, stale, unrelated or unsampled evidence cannot satisfy verification. Video-source word cues alone are not labelled edited audible speech; packet speech coverage uses actual Audio mappings and cached timing. Receiving relevant observations does not automatically resolve an issue: Hermes decides resolved/unresolved and whether the repair was satisfactory.

Authoritative project state, deterministic measurements and model/transcription observations are separately identified. Confidence is only reported when supplied; no numerical confidence is invented.

Representative range vision now observes each frame independently with the existing local engine, bounded to 2–5 requests. Individual labelled observations preserve contradictory content; a pooled unanimous summary is not used. Perception caching keys pixels, time, question and configured vision model. Current-state visual indexes invalidate after editorial changes. Source transcript reads are reused within a timeline snapshot. Per-frame perception accuracy remains unproven by live acceptance in this phase.

The flat issue interface implements typed modality claims. Legacy RoughCutReview remains a state-level compatibility path; it should not be used to represent modality claims.

## A/V relationship handling

Ordinary MCP mutations return PAIR_RELATIONSHIP_CHANGED notes when overlapping shared-source/link relationships or relative source mappings change, appear or disappear. Notes expose before/after ranges, link basis, speeds and video-minus-audio offset/delta. Unlinked overlaps are labelled candidates rather than asserted pairs. No synchronized audio edit is forced; intentional offsets/J/L cuts remain allowed. The legacy unsolicited background repair advisory is no longer appended to mutation results. Existing explicitly requested technical calculations remain available.

## Tests / agenticness

Typecheck PASS; desktop build PASS; **15 focused suites / 206 tests PASS**. Fourteen added tests cover packet mapping and A/V relationships, certainty/provenance, bounded oversized state, source-only/stale/irrelevant and multimodal verification, actual sampled coverage, contradictory per-frame observations/cache reuse, session-scoped automatic context staging, and no creative recommendation fields. Existing coordinate, review initialization/budget, stale-state, no-op and parameter tests pass.

Agency tests demonstrate different issues under identical evidence, two distinct technically valid Hermes-selected parameter repairs through the guard and real ProjectActor, no prescribed repair values, no automatic resolution, and justified no-repair completion. Every deterministic packet field is classified as EVIDENCE, STATE, TECHNICAL INVARIANT, PROVENANCE or WORKFLOW. Deterministic agenticness **PASS**. Live issue/repair/creative-value origin audit is **NOT RUN**.

## Budget status

Authenticated OpenRouter metadata checked after deterministic gates. Luna Pro remains available. Account remaining: **$1.644849519**; key spending allowance: **$0.01922543** under its existing $0.10 limit. The preceding single Luna review cost **$0.08077457**. The remaining key allowance is insufficient for a comparable bounded acceptance, so no inference was started. No credits purchased, spending limits changed, model default changed, Nemotron/Gemini run, or benchmark edit made. Implementation/tests consumed zero provider inference credits.

## Before → after architecture

Loose discovery and sparse pooled perception → compact current observation index → Hermes-selected issue/dimensions → Hermes-selected action → observable relationship changes → fresh modality/range-matched evidence → Hermes verification decision.

This is infrastructure readiness, not proof of improved autonomous editing. Visual and transcript observations can still be wrong, and Hermes can still judge newly acquired evidence poorly.

## Next step

**A. Run one Luna Pro acceptance once model budget is available.** Not performed. The existing acceptance harness has a Phase 3D opt-in/output directory and preserves the initial packet, normal objective and single-run safeguard.

## Artifacts / Git

Root: `/Users/adityasamant/SCLIP V1/editor/apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/phase3d-evidence-architecture/`

`saved-project-packet.json`, `deterministic-metrics.json`, `budget.json`, `preservation.json`, `typecheck.txt`, `focused-tests.txt`, `build.txt`. Known prior manifests verified 68 Phase 3B files and 25 original Phase 3 files unchanged; original starting project hash remains `e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`. Phase 3C project/render hashes are recorded without modification. No new reviewed project/render exists because live acceptance did not run.

Implementation: `a265c9f1`; this report is committed separately. Benchmark evidence remains locally preserved in the ignored artifact directory. No next phase implemented.
