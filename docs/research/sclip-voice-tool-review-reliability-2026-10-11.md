# Speech, tool recovery and reviewer reliability — 2026-10-11

## Findings from the actual user session

Read-only audit of Project 99 and observable Hermes tool activity found 56 model
requests and 120 generic tool calls in approximately 18.6 minutes. These include
28 tool-description calls, 12 searches and 19 terminal calls. Several terminal
failures repeated unchanged. Large research HTML consumed substantial context.
The session stopped on provider allowance before completion. Actual billed cost
is unavailable in the session database; its $0.101199925 estimate is not billing
proof. The cumulative key cap is not this session's cost.

The edit has eight video/source-audio pairs, one unintended unmuted source clip,
two identical overlapping music layers, and narration longer than the main video.
There were no authored text layers. No actual timeline visual/audio/temporal
inspection, critique, revision or completion calls occurred in the saved session.
It is therefore incorrect to describe the reviewers as having approved this edit.
The original project and output have not been patched.

Local reproduction confirmed Kokoro generated the narration. The requested
legacy `nova` alias resolves to `af_nicole`, not the actual `af_nova` voice ID.
The first placement failure left an imported pool item; a subsequent request
created another media UUID for the same generated file. These are general
execution/discovery issues, not evidence for a footage-specific rule.

## Changes

### Speech discovery, cache and placement

- `main/sclip/localTts.ts`: strict local Kokoro default; explicit fallback/cloud
  engines; actual synthesis provenance; bounded subprocesses; versioned,
  engine/model-specific cache with content integrity metadata. Historic caches
  remain preserved and cannot masquerade as verified Kokoro results.
- `vision/sidecar/kokoro_tts_worker.py`: actual installed English voice catalog,
  aliases and resolved voice metadata; unknown/unsupported voices reject.
- `main/mcp/server.ts`: discoverable `list_speech_voices`, explicit engine and
  preview schema; preview is a nonmutating audition, including during review.
- `main/state/hybrids.ts` and `actor.ts`: generated media plus Audio placement
  publish atomically. Failed placement leaves no partial pool/layer changes.
  Matching generated media can be reused; project switches during synthesis
  reject writes. Derived-job failure cannot misreport a committed edit as failed.
- `main/index.ts`: normal local compute path exposes provenance/catalog; OpenAI
  speech requires an explicit engine request rather than being tried first.

Hermes chooses the voice and placement. No stronger voice is forced universally.
Actual IDs and cheap local auditions make selection deliberate; volume gain is
not a substitute for performance. A synthetic `am_michael` sample was generated
locally and placement/reuse/rejection exercised through real Electron/MCP.

### Efficient recovery and Jev boundary

`main/sclip/toolFailureRecovery.ts` adds bounded, state-keyed failure bookkeeping
and technical advice to MCP errors. Unchanged failures reuse advice. No request
arguments, IDs, command or creative values are generated, and no automatic retry
is executed. Only 32 entries are retained.

Optional Jev triage uses the existing Decisions API, whose result is a score,
not an executable recovery command. It receives only tool name, argument field
names, technical category and hashed state identity. It never receives raw
commands/credentials and never edits. One auxiliary request may be in flight;
duplicate calls coalesce and other requests receive local guidance. Failure
preserves the original MCP error. Separate explicit
`SCLIP_FAILURE_JEV_AUTHORIZED=1` and a credential are required. It remains OFF
for this work and the user's profile. No paid auxiliary request was made.

This is MCP recovery assistance, not a replacement editor. Terminal failures
outside Sclip MCP still use Hermes's existing terminal hints; malformed wrapper
calls that never reach MCP cannot receive this advice. A model may still ignore
guidance. Live credit savings are not established by offline tests.

The installed skill now emphasizes using known schemas/current IDs, correcting
technical constraints before retries, reusing cached assets, and bounded research
excerpts. Approximate duration tolerates small variation; explicit exact or upper
limit requirements still govern. No cut count, hook or genre recipe was added.

### Senses and reviewers

- `main/sclip/audioPerceptionFacts.ts` / `visionSidecar.ts`: preserve per-event
  audio pops and beat-sync measurements previously dropped at the boundary;
  validate/bound fields and report semantic/vocal-delivery limitations.
- `vision/sidecar/audio_analyzer.py`: spectral energy/flatness is measured evidence,
  not a fabricated crowd/applause semantic label.
- `reviewer/backgroundReviewer.ts`: does not infer stadium crowd from spectral
  measurements; does not equate low energy with unwanted dead air; speech-cut
  timing checks use audible Audio edges, not unrelated visual cuts. Missing
  vocal-delivery assessment is explicit. It still supplies critiques, not edits.
- `renderedAudioEvidence.ts`: signal/transcription cannot certify emotional or
  confident delivery. Responses report that dimension as unassessed.

Background layout review is automatic. Deeper local modalities and optional
provider review remain governed by existing authorization/readiness mechanisms;
no download, background paid judge or silent provider fallback was introduced.
Freshness, current-state critique, normal completion and modality-correct review
tests pass. This does not prove arbitrary creative judgments are always correct.

## Validation and cost

All tests used deterministic/fake providers or installed local media models.
Provider inference calls: **0**. Paid spend: **$0.00**. No live editing session.

| Check | Result |
|---|---|
| Focused regression suite | 17 files, 229 tests PASS |
| Final preview guard/reviewer regression rerun | 3 files, 28 PASS (one new case) |
| Typecheck | PASS |
| Desktop, CLI, skills build | PASS |
| Electron local Kokoro / inspection / completion | 3 PASS across final reruns |
| Actual local audio analyzer | PASS; factual measurements, no delivery certification |
| Broad TypeScript suite | 8,124 PASS, 22 SKIP, 3 initial failures |
| Corrected broad-suite failures | catalog runtime fixture + two stale skill assertions; all covered in final focused PASS |
| Optional upstream Hermes pytest | SKIP: installed venv has no pytest |
| Diff whitespace validation | PASS |

The entire broad suite was not repeated after the three fixture/assertion fixes.
Initial Electron failures came from missing E2E hooks and then an asynchronous
preview bridge fixture race. Correct build flags and waiting for the actual bridge
resolved them; production was not changed to imitate the obsolete fixture.
Native engine code is unchanged. Do not interpret these results as "bug free."

## Preservation and installation

Project 99 starting SHA256:
`0b78f55b913e3a47dc2dce5e77535ef08a99ff603d846e56c6408d7f26efbb22`.
Pre-existing acceptance-runner edits remain untouched and excluded from these
commits (SHA256 `f52bf99b33f8fd7fca2272e24acd4c51c53a48aa94ffa4a80e400f4236c17176`).

Install the tested production bundle with the existing backup/atomic replacement
procedure; retain the local Hermes launcher and verify profile hashes and bundled
assets. Installation/launch receipts live in
`.scratch/session-reliability-fixes/installation.json` and `launch-check.json`.
The app build manifest records the production commit and compiled main hash.

## Remaining limits

No current sense reliably judges assertiveness, whisperiness, acting quality or
voice suitability. Whisper establishes words, not performance. Real Jev/provider
behavior and whole-session efficiency remain unvalidated without separately
authorized inference. No deterministic rule forces a creative repair, sync,
voice, caption, duration or selected shot. The original failed edit is preserved.

Next action: test the updated installed app with a normal user request and review
the actual result; this change itself does not authorize us to run that session.
