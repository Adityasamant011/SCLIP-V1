# Phase 4B.3 — same-key budget recheck

Date: 2026-10-10. Workspace HEAD before this report: `6873191a`. Existing reviewer integration remains unchanged.

## Verdict

**F — TEST BLOCKED BEFORE INFERENCE.**

The user's limit change is confirmed. The old mismatch (remaining allowance exceeding $0.25) is resolved. However, the current key-level guard does not establish the requested hard bound after accounting for unsettled/in-flight charges. No session was launched. This is not an editorial/model/reviewer result.

**New paid cost $0.00; model sessions 0; inference requests 0; editorial MCP calls 0; timeline mutations 0; renders 0.**

## Actual authenticated checks

Metadata-only GETs returned HTTP 200. First snapshot: `2026-10-10T16:14:10.548Z`; key-only confirmation: `2026-10-10T16:15:07.561Z`. Usage was unchanged between them.

| Item | Actual result |
|---|---|
| Total key limit | **$0.55** |
| All-time usage | **$0.30147753** |
| Remaining allowance | **$0.24852247** |
| Limit reset | **null — no automatic reset** |
| Daily / weekly / monthly usage | $0 / $0.30147753 / $0.30147753 |
| BYOK usage | $0; not included in limit |
| Pending/reserved charge field | None returned by `/api/v1/key` |
| Effective authentication | Current configured OpenRouter credential; native runtime key and SDK bearer header match it |
| Base / model | `https://openrouter.ai/api/v1` / `openai/gpt-6-luna` |
| Reasoning | Native configuration resolves **high** |
| Model / endpoint availability | Exact model present; standard `openai` endpoint advertises status 0, tools and reasoning |

The same existing Sclip encrypted key store and normal credential resolver were used. No alternate key was created or required. Routing environment overrides were cleared in the disposable check. The decrypted key existed only in memory/child environment; it was not printed or persisted. Native Python configuration checks prohibited socket connections and made no completion request. Temporary encrypted profile copies were removed.

Normal standard endpoint prices remain **$0.10 input / $0.50 completion per million tokens**, with higher rates at ≥272,000 prompt tokens. Exact catalog/endpoints metadata is preserved locally. No provider/model substitution occurred.

## Why the new cap is not a verified hard experiment bound

The authorization is **$0.25 of new spending**. Remaining allowance is now below that amount, but the margin is only:

`$0.25 − $0.24852247 = $0.00147753`.

[OpenRouter's limits documentation](https://openrouter.ai/docs/api_reference/limits) says requests are charged on completion. Its documented in-flight estimate is held against account balance, applies only to some accounts, and is not documented as a reservation against this key's remaining $0.24852247. `/key` returned no in-flight/reserved amount. Stable usage and zero recorded daily usage do not prove there are no unsettled requests or remote consumers.

[OpenRouter's authentication documentation](https://openrouter.ai/docs/api_reference/authentication) describes rejecting requests once a key has used its limit. It does not establish that an already-admitted request is cut off at the exact remaining key allowance or that all concurrent requests reserve against that allowance.

The configured maximum of 4,096 completion tokens costs **$0.002048** at the current normal completion rate, even with input costs excluded. That alone exceeds the $0.00147753 margin. If a request were admitted shortly before recorded key usage reached the cap, its completed charge could exhaust this margin. This is a counterexample to relying on the current checks for a guarantee, **not a claim that an overshoot actually occurred**. Long prompts and concurrent/in-flight requests increase the unbounded exposure.

The existing launcher has no verified pre-request session-wide cost reservation; iteration/output limits and post-response accounting do not provide one. A new proxy, billing layer, or inference request was not introduced. Therefore the requested safety condition cannot be confirmed with the current prepared controls, and the explicit instruction to stop applies.

## Configuration and integrity

The disposable native check continues to resolve model fallback off, standard OpenAI-only routing, creator memory off, auxiliary title/background review configuration off, 16 iterations, and 4,096 maximum output tokens. Existing auxiliary-disabling acceptance machinery remains available; no paid auxiliary entrypoint or background Jev was invoked. Provider fallback enforcement on a real request and the editing workflow remain untested because no request was dispatched.

No production, skill, ProjectActor, perception, memory, reviewer integration, acceptance runner, Applications bundle, spending-limit or credential changes were made. The preexisting dirty `apps/desktop/e2e/acceptance-routing/run.mjs` remains unchanged, SHA256 `f52bf99b33f8fd7fca2272e24acd4c51c53a48aa94ffa4a80e400f4236c17176`.

Prior preflight/report is preserved in Git commit `6873191a`; its metadata/outcome files were copied to `blocked-preflight/` before the new check. Completed research and deterministic reviewer tests were not repeated. No new project, video or independent quality result exists.

## Artifacts

Directory: `/Users/adityasamant/SCLIP V1/editor/.scratch/live-reviewer-4b3/`.

- `preflight.json`: current exact-model/catalog/endpoints and $0.55 key snapshot.
- `key-recheck.json`: second key snapshot, period usage and returned accounting field names; no sensitive values.
- `budget-recheck-outcome.json`: budget arithmetic, stop reason and zero-inference counters.
- `blocked-preflight/`: preserved previous $0.70 checks/outcome.
- `preflight.ts`, `preflight.cjs`: metadata/configuration checker only, extended to inspect accounting fields.

## Exactly one next action

Establish a verified request-admission bound for this same key/session, including unsettled costs, before authorizing its execution. No second API key is needed or requested. No follow-up implementation or inference was started.
