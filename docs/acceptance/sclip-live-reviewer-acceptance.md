# Phase 4B.3 — normal-streaming GPT-6 Luna acceptance

Date: 2026-10-10. Production/reviewer base `3b7c2d59`; testing cleanup `06c31936`.

## Verdict

**C — MODEL FAILED TO PERFORM THE EDIT.**

Normal inference and local MCP worked. Hermes exhausted its inspection/planning budget without an editorial mutation. Its final answer correctly admitted noncompletion. No creative mutation was attempted or blocked; this run does not demonstrate a missing editing capability.

## Cleanup and focused verification

Deleted acceptance-only `guarded_hermes.py`, `spend_guard.py` and its retired tests: custom admission, context reservations, spending ledger, HTTP/SDK interception, socket restrictions and streaming rejection. No proxy replaces them. `normal_hermes.py` enters the installed native CLI, disables nonessential auxiliary inference in this disposable process, and observes effective clarification timing. Primary transport is untouched.

ProjectActor, transactions/rollback, editorial revision guards, evidence freshness, Jev authorization, creator-memory protections and normal provider limits remain unchanged. No production source, editorial skill or Applications bundle changed. The secure Electron resolver supplies the real selected credential only in the child environment; no plaintext key is printed or persisted.

| Check | Result |
|---|---|
| Typecheck | PASS |
| Desktop / CLI / skills E2E build | PASS |
| Installed Hermes + SDK SSE → real local MCP → streamed final response + usage | 1 PASS; zero provider inference |
| Native route/auth/high reasoning/fallback/auxiliary checks | PASS |
| Live artifact/export collection | 1 PASS; **not editorial success** |
| Full export decode and before/after project + decoded A/V comparison | PASS |
| `git diff --check` | PASS |

The initial offline test had a fixture serialization error: native Hermes returns normalized `SimpleNamespace` tool calls rather than Pydantic objects. Fixed in the test only; the corrected streaming/MCP check passed before inference.

Reusable live-test instructions: `apps/desktop/e2e/live-reviewer-acceptance/README.md`. Real inference remains opt-in. Clarifications expire naturally in the same session; only the overall 20-minute session deadline terminates it.

## Configuration, usage and money

| Measurement | Observed |
|---|---|
| Model / reasoning | `openai/gpt-6-luna` / high |
| Route | `https://openrouter.ai/api/v1`, standard `openai` only |
| Fallback | No model fallback; alternate providers/variants excluded |
| Paid auxiliaries / background Jev / creator memory / external B-roll | Disabled |
| Normal limits | 16 iterations, 4,096 output tokens per request |
| Model requests | 16 ordinary iterations + one successful native final summary |
| Session count / observed provider retries | 1 / 0 |
| Hermes launcher runtime | 322.077s; whole test including export ≈6.2 minutes |
| CLI tool count / persisted invocations | 100 reported / 84 recorded |
| MCP-targeted invocations | 43, including unsuccessful requests |
| Key cap / reset | $0.60 unchanged / `null` |
| Usage before / latest after | $0.30147753 / $0.35074946 |
| Latest provider-reported new spending | **$0.04927193** |
| Latest remaining allowance | $0.24925054 |

Pricing at preflight: $0.10 input / $0.50 output per million tokens; at ≥272,000 input tokens, $0.20 / $0.75. Cache rates are separately advertised.

Billing is delayed: the first post-run check at 17:26:17 UTC showed $0.02918043 new usage; 17:29:58 UTC showed $0.04927193. Use the latest reported key delta, not the earlier provisional figure or Hermes's $0.033906005 estimate. Shared-key usage cannot independently attribute concurrent activity. Small in-flight overages remain possible; no exact mathematical cap is claimed. No limit change, purchase or second session occurred.

The DB API-count field is 16; native iteration-limit summary uses a separate normal provider call. Seventeen assistant responses are persisted. Tool counts likewise measure different things and are not interchangeable.

## Input, decisions and actual editing

Copied the approved **89.9-second regression draft** with original authored composition and cached speech into a disposable workspace. Only local media/cache paths changed. This is exposed regression footage, not an unseen holdout. Original fixture assembly is not AI work.

Exact brief:

> Please finish this draft as a clean, coherent video for its intended audience. Improve the editing where appropriate, preserve the speaker's meaning and natural delivery, and make sure the result looks and sounds good. Keep the project editable.

