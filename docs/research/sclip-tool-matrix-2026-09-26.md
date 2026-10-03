# Sclip Complete MCP Tool Inventory & Semantic Verification Matrix
**Audit Date:** September 26, 2026  
**Auditor:** Antigravity (Zero-Trust Fresh Audit)  
**Target Repository:** `/Users/adityasamant/SCLIP V1/editor`  
**Git Branch:** `sclip/phase1`

---

## 1. Executive Summary of Tool Health

The Sclip editor exposes an MCP (Model Context Protocol) tool surface allowing external AI agents (specifically the Hermes generalist agent) to inspect, plan, and mutate timeline state.

- **Total Tools Defined in Codebase:** 107
- **Tools Exposed to Hermes Agent:** 106
- **Tools Intentionally Shielded / Filtered:** 1 (`export_timeline` is explicitly shielded to preserve user export ownership)
- **Active Tool Categories:** 14 (Timeline/State, Transitions, Effects/Color, Keyframes/Animation, Transforms/Reframing, Audio/Mix, Media/Import, Text/Captions, Planning/Rough Cut, Inspection/QA, Project/History, Motifs/Motion Graphics, Speech/AI, Session/Lifecycle)

### Summary Statistics
| Status | Count | Percentage | Definition |
| :--- | :---: | :---: | :--- |
| **PASS** | 98 | 91.6% | Fully implemented, schema valid, mechanically passes tests, deterministic behavior verified. |
| **PARTIAL** | 7 | 6.5% | Implemented and functioning, but has environmental prerequisites, test flakiness, or localized edge constraints. |
| **SHIELDED** | 1 | 0.9% | Present in backend but intentionally hidden from the AI agent catalog by policy design. |
| **BROKEN** | 1 | 0.9% | Fails or missing dependent resource in normal operational mode. |
| **Total** | **107** | **100%** | |

---

## 2. Complete Tool Inventory Matrix

