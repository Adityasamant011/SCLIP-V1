# Phase 4B.3 — real reviewer acceptance preflight

Date: 2026-10-10. Workspace: `e24b8c28`, following reviewer implementation `9238c27a` and `c4440bbc`.

## Verdict

**F — TEST BLOCKED BEFORE INFERENCE.**

The requested model exists and the authenticated key has sufficient allowance, but the existing acceptance launcher does not establish a reliable session-wide **$0.25** bound. The task expressly requires stopping before inference in this situation. No live experiment was started. This is a cost-control preflight blocker, not evidence that Hermes failed to edit or that the reviewer failed to activate.

**New paid cost: $0.00. Model sessions: 0. Model requests: 0. Editorial MCP calls: 0. Mutations: 0. Renders: 0.**

No production, skill, ProjectActor, perception, memory, routing harness, provider limits or Applications bundle changes were made. The preexisting unrelated `acceptance-routing/run.mjs` change remains byte-for-byte preserved (SHA256 `f52bf99b33f8fd7fca2272e24acd4c51c53a48aa94ffa4a80e400f4236c17176`). New local scripts perform metadata/configuration checks only; none is an inference runner or billing proxy.

## Authenticated model and allowance checks

At `2026-10-10T15:37:52.547Z`, credential-safe authenticated **GET** requests to OpenRouter returned HTTP 200 for `/key`, `/models` and `/models/openai/gpt-6-luna/endpoints`.

| Item | Observed |
|---|---|
| Exact model | `openai/gpt-6-luna` |
| Base | `https://openrouter.ai/api/v1` |
| Selected candidate endpoint | `openai`, OpenAI; advertised status 0 |
| Model context / maximum completion | 1,050,000 / 128,000 tokens |
| Tool support | Catalog and endpoint advertise `tools`, `tool_choice` |
| Reasoning support | Catalog and endpoint advertise `reasoning` / `reasoning_effort` |
| Key cap | **$0.70**, unchanged |
| Key usage | **$0.30147753** |
| Remaining allowance | **$0.39852247** |
| Key reset | None reported |

Only selected nonsecret metadata is retained. Credentials were decrypted from a disposable encrypted-store copy using Sclip's existing Electron safeStorage identity. No plaintext credential was printed, written into configuration, exported or passed in command arguments. Temporary profile copies were removed.

### OpenRouter price schedule

Prices for the standard `openai` endpoint, per million tokens:

| Rate | Normal | Prompt ≥272,000 tokens |
|---|---:|---:|
| Input | $0.10 | $0.20 |
| Completion | $0.50 | $0.75 |
| Cached input read | $0.01 | $0.02 |
| Cache write | $0.125 | $0.25 |

Catalog also lists web search at $0.01. Such optional provider-side calls must be excluded or budgeted before any eventual session. No cache discount was assumed to establish safety. No separate reasoning-token price is advertised in the metadata; actual completion/reasoning accounting was not observed because no inference occurred.

[Official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) confirms `high` effort support. It also states that direct OpenAI Chat Completions function calling requires `none`, whereas Responses supports reasoning with tools. That direct-endpoint limitation is not automatically attributed to OpenRouter's compatibility layer. OpenRouter advertises both tools and reasoning for this route; actual high-effort multi-tool interoperability remains untested here.

## Actual installed runtime configuration

The installed launcher still invokes `/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python -m hermes_cli.main`.

An offline check used that interpreter, a disposable `HERMES_HOME`, the real selected credential injected only into the child environment, and socket connections prohibited before runtime imports. It exercised native `load_config`, `resolve_runtime_provider`, `get_fallback_chain`, `resolve_reasoning_config` and SDK authorization-header construction. It constructed no agent and called no completion method.

Observed result:

```json
{
  "provider": "openrouter",
  "model": "openai/gpt-6-luna",
  "base_url": "https://openrouter.ai/api/v1",
  "api_mode": "chat_completions",
  "reasoning": { "enabled": true, "effort": "high" },
  "credential_present": true,
  "model_fallback": false,
  "max_tokens": 4096,
  "max_turns": 16,
  "memory_enabled": false,
  "auxiliary_config_disabled": true,
  "inference_requests": 0
}
```

Planned provider routing was `only: [openai]`, excluding OpenAI Flex/Fast, with required parameters. No request was dispatched to verify its enforcement on a billed call. Existing acceptance auxiliary-client disabling is available for reuse; configuration flags alone do not guarantee every auxiliary entrypoint is disabled. No such entrypoint was invoked here.

The first local configuration probe placed effort at the YAML root and failed its assertion. Source inspection established the supported location is **`agent.reasoning_effort`** (`hermes_constants.py:resolve_reasoning_config`). The corrected disposable probe passed with `high`. This was a preflight-script configuration correction, not a production change, model failure, paid retry or editorial intervention.

## Why the budget gate failed

The prepared acceptance runner's existing hard guard is the provider key allowance. The current **$0.39852247** remaining allowance exceeds this task's **$0.25 new-spend authorization**. No cap was changed.

`model.max_tokens` bounds completion size, not total conversation input. `--max-turns` governs editing iterations, not a verified cap on all billed HTTP requests. Installed Hermes has retry paths and a direct final-summary request path. `session_estimated_cost_usd` is accumulated after responses; it is accounting, not pre-request spending admission.

