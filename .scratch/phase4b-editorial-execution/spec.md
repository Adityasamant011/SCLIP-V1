# Phase 4B — deterministic editorial execution

Status: implementation complete; final checks recorded in report.md.

## Audit against the current checkout

- Production range inspection: `sclip/rangeRender.ts` already exported through
  the live production renderer/normal mix, but had a 30-second hard bound.
  The older `renderTimelineRange` remains a background approximation; new audio
  inspection explicitly uses `renderComposedTimelineRange`, never that fallback.
- Local speech: native `mcp/tools.rs::transcribe_clip` accepts a host-injected
  layer/media compute slice; local `whisper_cpp` is strict and uses existing
  audio extraction, normalized segment/word timing and content-addressed cache.
  Rendered inspection supplies an ephemeral slice over the actual export,
  never inserts it into ProjectActor, and never falls back to a cloud backend.
- Audio analyzer: existing sidecar mixes factual output with editorial labels
  and suggestions. Reusing its entire response would violate this phase's
  evidence-only contract. The new small PCM measurement function returns neutral
  threshold facts; Hermes interprets them.
- Editing: existing `applySplitLayer`, `applyRippleDeleteLayers`, ripple planner,
  actor Immer draft/validation/reconciliation/history support one atomic range
  operation. Existing repair transactions support 1–8 explicit parameter updates,
  not arbitrary split/delete scripts. No second transaction/edit engine added.
- Visual evidence: existing live compositor sampling, separate local Qwen frame
  observations, pixel/time/question/model cache and source mapping reused.
  New bounded temporal index joins those samples with authored chronology.
- Speech projection: timeline context/Evidence Packet show source-derived speech
  windows. They remain useful for intention/context; actual rendered transcript
  now independently observes the mixed result.
- Receipts: existing transaction geometry inadvertently compared video and audio
  as overlaps on a mixed track. It now uses existing visual/audio overlap classes.
- Captions, crop/transform/keyframe/fit, imported media placement on upper tracks,
  and gain/pan/fades/mute already exist. Guidance improved; no algorithms added.
- Background critique is not a readiness judge: it includes structural/layout
  checks and optional fallible perception/semantic diagnostics, and can be absent
  or stale. Tool/skill clarify scope; production reviewer was not redesigned.

## Capabilities and boundaries

`ripple_cut_range`: caller chooses seed IDs and exact frame-grid start/end plus
current packet state_version. Authored link members join the scope. Existing
ripple closes the interval across the composition; unselected conflicting
layers, locks/invalid landings reject the whole draft. Source offsets are never
synchronized. One history entry; before/after layer intervals, IDs, state hashes,
relationship changes and per-lane geometry returned. Receipt layer changes are
bounded to 256 with explicit omission count. Caller may explicitly scope overlays.

`inspect_rendered_audio`: actual production render -> decode mono 16kHz PCM ->
neutral RMS/peak/near-full-scale sample counts/quiet spans -> existing local
Whisper -> timeline-absolute recognized segments/words. Recognition unavailable
is explicit and earns no speech coverage; no audio earns neither audio nor speech
coverage. Measurements identify their thresholds and limitations. Measurement
cache keys include state, rendered bytes and range. Transcription always goes
through the native recognizer/cache, not a cached TS recognition result.

`inspect_timeline_temporal_window`: 2–5 chronological composed observations,
source mappings, sampled text and authored layer start/end/transition chronology.
Events capped at 128 with omissions; sampled layer index capped at 64/frame.
Per-frame differences/contradictions preserved. No motion/quality inference is
made about unsampled intervals. Existing pixel-specific perception cache reused.

`render_timeline_range`: default review resource ceiling 120 seconds.
SCLIP_REVIEW_MAX_SECONDS sets 1–300 seconds at process startup; values above 300
clamp to 300, invalid/nonpositive values use the default. This is not a creative
output-duration instruction. Cancellation rejects/discards evidence; a production
export already in progress is allowed to settle before its temporary output is
removed. Existing renderer cancellation behavior was not redesigned.

## Agency

Hermes chooses purpose/story, range, scope, issue, repair, tools and creative
values. The skill distinguishes purpose/assembly, deliberate finer editorial
execution and current-result review. Thinking lenses have no mandatory mutation,
effect, pacing, caption or B-roll quota. Hermes may preserve an area, choose another
repair, rollback or conclude no justified change. External B-roll unchanged/frozen.

## Changed files

Production:
- src/main/state/mutations/rangeCut.ts
- src/main/state/actor.ts; state/mcp-commands.ts; state/repairTransaction.ts
- src/main/sclip/renderedAudioEvidence.ts; timelineTemporalEvidence.ts
- src/main/sclip/rangeRender.ts; timelineVisualEvidence.ts
- src/main/sclip/evidenceModalities.ts; revisionLoopGuard.ts
- src/main/sclip/editorialEvidencePacket.ts (deeper-tool entry labels only)
- src/main/mcp/server.ts
- skills/weftcut/SKILL.md

Tests:
- state/__tests__/range-cut.test.ts; mcp/editorialExecution.test.ts
- sclip/renderedAudioEvidence.test.ts; timelineTemporalEvidence.test.ts
- sclip/reviewRangeBounds.test.ts
- state/__tests__/mcp.tool-table.test.ts (catalog expectations, including preexisting
  transaction/parameter-receipt additions)
- sclip/roughCutInspection.test.ts (configured range-bound assertion)

Paths beginning src are relative to apps/desktop.

## Test policy

Deterministic synthetic tests only: recognizer/perception responses injected in
unit tests, actual FFmpeg container/PCM decoding tested, real local MCP sessions
exercise lifecycle and range mutation. No cloud/OpenRouter requests, no local
model inference, no holdout, no model smoke or editorial quality verdict.