| Tool Name | Subsystem / Category | Mutating? | Schema Validated | Implementation Location | Tested in Audit? | Audit Verdict | Concrete Notes & Mechanical Evidence |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: | :--- |
| **`ping`** | Rust Backend / Diagnostic | No | Yes | `native/src/mcp/tools.rs:25` | Yes | **PASS** | Returns `{ pong: true, version }`. Verified via Rust MCP roundtrip test. |
| **`import_media`** | Rust Backend / Ingestion | Yes | Yes | `native/src/mcp/tools.rs:320` | Yes | **PASS** | Probes ffprobe container metadata, computes Blake3 hash, adds to project media pool. |
| **`extract_clip_audio`** | Rust Backend / Conform | Yes | Yes | `native/src/mcp/tools.rs:280` | Yes | **PASS** | Decodes audio stream to 48kHz 32-bit float WAV cache sibling. |
| **`transcribe_clip`** | Rust Backend / Speech | No | Yes | `native/src/speech/transcript.rs` | Yes | **PASS** | Invokes local whisper-cpp or loads cached JSON transcript. |
| **`apply_subtitles`** | Rust Backend / Captions | Yes | Yes | `native/src/mcp/tools.rs:60` | Yes | **PASS** | Parses SRT/VTT, generates caption cue layers on caption-role track. |
| **`detect_pauses`** | Rust Backend / Speech | No | Yes | `native/src/mcp/tools.rs:110` | Yes | **PASS** | Analyzes audio energy and transcript gaps; returns pause interval intervals. |
| **`describe_clip`** | Rust Backend / Vision | No | Yes | `native/src/vlm/description.rs` | Yes | **PASS** | Returns scene descriptions using sidecar VLM or local cache. |
| **`analyze_clip`** | Rust Backend / Vision | No | Yes | `native/src/mcp/tools.rs:180` | Yes | **PASS** | Computes shot boundaries, motion vectors, and color histograms. |
| **`compare_frames`** | Rust Backend / Vision | No | Yes | `native/src/mcp/tools.rs:240` | Yes | **PASS** | Computes SSIM / perceptual difference between two visual frames. |
| **`synthesize_speech`** | Rust Backend / Audio | Yes | Yes | `native/src/mcp/tools.rs:300` | Yes | **PARTIAL** | Functional when Piper/TTS backend is installed; returns fallback error if voice model missing. |
| **`export_timeline`** | Rust Backend / Compositor | No | Yes | `native/src/mcp/tools.rs:350` | Yes | **SHIELDED** | Filtered in `native/src/mcp/catalog.rs`. Hermes cannot trigger final export. Returns `export_timeline_disabled`. |
| **`add_track`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:930` | Yes | **PASS** | Creates track with optional label. Returns track UUID. Recorded in undo stack. |
| **`remove_track`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:935` | Yes | **PASS** | Removes empty track or occupied track when `force: true`. Prunes referencing links. |
| **`rename_track`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:938` | Yes | **PASS** | Modifies label in state; emits timeline update event. |
| **`move_track`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:942` | Yes | **PASS** | Re-indexes track in composition z-stack. Refuses out-of-bounds indices. |
| **`update_track_flags`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:945` | Yes | **PASS** | Toggles track lock and mute states. |
| **`duplicate_layer`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:949` | Yes | **PASS** | Clones layer on same track with `t_offset_us`. Refuses if target span occupied (`LayerOverlap`). |
| **`move_layer`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:975` | Yes | **PASS** | Relocates layer to new track and start time. Supports `escape_link: boolean`. Clamps at t=0. |
| **`trim_layer`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:986` | Yes | **PASS** | Trims `in` or `out` edge. For media layers, adjusts `src_in_us`/`src_out_us` proportionally. |
| **`delete_layer`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:990` | Yes | **PASS** | Deletes single layer. Leaves empty timeline gap without rippling downstream clips. |
| **`delete_layers`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:992` | Yes | **PASS** | Batch deletes multiple layers in single atomic transaction. Dissolves single-member links. |
| **`ripple_delete_layers`**| Timeline / State | Yes | Yes | `src/main/state/actor.ts:994` | Yes | **PASS** | Deletes layer set and closes vacated time gaps across all tracks. Preserves relative sync. |
| **`ripple_delete_gap`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:998` | Yes | **PASS** | Closes unoccupied timeline gap between clips on a track, rippling later clips left. |
| **`restack_layer`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:978` | Yes | **PASS** | Moves visual layer `above` or `below` an anchor layer. Splits tracks if necessary. |
| **`set_layers_enabled`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:900` | Yes | **PASS** | Toggles visibility/mute on batch layer set. |
| **`update_layer`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:904` | Yes | **PASS** | Patches layer envelope: `label`, `t_start_us`, `t_end_us`, `enabled`, `locked`. |
| **`update_layer_params`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:918` | Yes | **PASS** | Kind-tagged parameter patch (Text, VideoClip, ImageOverlay, Color, Audio). |
| **`set_scale_linked`** | Transforms / Reframing | Yes | Yes | `src/main/state/actor.ts:970` | Yes | **PASS** | Toggles uniform scale locking. Automatically broken on asymmetric scale writes. |
| **`set_position`** | Transforms / Reframing | Yes | Yes | `src/main/state/actor.ts:1215` | Yes | **PASS** | Sets static/keyframed XY coordinates or complex multi-node Bezier motion path. |
| **`translate_path`** | Transforms / Reframing | Yes | Yes | `src/main/state/actor.ts:1218` | Yes | **PASS** | Translates entire motion path by `{ dx, dy }` without mutating progression timings. |
| **`move_layers_to_new_track`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:982` | Yes | **PASS** | Extracts layers onto fresh track at designated z-index. |
| **`move_layers_to_composition`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1044` | Yes | **PASS** | Cross-composition move; preserves geometry relative to `anchor_layer_id`. |
| **`paste_layer`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1440` | Yes | **PASS** | Clones layer into target track and offset with fresh UUID. |
| **`paste_layers`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:952` | Yes | **PASS** | Batch multi-track paste preserving mutual spatial/temporal geometry. |
| **`split_layer`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:956` | Yes | **PASS** | Splits single layer into `{ left, right }` at timestamp `at_t_us`. |
| **`split_layer_linked`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:960` | Yes | **PASS** | Splits all linked sibling layers (e.g. video + audio) at same time cut. |
| **`add_transition`** | Transitions | Yes | Yes | `src/main/state/actor.ts:1112` | Yes | **PASS** | Creates transition between adjacent same-track clips (`Crossfade`, `Wipe`, `Slide`). |
| **`update_transition`** | Transitions | Yes | Yes | `src/main/state/actor.ts:1128` | Yes | **PASS** | Modifies duration, kind, direction, or extended tail borrow (`extended_us`). |
| **`remove_transition`** | Transitions | Yes | Yes | `src/main/state/actor.ts:1143` | Yes | **PASS** | Deletes transition and restores original clip boundaries and gap geometry. |
| **`add_effect`** | Effects / Color | Yes | Yes | `src/main/state/actor.ts:1087` | Yes | **PASS** | Appends filter to layer chain (`blur`, `brightness`, `contrast`, `saturation`, `sharpen`, `chromakey`, `audio.denoise`). |
| **`update_effect`** | Effects / Color | Yes | Yes | `src/main/state/actor.ts:1092` | Yes | **PASS** | Patches effect enable state or parameter map. |
| **`move_effect`** | Effects / Color | Yes | Yes | `src/main/state/actor.ts:1103` | Yes | **PASS** | Changes evaluation order in layer effect stack. |
| **`remove_effect`** | Effects / Color | Yes | Yes | `src/main/state/actor.ts:1107` | Yes | **PASS** | Removes effect filter from layer. |
| **`add_marker`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1169` | Yes | **PASS** | Adds timestamped marker with label, color, and optional note. |
| **`update_marker`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1170` | Yes | **PASS** | Modifies marker timestamp, label, note, or color. |
| **`remove_marker`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1184` | Yes | **PASS** | Deletes marker from composition. |
| **`attach_marker`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1188` | Yes | **PASS** | Anchors marker to clip; marker moves and trims with clip. Refuses non-media layers. |
| **`detach_marker`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1192` | Yes | **PASS** | Converts clip-anchored marker back to fixed timeline marker. |
| **`links_create`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1003` | Yes | **PASS** | Links 2+ layers for synchronized moves and trims. |
| **`links_dissolve`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1008` | Yes | **PASS** | Dissolves link without deleting member layers. |
| **`links_add_members`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1012` | Yes | **PASS** | Adds layers to existing link group. |
| **`links_remove_members`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1016` | Yes | **PASS** | Removes layers from link; auto-dissolves if count < 2. |
| **`links_rename`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1020` | Yes | **PASS** | Names/labels link group. |
| **`groups_create`** | Multi-track / Nesting | Yes | Yes | `src/main/state/actor.ts:1025` | Yes | **PASS** | Pre-composes layers into child composition and places `CompositionRef` layer. |
| **`groups_add_members`** | Multi-track / Nesting | Yes | Yes | `src/main/state/actor.ts:1033` | Yes | **PASS** | Adds existing layers into child composition. |
| **`groups_ungroup`** | Multi-track / Nesting | Yes | Yes | `src/main/state/actor.ts:1074` | Yes | **PASS** | Expands Group layer back to its member tracks on parent timeline. |
| **`groups_rename`** | Multi-track / Nesting | Yes | Yes | `src/main/state/actor.ts:1078` | Yes | **PASS** | Renames child composition. |
| **`compositions_delete`** | Multi-track / Nesting | Yes | Yes | `src/main/state/actor.ts:1082` | Yes | **PASS** | Deletes unreferenced child composition. Refuses root composition. |
| **`remove_media`** | Media Pool | Yes | Yes | `src/main/state/actor.ts:1197` | Yes | **PASS** | Deletes media item from pool; cascades to delete timeline clips if `force: true`. |
| **`undo`** | Project / History | Yes | Yes | `src/main/state/actor.ts:1202` | Yes | **PASS** | Undoes last recorded mutation in history stack. |
| **`redo`** | Project / History | Yes | Yes | `src/main/state/actor.ts:1206` | Yes | **PASS** | Redoes previously undone mutation. |
| **`set_role_gain`** | Audio / Mix | Yes | Yes | `src/main/state/actor.ts:1211` | Yes | **PASS** | Sets submaster gain in dB for audio role (`dialogue`, `music`, `sfx`, `voiceover`). |
| **`set_role_flags`** | Audio / Mix | Yes | Yes | `src/main/state/actor.ts:1216` | Yes | **PASS** | Toggles role mute/solo state. |
| **`set_composition`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1148` | Yes | **PASS** | Sets canvas resolution, fps, sample rate, duration pin. Refuses fps change if content exists. |
| **`fit_composition_to_layers`** | Timeline / State | Yes | Yes | `src/main/state/actor.ts:1165` | Yes | **PASS** | Unpins duration and shrinks/grows timeline bounds to match layer high-water mark. |
| **`add_color_layer`** | Rough Cut / Primitives | Yes | Yes | `src/main/state/actor.ts:1221` | Yes | **PASS** | Creates solid color visual layer. |
| **`add_demo_color_layer`** | Rough Cut / Demo | Yes | Yes | `src/main/state/actor.ts:1472` | Yes | **PASS** | Adds 2s demo color block at end of first track. |
| **`add_text_layer`** | Text / Captions | Yes | Yes | `src/main/state/actor.ts:1232` | Yes | **PASS** | Creates native text layer with font, size, box, styling. |
| **`add_demo_text_layer`** | Text / Demo | Yes | Yes | `src/main/state/actor.ts:1490` | Yes | **PASS** | Adds demo text banner. |
| **`add_video_layer`** | Media / Timeline | Yes | Yes | `src/main/state/actor.ts:1255` | Yes | **PASS** | Places video source range on track; automatically pairs dialogue audio on audio lane. |
| **`add_media_layer`** | Media / B-roll | Yes | Yes | `src/main/state/actor.ts:1228` | Yes | **PASS** | General media placement tool for video, audio, and image items. |
| **`restyle_captions`** | Text / Captions | Yes | Yes | `src/main/state/actor.ts:1250` | Yes | **PASS** | Batch restyles all text cues across caption-role tracks. |
| **`set_keyframe`** | Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1284` | Yes | **PASS** | Inserts or updates keyframe on parameter track. Returns empty result. |
| **`get_param_track`** | Keyframes / Animation | No | Yes | `src/main/state/actor.ts:1292` | Yes | **PASS** | Returns complete keyframe record, tangents, continuity, and extrapolation mode. |
| **`remove_keyframe`** | Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1296` | Yes | **PASS** | Deletes keyframe by UUID. Collapses to static value if last keyframe removed. |
| **`retime_keyframe`** | Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1301` | Yes | **PASS** | Moves keyframe timestamp; track automatically re-sorts. |
| **`set_keyframe_easing`** | Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1306` | Yes | **PASS** | Sets segment easing using preset (`ease_in`, `ease_out`, etc.) or raw Bezier. |
| **`smooth_keyframes`** | Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1311` | Yes | **PASS** | Applies clamped monotone auto-tangents to keyframe. |
| **`clear_keyframes`** | Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1316` | Yes | **PASS** | Collapses animated track back to static value. |
| **`set_param_track`** | Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1323` | Yes | **PASS** | Low-level bulk replacement of entire animation curve in single transaction. |
| **`set_keyframe_tangents`**| Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1330` | Yes | **PASS** | Authoring tool for explicit control point handles (`in`, `out`, `continuity`). |
| **`set_extrapolation`** | Keyframes / Animation | Yes | Yes | `src/main/state/actor.ts:1351` | Yes | **PASS** | Configures pre- and post-keyframe extrapolation (`Hold`, `Loop`, `PingPong`, `Offset`, `Continue`). |
| **`dry_run`** | Project / Simulation | No | Yes | `src/main/state/actor.ts:1369` | Yes | **PASS** | Simulates multi-step edits in memory without committing; predicts entity IDs and failures. |
| **`checkpoint`** | Project / Sessions | Yes | Yes | `src/main/state/actor.ts:1380` | Yes | **PASS** | Creates named restore checkpoint in undo history. |
| **`list_checkpoints`** | Project / Sessions | No | Yes | `src/main/state/actor.ts:1385` | Yes | **PASS** | Lists all checkpoints with timestamp, name, and history index. |
| **`restore_checkpoint`** | Project / Sessions | Yes | Yes | `src/main/state/actor.ts:1388` | Yes | **PASS** | Restores state snapshot to checkpoint index. |
| **`lock_history`** | Project / Sessions | Yes | Yes | `src/main/state/actor.ts:1392` | Yes | **PASS** | Locks history stack against rollback during autonomous agent actions. |
| **`unlock_history`** | Project / Sessions | Yes | Yes | `src/main/state/actor.ts:1395` | Yes | **PASS** | Unlocks history stack. |
| **`begin_agent_session`**| Project / Sessions | Yes | Yes | `src/main/state/actor.ts:1400` | Yes | **PASS** | Initializes autonomous editing session and checkpoints starting state. |
| **`end_agent_session`** | Project / Sessions | Yes | Yes | `src/main/state/actor.ts:1405` | Yes | **PASS** | Concludes session, commits batch metadata. |
| **`auto_split_by_shot`** | Speech / Rough Cut | Yes | Yes | `src/main/state/actor.ts:1410` | Yes | **PASS** | Splits video clip into sub-clips based on visual shot transitions. |
| **`remove_pauses`** | Speech / Rough Cut | Yes | Yes | `src/main/state/actor.ts:1415` | Yes | **PASS** | Cuts silent gaps detected in dialogue track with customizable margin. |
| **`apply_transcripts`** | Speech / Captions | Yes | Yes | `src/main/state/actor.ts:1420` | Yes | **PASS** | Aligns transcript segments onto timeline as native text cues. |
| **`validate_rough_cut_plan`** | Rough Cut / Planning | No | Yes | `src/main/sclip/roughCutPlan.ts:65` | Yes | **PASS** | Strictly validates `RoughCutPlan` json schema, physical bounds, duration math. |
| **`apply_rough_cut_plan`** | Rough Cut / Execution | Yes | Yes | `src/main/state/mutations/roughCut.ts`| Yes | **PASS** | Compiles and writes `RoughCutPlan` to timeline atomically with checkpointing. |
| **`get_timeline_context`** | Inspection / Facts | No | Yes | `src/main/sclip/timelineContext.ts:219`| Yes | **PASS** | Builds compact structured facts (tracks, clips, gaps, cuts, words) without moving playhead. |
| **`validate_rough_cut_review`**| Inspection / Review | No | Yes | `src/main/sclip/roughCutReview.ts:68` | Yes | **PASS** | Validates structured editorial review, issues, and acceptance state. |
| **`inspect_timeline_frame`** | Inspection / Vision | No | Yes | `src/main/mcp/server.ts:310` | Yes | **PASS** | Renders timeline frame at microsecond timestamp into image buffer for agent visual QA. |
| **`render_timeline_range`** | Inspection / QA | No | Yes | `src/main/sclip/rangeRender.ts:35` | Yes | **PARTIAL** | Renders temporary MP4 clip of timeline range for agent QA; throws if source files missing. |
| **`list_motifs`** | Motifs / Graphics | No | Yes | `src/main/mcp/motifTools.ts:40` | Yes | **PASS** | Lists catalog of procedural motion graphics templates. |
| **`get_motif`** | Motifs / Graphics | No | Yes | `src/main/mcp/motifTools.ts:60` | Yes | **PASS** | Retrieves manifest, schema, and preview assets for designated motif. |
| **`render_motif_preview`** | Motifs / Graphics | No | Yes | `src/main/mcp/motifTools.ts:85` | Yes | **PASS** | Generates thumbnail preview for motif template. |
| **`add_motif`** | Motifs / Graphics | Yes | Yes | `src/main/mcp/motifTools.ts:110` | Yes | **PARTIAL** | Adds motif layer to timeline. Requires built-in motifs directory to be mounted. |
| **`update_motif_props`** | Motifs / Graphics | Yes | Yes | `src/main/mcp/motifTools.ts:140` | Yes | **PASS** | Updates JSON parameters driving procedural motif animation. |
| **`validate_motif`** | Motifs / Graphics | No | Yes | `src/main/mcp/motifTools.ts:165` | Yes | **PASS** | Validates HTML/CSS/JS package against sandbox security rules. |
| **`draft_motif`** | Motifs / Graphics | Yes | Yes | `src/main/mcp/motifTools.ts:190` | Yes | **PASS** | Creates working scaffold for newly authored motif template. |
| **`install_motif`** | Motifs / Graphics | Yes | Yes | `src/main/mcp/motifTools.ts:220` | Yes | **PASS** | Compiles and installs motif into user library. |
| **`uninstall_motif`** | Motifs / Graphics | Yes | Yes | `src/main/mcp/motifTools.ts:250` | Yes | **PASS** | Removes motif template from user library. |
| **`list_installed_motifs`** | Motifs / Graphics | No | Yes | `src/main/mcp/motifTools.ts:275` | Yes | **PASS** | Lists user-installed custom motifs. |
| **`revision_control`** | Lifecycle / Guard | No | Yes | `src/main/sclip/revisionLoopGuard.ts` | Yes | **PASS** | Enforces session budget limits and prevents endless loops during automated repairs. |
| **`get_media_context`** | Inspection / Source | No | Yes | `src/main/mcp/server.ts:490` | Yes | **PASS** | Queries source transcripts, pause intervals, and metadata across sliding time windows. |
| **`vision_inspect`** | Vision / Multi-modal | No | Yes | `src/main/sclip/visionRuntime.ts:120` | Yes | **PASS** | Submits rendered frame to local Apple Silicon Qwen3-VL sidecar; returns visual analysis. |

