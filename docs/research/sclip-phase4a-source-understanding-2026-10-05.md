# SCLIP Phase 4A — source understanding architecture

Date: 2026-10-05. Base: `f85f8400`.

## Verdict

**Deterministic implementation PASS. Live acceptance BLOCKED — BUDGET.**
No inference session started, no editorial output generated, no quality or
cross-genre improvement established. Existing artifacts were preserved.

## Current sense stack

| Sense | Observation | Execution | Batch / cache | Coordinates | Source index use |
|---|---|---|---|---|---|
| Qwen vision | People, settings, visible activity as fallible descriptions | Existing local sidecar on macOS ARM64 | Six bounded per-frame requests per source, disk reuse; multi-image API also exists but pooled summary not used | Source; composed frames for timeline tools | Coarse and targeted visual observations |
| Transcript / word timing | Recognized speech with segment/word times | Existing configured local Whisper/FunASR or optional OpenAI engine; no generation added here | Existing source cache reused; generation on demand through selected layer | Cached source times; transcription tool owning-composition times labelled separately | Availability, segment coverage, targeted context |
| Audio analyzer | Signal measurements, tempo/beats/clipping | Existing local analyzer | Targeted source windows cached; skipped for tiny coarse frame windows | Source | Available measurement ranges/facts; no semantic audio inference |
| SourceObservationIndex | Joins frame, transcript and signal facts | Local evidence infrastructure | Disk index; at most 64 cache entries read per overview | Source | Reused as the acquisition/cache primitive |
| Source frame extraction | Exact original pixels | Existing local FFmpeg/source evidence tools | Independent frames, bounded on demand | Source | Existing extractor reused |
| Timeline compositor / range visuals | Actual composed edit and individual representative frames | Local render/perception | Existing state/pixel caches, bounded ranges | Timeline | Remains timeline evidence; source map cannot replace it |
| ProjectActor / media metadata | Authoritative state, source ranges, A/V relationships, dimensions and duration | Local deterministic | Current snapshot; no perception inference | Source plus explicit timeline mappings | Metadata and identity; existing packet supplies relationships |
| Captions / text | Saved authored text | Local authoritative state | Existing packet bounds | Timeline | Existing timeline evidence; source OCR remains unknown |
| Existing describe/analyze scene tools | Source descriptions / scene observations | Existing configured perception/native tools | Existing tool caches; on demand | Source | Available for deeper queries, not newly inferred scene segmentation |
| Optional JEV advisory | Narrative advisory | Optional external service | Existing optional path | Existing source context | Not used to construct/rank the new index; external B-roll disabled |
| Hermes | Editorial interpretation and action | OpenRouter model | Bounded text context, not raw-video upload | Explicitly labelled evidence | Sole creative decision-maker; not run in this task |

## Architecture and evidence flow

`sourceUnderstanding.ts` builds a coverage view from existing source facts.
`SourceObservationIndex` provides cached/coarse retrieval and speech context.
`get_source_understanding` defaults to cached evidence; explicit coarse acquisition
and the initial edit packet sample six uniformly spread instants per source.
Automatic sampling is evidence acquisition, not clip selection. Review startup
and later packet reads use caches. The initial map handles at most four sources;
omission is visible. Subsequent packet reads include a compact first-source view;
Hermes can request any other source explicitly.

**Coarse source map → Hermes selects targeted evidence → Hermes chooses edit.**
Twelve uniform coverage cells are explicitly not scene cuts or editorial sections.
Visual instants do not certify unseen time. Speech, signal audio, source text and
metadata have independent status. Frames retain separate descriptions, including
contradictions. Authoritative metadata, model observations/transcription and
verified signal measurements remain distinguishable.

The bounded speech-context tool retrieves before/selected/after cache segments
and original word timing. Hermes chooses source bounds and padding. Missing cache
stays unknown; it does not certify silence. No full-source automatic transcription
was added. General skill guidance requires relevant speech/audio for spoken
claims or an honest unverified result. It chooses no dialogue interpretation.

The initial packet checks authoritative state again after async acquisition.
Source evidence cannot substitute for fresh current-timeline verification.
Phase 3D modality checks, Phase 3E explicit atomic repairs, and Phase 3F rollback
coherence are preserved.

## Cost and caching

- Maximum six local frame observations per source, four sources (24 requests).
  The requests are independent per frame, not one pooled model verdict.
- Reuses existing source/hash/cache identity; separately refreshes transcript
  availability so an old visual cache does not conceal a new transcript.
- Source map: at most 12 cells, 24 observations, 9KB including cache-scan metadata.
  Overview scans at most 64 matching entries and discloses omitted cache entries.
- Speech context: at most 60 source seconds including padding, 0–10 seconds on
  each side, 12KB output limit; oversized context requests must be narrowed.
