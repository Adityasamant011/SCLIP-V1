# Phase 4B acceptance-only routing readiness — 2026-10-07

## A — HARNESS READY FOR ONE PAID HOLDOUT

**No holdout/model inference executed. Cost: $0.00.** Production code, installed
app, Phase 4B skill and editorial architecture are unchanged.

## Root cause, traced and reproduced offline

Hermes CLI setup calls `resolve_runtime_provider` with explicit provider
`openrouter`. In `hermes_cli/runtime_provider.py`, `_resolve_openrouter_runtime`
(lines 1242–1383) uses `model.base_url` only for compatible `auto`/`custom`
provider contexts, not explicit `openrouter`. Its source explicitly says
`OPENAI_BASE_URL` is no longer consulted in this route. The invalid harness set
both ignored values to localhost while the benchmark launcher supplied the dummy
`local-budget-proxy-only` credential. Thus primary inference resolved to the
canonical OpenRouter endpoint with no authorized real key, producing HTTP 401.
The auxiliary title route used different auxiliary resolution and was blocked
by the proxy (403). Neither request resulted in a successful model response.
An offline regression reproduces the ignored URL behavior.

## Prepared replacement

- Supported normal base: `https://openrouter.ai/api/v1`.
- Exact model: `openai/gpt-5.6-luna-pro`.
- Existing `loadAllKeys` → `resolveHermesProviderEnvironment` → child environment
  `OPENROUTER_API_KEY`. No plaintext key persisted or exposed. An encrypted-store
  copy is used only in the disposable isolated profile, with Sclip OS identity.
- Both `fallback_model` and `fallback_providers` are empty. Request routing has
  one eligible `openai` provider, excluding `openai/flex` and `openai/fast`.
  Hermes does not expose literal `allow_fallbacks` in its preference builder;
  supported provider restrictions remove alternate candidates instead.
- Supported config disables title generation, compression and background review.
  Acceptance-only Python bootstrap disables auxiliary-client entrypoints before
  CLI imports. Required because explicit auxiliary providers have a main-agent
  paid-model safety net, so `free_only`/empty auxiliary chains alone are insufficient.
  No request proxy remains in the active runner. No creative/tool guidance added.
- Startup profile regeneration is handled by reapplying only isolated controls
  afterward; the generated product system prompt, skill and MCP configuration remain.
- Old `.scratch/phase4b-final/run.mjs` is retired. Prepared tracked runner refuses
  execution without separate paid opt-in; preserved invalid artifacts stay unchanged.

## Authenticated metadata (no completion)

- Limit: **$0.50**, unchanged.
- Usage: **$0.0008925**, unchanged across checks.
- Remaining: **$0.4991075**.
- Exact tool-capable model and standard OpenAI route confirmed present.
- Standard price: **$0.20/M input, $1.20/M output**.
- At ≥272k input tokens: **$0.40/M input, $1.80/M output**.
- Account credit is not the experiment budget. No allowance update/purchase performed.

## Validation

- 3 Node configuration tests: PASS.
- 6 Python offline runtime/request-preference/auxiliary-disable tests: PASS.
- Real credential in isolated Python runtime, canonical URL, exact model and SDK
  Bearer header: PASS, all network connections prohibited during this check.
- Authenticated key/catalog/endpoint GET checks: PASS; no inference requests.
- Paid runner without explicit opt-in: correctly rejected before profile/project start.
- Typecheck: PASS. Runner syntax/bundle: PASS. `git diff --check`: PASS.

## Poffertjes: STILL VALID

Preserved QA/trace show zero successful model responses, zero creative plans,
zero editorial MCP calls, zero mutations and no footage-based production changes.
The previous retirement statement was corrected. Retire the footage only after
first successful strong-model editorial exposure. No QA is interpreted as an
expected editorial answer.

Runtime metadata: `.scratch/phase4b-final/routing-readiness.json`.
Implementation/tests: `apps/desktop/e2e/acceptance-routing/`.
No completion request was used to establish readiness; paid execution remains
untested and requires a separate authorization. STOP.
