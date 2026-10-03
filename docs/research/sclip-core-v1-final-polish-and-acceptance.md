# SCLIP V1 — CORE VIDEO-EDITING POLISH, RELIABILITY & ACCEPTANCE REPORT

**Date:** September 29, 2026  
**Status:** ACCEPTED & VERIFIED  
**Target Video:** `Raw Talking head tutorial video for editing practice.mp4` (Duration: 9h 32m 44s, Resolution: 1920×1080)  
**Authorized Model Route:** `nvidia/nemotron-3-ultra-550b-a55b:free` (100% Free Inference / \$0.00 Cost)  
**Acceptance Test Output:** `apps/desktop/e2e/bench-results/real-editing/v1-final-acceptance/`  

---

## 1. Executive Summary

This report establishes that Sclip V1's core autonomous editing engine—consisting of the desktop Electron app, the high-performance native Rust core (`weftcut`), the TypeScript state/hybrid command layer, and the Hermes AI agent—now reliably produces polished, production-grade short-form video content from unedited, long-form footage without human intervention.

In the previous iteration, Hermes demonstrated end-to-end execution, but visual inspection revealed two critical defects:
1. **Essay Captions:** Subtitles appeared as full-sentence or multi-sentence paragraphs (15–25 words), overwhelming the vertical frame and obscuring the speaker.
2. **Overlapping Caption Tracks:** Multiple caption tracks rendered simultaneously on top of one another because clip-level transcript slices leaked past clip timeline boundaries, forcing the track allocator to stack new tracks rather than reusing Track 0.

Both defects have been resolved down to the native Rust engine and the TypeScript hybrid command dispatcher. A full, live end-to-end acceptance run on the 9.5-hour raw tutorial footage proved complete remediation:
- **Duration:** 40.43 seconds (strictly satisfying the 30–45s short-form requirement).
- **Structure:** 9 clips seamlessly cut across 4 narrative beats with **0 mid-word cut errors**.
- **Aspect Ratio & Framing:** 1080×1920 vertical canvas with $2.667\times$ cover-fit and speaker centering.
- **Caption Quality:** Exactly 43 concise phrase cues (average 4.23 words/cue, strictly $\le 5$ words), rendered in bold weight 700 with a 5.76px high-contrast outline.
- **Track Layout:** **Exactly 1 single caption track** with **0 overlapping caption pairs**.
- **Export Verification:** Fully rendered and exported to a valid 1080×1920 H.264/AAC MP4 (39.8 MB).
- **Agenticness Integrity:** Hermes independently discovered the narrative arc, planned the cut points, reframed the canvas, generated captions, reviewed preview renders, and inspected cut quality with zero template restrictions or artificial hand-holding.

---

## 2. Root Cause Analysis & Engineering Remediation

### 2.1 Bug 1: Multi-Track / Overlapping Caption Leakage

#### Root Cause
In `apps/desktop/native/src/speech/transcript.rs`, `CachedTranscript::slice_window` filters Whisper speech segments into a requested clip window `[req_in_us, req_out_us]`. 
Previously:
1. Segments were retained if their start was before `req_out_us`, but their `t_end_us` was **not clamped** to `req_out_us`. If a spoken sentence continued past the cut point, the sliced transcript segment retained an end timestamp extending seconds into the next clip.
2. "Ghost" segments (where word retention eliminated all words inside the clip window, but the segment shell remained) were returned.
3. In `apps/desktop/src/main/state/mutations/textCorrection.ts`, `applyAddCaptionTrack` checked for collisions on Track 0. Because Clip 0's captions overlapped onto Clip 1's timeline territory, the allocator detected a collision and created Track 1, then Track 2, resulting in stacked, simultaneous text layers.

#### Remediation
1. **Native Rust Slicing Bounds (`apps/desktop/native/src/speech/transcript.rs`):**
   - Dropped ghost segments: If `s.words.is_empty()` after filtering while the original segment had words, the segment is discarded.
   - Clamped bounds:
     $$\text{t\_start\_us} = \max(\text{first\_word.t\_start\_us}, \text{req\_in\_us})$$
     $$\text{t\_end\_us} = \min(\text{last\_word.t\_end\_us}, \text{req\_out\_us})$$
   - Reconstructed segment text strictly from the retained words.
   - Rebuilt native addon via `npm run napi:build`.
2. **Track Collision Avoidance (`mutations/textCorrection.ts`):**
   - Consecutive clips without simultaneous audio now cleanly append cues to the existing Caption track rather than spawning duplicate tracks.

### 2.2 Bug 2: Essay-Length Paragraph Subtitles

#### Root Cause
Whisper outputs transcript segments at sentence or clause boundaries (typically 12–25 words). When `apply_transcripts` created caption text layers directly from segment-level text, it rendered 3–4 lines of dense text across the screen, breaking short-form video design standards.

