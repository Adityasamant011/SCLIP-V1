# Phase 3C.1 — limited GLM preflight

## Model / price / budget

Authenticated OpenRouter catalog checked 2026-10-04 21:01:41 UTC; key, credits and models endpoints returned HTTP 200. Exact `z-ai/glm-5.3-flash` is listed with `tools`, `tool_choice` and `parallel_tool_calls`. Prices: $0.15/M input, $0.50/M output, $0.03/M cached input. Listing does not prove inference authorization; no inference request was made.

Existing key remaining **$0.01922543**, below the requested **$0.02 experiment allowance**. Account remaining $1.644849519 does not override the key limit. Stopped before inference under the user's insufficient-allowance rule. This is a conservative budget gate, not a claim that every 12–16-turn GLM run must cost $0.02. No purchases, limit changes, paid probes or model substitutions.

**GLM TEST READY — BUDGET REQUIRED.** Provider experiment spend **$0**.

## Experiment preservation

Intended frozen baseline: `fcbfd0ad`; current primary checkout contains existing Phase 3D commits through `e0745d72`. No checkout, build, architecture modification, prompt change or review session was needed after the budget gate. Phase 3D was not used for inference. The preserved starting project SHA256 remains `e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`. Previous projects/renders/traces were not written. No raw-source rerun.

## Live review / independent QA

Not run. Zero turns, MCP calls, inspections, mutations and verifications. Review runtime, evidence use, issue, repair, causal trace and result quality are unavailable. No quality improvement or model-success claim is made. Independent preflight QA confirmed the requested model metadata, insufficient allowance and unchanged starting-project hash. No GLM render or reviewed project exists.

## Nemotron vs Luna vs GLM

| Dimension | Nemotron | Luna Pro | GLM Flash |
|---|---|---|---|
| Grounding / temporal reasoning / evidence selection | Weak; isolated-frame overgeneralization | BETTER; representative ranges and real speech boundary | NOT ENOUGH EVIDENCE |
| Editorial judgment / tool selection | Unsupported opening diagnosis; no action | BETTER / CLEARLY BETTER; defensible issue, discovered tools | NOT ENOUGH EVIDENCE |
| Action completion | 0 effective mutations | CLEARLY BETTER; 1 video mutation, paired audio omitted | NOT ENOUGH EVIDENCE |
| Self-correction | No verified improvement | NOT ENOUGH EVIDENCE; incomplete repair undetected | NOT ENOUGH EVIDENCE |
| Actual quality improvement | None | SIMILAR; targeted audio defect persists | NOT ENOUGH EVIDENCE |
| Unsupported claims | False visual diagnosis | BETTER, still false success / sync claim | NOT ENOUGH EVIDENCE |
| Runtime / MCP calls | 280.237s / 15 | 157.298s / 15 | Not run / 0 |
| Effective mutations / verification | 0 / 0 | 1 / 1 visual, inadequate for speech issue | 0 / 0; not run |
| Agenticness | PASS | PASS | Not assessed |
| Provider cost | $0 (free) | $0.08077457 | $0; preflight only |

Comparative labels describe Luna against Nemotron, not a GLM performance estimate.

## Agenticness

Issue chosen by Hermes, repair chosen by Hermes, creative parameters chosen by Hermes and tool selection controlled by Hermes: **not assessed**, because Hermes never started. Deterministic creative leakage: **NO** (no editing occurred). Alternative grounded issue, alternative valid repair and justified no-repair remain possible in the frozen architecture per the prior audit, but are **not tested for GLM**. Final agenticness: **not assessed**, no artificial PASS/FAIL assigned to an unrun test.

## Verdict / next step / Git

**E. TEST BLOCKED — budget.** Next step: make sufficient allowance available explicitly before authorizing a future frozen-architecture GLM experiment. No next phase implemented; no retry attempted. Production files and model preferences unchanged. This commit records preflight documentation only.

Artifacts: `/Users/adityasamant/SCLIP V1/editor/apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/phase3c1-glm-preflight/access.json` and `metrics.json` (local ignored metadata; no secrets or hidden reasoning).
