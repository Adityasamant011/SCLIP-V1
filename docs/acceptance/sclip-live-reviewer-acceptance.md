# Phase 4B.3 — GPT-6 Luna High acceptance

Date: 2026-10-10. Current workspace build; prior report commit `34bdb504`. Final execution follows explicit authorization for the existing **$0.60 key cap**, **$0.30 new spending**, and the stricter **$0.25 request-level guard**.

## Verdict

**E — TECHNICAL INTEGRATION FAILURE (acceptance harness).**

One real Hermes CLI session was launched. It failed on its first SDK attempt **before a provider inference request was dispatched**. No GPT-6 response or creative work occurred. Installed Hermes selects streaming by default; the acceptance-only guard rejects streaming. The SDK presents that local rejection as `APIConnectionError`. An offline SDK reproduction produces the same exception/cause with zero mock-transport dispatches.

This is neither an observed GPT-6 editorial failure nor a Sclip reviewer failure. The experiment does not answer whether GPT-6 Luna can edit and review a video. I should have checked the native runtime's streaming path before launching the live session; the prior 10 guard tests established safety behavior, not runtime compatibility.

**New paid cost: $0.00. No retry, resumed attempt, second live session or post-test patch.**

## Actual allowance, route and configuration

| Item | Result |
|---|---|
| Model / reasoning | `openai/gpt-6-luna` / `high` |
| Base | `https://openrouter.ai/api/v1` |
| Provider | Standard `openai` only; fallback prohibited by request guard |
| Key total cap | **$0.60**, unchanged |
| Usage before / after | **$0.30147753 / $0.30147753** |
| Remaining before / after | **$0.29852247 / $0.29852247** |
| Reset | `null`, no automatic reset |
| Authorization / experiment guard | $0.30 / **$0.25** |
| Max output / normal iterations | 4,096 aggregate completion tokens / 16 |
| Paid auxiliary / background Jev | Disabled |
| Creator memory / external B-roll | Off / off |

Authenticated metadata snapshots: `2026-10-10T16:51:14.472Z` before and `2026-10-10T16:57:00.850Z` afterward (18:51 and 18:57 Copenhagen). `/key`, catalog and exact-model endpoints succeeded before launch. The standard endpoint advertises tools, high reasoning compatibility and the unchanged price schedule: $0.10 input / $0.50 completion per million tokens, increasing to $0.20 / $0.75 at ≥272,000 prompt tokens. No alternative endpoint or model was used.

The exact historical key-cap check was removed only from the acceptance wrapper/spec. Remaining allowance is checked separately against the experiment guard. The normal Sclip resolver selected `sclip_openrouter`, decrypted from a disposable encrypted copy and injected into Hermes's environment. No key was changed, created, printed or persisted as plaintext.

## Request-level safety verification

The existing guard was retained at **$0.25**. All primary sync/async HTTP sends are intercepted, including direct final-summary sends and SDK retry attempts. Alternate inference endpoints, auxiliary routes, unknown request fields, paid hosted tools, plugins, streaming and unbounded multimodal shapes fail closed. External raw-socket bypass is blocked in the guarded process. Subprocesses receive no provider credential; the desktop fixture profile has no cloud keys. No paid BackgroundReviewer/Jev path is authorized.

Before dispatch, the guard reserves the entire advertised 1,050,000-token input context at the highest applicable uncached input rate, the aggregate output cap at the highest completion rate, plus a conservative 5.5% margin. The 4,096-output reservation is **$0.22479096**. Reasoning is included in the aggregate output limit; cached writes are prohibited, and explicit mode with no breakpoints disables automatic cache writes. Unknown/failed/uncertain responses retain the full reservation. Valid provider usage replaces it with recorded cost. Concurrent reservations cannot exceed the guard ceiling; summary calls use the same admission path.

