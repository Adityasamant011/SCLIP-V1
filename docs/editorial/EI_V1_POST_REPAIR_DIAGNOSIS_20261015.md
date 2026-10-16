# Editorial Intelligence V1 — matched post-repair diagnosis

These are three unchanged diagnostic briefs on the independently repaired **package 3**, before the subsequently requested centered-cover insertion default. No output receives retrospective credit for that later change. Hermes chose every passage, edit and review decision. Host-side exports of incomplete projects are explicitly independent QA.

Frozen reference: `sclip-core-v1-baseline`, `36987a59e5a0e3bc226fde07bf4ae241594b8f8e`. Both cohorts request `nvidia/nemotron-3.5-lightning:free`, with identical briefs, footage hashes, fresh synthetic creators and 60-turn / 90-request / 20-minute limits. Current SSE responses additionally record returned model IDs; the original driver did not retain them, so hosted backend/weight identity cannot be retroactively proven. No alternate model, paid fallback, auxiliary inference or friendly re-prompt was used. Held-out D remains uninspected.

Evidence: `/Users/adityasamant/SCLIP V1/editor/acceptance-artifacts/mausbot-repair-review-20261015/`; `editorial-comparison.json` contains actual counts, committed ranges, transforms and rejected calls. A's first attempt was excluded because a verification-proxy error interrupted it; its empty project, trace and failure recovery remain in `A-repaired/`. One unchanged retry follows the proxy correction. No poor creative result was retried.

## Observed outcomes

| Case | Frozen reference | Repaired package 3 | Actual editorial result |
|---|---|---|---|
| A landscape tutorial | Trusted completion; 24 requests / 230.106s | Incomplete current review; 55 / 546.439s | 45s paired A/V, source ~10.17–55.18s. 1280×720 upper-left in 1920×1080; 55.56% canvas outside video. Beginning depends on program context; ending “you've seen people,” is unfinished. Frozen brief asks for an editing lesson from entrepreneurship footage; this mismatch is retained and reported, not silently repaired. |
| B portrait educational clip | Incomplete; 39 / 215.820s | Trusted completion; 38 / 401.000s | 34.967s, source beginning retained. Introduces an upcoming lesson rather than delivering a complete insight. Original blurred/camera-settling opening remains. Source occupies the upper 720px of the 1920px canvas; 62.5% canvas outside video, ignoring captions. Fifteen caption layers cover only 20.267s (~58% temporal coverage, **not** word recall), omitting the opening and later speech. Final sentence does close; do not mislabel this as the A/C incomplete ending. |
| C interview highlight | Incomplete; 31 / 202.974s | Incomplete current review; 48 / 445.699s | Source 0–60s paired A/V. Original black opening/intro retained; full ASR ends “That's the way that organic matter is.” 640×360 upper-left in 1920×1080; 88.89% canvas outside video. No current trusted Hermes completion. |

All three actual MP4s decode with H264 and AAC. A/C use `independent-qa-partial.mp4`; B's `finished.mp4` is a legitimate native technical completion. Every case retains native project/history/tool records, final media, full local Whisper transcript and beginning/middle/end frames. Technical completion is 1/3 in each cohort; **0/3 useful professional rough cuts demonstrated** by this single engineering assessment. These small stochastic samples do not establish causal regression/improvement from the safety patch. The later framing default has separate tests/runtime evidence and does not solve the other quality failures.

Current cohort: 141 primary requests; all 141 usage receipts report cost zero and the approved returned model ID. Original cohort: 94 requests. No performance improvement is claimed. Rejected-call counts include legitimate safety/review refusals: A 22, B 16, C 17; these are not counts of broken tools. Per-call evidence distinguishes missing schemas/arguments, bad media/layer IDs, invalid plans, review-stage mistakes and memory-domain refusals.

Assessment uses the frozen 0–4 rubric, with scores and uncertainty in each `editorial-assessment.json`. It is not a blinded professional panel or certification of word-level cuts/audio taste. A's source/brief mismatch permits honest abstention, but abstention would not count as a useful-video pass.

## Three highest-impact causes

1. **Passage selection lacks a completed narrative proposition.** Full/partial speech is available, yet selections remain an intro or the first exact-duration chunk. A retrieved actual speech and still ended an unfinished idea. B/C retained source beginnings. This is evidence use and reasoning, not proof that Whisper is disconnected. Source timestamps and committed ranges establish what actually played.
2. **Self-review claims are disconnected from evidence and legal progression.** A/C repeatedly attempt completion while current review is missing; explicit legal next actions are returned. B does obtain current evidence and explicitly declares all requirements satisfied, while actual render/caption coverage contradicts that judgment. A valid receipt proves freshness/observation, not the correctness of Hermes's aesthetic conclusion. Preserve that distinction; do not automate subjective approval.
3. **Plan/tool grounding and rendered composition/caption checks are weak.** B sends an invalid rough-cut plan and malformed transcript payloads before falling back to simpler edits. Source-relative and layer-relative inputs are confused. New placement previously retained identity geometry; the user's later centered-cover default addresses that insertion defect. Captions expose an additional real limitation: `state/hybrids.ts` uses only word-bearing segments once any usable words exist, so transcript segments without usable words can disappear from captions. Actual `apply_transcripts` reports caption range starting at 7.2s despite audible speech from the start. Both transcript generation/timing limitations and Hermes's unverified “full captions” claim matter. No caption repair is claimed here.

Local Qwen observations remain fallible and coordinate-specific; an observation of centered source footage is not proof that the rendered composition is centered. Native traces, actual geometry and rendered frames distinguish absent observations, incorrect observations and ignored observations.

## First small experiment recommended

Keep the agent, actor, tools and safety contracts. Trial a concise **evidence-and-claim record in the existing Hermes workflow**, not a second creative agent or scripted montage:

- Retrieve candidate speech plus surrounding start/end context before choosing a passage; use supported source ranges and retain uncertainty. Hermes chooses candidates, duration, order and whether the footage can fulfill the brief.
- Ground chosen actions in actual discovered schemas; validate the Hermes-authored plan without mutation, apply it and compare returned mutation IDs/ranges with the intended edit.
- Before concluding, present the original brief alongside actual rendered beginning/ending speech, framing bounds, requested caption coverage and the exact legal review action. Hermes identifies contradictions, repairs or abstains. Infrastructure neither chooses creative fixes nor certifies subjective findings.

Separately, a small objective caption regression should preserve complete segment text when word timing is unavailable, with uncertainty labels rather than fabricated exact word timestamps. This is an execution/data-preservation repair, not an editorial strategy. It has not been implemented in this change.

Success criteria: useful outputs meet every frozen rubric dimension ≥3; complete opening/ending thought, retained meaning, requested caption words represented without unlabelled timing invention, usable composition and intelligible original audio. Require legitimate current review and actual committed/rendered output, while scoring quality separately. Do not turn abstention, mere export or MCP success into a quality pass.

Use several matched trials, preserve failures and compare call errors/latency. Then run frozen held-out D against its baseline and the candidate without tuning on D, followed by genuinely new authorized raw footage. Camera-original/multitrack podcast rushes and independent consenting professional reviewers are still needed for broader professional-workflow acceptance. No major architecture change or paid comparison is proposed without review.
