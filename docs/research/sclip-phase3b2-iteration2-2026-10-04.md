# Phase 3B.2 iteration 2 — evidence grounding and review execution

## Implementation

Hermes retains issue selection, repair selection and evaluation. Infrastructure initializes an authenticated, project-bound review session before Hermes starts. The session guard survives MCP reconnects. Four diagnosis inspections reach a decision point; one reasoned extension is bounded. Hermes can select a receipt-grounded issue or conclude no justified repair with current evidence. Repairs require checkpointing, fresh state and relevant reinspection; repair cycles and final inspection are bounded. No issue or creative action is selected by deterministic code.

Timeline frame/range requests reject invalid coordinates before rendering or visual inference. `timeline_t_us` names composition time; legacy `t_us` remains a timeline alias. Source inspection uses existing native media frames through `vision_inspect({media_id, source_t_us, question})`. Responses carry coordinate space, origin and identifiers. Review receipts bind observations to authoritative editorial state; background proxy bookkeeping does not invalidate otherwise unchanged evidence.

## Coordinate inventory

| Path | Coordinates and provenance |
|---|---|
| vision_inspect / inspect_timeline_frame | Current composition timeline; explicit timeline_t_us (legacy t_us); strict bounds |
| vision_inspect with media_id / source_t_us | Original source media; strict media duration bounds |
| render_timeline_range / get_timeline_context | Current composition timeline ranges |
| get_media_context / get_source_observations / media resources | Original source media timings |
| analyze_clip | Original source timing in output |
| describe_clip | Owning composition window input; original source timing in output |
| compare_frames | Original source timestamp for each referenced clip slice |
| transcribe_clip / detect_pauses | Owning composition timings; source-derived evidence |
| extract_clip_audio | Owning composition window, with explicit source bounds where supplied |
| Cached media transcript | Original source timings; differs from transcribe_clip composition output |
| Current layer mapping | t_start_us/t_end_us timeline; source_start_us/source_end_us source |

Source-derived evidence cannot certify current rendered visuals. Current frame receipts are required for frame claims; render receipts for render claims. Empty or stale conclusions cannot pass a grounded review.

## Deterministic checks

Typecheck passed. Seven focused suites, 67 tests passed, covering valid 20s/60s timeline inspection, rejected 200s/60s timeline inspection without inference, valid 200s/600s source inspection, provenance, automatic authenticated initialization, shared lifecycle across connections, bounded diagnosis, no-repair freedom, real ProjectActor mutation/reinspection and stale-state rejection/regrounding. Desktop E2E build passed. No model calls in these tests.

## Live acceptance

Pending one review-only run of the unchanged preserved Phase 3B first-pass project. Normal objective, same OpenRouter model, 24-turn ceiling, external B-roll disabled. No raw-source rerun. Artifacts stored separately under apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/review-only-iteration2/.
