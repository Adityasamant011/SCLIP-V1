# Phase 4A — one Luna product-demo holdout

## Verdict

**QUALITY: IMPROVED. GENERALIZATION: B — PARTIAL GENERALIZATION.**
Architecture audited at `b5c0daa1`; no production change before/during/after the
acceptance. Exactly one session, no editorial retry or patch. No expected edit
was authored. This demonstrates useful evidence acquisition and a coherent new
product edit, not complete autonomous quality assurance or cross-genre proof.

## Model / cost / runtime

`openai/gpt-5.6-luna-pro` through OpenRouter. Preflight 18:22:02 UTC confirmed
availability, authenticated catalog access and tool calling. Key remaining
$0.39746792 exceeded the $0.30 complete-run headroom. No allowance was changed.
Normal-context pricing: $0.20/M input, $1.20/M output, $0.02/M cached input reads.

Provider cost **$0.31660882**, measured by key usage delta
$0.90253208 → $1.21914090; account delta agrees. No other experiment was run.
Hermes launcher runtime **422.068 seconds** including initial local evidence;
CLI reported 6m20s after initialization. Harness including import/render ~7.3min.
32-turn ceiling, one session, no extension, provider failure or timeout.
90 reported Hermes tool calls; 52 logged named MCP invocations, including
asynchronous follow-up invocations. Tool/schema/resource activity is additional.

## Media / exact natural request

**See the foldable Motorola Razr in action! (Live product demo).mp4**
Source SHA256: `f1e749ae820400f5ded5418f9886db2dc2b217c414a2d6c9b03b5739e1a15e74`.
845.123583s, 1280×720, video/audio. Initial timeline empty, imported source only.

“Make a concise, engaging product demo from this footage that helps viewers
understand the phone.”

## Source understanding usage

- Initial Phase 4A map preloaded: six sampled instants across the source; four
  frame descriptions retained, two explicitly omitted by the output bound.
  Coverage still listed all six instants. Speech unknown; signal audio absent.
- Missing speech addressed: Hermes added a temporary full-source A/V pair and
  requested local `transcribe_clip` for 0–780s and 780–845.123583s with words.
  Four logged invocations represent two acquisition windows and follow-up calls.
  Backend was `whisper_cpp`; no new cloud ASR was introduced.
- Broad transcript discovery: 19 `get_media_context` calls, including 13
  60-second segment windows covering 0–780s and five precise word-range queries.
- Targeted source visuals: five independent instants at 12, 40, 70, 195 and 680s;
  ten logged invocations including follow-ups. Source and timeline coordinates
  stayed explicit; recorded coordinate checks all accepted.
- No explicit calls to the new `get_source_understanding` or
  `get_source_speech_context` tools after preload. Hermes independently used the
  existing cached transcript/range and source-frame paths instead.
- Speech/audio content was used; no signal-analysis or semantic-audio query.
  Missing text/OCR and audio measurements were not turned into creative rules.

This is consistent with intentional broader understanding and modality-aware
selection. One uncontrolled holdout cannot isolate how much behavior was caused
by the new map versus model or footage differences.

## Hermes story / structure / actual edit

Hermes authored the thesis: pocketable clamshell form plus useful camera behavior.
It chose product identification → zero-gap hinge/flat closure → selfie/group
camera use. It acknowledged studio-interview footage rather than product beauty
shots. All content decisions and source values came from Hermes's submitted plan.

| Timeline | Source | Purpose |
|---|---|---|
| 0–16.433333s | 34.160000–50.593333s | Product and vertical clamshell form |
| 16.433333–32.600000s | 182.000000–198.166667s | Sliding screen question, zero-gap hinge, flat closure |
| 32.600000–51.633333s | 686.720000–705.753333s | Outside camera as selfie/group camera |

Three VideoClip + three matching Audio layers, 11 Text layers on the opening.
51.633333s, native 1280×720 H.264/AAC render. Existing frame-grid quantization
explains small differences from Hermes's requested plan boundaries; no story,
range or partner repair was inferred by Phase 4A infrastructure.

## Opening / ending / clarity / pacing

Opening: “So the Motorola Razer is really interesting for a lot of reasons …”
It identifies the product and completes the vertical-clamshell explanation.
The cached transcription spells the product incorrectly; actual source title
identifies Razr. Opening is understandable standalone, though explanatory rather
than an especially sharp hook.

Ending: “… and when you have it open, you still have that same interaction.”
Both source-word evidence and fresh render transcription support a completed
sentence. It follows the closed-phone selfie/group-camera benefit, but is a
somewhat generic final payoff.