Source inspected:

- `apps/desktop/e2e/acceptance-routing/run.mjs`, `config.mjs`, `hermes_acceptance.py`: existing provider-level guard, route pinning, auxiliary isolation.
- `apps/desktop/src/main/sclip/hermesBenchmarkLauncher.ts`: normal supported credential/skill/evidence launch and max-turn setting.
- Installed Hermes `cli.py`: output cap and reasoning configuration.
- Installed Hermes `agent/iteration_budget.py`: iteration counters and refunds.
- Installed Hermes `agent/conversation_loop.py`: retries and post-response cost accumulation.
- Installed Hermes `agent/chat_completion_helpers.py`: direct final-summary request.
- Installed Hermes `agent/transports/chat_completions.py`: reasoning parameter serialization.

Cost examples, **not enforced bounds**:

- Assuming 16 requests × 50,000 input tokens + 4,096 completion tokens at normal uncached rates gives **$0.112768**. There is no verified hard 50,000-token input cap or 16-billed-request cap in the current runner. This favorable estimate cannot authorize the run.
- Conservatively allowing 16 full-context requests at the advertised long-context input/completion rates gives **$3.409152**, before retry/summary requests, possible cache-write rate differences or optional provider charges. This intentionally overestimates by allowing the full context as input as well as completion. Even subtracting completion from the context leaves the bound far above $0.25.

The old local budget-proxy experiment was bypassed by routing and retired from the supported acceptance path. It was not restored or rebuilt. A new request-admission/billing layer was not introduced to evade the task's instruction to use existing supported controls or stop.

## Workspace, source and skill integrity

The current compiled workspace contains the `review_required` completion response. Normal built skill contains the updated completion contract. The experimental Phase 4B.2B reference remains separate; it was not promoted. Current compiled assets and normal skill hashes are recorded in `outcome.json`.

The five requested reports were read alongside relevant current implementation. Earlier offline reviewer results remain **302 focused passes plus one real compositor/export Electron pass**, with native installed-Hermes skill/tool loading exercised. Those are prior integration evidence, not a fresh live acceptance or model-quality result.

Approved exposed regression source exists:

`/Users/adityasamant/Downloads/Raw Talking head tutorial video for editing practice.mp4`

- Duration verified by ffprobe: **575.710839 seconds**.
- SHA256 verified: `43586606dedfcd16c4208860c8336d78e9f9c1de78b3d037170481a280fef857`.
- No arbitrary excerpt, expected timeline, controlled draft, new project or model exposure was created after the cost gate failed.

The intended brief was preserved exactly:

> Please finish this draft as a clean, coherent video for its intended audience. Improve the editing where appropriate, preserve the speaker's meaning and natural delivery, and make sure the result looks and sounds good. Keep the project editable.

A fresh live app/catalog/perception/export preflight was not completed after the financial blocker was established. No installed application was used to make quality conclusions or overwritten. These remaining checks must pass before a later authorized session; historical passes are not substituted for them.

## Execution and independent QA

| Requested observation | Result |
|---|---|
| Source understanding / editorial intent | NOT RUN |
| Initial assembly / finer editing | NOT RUN |
| Ordinary `end_agent_session` handoff | NOT RUN |
| Current critiques delivered to a real model | NOT RUN |
| Repair / justified no repair | NOT RUN |
| Fresh verification / completion judgment | NOT RUN |
| Before/after project and exported video | NOT CREATED |
| Independent rendered/editorial QA | NOT APPLICABLE; no model result exists |
| Model input/output/reasoning tokens | 0 inference tokens used |
| Provider/model retry or second session | NONE |
| New paid expenditure | **$0.00** |

The automatic permission review timed out before the first metadata command started. Its explicitly permitted retry succeeded. This was an OS permission/preflight retry, not an inference retry.

## Artifacts

Local directory: `.scratch/live-reviewer-4b3/`.

- `preflight.json`: actual authenticated catalog, endpoints, allowance; preserves the initial failed configuration probe.
- `runtime-config-check.json`: corrected native runtime/auth/high-effort check, sockets disabled.
- `outcome.json`: stop reason, source hash, natural brief, price calculations, zero-inference counters and compiled-asset hashes.
- `preflight.ts`, `preflight.cjs`: metadata/offline configuration checker; no chat/completion endpoint or agent construction.

No raw Hermes reasoning database, hidden reasoning, plaintext credentials or fake editorial success artifacts were exported. Only this report is a new tracked deliverable; production and the preexisting dirty harness remain unchanged.

## Final recommendation

1. **Worked:** authenticated model/price/allowance discovery, actual installed runtime route/auth resolution and explicit `high` configuration, current reviewer build presence.
2. **Failed:** preflight could not establish the required session-wide $0.25 spending guarantee using the existing acceptance controls.
3. **GPT-6 Luna viability:** not evaluated; catalog eligibility and low advertised price are not proof of editing capability.
4. **Actual total editing cost:** **$0.00**; no editing session occurred.
5. **Exactly one next action:** establish a verified experiment-specific $0.25 spending/admission bound using supported controls before launching the requested acceptance. Do not add editorial infrastructure or infer model/reviewer failure from this blocked preflight.

STOP. No follow-up inference or implementation was initiated.
