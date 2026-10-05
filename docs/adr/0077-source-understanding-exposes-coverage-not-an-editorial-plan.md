---
status: accepted
---

# Source understanding exposes coverage, not an editorial plan

## Context

Sparse source observations did not make unseen regions or missing speech obvious.
Hermes could select spoken material from visual evidence while acknowledging that
its dialogue context was unknown. Better evidence should support editorial
judgment without prescribing stories, source ranges or genre recipes.

## Decision

Reuse SourceObservationIndex, its local Qwen frame extractor/cache, existing
signal analysis, media metadata and transcript/word cache. Add a bounded source
coverage view and cached source speech context. A uniform grid indexes coverage;
it is explicitly not scene detection or semantic segmentation. A sampled frame
supports an instant, not the whole grid cell. Each modality has independent
availability. Missing transcript is unknown speech, not silence. Contradictory
frames remain separate observations with timestamps and provenance.

The authenticated initial edit Evidence Packet acquires at most six local frames
per source, for at most four sources. Review initialization and subsequent packet
reads use cached source evidence. State identity is rechecked after asynchronous
acquisition. Targeted tools let Hermes request deeper source evidence. Before,
selected and after speech context retain original word times, use a maximum
60-second source window and reject oversized results rather than dumping a full
transcript. Cached source evidence cannot verify the changed timeline.

A source map is bounded to 12 coverage cells, 24 observations and 9KB; explicit
truncation identifies omitted evidence. The overall Evidence Packet retains its
28KB bound. Cache scans read at most 64 entries and disclose incomplete scans.
No second model, service, editorial judge or editing architecture is introduced.

## Agency and consequences

The index ranks no segment, proposes no story/cut/repair, and publishes no actor
mutation. Hermes chooses deeper evidence, story, source ranges, pacing, all tools
and creative parameters, or no edit. General guidance says visual evidence alone
cannot establish spoken meaning, sentence boundaries or dialogue continuity;
Hermes may acquire relevant evidence or honestly leave the claim unverified.
Existing modality-correct verification, transactions and rollback remain intact.

Six samples can miss events. Local compute is bounded but not latency-free.
Transcript generation remains on demand through existing Hermes-selected layers;
this change does not introduce automatic transcription or source OCR/semantic
audio. Local source indexing currently follows the existing macOS ARM64 runtime
availability. Technical tests establish capability, not editorial improvement.
