# Phase 3B.2 — saved-edit review acceptance

## Scope and resilience

No first pass, source import, transcription, provider/model change, or creative tool change. One live review uses a copy of the existing Phase 3B first-pass project and its media/cache. Two setup failures occurred before Hermes launched: missing workspace-relative media, then the renderer remained on the startup view. Both setup artifacts were retained; neither used model requests. The final harness copies Media/Cache and enters the editor through its existing reopen hook.

The installed Hermes runtime (`8fd95f5c75a97418c983be7baaa55a408bed206a`) already handles transient request failure. Its conversation loop uses a default ceiling of **three failed attempts**, despite calling this “three retries” in its output. Ordinary backoff uses 2-second exponential delays with jitter, capped at 60 seconds before jitter; 429 respects Retry-After up to 600 seconds. OpenAI SDK retries are disabled for the primary client. OpenRouter transport failure does not trigger an additional rebuilt-client cycle. No fallback was configured in this run. Existing behavior was reused without adding a retry wrapper or replaying a session/tool mutation.

Retryable conditions covered: 429, 500, 502, 503/overload, 504, connection reset, timeout. Authentication/configuration failures fail immediately for this single-key configuration. Explicitly configured credential refresh/fallback in other installations may behave differently. Request retries occur inside the provider-response loop before tool dispatch; ProjectActor mutations are not replayed by a process/session restart.

## Tests and evidence collection

- Typecheck: PASS.
- Focused Vitest: **34/34 PASS**, revision guard and real MCP/ProjectActor action integration.
- New offline Python tests drive the **installed Hermes conversation loop**, replacing the provider client and blocking network: transient failure then identical request succeeds (seven conditions); persistent 503 stops after three attempts; 401/403/400 stop after one attempt. **3 tests / 11 cases PASS**. No editing tools or real provider requests execute.
- Added stale-state test: changed timeline rejects the prior diagnosis even after a read; a newly grounded diagnosis permits mutation and requires reinspection.
- Build E2E: PASS.

The sole production-code addition is opt-in mutation auditing through the existing MCP commit-observation window (`SCLIP_MCP_AUDIT_DIR`). It writes authoritative before/after ProjectActor snapshots only for actual committed calls. It supplies no editorial decisions and does not change tool routing. The review harness saves current timeline/history/logs and renders only if an actual mutation is observed. CLI reasoning display is removed from the shareable trace; future harness setup disables only its display, preserving model reasoning settings.

## Live result

**FAIL — AGENT.** Provider remained available; no retry failure occurred. This is not a provider block.

| Metric | Result |
|---|---:|
| Review runtime | 353.838 seconds |
| Tool-bearing Hermes turns | 24 / 24 ceiling |
| CLI-reported calls | 48 (assistant tool-call messages + tool responses) |
| Actual MCP tool calls | 21 |
| MCP protocol requests including resource/list | 23 |
| Inspection attempts / successful | 15 / 14 |
| Geometry calculations | 6 |
| Verified issues / attempted repairs | 0 / 0 |
| Successful timeline mutations / verification calls | 0 / 0 |
| Verified improvements / regressions introduced | 0 / 0 |
| Physical provider requests | Not exposed; no retry errors observed |

**Before → Hermes decision → mutation → after → verification:** saved 55.866667-second edit → Hermes claimed opening signage and black-frame/source mismatch, proposing source reselection and rough-cut reconstruction → **no mutation** → identical compositions, six video + six audio + 53 captions → **no repair verification**.

The final critique claims “15+ seconds of black screen or irrelevant signage”. It used `vision_inspect t_us` values 205640000, 425600000 and 425650000, all beyond the 55866667-microsecond timeline. Those source timestamps cannot establish what the current edit displays. Native first-pass render samples show the speaker during the alleged absent-speaker opening and subsequent sections. They also show real late framing and caption weaknesses; the failed critique did not repair those. We do not adopt its asserted source-corruption cause as a verified issue.

Hermes never invoked `revision_control begin`, checkpointed, validated a grounded review, selected an issue through the guard, or mutated. The instruction-dependent guard therefore did not enforce its diagnosis/action budget. Fifteen inspection attempts and six geometry reads consumed the interaction budget. Failure categories: **REVIEW_REASONING_FAILURE, STATE_GROUNDING_FAILURE, EVIDENCE_FAILURE**. There is no tool-execution repair failure because no repair was attempted.

Full-project hashes changed because project loading relocated media, then background proxy preparation added `media_pool.<id>.decode_route.quick_proxy`. This is not an editorial mutation. Canonical compositions hash is identical before/after: `906215e72fb99f4c59fddf83bc0efa9d6268eccf60869d8df44d116b87fa73bc`. Loaded project hash `276a5896c4b8dc70c81d4d0cdeda4aa9085392ffb1abfceb768e8438566880aa`; reviewed project hash `67f73aeef5667d582ca1637d1b7c1c3e230194cdc2f7b118655562a7f10d3e48`. The original first-pass remains `e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`.

**Agency:** Hermes independently selected its claimed issue and proposed repair. Neither was supplied by the harness; the claim was unverified and the repair was not executed. Deterministic code supplied evidence/invariants/auditing only. No footage-specific creative rule was added.

**Next step: A — Phase 3B.2 needs another architectural iteration.** Make review-mode budgeting reliable without relying solely on a model remembering to begin, and make out-of-timeline visual evidence unambiguous. Do not choose creative repairs in deterministic code. No further implementation or live review was performed.

## Artifacts

Root: `apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/review-only/`.

- `starting-project.json`, `loaded-project.json`, `reviewed-project.json`
- `hermes-trace.txt`: secrets redacted; CLI reasoning display removed
- `metrics.json`, `mcp-events.json`, `history.json`, `configuration.json`, `prompt.txt`
- `contact-sheet.jpg`, `frame-0.7.jpg`: copied samples from the unchanged native first-pass result
- `render.json`: references preserved `../first-pass/edit.mp4`; no redundant render of an unchanged timeline
- `workspace/`: copied project/media/cache and native logs

Original Phase 3 and Phase 3B artifacts were preserved: 25/25 baseline hashes match, and the copied source media is hash-identical. `preservation.json` records the check. Two pre-provider setup failures are kept separately in sibling `review-only-preload-failure` folders.

No successful self-correction is claimed. The E2E harness completing is measurement success, not editorial acceptance.


Offline provider-test command: `HERMES_RUNTIME_ROOT=/Users/adityasamant/SCLIP/hermes-agent-src /Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python apps/desktop/e2e/provider-runtime/provider_retry_test.py`.
