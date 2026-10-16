# Editorial Intelligence V1: focused Hermes review-guidance experiment — 2026-10-15

## Decision

Do not promote this candidate. The pilot does not demonstrate a reliable improvement in actual editorial quality. Guidance-only changes did not reliably produce the intended evidence collection, caption repair, or contextual storytelling. Technical completion improved in one defective-edit trial and worsened on the valid control. Both arms preserved the valid control. Existing composed-frame binding failures and provider timeouts confound the comparison. The evidence supports keeping the caption fix and investigating the concrete sensing/argument/claim failures before further prompting experiments; it does not justify a new agent or architecture.

The user subsequently explicitly authorized updating Sclip in Applications after final testing. The selected installation is the separately verified caption-fixed package, matching the primary experimental source, without this unsuccessful guidance candidate. No baseline commit/tag or real creator data was changed. The previous installed bundle is retained in this evidence directory. See installation-receipt.json and post-install verification evidence.

## Candidate and technical checks

Only three candidate files changed in the isolated review worktree: skills/weftcut/SKILL.md; apps/desktop/src/main/sclip/revisionLoopGuard.ts; its test. Diff: 41 insertions, 3 deletions. Existing skill guidance encourages bounded beginning/middle/ending samples, caption/rendered-speech comparison, source boundary context, brief fulfillment and explicit uncertainty. review_next adds a short focus hint and a schema-valid existing multi-frame example only when current receipts supply bounds and inspection is already legal. The no-repair example asks for the agent's own evidence-grounded reasoning. No state transition, completion requirement, inspection budget, creative scoring or ownership rule changed. No new agent or automatic judgment.

Focused reviewer tests: 46 PASS. Skill/package gates: 16 PASS. Typecheck/build/mac-arm64 packaging PASS; packaged review paragraph checked against source. The actual retained creator-scoped runtime also contains the new paragraph. A first sandbox/root test attempt failed network/server-dependent cases and is retained; the authorized correct-workspace run passed. No failed attempt is credited as a pass.

Candidate patch and exact source snapshots: guidance-candidate.patch and candidate-source/. Candidate stays in the isolated review worktree, uncommitted and unpromoted. Primary branch keeps the accepted caption repair and previous verified engineering repairs.

## Frozen comparison

Plan/rubric/inputs frozen before inference in evaluation-plan.json, SCORING_RUBRIC.json and input-project-pins.json. Three matched cases, six trials: original B 35-second portrait creation brief; review of the preserved original defective B edit; review of an already-good standalone landscape quote. Both arms include the SAME caption fix; the comparison is not confounded by adding caption preservation only to treatment. Original prompts/source/trials are retained.

Existing authorized tutorial source only. The defect input retains source100–135s and the 18 incomplete original captions. The valid control is a deliberately selected, complete quote at source121.88–126s with original audio, normal full-frame landscape video and faithful native-generated captions; exported control frames/decoded audio/transcript were inspected before model trials. Its brief specifically requests this single quote, not a full lesson. It is a valid control from the same footage, not independent held-out footage or a professional human study.

Counterbalanced run order: before-create, after-create, after-defect, before-defect, before-valid, after-valid. Same native Hermes, exact approved nvidia/nemotron-3.5-lightning:free route, 60 native iterations, 90 primary request ceiling, 20-minute maximum observation window; per-request live zero-price checks, max_price0, paid fallback and auxiliary/compression/curator inference disabled. No host creative repairs during trials. Local Whisper/Qwen/SenseVoice remain existing integrations. 155 recorded primary requests total; every returned served model ID is the approved route and all reported cost values are zero.

## Results