Offline tests passed **10/10**, including sync/async/final-summary admission, a synthetic SDK retry rejected before its second send, uncertain-cost retention, long-context rates, output/reasoning caps, ledger single-use, credential stripping and raw-socket rejection. Native source confirms the primary SDK sets `max_retries=0`, and `agent.api_max_retries=1` means one attempt. The CLI phrase “after 1 retries” describes this single attempt; it is not evidence of an additional dispatched request.

**Safety succeeded by refusing the unsupported streaming path. Compatibility failed.** This guard is not ready for the current native Hermes execution path. The 10 offline tests did not establish a successful streamed request/settlement integration. No streaming support was added after the failed experiment.

## Project and natural brief

Disposable new project, using already approved **exposed regression media**, not an unseen holdout:

`/Users/adityasamant/Downloads/Raw Talking head tutorial video for editing practice.mp4`

Source SHA256: `43586606dedfcd16c4208860c8336d78e9f9c1de78b3d037170481a280fef857`.

Exact request:

> Please finish this draft as a clean, coherent video for its intended audience. Improve the editing where appropriate, preserve the speaker's meaning and natural delivery, and make sure the result looks and sounds good. Keep the project editable.

The approved fixture is a paired 89.9-second source/timeline excerpt, 1280×720 at 30fps, with an undersized 0.6 scale transform. Local Whisper transcription succeeded. Fixture choices were made before model launch, are separately logged, and do not count as Hermes work. No expected repair values, hidden creative hints or QA feedback were supplied.

An initial fixture setup failed because the prepared script assumed the encrypted credential tag `openrouter` rather than the current `sclip_openrouter`. It failed before app/Hermes initialization, with zero inference. Its metadata/prompt artifacts are preserved in `fixture-preflight-credential-tag/`. The tag copy was corrected before the single live Hermes launch. This was not a model retry or second session.

## Actual workflow observations

| Stage | Observed |
|---|---|
| Initial packet | Prepared and staged with current authoritative state, source mappings, paired A/V and actual transcript |
| BackgroundReviewer feedback | Packet contains one current-state `visual_framing` warning; deterministic estimate, explicitly uncertain and requiring rendered inspection |
| Feedback received/interpreted by GPT | **Not established: no model response or provider dispatch** |
| Source understanding / intent / plan by Hermes | None |
| SDK model attempts / provider requests | **1 / 0** |
| Editorial MCP calls | **0**; one infrastructure `tools/list` discovery call |
| Initial assembly / finer editing by Hermes | None |
| Meaningful model timeline mutations | **0** |
| Ordinary completion-review handoff | Not reached; `end_agent_session` was never called |
| Hermes critique disposition / issue selection | None |
| Repair / justified no repair | Neither occurred |
| Fresh verification / final editorial judgment | Not reached |
| Agenticness | Not evaluable; no creative model decisions occurred |

The reviewer warning says the static scale estimate covers only 60% of canvas width/height and explicitly allows intentional insets/letterboxing; it does not choose a repair. Its disposition remains `not_considered_in_this_state`. No fake reviewer content or deterministic creative decision was introduced.

## Runtime and transport diagnosis

The live launcher ran **5.198 seconds**; CLI session duration was about 2 seconds. Fixture/transcription/exports plus artifact collection took about 2 minutes. No overall deadline or clarification interruption occurred.

Native source:

- `/Users/adityasamant/SCLIP/hermes-agent-src/agent/conversation_loop.py:2984`: `_use_streaming = True`, including quiet callers.
- `/Users/adityasamant/SCLIP/hermes-agent-src/agent/chat_completion_helpers.py:3906`: streaming request shape; usage is requested on the stream.
- `apps/desktop/e2e/live-reviewer-acceptance/spend_guard.py`: sync/async `send` rejects `stream` before admission/dispatch.

The offline reproduction uses the installed OpenAI SDK with a fake credential and `httpx.MockTransport`; it creates no agent session and opens no network connection. Result:

```json
{
  "sdk_exception": "APIConnectionError",
  "cause_class": "StopSpending",
  "cause_message": "Unsettleable stream prohibited",
  "mock_transport_dispatches": 0
}
```

