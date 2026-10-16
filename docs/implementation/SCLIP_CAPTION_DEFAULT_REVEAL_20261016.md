# Automatic caption reveal default — 2026-10-16

Installed `/Applications/Sclip.app` now defaults valid automatic captions to word reveal, including existing saved captions without an explicit display preference. No manual switch or project migration is needed. Explicit whole-phrase choices remain respected; missing/stale timing safely retains full text. Underlying acoustic accuracy is unchanged.

Two production files changed: shared caption-display default resolver and main summary projection. ProjectActor, native Hermes, ASR and renderer architecture remain. No extra model/Hermes calls or dependency changes.

Verification:147 affected tests PASS; saved-project88/88 captions automatically reveal without any mode edits; typecheck/build PASS; all66 packaged build files match. Actual packaged default-on H.264/AAC export decodes, four word-start frames exactly match prior explicitly enabled reveal, and audio is byte-identical. Installed app updated after signature/full-copy integrity checks and passed its own fresh default-on A/V export. Original source project hash unchanged. Existing full8363-test evidence reused for unchanged systems; not claimed as a new broad-suite run.

Evidence: `/Users/adityasamant/SCLIP V1/maintenance/caption-default-20261016/REPORT.md`, `installed-pins.json`, `default-render-proof.json`, `final-check.json`. One rollback retained in that evidence directory. Obsolete backup and duplicate generated package removed only after installed PASS. Frozen baseline/stash preserved; no commit/tag.