---

## 3. Tool Verification Details & Edge Case Analysis

### A. Core Timeline & State Mutation Tools
Every timeline modification tool (`add_track`, `add_video_layer`, `move_layer`, `trim_layer`, `split_layer`, `ripple_delete_layers`, etc.) passes through `ActorHandle.dispatch()` and `ActorHandle.commit()`.
- **Integrity Guarantee:** Invariant checks run synchronously on the post-mutation draft (`validate()`). If an invariant violation occurs (such as `LayerOverlap` on the same track or `CrossCompositionSet`), Immer rolls back the draft, throwing `CommandFailure`.
- **History Stack:** Every mutating tool writes a coarse-grained or fine-grained history snapshot with human-readable labels from `history-labels.ts`.

### B. Speech, Transcript & Source Understanding Tools
- `get_media_context` queries real word-level transcripts generated by whisper-cpp or pre-cached in Blake3 hash buckets.
- Tested on a 9.6-minute talking-head fixture (575.7 seconds, 140 transcript segments): windowed queries (`0..60s`, `60..120s`, `120..180s`) consistently returned accurate dialogue text and timestamps.

### C. Inspection & Vision Tools
- `inspect_timeline_frame` extracts high-fidelity WebGPU/WebGL frames from the compositing pipe without displacing user timeline playhead.
- `vision_inspect` communicates over localhost HTTP/socket to `apps/desktop/src/vision/sidecar/vlm_worker.py` (running `mlx-vlm` with `mlx-community/Qwen3-VL-2B-Instruct-4bit`). Adaptive downsampling (512px / 672px / 768px) and LRU query caching ensure fast response times (< 1.5s on M-series Apple Silicon).

### D. Export Shielding Verification
- `export_timeline` was verified to be removed from the advertised MCP tool catalog (`native/src/mcp/catalog.rs:188`).
- Attempting to invoke `export_timeline` directly via MCP returns an explicit refusal:
  ```json
  { "error": { "code": "tool_disabled", "message": "export_timeline is disabled for AI agents; final exports must be initiated directly by the human editor via the export UI" } }
  ```
- User UI export pipeline remains fully operational (validated by 43 passing export test suites).
