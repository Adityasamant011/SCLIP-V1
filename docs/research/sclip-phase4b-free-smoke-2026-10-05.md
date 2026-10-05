# Phase 4B — one $0 behavioral smoke

## Verdict

**D — FREE MODEL TOO WEAK TO ASSESS BEHAVIOR.** One session only. This is not a quality or generalization verdict. No production correction or second inference run was performed.

## Model and cost

- Exact model: `nvidia/nemotron-3-ultra-550b-a55b:free`.
- Live endpoint: `Nvidia | nvidia/nemotron-3-ultra-550b-a55b-20260604:free`; authenticated catalog access and tool calling confirmed.
- Prompt/completion prices both zero. Key usage before/after: $1.271188; key allowance remaining $0.028812; account remaining $0.454436089. Both usage deltas zero; **paid cost $0.00**.
- Isolated profile pins main and auxiliary models to this free slug, disables model fallback, and uses the existing free-only auxiliary setting. Current production skill/prompt/tools unchanged; external B-roll disabled.
- Runtime 310.268 seconds including initial evidence/launcher work; CLI reports 4m28s. 24-iteration ceiling reached. 48 CLI-reported tool messages/calls; authoritative MCP log contains 19 actual calls (completion records deduplicated): 15 media-context, 1 import, 1 add-video, 2 transcription attempts.

## Test identity

PROJECT: NEW. MEDIA: REGRESSION. PRIOR EDITORIAL EXPOSURE: YES. GENERALIZATION CLAIM: NONE.

Source: `See the foldable Motorola Razr in action! (Live product demo).mp4`.
Natural request: “Make a concise, engaging product demo from this footage that helps viewers understand the phone.”
Architecture: `c77147a1`. No expected edit, tool hint, or creative intervention.

## Behavior and tools

| Observation | Result |
|---|---|
| Initial assembly | Placeholder only: entire source added as one linked A/V pair |
| Deliberate editorial/review stage | No |
| Actual rendered-result evidence inspected | No |
| Repair attempted | No |
| Fresh relevant post-repair verification | No; repair not reached |
| ripple_cut_range | Not used |
| inspect_rendered_audio | Not used |
| inspect_timeline_temporal_window | Not used |
| Longer-range render/review | Not used |

Hermes received the initial packet, recovered from a nonexistent guessed import path, added the full source, transcribed it locally, and read twelve 60-second source windows. It exhausted its budget gathering source context. Its final answer emitted an XML-shaped proposed rough-cut tool call as text; no rough-cut execution occurred. This is insufficient evidence of the new execution/review workflow. Not calling every new tool is not itself a failure.

Four rejected requests: nonexistent import path; media-context windows exceeding the documented 60-second maximum (two); transcription without the required audio window (one, then successfully corrected). Valid subsequent calls succeeded. No demonstrated production schema/integration defect; no patch justified.

## Independent technical QA

Saved ProjectActor state contains one VideoClip and one Audio layer with an authored link. Source ranges and starts match; source bounds, media references, layer identities and interval validity pass deterministic checks. Duration 845.133333 seconds. No internal video gaps or overlaps. The video endpoint is frame-quantized and ends 9,750 microseconds after audio, less than one 30fps frame. No speech/creative repair occurred.

Full render skipped by the existing harness because duration exceeds its 600-second export ceiling. Render validity and audible final output therefore remain unverified. Review/verification lifecycle was not entered and cannot be accepted as proven.

## Failure and agency

Failure classification: **FREE-MODEL REASONING LIMITATION**. Hermes spent its bounded session on source gathering, then described an action rather than executing it. Tool mechanics operated for valid requests.

Creative decisions Hermes: **YES**. Deterministic creative leakage: **NO**. Existing explicit add-video operation creates its standard linked A/V insertion; the harness supplied no selected ranges, cuts, repair values or creative plan.

## Artifacts

`apps/desktop/e2e/bench-results/phase4b-editorial-execution/free-regression-smoke/` contains initial/final projects, prompt/configuration, initial packet, observable Hermes trace (reasoning display omitted), MCP events, mutation before/after receipt, history, metrics, independent QA, preflight/postflight and cost records. Review lifecycle and coordinate audit logs are preserved. No final render was generated.

## Validation / Git

Workspace E2E build passed. One targeted Playwright harness passed as an execution/artifact check; this does **not** imply behavioral acceptance passed. Production files unchanged from `c77147a1`. Only opt-in smoke harness and this report added. No paid inference, new holdout, rerun, or subsequent phase.
