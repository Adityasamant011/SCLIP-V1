# Hermes bulk runtime gate — 2026-09-28

Scope: deferred-tool protocol fix and six-range bulk rough-cut execution only. No Jev experiment, vision, export, full edit, or GLM inference was run. Existing dirty Sclip and Hermes work was preserved.

## Runtime

- The built-Electron mechanical harness launches the external Python checkout at `/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python`; its `tools.tool_search` resolves to the patched source file in that checkout. Development Sclip also uses that source checkout when configured through its current development path.
- The source patch survives a fresh Python process and the fresh built-app test below.
- The installed `/Applications/Sclip.app`, `/Applications/WeftCut.app`, and generated `apps/desktop/release/mac-arm64/WeftCut.app` lack the `Contents/Resources/hermes/hermes` executable expected by the packaged launch path. They are **not** verified distributable carriers of this fix. The existing package configuration does not currently bundle that executable. This pre-existing distribution gap was not redesigned here.

## Local regressions

- Hermes targeted pytest suite (`tests/tools/test_tool_search.py` and `tests/test_toolsets.py`): **60 passed**. Pytest 9.1.1 was installed into an isolated temporary target, not the user's global Python.
- Sclip focused Vitest suite (rough-cut contract, execution and plan; Hermes settings and terminal; MCP router and tool table): **96 passed across 7 files**.
- Cost-observer Python mocks: **13 passed**. These prove route filtering, response accounting, normal/summary/auxiliary capture, and fail-closed behavior for missing usage. They do **not** prove a hard pre-request dollar ceiling.

## One fresh free-model built-app run

- Profile: OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free`; Jev disabled.
- Artifact: `apps/desktop/e2e/bench-results/mechanical/bulk-runtime-verify-v1.outcome.json` and paired Hermes trace/usage files.
- Seven model requests were recorded, including one auxiliary request; six were main-model requests. Runtime was 113,210 ms.
- Hermes independently selected `apply_rough_cut_plan`. Its first selected invocation omitted nested required fields; the patched protocol refused it, Hermes called `tool_describe`, and its next invocation succeeded. There was **one successful atomic bulk operation**, not six sequential placement calls.
- Canonical timeline matched the offline expected state. Six linked A/V pairs appeared in the specified order; frame-snapped duration was 30,766,667 µs. One undo restored the empty project; redo restored the edit; save/reopen preserved it; MCP remained usable.

## Paid-readiness decision

**GLM 5.2 was not called. Recorded GLM spend: $0; Jev spend: $0.** The current test-only guard observes and stops *after* a response, and its preflight only checks accumulated spend. A local mock showed that with $0.029 already consumed under a $0.05 cap, it permits another request with no estimate or reservation for that request. The harness also does not currently enforce a request-level maximum output size. Therefore the requested $0.05 total ceiling cannot be conservatively protected by the current guard. Per the brief, this failed prerequisite blocks paid inference. There is no claim of measured GLM savings.

## Verdict and next action

`BULK NOT YET CONFIRMED WITH GLM`

Next single validation step: implement and mock-test a **test-only** pre-request budget reservation and maximum output cap for the disposable GLM harness, then reassess whether one bounded GLM bulk run can fit under $0.05. Do not change the user's persistent model selection, Sclip production behavior, Jev, ProjectActor, or Hermes creative routing for that test.
