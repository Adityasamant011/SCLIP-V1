# Phase 3F — one Luna family-vlog holdout

## Verdict

**B — PARTIAL GENERALIZATION. Quality: INCOMPLETE. Agenticness: PASS.**
Luna independently created a real compact edit on materially different footage.
Its selection, speech/context verification and ending are insufficient to call
this a ready editorial improvement. No repeat, production patch or next phase.
One vlog is not evidence of generalization across all genres.

## Media / prompt / controlled run

Existing family/lifestyle source: `/Users/adityasamant/Downloads/Fun Family Morning,
Garden Update & New FS Tracksuits.mp4`, 1314.010794 seconds, 1280×720. SHA256
`759bc4124516b87899bbcc34d76ffcab43869fc59fe4d61a454416dc35329396` verified.
Exact prompt: **“Make a short, engaging family vlog from this footage. Keep the
moments that tell a natural story.”**

Empty timeline with imported media; neutral source-size 1280×720/30fps canvas.
Production Phase 3F `b8f4c03a` unchanged. Existing packet/skill/tools/local Qwen/
actor/transaction/rollback capabilities. External B-roll and Jev disabled,
consistent with previous acceptances. No expected timeline, chosen scenes, cuts,
hook recipe, repairs or parameter hints supplied by the harness. The talking-head
remains regression-only and was not used for a quality conclusion.

One session, existing full-edit launcher, 32-turn ceiling, no second review or
editorial retry. This is a creation session, not the former 16+4 review-only test.
No new continuation logic was introduced. Earlier test-command preparation failed
before test discovery/inference; the successful invocation started the only
Hermes session. No failed provider/editorial attempt was repeated.

## Model / cost / runtime

Exact `openai/gpt-5.6-luna-pro` via OpenRouter; available/tools supported in the
current authenticated catalog. Price $0.20/M input, $1.20/M output, $0.02/M cached
input (catalog higher-tier pricing above 272k prompt tokens).

Before: key limit $1.05, usage $0.651435, remaining $0.398565: conservative $0.30
gate passed. After: usage $0.90253208, remaining $0.14746792. **Usage delta
$0.25109708**, also matching account balance delta; assumes no concurrent spending
on that key. No credit purchase or limit change by Codex.

Hermes runtime **453.083s (7m33s)**; overall Electron test including preparation and
render approximately **7.9m**. CLI reports 76 tool calls including discovery/skill
reads; actual MCP editing/evidence calls **29**, plus one resource read and three
tool-list requests. Exact provider iteration counter is not exported; the session
returned normally below the 32-turn ceiling, without timeout/provider failure.

## Understanding / Hermes-selected plan

Initial packet was supplied and fetched again. Media context reported no cached
transcript. Hermes discovered transcription and analysis tool schemas but made
**zero `transcribe_clip` calls**. It requested source observations over all source
regions: four oversized requests rejected; it recovered using smaller windows,
for 11 successful requests, mostly 17–20 seconds each locally. Coarse source
observations were its main selection evidence; exact speech remained unknown.

Hermes chose a warm family-morning → family interaction → outdoor beat → clothing
reveal arc, its own 90-second duration, four ranges and rationales. It validated
and dry-ran its own plan, checkpointed and applied it through the existing
`apply_rough_cut_plan` tool contract. This is one atomic rough-cut commit, not
`apply_repair_transaction`; no repair transaction was used.

| Timeline seconds | Source seconds | Duration |
|---|---|---|
| 0–10 | 28–38 | 10s |
| 10–30 | 160–180 | 20s |
| 30–65 | 360–395 | 35s |
| 65–90 | 790–815 | 25s |

Result: 4 VideoClip + 4 Audio, four authored links, original sound, no captions,
text, new effects, music or external media. Source ranges and values were supplied
by Hermes; infrastructure selected no creative answer.

## Verification / self-correction

Fresh post-assembly packet, timeline visual-range inspection with five labelled
frames at 0, 22.5, 45, 67.499999, 89.999999s, and background critique. Coordinate
spaces correct; no invalid source-as-timeline request observed. Clean geometry
and timeline were reported. Model observations remained separate from authoritative
state and geometric facts.

Hermes explicitly listed dialogue/exact-cut uncertainty in its plan but ended
without speech/audio verification. Visual samples and a clean critique do not
prove contextual speech quality. It called the result a **first cut**, avoiding a
strong publishability claim; its outdoor-family characterization still overstates
what the selected passage contains.