| Case | Old guidance | Treatment | Interpretation |
| --- | --- | --- | --- |
| Original creation brief | 53 requests including one around cleanup; page closed before verified completion; no finished video | 13 requests; created35s, exited without required current review; independently preserved partial only | Neither achieved trusted completion. No request-efficiency or quality win may be credited to stopping earlier. |
| Defective edit review | 22 requests,1107.559s; incomplete; added missing final caption but left other omissions | 38 requests,1049.297s; trusted completion; trimmed35s to33.533333s, left18 incomplete captions | More requests (+16), nominally58.262s less observed native time, but delays dominate and quality remains inadequate. |
| Valid quote review | 14 requests,162.145s; trusted completion; authored edit unchanged | 15 requests,184.009s; incomplete; authored edit unchanged | Both preserve the good edit. Treatment adds1 request/21.864s and loses completion in this pair. |

Trusted completions: one of three attempts in each arm; this is a tiny descriptive pilot with an interrupted creation control, not a population reliability estimate. No treatment improvement in creator-usable finished-video quality is established. No professional/human-assessed quality rate is claimed.

### Evidence collection and defect reasoning

- Old-guidance defect review attempted one inspect_timeline_range_visuals; treatment valid-control review attempted one. Both failed with actual decoder/live-compositor binding errors. Attempted tool calls are not counted as successful beginning/middle/ending perception. The existing tool name is correct; availability is conditional and this workflow exposed an actual limitation.
- Treatment defect review used ten vision_inspect calls: six successful single-frame observations and four coordinate refusals. Successful samples concentrated at the middle/ending, not a three-point whole-video review. Truncated/null-confidence observations remain fallible. No successful whole-range multi-frame observation was established by this pilot.
- The treatment identified the last uncaptained region but wrongly asserted it contained no spoken content. The actual original audio includes the additional spoken sentence. A caption gap is not silence. It trimmed both A/V layers to33.533333s, producing a cleaner stopping point at “they get distracted,” but its reasoning was partly unsupported and it left the contextual opening and substantial missing captions unchanged.
- Six record_issue attempts in that treatment contained repeated already-performed-repair narratives and invalid/inadequate range/receipt combinations; no registered repair outcomes survived in the final completion disposition. The host did not automatically certify those subjective claims as defects. It eventually concluded_no_repair against current rendered evidence. That is legitimate technical completion, not proof of correct editorial judgment.
- The old-guidance defect review added the actual final spoken caption, improving one omission, but did not repair the broader missing text or complete review. Its independent partial export is not credited as a native success.
- Treatment valid-control review acknowledged unavailable visuals and made no destructive edit. It misused record_issue for a non-defect/no-repair statement and failed completion. This is protocol/reliability friction, not evidence of a destructive false-positive repair. False-positive mutations on the one valid control: zero in both arms.
- Treatment creation chose the first35s: the actual output is a contextful introduction promising a lesson about success/failure, not a delivered explanation of the promised reason. Captions were generated by the fixed pipeline, but it made no composed multi-frame or rendered-audio inspection; a render call alone cannot establish subjective review. It exited with CURRENT_HERMES_RENDERED_REVIEW_REQUIRED. No claim of coherent autonomous delivery is made.

## Media and limitations

Each completed/partial run retains native project/tool records/reviewer outcome/provider receipts, or explicitly marked partial evidence for interruption. Independent QA sampled actual exported beginning/middle/ending, decoded all five available MP4s and ran local full-output Whisper. `cohort-metrics.json`, `qa-*.log`, and each run's independent-qa/ retain observations. Agent decisions are separate from independent findings.

Actual finished native videos: after-defect/finished.mp4 and before-valid/finished.mp4. after-create, before-defect and after-valid MP4s are explicitly independent-qa-partial exports and never count as native completion. before-create has no finished output; its last autosaved project and partial-mcp-events.json remain. The original temporary session database was removed by the inherited driver's failure cleanup, so its full native tool trace is unavailable; no complete trace or native outcome was fabricated. The page-close cause is not established and there is no corresponding new macOS crash report proving an engine crash.

