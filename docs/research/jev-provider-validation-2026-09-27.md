# Jev measurement continuation — provider blocked

2026-09-27. Continued from the current dirty working tree and the completed local handoff. No implementation restart, reset, stash, production changes, model change, new architecture or final export.

## Package-note triage

The generated `apps/desktop/release/mac-arm64/WeftCut.app/Contents/Resources` genuinely contains no `hermes/hermes` executable. Both current `HermesRuntime.resolveLaunch` and `HermesTerminalRuntime.resolveLaunch` expect that executable when packaged, unless an explicit executable override is supplied. Source/development launch can use the existing external Hermes checkout; that branch is not the normal packaged branch.

This is a real distribution limitation, not merely a false-positive test log: a normal clean-user installation of this generated package would not start Hermes without a separately provisioned runtime/override. It does not invalidate the packaged Qwen/MCP checks, which did not prove Hermes distribution readiness.

It is **pre-existing**, not caused by this Jev work: `git show HEAD:apps/desktop/src/main/sclip/hermesRuntime.ts` already requires `resources/hermes/hermes` and raises `Bundled Hermes runtime is missing`; HEAD's electron-builder configuration has no Hermes resource supply step. The current packaging diff adds the Qwen worker and its presence check, not a removal of Hermes. No Hermes build/supply step was found in the current packaging scripts/workflows. As instructed for unrelated/pre-existing limitations, no packaging implementation was added. The installed development launcher was not replaced.

## 1. Provider gate

Ran exactly **one** provider request through the **existing built production main entry**, normal WeftCut Streamable HTTP MCP `evaluate_source_passages`, production `createSourcePassageEvaluator` / `createJevClient`, and existing secure-storage credential resolver. The thin Electron test adapter disables Playwright's mock keychain; it does not supply a second provider implementation. An isolated disposable profile copies the encrypted credential blob; the environment OpenRouter key is explicitly empty.

Input was only one cached retrieval window overlapping source 0–1s, with the evaluator's normal three evidence questions. No whole-source paid evaluation, Hermes call, Qwen call or editing mutation was performed.

| Measurement | Observed |
| --- | --- |
| Requested model | `typesafe/jev-1.13` |
| Endpoint | `https://openrouter.ai/api/alpha/decisions` |
| Production credential resolution | PASS |
| Provider request count | **1** |
| Real Jev inference / accepted result schema | **NOT ESTABLISHED** — HTTP error before a successful result |
| Provider response | **HTTP 403 (credit/key spending limit)** |
| Provider request latency | **309 ms** |
| End-to-end MCP call latency | **330 ms** |
| Input tokens / billed cost | **Unavailable/null**, not zero |
| Fallback / retry | **NONE** |
| Timeline unchanged | **YES** |
| Ordinary timeline-context MCP afterward | **PASS** |

Sanitized numeric receipt and whitelisted error are saved in `apps/desktop/e2e/bench-results/jev/provider-gate-current.json` (gitignored). No raw provider body or credential was printed or included in the report. The key stayed in the main-process production credential path.

The copied active main profile resolved to **OpenRouter / `nvidia/nemotron-3-ultra-550b-a55b:free`**. It was not changed or called. This is not a Nemotron benchmark or a fallback. The requested controlled final benchmark remains **`z-ai/glm-5.2`**, but no main-model benchmark was reached after the provider stop condition.

## 2–4. Retrieval, source A/B and gate decision

**NOT RUN.** Winner Recall@3/@5/@8/@12, candidate coverage, neighboring-context quality, uncertain/context-required rankings, irrelevant rate, real malformed rate, token volume and successful Jev cost remain unmeasured. The historical airport/mentor narrative around 155–225s remains evaluation-only ground truth, not a production selection rule.

No compact-only versus compact+Jev Hermes source-understanding run was launched. No source-quality or incremental efficiency gate is claimed. The 403 stop condition prevents proceeding to reduced-evidence editing.

## 5. Full edit

**NOT RUN.** No completion, new story choice, framing, caption, pacing, polish or acceptable-edit rating is available. No MP4/export was created.

## 6. Agenticness

Production Hermes, tool search, skill, main-model selection, reasoning, max-turn settings, ProjectActor, vision, editor/compositor/export and pruning are unchanged by this continuation. The test invokes a read-only evidence operation for measurement, not an editing controller. No automatic production Jev call or creative action order was introduced. Actual creative agent behavior was not observed in this run.

## 7. Mechanical efficiency

**Not measured in a new agent session.** The prior local nine-range equivalence test proves one existing bulk operation can execute nine already-decided placements, potentially avoiding eight primary-model execution turns. That potential is not a measured reduction here. Caption IDs remain returned by the existing caption operation; avoidance of the historical huge tracks read was not observed in a new live edit.

## 8. Context efficiency and cost

No main-model calls occurred. New cumulative/peak/cache/uncached/output/reasoning measurements therefore do not exist for a comparable edit. The previously verified 84.43% compact payload reduction remains a payload measurement, not a billed saving.

Historical diagnostic baseline remains the unfinished GLM run: 52 successful calls, approximately 5.31M input, 402,823 uncached input, 4.91M cached input, 34,517 output, peak 158,695 input and approximately $0.9243 recorded main-model cost. It cannot be compared to this failed provider probe as cost per acceptable edit. Failed Jev-attempt billing is unavailable. The $0.30–$0.45 target remains unproven.

## 9–10. Quality and regressions

No new video-quality evidence. Qwen's known semantic partial-head-crop failure remains unresolved; honest confidence/geometry do not prove it solved.

Focused existing regressions before the gate: **23/23 PASS** across Jev client, source passage evaluator, retrieval metrics and structural agency tests. The new provider-gate diagnostic: **1/1 PASS** in 8.5s (7.4s test execution), meaning it safely recorded the provider refusal and verified unchanged timeline / usable MCP — **not** that Jev access passed.

Current tree has newer changes than the handoff's 51-file snapshot (52 tracked modified files before this measurement). They were preserved. ProjectActor SHA still matches the handoff: `5bb6f84b420a635b35b9b3ff0dedca231a18e9f31fa6cccd49c519c0ec57d679`. Only a test-only single-request gate in the existing reliability spec and this report were added in this continuation. No production rebuild or package replacement was necessary for the existing production runtime probe. Known old typecheck/fixture failures were not changed or rerun.

## 11. Current remaining blocker

The immediate blocker is **OpenRouter account/key spending allowance**, not a newly demonstrated Jev retrieval, Sclip execution or Hermes planning defect. This run cannot establish the biggest product-quality bottleneck because it did not reach inference or editing.

## 12. Exactly one next priority

**After the existing OpenRouter allowance is made usable, validate Jev retrieval recall and neighboring-context quality on the historical source before any reduced-evidence edit.** This is the next validation priority; no new engineering architecture is justified by an account-limit refusal.

Stop here. No fallback, free-model comparison, further paid request, source A/B, full edit, style learning or automatic architecture work.

Reproduce the single gate from `apps/desktop`:

```sh
SCLIP_JEV_PROVIDER_GATE=1 SCLIP_JEV_ENABLED=1 npx playwright test e2e/electron/jev-reliability.spec.ts --grep 'minimum authenticated Jev provider gate' --project=parallel --workers=1
```

**JEV NARROWS. HERMES CHOOSES. DETERMINISTIC CODE EXECUTES. HERMES REVIEWS.**