Self-correction: recovered from technical observation-window rejections. **Zero
post-assembly revisions, repair transactions or rollbacks.** Review lifecycle
file is empty: this creation session did not enter the review-only guard campaign.
Rollback capability was available but not exercised; no claim of live rollback
or a complete review-repair loop is justified.

## Independent QA (after session, never fed back)

Used exact project/history/mutation diff; native render; five preserved compositor
frames; additional exact boundary frames and regular render contact sheet; existing
local Whisper base on CPU for the 90-second edit and four source-context windows;
ffprobe, full decode, black/silence detection and audio levels. No extra paid/free
provider inference. Initial GPU Whisper attempt failed under sandbox allocation;
CPU succeeded, without production/perception changes. ASR is fallible and word
precision is not certified; files/render remain human-reviewable.

| Dimension | Finding |
|---|---|
| Story/selection | Recognizable family-to-clothing sequence, weak connective development. Outdoor passage is mainly solo clothing commentary rather than visible family activity. |
| Opening/hook | Child visible at exact opening; camera moves away to appliance/room/partial adult for much of the first 10s. A human opening exists, but sustained engagement is weak. |
| Pacing/rhythm | Three source joins; 60 of 90 seconds dominated by clothing commentary. Compression achieved, limited internal tightening. |
| Continuity/context | Last selection opens mid-discussion (“Unisex…”). Ending leaves an unresolved clause. |
| Speech ending | Edit ends approximately “…whenever I release blue Future Self products”; source context continues “they just always do incredibly well.” A clear incomplete ending. |
| Visual variety | Child/home, family/kitchen, solo driveway, solo clothing presentation; variety exists, little developed family-day progression. |
| Captions/text | None. No fabricated dialogue; absence is not automatically a defect. |
| A/V integrity | Four exact paired ranges; zero source offsets, gaps or main-track overlaps. |
| Technical validity | 90.000s H.264/AAC, 1280×720, 30fps, full decode passes. No black intervals ≥0.15s at threshold0.05; no silences ≥0.5s at−40dB; peak about−1.02dB. These are measurements, not editorial approval. |
| Final judgment | “First cut” is fair; clean topology/coverage supported. Full speech/story readiness not verified. |

The source was reduced from nearly 22min to 90s; a shorter valid extraction is
real, but improved ready-to-publish storytelling is **not established**. Quality
**INCOMPLETE**, rather than equating compression with improvement. No corruption,
A/V drift or structural regression found. Speech/context damage is introduced
by the chosen truncation. This is principally an evidence-use/editorial weakness;
no legitimate post-assembly repair was attempted and blocked by architecture.

## Agenticness

- Story/issue decisions by Hermes: YES.
- Tools by Hermes: YES.
- Parameters/durations/source ranges by Hermes: YES.
- Rough-cut batch contents by Hermes: YES; repair transaction contents: N/A.
- Rollback by Hermes: N/A, not used.
- Final quality judgment by Hermes: YES, independently checked afterward.
- Deterministic creative leakage: NO. Alternative valid edits/no repair possible.

The expressly chosen rough-cut tool creates paired A/V by its existing assembly
contract; the harness did not infer or inject partner repair operations. Its
source-sized canvas is disclosed above. No benchmark-specific creative rules,
expected choices or post-run fixes were introduced.

## Artifacts / Git / limits

Separate local artifact root:
`apps/desktop/e2e/bench-results/phase3f-rollback-generalization/vlog-live/`.
Includes prompt/configuration/preflight/cost, initial/final project, initial packet,
observable trace (thinking display omitted), MCP/coordinate/history records,
mutation before/after + Hermes plan, per-frame observations, `edit.mp4`,
`independent-qa.json`, `agenticness.json`, `causal-trace.json`, metrics and
`independent-qa/` frames, audio, ASR and technical scan. No credentials or hidden
chain-of-thought preserved.

Production remains `b8f4c03a`. This commit adds only the opt-in holdout harness and
report; prior artifacts unchanged. Working tree clean after commit.

Assessment is bounded, not a human full-motion review of every source minute.
No generalization across genres, live rollback proof or ready result claimed.
One session completed. No rerun, patch, recommendation execution or next phase.