Hermes chose: inspect → choose/rehearse edit → apply → inspect/close. Only inspection finished. It read eight editing references, repeatedly searched/described tools, obtained timeline/source context, representative timeline visuals, rendered audio with local Whisper, and ten point visual inspections. It unnecessarily checked repository status.

Three observable mistakes: invalid `PLACEHOLDER` tool target; source-context window above the documented 60-second maximum; whole-source transcription requested through an 89.9-second timeline layer. The latter two received useful bounds rejections. No creative edit was rejected.

**Actual authored mutations: 0. Repairs: 0.** Two checkpoints were created, including automatic pre-agent checkpoint. No cuts, transforms, captions or audio changes.

## Reviewer and verification

Initial Evidence Packet and `get_timeline_critique` delivered the current 60%-coverage warning, explicitly a fallible estimate requiring inspection and allowing intentional insets. Hermes inspected actual rendered evidence and acknowledged the inset. Infrastructure supplied no repair or creative values.

`end_agent_session` was discovered but **never called**. Completion-review handoff, repair selection and fresh post-repair verification were not reached. This was budget exhaustion, not a justified no-repair conclusion. Final answer admitted the unfinished edit and unclosed session/history lock. Disposable processes were closed afterward; their state was not copied into the real profile.

## Independent QA

QA followed model completion, with no findings fed back to Hermes.

- Project JSON is identical before/after: SHA256 `004e328ae677dbb58a2e311361ab5bd5f8a8c66a3cf72a93e28c95be1e591944`.
- Independently decoded video and PCM hashes match the baseline export.
- Export: **89.900s**, H.264 1280×720/30fps, AAC stereo/48kHz; full decode passes.
- One video + one audio layer, matching source/timeline 0–89.9s and speed; no authored offset, gap/overlap or broken media.
- Eight decoded frames retain the small inset/black border. Sign/title and arrow are genuine source content. Final sampled frame contains the speaker, not an all-black tail.
- Rendered Whisper speech is available. Opening: “Alright so I want to spend a few minutes talking about the number one reason why people fail, okay?” Ending remains inside the puzzle analogy: “…here's the second piece and here's the third piece.” Setup lacks a complete tutorial conclusion.
- No finer story/pacing/dialogue shaping or new captions/treatments. Peak ≈0.98 and zero samples above 0.999 are signal measurements, not subjective listening certification.

**Quality: NO IMPROVEMENT. Human correction burden: HEAVY.** No authored A/V regression; final model judgment correctly admits noncompletion. Primary failure: **MODEL REASONING FAILURE — inspection/discovery/planning consumed the budget without action**. Completion reviewer behavior remains untested by this run.

Agenticness preserved: Hermes chose evidence, tools and plan. No deterministic creative repair/value, forced mutation or automatic A/V synchronization.

## Artifacts and commits

Root: `/Users/adityasamant/SCLIP V1/editor/.scratch/live-reviewer-4b3/normal-stream-session/`.

- Editable project: `workspace/edit/project.json`; `initial-project.json`, `final-project.json`.
- Export: `edit.mp4` (**unchanged fixture**); `initial-draft.mp4`.
- `hermes-trace.txt`, `observable-session.json`, `observable-tool-requests.json`, `mcp-events.json`, `history.json`.
- `initial-editorial-evidence.json`, `rendered-audio-evidence.json`, `sampled-frames/`.
- `session-result.json`, `metrics.json`, `preflight.json`, `post-run-key.json`, `outcome.json`.
- `ffprobe.json`, `independent-qa.json`, `qa-frames/`, `qa-contact-sheet.jpg`.

Prior guard failure and original report remain in `live-session/`. Cleanup commit `06c31936`; findings committed separately. Existing unrelated dirty `acceptance-routing/run.mjs` is unchanged, SHA256 `f52bf99b33f8fd7fca2272e24acd4c51c53a48aa94ffa4a80e400f4236c17176`. Installed app stays at verified production build `3b7c2d59`.

## Exactly one next action

Inspect this saved trace to identify why Hermes failed to move from sufficient evidence to an executable editorial decision. Do not automatically add infrastructure or run another model.

STOP. No second session, post-test repair or Applications update.
