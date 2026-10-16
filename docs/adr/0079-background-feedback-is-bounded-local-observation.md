---
status: accepted
---

# Background feedback is bounded local observation

The creator requested continuous visual/audio feedback during editing. Previously,
actor changes refreshed deterministic layout checks; optional deeper review was
explicit and its legacy audio pass required multiple A-roll clips.

Keep BackgroundReviewer and its existing completion contract. Add an independent
read-only scheduler for the existing local sensing implementations, not another
creative agent. It samples after four seconds of editing inactivity, at most one
physical job and one attempt every twenty seconds. Successful unchanged state is
not repeatedly inferred. Playback/export admission, a thirty-second result budget,
local memory headroom, temporary-file cleanup and cancellation bound its work.
Noninterruptible vision inference retains its physical lease until it settles;
late results cannot become current.

Each observation captures actor event epoch, authored review state, project opening
and source stat fingerprint. Edits, A→B→A, reopening and source changes invalidate
results. It never dispatches ProjectActor mutations, writes creator preferences,
starts Hermes turns, obtains completion receipts or certifies subjective defects.

Visual evidence uses a passive current-playhead capture: no seek, pause, restore
or background recomposite. Qwen descriptions retain truncation/uncertainty. Cached
model files only: a missing cache cannot initiate downloads. Existing geometry and
pixel facts remain available when local perception is unavailable. One still does
not establish action or continuity.

Audio evidence uses at most six seconds of the production composition mix, across
all audible tracks, without an A-roll/multi-clip prerequisite. RMS/peak, threshold
quiet spans and near-full-scale counts are measurements, not editorial judgments.
Optional existing SenseVoice CPU recognition adds fallible coarse labels/text, not
word alignment, sentence completion or vocal-delivery approval. This narrowly
extends ADR 0078's initial on-demand-only scheduling; its runtime, ownership,
licensing, cache, single-thread and no-cloud constraints remain.

Foreground exports may cancel only a background render lease. They wait for actual
cleanup, bounded to five seconds, and fail visibly rather than taking a resource
still executing. A background request never cancels user/foreground exports.

The agent panel shows current status, sample coverage, missing modalities and a
session-local pause. Current compact observations can be appended once per epoch
to an existing MCP response. They add bounded context tokens, never an extra model
turn or forced repair. Hermes decides whether to inspect further, revise or abstain.
Background observations do not replace the current rendered evidence required by
legitimate completion. No paid/hosted background inference is introduced.

Initially enabled on macOS arm64; SCLIP_BACKGROUND_FEEDBACK=0 disables it at launch.
Other platforms remain explicit unsupported/disabled rather than claiming parity.