The three selected concepts form a coherent explanation. The hinge section has
visible phone handling; the camera payoff is mostly spoken while the guest is
shown. The edit is substantially more concise than the 14-minute interview, with
natural question/answer continuity. Pacing is reasonable but talk-heavy. No
predetermined scene count, pace, structure or duration was used to judge it.

## Self-correction / verification

Hermes corrected a rejected rough-cut dry-run/validation submission before the
successful apply. This was technical correction, not proof of editorial repair.
After assembly it acquired current timeline state, five representative composed
frames and critique; after adding opening captions it repeated visual/state
inspection. No editorial repair transaction or rollback was used.

Hermes's final claim was “created and verified” and ready for user review/export.
Its observable checks support visual/state verification, not a fresh audible
render audit. A clean background critique is not independent editorial proof.
Caption spelling/grammar defects remained. No evidence demonstrates that Hermes
noticed and corrected those defects itself.

## Independent QA

After the session finished, without feeding findings back to Hermes:

- Inspected exact saved layers, ranges, authored history, mutation snapshots and
  caption content. Three A/V pairs have identical source/timeline ranges; no
  internal main-video/audio gaps, overlaps or accumulating authored A/V offset.
- Native render probes as H.264 1280×720 + AAC, ~51.633s; full decode succeeds.
- Inspected nine actual render frames, including both sides of joins and endpoints.
  Subjects/phone are visible, canvas filled, opening captions readable. Later
  sections are uncaptained; captions were not required by the user.
- Inspected cached source words/context and independently transcribed the actual
  rendered audio using existing local Whisper. No selected boundary crosses a
  cached word; fresh rendered transcript retains complete opening/ending speech.
  QA GPU allocation failed under sandbox, so local QA used CPU; no production
  patch or additional Hermes session was made. ASR remains fallible; this is not
  a calibrated human listening or lip-sync study.
- Audio PCM comparison against independently decoded selected source gives
  correlations ~0.982–0.986 with a stable ~28.3ms sub-frame shift. Original source
  video starts at 33.333ms while audio starts at zero. This alone cannot assign
  the shift to an editorial regression or prove perfect lip sync. No accumulating
  drift or serious A/V failure was established. Peak -5.7dBFS, mean -30.1dBFS;
  dialogue is quiet and no loudness mastering was done.
- Caption defects: “Razer” rather than Razr; malformed recognized phrasing such
  as “I'm granted.” Captions reproduce uncorrected ASR output and only cover the
  opening. These are observable text defects, not a reason to patch this holdout.

**Quality IMPROVED** for the requested concise product explanation, with limited
polish/verification. No serious technical regression found; added caption errors
and uneven coverage remain. This is not a fully publish-ready acceptance.

## Agenticness

**PASS.** Story, ranges, tools, deeper evidence, requested timing/parameters and
optional caption application were chosen by Hermes. Existing transcript-derived
caption layout and frame-grid defaults were inherited tool behavior; no new
creative recipe was added. Infrastructure supplied evidence, legality and normal
bookkeeping. No editorial issue, range, repair or creative value was generated
by Phase 4A. Alternative story/edit/no-edit choices remained available.

Deterministic segment ranking **NO**; story selection **NO**; genre recipe **NO**;
benchmark-specific production logic **NO**. The holdout filename/hash/prompt live
only in the acceptance harness/artifacts. No quality conclusion uses earlier
fixtures. Final quality judgment was Hermes's own; independent QA qualified it.

## Failure classification / generalization

**MODEL REASONING FAILURE**, limited to caption proofreading and incomplete
rendered-audio verification/overstated completion. No general infrastructure
capability blocked evidence acquisition, rough-cut creation or requested checks.
No source-index failure is inferred from explicitly bounded omissions.

**B. PARTIAL GENERALIZATION.** Hermes deliberately acquired speech and broader
source evidence, chose a coherent new product story and made a useful edit.
Complete self-correction and reliably accurate final judgment remain unproven.
One product demonstration cannot establish quality across all genres.

## Artifacts / Git

Local preserved artifacts:
`apps/desktop/e2e/bench-results/phase4a-source-understanding/product-demo-live/`.
Includes initial/final projects, native render, initial packet, exact prompt,
Hermes observable trace, MCP events, history, authored plan, mutation snapshots,
causal trace, provider cost/pre/postflight, hashes, metrics, sampled frames and
independent QA transcript/contact sheet/technical measurements.

Production stays at `b5c0daa1`. Only opt-in harness and this report are added.
No architecture/skill/prompt/tool/ProjectActor/perception/continuation changes.
No rerun, result patch or next phase executed.