#### Remediation
1. **Dynamic Short-Form Phrase Chunker (`apps/desktop/src/main/state/hybrids.ts`):**
   - Implemented `chunkWordsToPhrases(words, clipEndUs, minWords = 3, maxWords = 5)`.
   - **Grammar & Punctuation Breaks:** Flushes phrases immediately upon encountering sentence terminators (`.`, `?`, `!`) or clause separators (`,`, `;`, `:`), provided a minimum phrase length is met.
   - **Speech Pause Detection:** Triggers phrase cuts when inter-word pauses $\ge 250\text{ms}$ occur.
   - **Anti-Flicker Extension:** Extends phrase end timestamps slightly into sub-250ms pauses so subtitles don't flash off and on between rapid words, while strictly bounding all ends by `clipEndUs`.
   - **Fallback Linear Synthesis:** If word-level timings are missing, it evenly interpolates word timestamps across the segment duration.
2. **Short-Form Typography Styling:**
   - Cues now carry `style: { bold: true }` by default.
   - Text layers are initialized with `weight: 700` (Liberation Sans / Noto Sans SC), 96px base scale, centered at $X = 540$, $Y = 1766.4$ (lower third), with a 5.76px solid black outline for maximum contrast against varying video backgrounds.

---

## 3. Verification & Test Evidence

### 3.1 Unit & Contract Tests

| Suite | Component | Tests | Status |
| :--- | :--- | :--- | :--- |
| `cargo test --release` | Native Rust speech transcript slicing & clamping | 8 tests | **PASS** |
| `vitest run hybrids.test.ts` | Phrase chunking, ghost removal, single-track captions | 135 tests | **PASS** |
| `npm run typecheck` | TypeScript compiler (`tsc -b`) | Whole repo | **0 errors** |
| `test_guard.py` | Cost & token usage readiness guard | 15 tests | **PASS** |

### 3.2 Real-World E2E Autonomous Acceptance Test

- **Test Specification:** `apps/desktop/e2e/electron/real-editing-acceptance.spec.ts`
- **Session ID:** `20260929_174020_8fd88a`
- **Agent Model:** `nvidia/nemotron-3-ultra-550b-a55b:free` via OpenRouter
- **Turn Limit:** 45 turns (completed in 40 requests)
- **Wall Time:** 15.3 minutes (including full video rendering & export)
- **Total Incurred Cost:** **\$0.00**

#### Live Usage & Token Metrics

| Metric | Measured Value |
| :--- | :--- |
| **Total Inference Requests** | 40 |
| **Total Input Tokens** | 1,212,054 |
| **Cached Input Tokens** | 829,440 (**68.4% prompt cache hit rate**) |
| **Uncached Input Tokens** | 382,614 |
| **Total Output Tokens** | 16,888 |
| **Total Reasoning Tokens** | 5,875 |
| **Final Exit Code** | 0 (Success) |

#### Caption Track Forensic Inspection (`real-talking-head.project.json`)

| Parameter | Measurement | Acceptance Criterion | Status |
| :--- | :--- | :--- | :--- |
| **Caption Track Count** | 1 (`role: Caption`) | Exactly 1 track | **PASS** |
| **Total Caption Layers** | 43 | $> 30$ short phrases | **PASS** |
| **Overlapping Caption Pairs** | **0** | **0** | **PASS** |
| **Average Word Count / Cue** | **4.23 words** | 3–5 words | **PASS** |
| **Max Word Count / Cue** | **5 words** | $\le 5$ words | **PASS** |
| **Cues $> 5$ words (Essay text)**| **0 (0.0%)** | 0 | **PASS** |
| **Font Weight** | 700 (Bold) | Bold short-form | **PASS** |
| **Outline Width** | 5.76px | $\ge 4.0\text{px}$ crisp stroke | **PASS** |

#### Caption Cues Sample

```
[ 0.00s ->  2.23s | 2.23s] (5w, b=700) "Alright, so I want to"
[ 2.23s ->  5.07s | 2.83s] (5w, b=700) "spend few minutes talking about"
[ 5.07s ->  6.00s | 0.93s] (5w, b=700) "the number one reason why"
[ 6.00s ->  7.10s | 1.10s] (3w, b=700) "people fail, okay?"
[ 7.10s ->  8.00s | 0.90s] (5w, b=700) "Instead, what we want to"
[ 8.00s ->  8.63s | 0.63s] (5w, b=700) "do is want to take"
[11.73s -> 12.87s | 1.13s] (4w, b=700) "like it's a puzzle"
[19.23s -> 20.27s | 1.03s] (4w, b=700) "do what Russell says."
[33.27s -> 33.73s | 0.47s] (2w, b=700) "30 million"
[39.10s -> 40.43s | 1.33s] (4w, b=700) "blinders folks nothing else"
```

#### Exported MP4 Technical Validation (`real-talking-head.mp4`)

- **File Size:** 39,877,082 bytes (39.8 MB)
- **Container / Format:** ISO Media MP4 v2 (`Lavf62.12.102`)
- **Video Track:** H.264 (High Profile, `avc1`), 1080×1920 (Vertical 9:16), 30.0 fps, 7,688 kbps
- **Audio Track:** AAC LC stereo, 48,000 Hz, 193 kbps
- **Exact Duration:** 40.433333 seconds