The inherited harness initially kept waiting after a native turn had exited into review_required. A symmetric passive stop condition was added for subsequent runs: actual review_required plus no primary request for90s, without a new prompt or review verdict. The already-loaded after-create driver required a separate observer to save the actual status, tools, project and independent partial export, then end only that owned idle test. Its active completion latency is not cleanly measured (review_required observed by211s); passive wait/cleanup is not credited as model latency. Later profiles are retained to preserve failure evidence. These harness corrections change observation/retention, not agent prompts, tools or budgets.

Provider delays also limit inference: after-defect has one recorded upstream timeout; before-defect has two missing/timed-out responses. One401 was recorded around cleanup of interrupted before-create, after52 successful responses. It is not a paid-model fallback or successful edit. Avoid causal performance claims from these elapsed times. There were no retries to select a favorable creative outcome.

Disk free space briefly fell to1.5GiB and recovered to about5.5GiB as disposable test processes ended; no projects, packages, source or evidence were deleted to reclaim space. Final regression/installation proceeded only with adequate space.

## Speech portability proposal

SPEECH_PORTABILITY_PROPOSAL.md is proposal only; copied into docs/implementation/SCLIP_GENERATED_SPEECH_PORTABILITY_PROPOSAL_20261015.md. Reuse the existing workspace import-copy queue and ProjectActor path write-back to make placed generated originals durable in Media. Distinguish queued from verified durable completion, preserve preview-only behavior/cache originals on failure, and verify project-opening/request/source ownership at late write-back. Required acceptance replays the already reproduced cold-cache failure with all original references unavailable. No persistence production code changed.

## Final installation gate

Final primary-branch regression:8317 PASS,22 skipped;635 files PASS,2 skipped. Browser-only and separate long capacity stress excluded as explicitly recorded in the command. This verifies the selected caption-fixed primary source, not promotion of the guidance candidate. The selected caption package already passed typecheck/build/native real caption export and signature checks; installation-source-check.json verifies accepted source34 and caption source hashes. Full staged/installed bundle comparison covers16,567 file/symlink entries; prior installed app retained at previous-installed-Sclip.app. Post-install actual runtime and signature outcomes are recorded separately before final delivery. No Git commit or tag, memory deletion, real-project modification, dependency/model version change or paid call.


## Verified Applications update and post-install checks

The explicitly authorized update is complete: `/Applications/Sclip.app` is the caption-fixed verified build. The unpromoted review-guidance candidate is excluded. All16,567 file/symlink entries matched the selected package at installation; installed ASAR/executable/Info.plist pins still match after runtime tests. Original installed app retained intact at `acceptance-artifacts/review-guidance-experiment-20261015/previous-installed-Sclip.app`; its old pins match. macOS registration refreshed. Version remains0.1.8; exact bundle hashes in installed-pins.json identify this newer technical build.

Actual installed disposable-profile tests PASS: import, centered full-canvas preview, mouse-driven scrubbing, playback clock, undo/redo, three built-in Motif exports and invalid-prop refusal, save/reopen, H264/AAC export/decode, cancellation after a rendered chunk and subsequent successful render (1449ms recovery). These are mechanical controls, with hosted=false/requests0, not a native editorial completion; the inherited generic result label INCOMPLETE_NATIVE_SESSION is not counted as an editing failure or success.

Direct caption check in the updated installed executable: native local Whisper yielded19 actual segments (11with word arrays); MCP apply_transcripts retained all cached text in42cues. Actual caption-fixed MP4 exported and decoded successfully. `installed-caption-result.json` is PASS. No extra paid or hosted calls for post-install checks.

Frozen baseline HEAD/tag,51-item stash and all individually inventoried pre-existing primary file hashes were verified preserved before this intentional ledger append. No real user project, creator memory or preferences were opened/changed. No commits/tags.

Final post-caption-runtime deep/strict installed signature: PASS (`installed-final-signature.log`). Final status: `FINAL_STATUS.json`. No further experiment or background work is running.