- Initial source maps bounded to 9KB combined; packet section 10KB, whole packet
  retains 28KB bound. Explicit truncation never asserts exhaustive coverage.
- No new cloud model/service. Existing local compute has latency/resource cost.
  Only bounded returned text enters paid Hermes context.

## Deterministic tests

Typecheck **PASS**. Desktop/CLI/skills build **PASS**.
**90 tests PASS in 12 focused suites; 10 new tests.** No model calls.

| Requirement | Evidence |
|---|---|
| A/B/I/J — long/bounded sources and unknown regions | Huge synthetic durations and oversized descriptions; grid/output bounds and omissions |
| C/D/H — independent modalities | Visual-only and speech-only maps retain missing modalities; separate provenance |
| E — bounded context | Before/selected/after segments, original word times, window/padding rejection |
| F — cache reuse | Six initial frame requests, zero additional requests on repeat; new transcript cache becomes visible |
| G — provenance | Source identity/hash checks reject replaced evidence; authoritative state rechecked after acquisition |
| K/L — no ranking and creative alternatives | Identical evidence supports three different authored stories/ranges/durations; no operations or ranking emitted; no edit required |
| M — no benchmark logic | Production diff and new skill section audited; no real fixture filenames/hash/text/timestamp rules introduced |
| N — regressions | Existing opening context, passage evaluation, rough-cut validation, modality verification, transactions and rollback tests pass |

Commands: root `npm run typecheck`, `npm run build:e2e`; desktop targeted Vitest
suites for sourceUnderstanding, sourceObservationIndex, sourceObservationMcp,
editorialEvidencePacket, evidenceVerification, rollbackCoherence,
repair-transaction, openingContext, sourcePassageEvaluation, roughCutPlan,
mcp.skill-conformance, and reviewGrounding. MCP tests bind local loopback with
mocked perception. This is focused validation, not a full repository test run.

## Agenticness audit

Architecture audit **PASS**; live model behavior **UNASSESSED**.
Story, source ranges, tools, deeper requests and cut/pacing values remain Hermes
choices. The initial coarse map is automatic infrastructure evidence acquisition;
it prescribes no deeper query or editorial action. No repair/creative parameters
are generated. Alternative edits and justified no edit remain possible.

Deterministic segment ranking: **NO**. Story selection: **NO**.
Genre recipe: **NO**. Benchmark-specific logic: **NO**.

## Fixtures and holdout

Old talking-head: **REGRESSION ONLY**.
Family vlog: **REGRESSION / REFERENCE ONLY**.

New candidate: `/Users/adityasamant/Downloads/See the foldable Motorola Razr in action! (Live product demo).mp4`.
Source SHA256: `f1e749ae820400f5ded5418f9886db2dc2b217c414a2d6c9b03b5739e1a15e74`.
845.123583 seconds, 1280×720, video/audio. Only identity/technical metadata checked;
no expected timeline or story authored.

Natural prompt: “Make a concise, engaging product demo from this footage that
helps viewers understand the phone.”

## Live gate and outcome

Authenticated metadata check at **2026-10-05 18:05:37 UTC**:
`openai/gpt-5.6-luna-pro` exists, current key catalog access and tools supported.
Pricing: $0.20/M input tokens, $1.20/M output tokens, $0.02/M cached-input reads
(normal context tier). Key allowance $1.05, consumed $0.90253208,
remaining **$0.14746792**. Account remaining $0.823092009 does not override the key
limit. Conservative complete-run headroom **$0.30** (not an expected spend target).
No limit change or purchase was made. Gate did not pass; no inference began.

Live inference cost **$0**; runtime/understanding/edit/independent media QA **N/A**.
Quality **INCOMPLETE**. Generalization evidence **NONE from Phase 4A**.
Failure classification **OTHER — provider key allowance gate**. Neither model
reasoning nor editorial quality can be evaluated from an unrun experiment.

## Known limitations

Six samples can miss events. The map is not complete footage understanding, scene
detection, semantic audio, source OCR or a readiness judge. Transcript quality is
fallible and requires existing on-demand acquisition when missing. Transcript
segments can span selection edges; words retain original times where available.
Only represented cache entries count, and observations can be explicitly omitted
under bounds. Existing macOS ARM64 source-sense availability remains; other
platforms return unavailable. Cache analysis identity uses existing version/model
keys, not a new model-weight fingerprint. No live quality result exists yet.

## Artifacts and next action

Safe readiness/preflight/test metadata:
`apps/desktop/e2e/bench-results/phase4a-source-understanding/` (local gitignored).
Architecture decision: ADR 0077. Changes and this report are committed together.

**One recommendation:** run one Luna product-demo holdout after sufficient key
allowance is available. Do not implement another phase first. No run is scheduled
or executed by this recommendation.