The live ledger likewise contains zero admitted calls and $0 committed/reserved. Authentication/catalog metadata worked; the error does not justify diagnosing provider unavailability.

## Independent QA and video output

The final export is **the unchanged fixture**, not an AI-edited result:

- **89.900s**, H.264 video, 1280×720, 30fps; AAC stereo, 48kHz.
- Full decode to null completed without errors.
- One VideoClip and one Audio layer; matching source/timeline 0–89.9s, no offset or speed change.
- No internal gap/overlap; no broken media reference.
- Authoritative compositions are exactly identical before/after. SHA256 both: `7bca4421fcf2137a39ac908d7d9c056399e5db65daaf84f4c6847fbf0f992ff0`.
- Project JSON differs only in media `decode_route` metadata; no authored change.
- Independently decoded **video hashes match** and **audio hashes match** across baseline/final exports.
- Sampled opening/middle/ending frames retain the fixture's inset/black borders; the last sampled frame contains the speaker rather than an all-black tail.
- No captions/text added or changed. No speech repair was claimed. Listening-based editorial improvement is not claimed.

**Quality result: NO IMPROVEMENT — unchanged baseline.** Story/pacing/micro editing/self-correction quality and human correction burden cannot be scored as model outcomes. Phase 4B's behavioral shift and GPT-6 Luna's viability remain untested.

## Tests and integrity

| Check | Result |
|---|---|
| Spending guard suite | **10 PASS, 0 FAIL** |
| Acceptance spec discovery | Exactly one opt-in serial test |
| Native configuration-only check | PASS: actual route/auth/high, fallback and auxiliaries disabled |
| Playwright artifact collection | **1 PASS**; this is not editorial acceptance success |
| Live editorial acceptance | **FAIL — harness streaming incompatibility** |
| Offline SDK reproduction | PASS: exact cause, zero dispatch |
| Export probe / full decode | PASS |
| Before/after authored and decoded A/V comparisons | PASS: unchanged |
| Post-run provider usage reconciliation | PASS: $0.00 new spending |
| `git diff --check` | PASS |

No production architecture, skill, perception, ProjectActor, reviewer, memory or Applications build changes. The preexisting unrelated dirty `acceptance-routing/run.mjs` stays unchanged, SHA256 `f52bf99b33f8fd7fca2272e24acd4c51c53a48aa94ffa4a80e400f4236c17176`. Current compiled main SHA256: `7024049ffe4b3483016db1e5ccfe0408c8d2191dd1e05764a042b4b00b10bde6`; normal bundled skill: `c97dd9dff3cd6dbe51d9c311083702e001f75edf3b56558d1c694c5700a36841`.

## Artifacts

Root: `/Users/adityasamant/SCLIP V1/editor/.scratch/live-reviewer-4b3/live-session/`.

- `initial-project.json`, `final-project.json`; editable project in `workspace/edit/project.json`.
- `initial-draft.mp4`, `edit.mp4` — identical decoded output, fixture only.
- `hermes-trace.txt`, `observable-session.json`, `mcp-events.json`, `history.json`.
- `initial-editorial-evidence.json`, `fixture-operations.json`, `mutation-evidence/`.
- `spending.json`, `preflight.json`, `post-run-key.json`, `session-result.json`, `outcome.json`.
- `guard-runtime-reproduction.json`, `offline-stream-reproduction.py` — entirely offline.
- `independent-qa.json`, `ffprobe.json`, `qa-frames/`.
- `review-lifecycle-events.json` and `coordinate-validation-events.json` — empty, rather than invented success.

No provider secret or hidden chain-of-thought was exported. The native Hermes session is not resumed. Prior blocked preflights remain preserved separately.

## Exactly one next action

Make the acceptance spending guard compatible with the installed Hermes streaming transport and verify it offline before considering another separately authorized live attempt. Do not change Sclip editorial architecture or the key cap to address this failure.

STOP. No post-test patch or second inference attempt was performed.
