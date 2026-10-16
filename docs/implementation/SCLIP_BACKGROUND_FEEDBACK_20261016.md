# Bounded continuous background feedback — 2026-10-16

Implemented, independently exercised in the packaged app, and installed at
`/Applications/Sclip.app`. The preceding installed app is retained as rollback.
No claim of human-level editorial review.

## Confirmed gap and change

Ordinary edits refreshed only cheap layout checks. Legacy optional audio analysis
required multiple A-roll clips. Added a separate read-only scheduler using the
existing Qwen, production audio mix and SenseVoice implementations; retained the
old reviewer and completion machinery. This is not another creative agent.

After a pause in edits, current pixels/geometry and up to six seconds of nearby
mixed audio are observed. The panel exposes coverage, uncertainty, unavailable
models and a session pause. Current observations can reach Hermes through its
existing MCP response, once per state/epoch. No new Hermes turn or hosted request
is started. This adds bounded context tokens to a response, not zero token cost.

Ownership captures project/opening, actor-event epoch, authored state and source
stat identity. A→B→A and cancelled/late work cannot regain authority. One physical
job remains leased until it actually settles. Background captures never seek or
pause playback. Foreground exports may preempt only background render ownership;
five-second release timeout never forcibly unlocks a live resource.

A real offline model test exposed a cache containing all MLX model assets but no
README/.gitattributes. Background resolution now uses MLX's same file patterns
with local_files_only=True; it neither downloads those documents nor falls back
to the network. Configuration loading reuses the loaded model's local path.

## Evidence so far

Workspace evidence: `/Users/adityasamant/SCLIP V1/maintenance/background-feedback-20261016/`.

- Focused reviewer/MCP/completion/renderer/export regressions: 325 passed.
- Broad desktop run: 8,382 passed, 22 skipped; three failed tests plus one failed
  suite were overlay setup failures (missing electron-builder.yml, Vite-denied
  symlinked fonts, paused generation paragraph). Corrected only staging layout;
  those checks passed on focused rerun. Logs retained; this is not an all-green
  original full run. The 10,000-commit creator-memory stress test completed.
- Final affected/staging rerun: 96 passed, one 150ms mock vision startup failed
  under concurrent model/test load. Isolated same test file: all four passed.
  Preserve this timing sensitivity; no production timeout or test was weakened.
- Release source excluding explicitly paused generation: typecheck/build pass.
  Actual full working tree still has its two pre-existing unfinished generation
  type errors; those files/wiring are preserved and unshipped.
- Seven Python worker tests pass, including no-network cache-miss fault injection.
- Packaging runtime/license/skill gates and deep/strict ad-hoc signature pass.
- Real disposable packaged run: automatic local Qwen descriptions, actual mixed
  audio measurements, real SenseVoice recognition, normal MCP delivery, unchanged
  saved project, playback-safe capture refusal and complete H.264/AAC export pass.
  `runtime-third/PASS.json`, `automatic-observation.json`, `mcp-delivery.json`,
  `verified-output.mp4`; third-run label test is explicitly not credited as exact
  A→B→A proof (see its INTERPRETATION.md).

## Final actual runtime / installed proof

`runtime-fourth/PASS.json`: exact authored-state A→B→A equality with increased
actor epoch discards the old observation; real foreground audio export preempts
the executing background render (AbortError) and succeeds in 1.34 seconds.
Subsequent H.264/AAC export fully decodes. No read-only saved-project changes.

`runtime-installed/PASS.json`: repeated all checks from `/Applications/Sclip.app`
using a fresh disposable profile. Local Qwen and SenseVoice actually ran with
HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE enabled and no provider credentials. Real
foreground preemption/recovery took 434ms. Both output streams are eight seconds
and decode. Original genuine project SHA still matches the last verified project.
Native UI inspection opened Agent → Background feedback, resumed sensing and
observed visual description, truncation warning, peak/quiet counts and local
recognition without a hosted connection. Screenshot and UI verification retained.

Final ASAR SHA256: `bf0a4b8beea18520261b0d9cff4cbf2834e49343ac586fb7fe8689e86e6c260c`.
Worker SHA256: `72f9de07b27f0a0d740fda618b58c3dc7ff3e837fc05c4b0fc995e263e01ffd7`.
Source snapshot: 1,487 files match current source after the explicitly documented
paused-generation exclusion. Exact refs/stash and source manifest retained.
Deep/strict installed signature passes (ad-hoc; not notarized). Hermes runtime,
Python, Whisper and native dependencies were reused at existing pins. No agent
loop, creative-selection policy or completion requirement was replaced.

The broad suite was not needlessly repeated after overlay corrections: failed
staging checks and final affected changes were rerun. Do not describe its initial
non-green result as a clean full run. Current optional generation remains paused.

## Limits

Sparse observations do not establish story, continuity, professional quality,
sentence completeness, full caption coverage or subjective vocal delivery. Qwen
repeated its accurate synthetic-scene description until its token ceiling;
truncation remains visible. SenseVoice recognition/labels remain fallible.
Existing speech-boundary and deep temporal tools remain Hermes-selected.

Local vision may defer for memory or a busy model; no weights are downloaded by
this feedback path. It is initially macOS arm64 only. Pause is session-local.
No creator-memory interpretation or style promotion occurs in this service.
No paid inference, real-project edits, baseline/stash changes, commits or tags.

## Files changed for this request

New shared observation contract; read-only LiveFeedback scheduler, local observer,
memory-headroom query and compact MCP-context helper; main-process setup/feedback
channels and existing MCP result wrapper; reviewer summary/current-critique types;
Agent panel feedback component/CSS; passive Pixi capture option and frame adapter;
range-render background flag and a small owned render lease in the existing export
flow; local-only vision request/cache resolver. Colocated tests cover ownership,
A→B→A, reopening, source changes, timeout/late jobs, no mutation/receipt, modalities,
model/memory gaps, playback refusal, export priority and UI scoping. ADR 0079
records the narrow extension to initial on-demand-only local sensing.

No creator-style mutations, deterministic creative edits, new hosted route,
additional alignment/generation model or changed dependency pin is included.