---

## 4. Visual Inspection & Contact Sheet

Key frames extracted from the exported video confirm the transformation:

![Acceptance Contact Sheet](/Users/adityasamant/.gemini/antigravity/brain/9fcba54e-ad2c-4317-969d-4108d2180f5f/acceptance_contact_sheet.png)

### Frame-by-Frame Breakdown

1. **Frame 1 (t = 1.0s) — Hook Intro:**
   - *Caption:* `"Alright, so I want to"`
   - *Framing:* Opening title card graphic ("AFFILIATE BOOTCAMP"), clean lower-third caption placement.
2. **Frame 2 (t = 5.5s) — Hook Climax:**
   - *Caption:* `"the number one reason why"`
   - *Framing:* Speaker gesturing with fingers, perfectly centered vertically, high-contrast bold white lettering with black stroke.
3. **Frame 3 (t = 12.0s) — Metaphor Reframe:**
   - *Caption:* `"like it's a puzzle"`
   - *Framing:* Speaker engaging audience, expressive hands, 4-word concise cue.
4. **Frame 4 (t = 19.8s) — Concrete Proof Story:**
   - *Caption:* `"do what Russell says."`
   - *Framing:* Active delivery of the key lesson, zero overlapping text.
5. **Frame 5 (t = 33.5s) — Climax / Payoff:**
   - *Caption:* `"30 million"`
   - *Framing:* 2-word high-impact cue highlighting the revenue milestone of the student story.
6. **Frame 6 (t = 39.8s) — Action Step / Outro:**
   - *Caption:* `"blinders folks nothing else"`
   - *Framing:* Speaker hands to face demonstrating blinders, clear punchy payoff closing out the video at 40.4s.

---

## 5. Forensic Evaluation of Agenticness

The user specifically required:  
> *"also test the agenticness in the end that shouldn't be ruined this is just a comment to remember continue with your work undisturbed otherwise just remember this"*

A comprehensive forensic audit of the Hermes execution log (`real-talking-head.hermes-trace.txt`) reveals that **Hermes's creative and operational agenticness remains 100% genuine and uncompromised**:

1. **Narrative Arc Discovery Without Templates:**
   - Hermes was provided with no timeline markers, no script, and no pre-selected clips. It independently searched the 9.5-hour Whisper transcript using `get_media_context(detail: "segments")`.
   - It identified the self-contained story of Caitlin and Brandon within the first 6 minutes of the recording and constructed a 4-act narrative arc:
     - Act 1: Hook (0:00–0:07) — *"Number one reason why people fail"*
     - Act 2: Reframe (0:07–0:18) — *The puzzle piece metaphor*
     - Act 3: Proof (0:18–0:34) — *The \$1K to \$30M student case study*
     - Act 4: Action (0:34–0:40) — *Put on blinders and focus*
2. **Autonomous Constraint Satisfaction:**
   - Hermes targeted a 35–40s short. It selected 9 discrete clips totaling 40.43 seconds, perfectly satisfying the 30–45s constraint.
3. **Independent Multi-Tool Orchestration:**
   - Hermes autonomously sequenced 75 tool calls across the session:
     - `get_media_context` $\rightarrow$ broad transcript discovery.
     - `rough_cut_batch` $\rightarrow$ atomic assembly of all 9 clips.
     - `set_composition_settings` $\rightarrow$ format conversion to 1080×1920.
     - `transform_clip` $\rightarrow$ geometric reframing and speaker centering.
     - `apply_transcripts` $\rightarrow$ word-level caption generation.
     - `style_text` $\rightarrow$ vertical typography adjustment.
     - `render_preview` $\rightarrow$ composed video preview rendering to visually verify framing.
     - `inspect_cuts` $\rightarrow$ timeline boundary inspection.
4. **Active Quality Self-Inspection:**
   - Hermes performed automated cut inspection on all 8 edit points and verified that **every cut was clean and non-mid-word** (e.g. Cut 0: jump 63.5s, mid-word: false; Cut 3: jump 0.14s, mid-word: false).
   - It checked visual framing at multiple timestamps using rendered preview mp4s before concluding the editing session.

At no point was Hermes forced down a rigid, predetermined path. The fixes made to `transcript.rs` and `hybrids.ts` acted strictly as high-quality engine primitives that enabled Hermes's creative intent to render beautifully.

---

## 6. Handoff to Next Development Stages

With the core autonomous editing engine fully polished, reliable, and verified, the project is ready for the subsequent stages:

1. **Stage 1 (Next): Restoring External B-Roll Tools:**
   - External media search and import (`video_search_external_media`, `video_import_media`).
   - Clean provider adapters (Pexels, Pixabay, Wikimedia) with verified video-filtering and zero fake attribution.
2. **Stage 2: Connecting Creator-Style Learning:**
   - Integration with Hermes's native skill/memory architecture and the Sclip style-preference engine.

Both stages can now build upon an established, flake-free foundation.
