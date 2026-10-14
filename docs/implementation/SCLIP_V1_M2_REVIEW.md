# SCLIP V1 M2 — review progression implementation and acceptance

Status: IN PROGRESS. Hermes remains the creative agent and decides repairs and review outcomes. The host supplies current protocol facts, never a creative edit or a forged verdict.

## Verified contract changes

Grounded `review_next` feedback exposes current stage, legal actions, exact native tool names, current receipt/issue IDs, missing rendered modalities, revision/opening/request ownership, schema-valid examples and preceding failure. Inspection examples now occupy the canonical example array when evidence is missing. Completion follow-up retains the original brief and explicitly requests continuation of unfinished work. The shipped WeftCut skill describes the supported flat review lifecycle.

Files: `main/sclip/revisionLoopGuard.ts`, `reviewProgress.ts`/test, `completionReview.ts`, `completionCheckpoint.ts`/test; `main/mcp/server.ts`, `completionReview.test.ts`; `skills/weftcut/SKILL.md` and its conformance test.

The first engineering probe completed an actual left off-screen title repair through native Hermes (19 provider requests,218 seconds,cost0). Frozen v1 preserved four complete outcomes (2pass/2fail) and six unrun cases. Failed traces exposed empty inspection examples and notification-like completion follow-up; v2 repaired those specific contract defects. No prompts, fixtures, turn limits or creative decisions were changed to manufacture a pass.

## Frozen v2 native trials

All ten planned trials executed through the real Hermes executable, PTY lifecycle, native MCP discovery, ProjectActor and compositor. OpenRouter model pricing was rechecked; exact zero-price Nemotron only, paid fallback and auxiliary inference disabled. Reported cost0 on every request; HTTP200 and usage present for all170 requests.

| Frozen case | Native outcome | Correct terminal/integrity | Requests | Confirmed error results | Seconds |
|---|---|---|---:|---:|---:|
| gap-1 | completed | PASS | 9 | 1 | 176.1 |
| offscreen-original-1 | completed | PASS | 19 | 4 | 196.9 |
| valid-original-1 | completed | PASS | 10 | 1 | 122.0 |
| offscreen-original-2 | completed | PASS | 17 | 2 | 197.2 |
| gap-2 | completed | PASS | 13 | 2 | 164.3 |
| offscreen-right | incomplete | FAIL | 49 | 11 | 532.8 |
| valid-wide | completed | PASS | 17 | 4 | 173.1 |
| stale-after-user-edit | completed | PASS | 18 | 3 | 197.8 |
| native-user-cancel | cancelled | PASS | 3 | 0 | 89.0 |
| bad-note-recovery | completed | PASS | 15 | 2 | 174.8 |

Correct terminal/integrity outcomes:9/10 (90%). Ordinary trusted completion:8/9 (88.9%); safe cancellation is reported separately. This does **not** establish90% ordinary completion reliability. All three valid controls, including a User edit that made acquired evidence stale, preserved authored compositions. The cancellation trial waited35seconds and observed no late project mutation. Completed deliveries had actual decoded artifact verification and independent full FFmpeg decode. Independent QA never repairs the project and is not credited as Hermes review. Additional pixel checks on all six synthetic title fixtures find visible bright glyphs in the five successful controls/repairs and zero bright glyphs in the failed right-side variation (`m2-v2-title-pixel-verification.json`). These simple fixture-specific measurements establish visibility, not general editorial quality.

Median latency175.5seconds; range89.0–532.8seconds. Thirty confirmed error tool results remain in the traces; not all are invalid arguments (some are honest protocol refusals). Native tool-call counts and exact error/request bodies are retained per trial. One trial fails and is not hidden.

Evidence: `.scratch/sclip-v1-implementation/m2-frozen-trials.json`, `m2-v1-results.json`, `m2-v2-results.json`, `m2-v2-suite.log`; per-trial `native-m2-frozen-v2-*` directories contain prompt, provider requests/responses, lifecycle status, project JSON, frozen pre/post actor state, actual MP4, rendered UI, mutations and delivery disposition.

## Failed right-side title and repair underway

The right-side variation retained an off-screen title and ended incomplete after49requests. Hermes repeatedly sent x/anchor fields to envelope-only `update_layer`. The writer silently ignored unsupported fields, misleading the agent into retrying. A regression first reproduced the failure. The smallest repair rejects unsupported fields atomically at the authoritative mutation boundary, adds `additionalProperties:false` to the envelope patch schema and names `update_layer_params`/`set_position` as the correct tools. No transform is chosen or applied automatically.

Files: `main/state/mutations/update.ts`/test, `main/state/mcp-commands.ts`, MCP completion integration regression. Focused64tests and205affected actor/catalog/argument/dry-run/text-box tests pass; main typecheck and production build pass (`m2-v3-contract.log`, `m2-v3-typecheck-final.log`, `m2-v3-build.log`). Real Electron/MCP verifies rejection without project/history changes and a correct Text parameter write succeeds (`m2-envelope-runtime-retest/results.json`). The initial runtime assertion used the wrong scalar JSON shape; that failed fixture/log is retained, corrected to the actual XY scalar representation.

The unchanged right-side native retest now PASSes: actual title repair, current rendered inspection, legitimate no-repair decision and decoded completed delivery;18providerrequests,182.2seconds,2confirmed error results,cost0. Saved `native-m2-v3-reviewer-right-right-original-retest/` includes project/MP4/trace and a visually inspected `title-frame.png` with readable centered text. Supplemental score is `m2-v3-focused-results.json`; original frozen v2 results are unchanged and are not pooled across versions. Left repair and already-valid control supplemental retests also PASSed:35requests/335.8seconds and19requests/199.1seconds respectively,cost0. Valid composition unchanged; all three supplemental outputs fully decode and synthetic title visibility checks pass. The35request run had9confirmed error results: repeatedly double-wrapped tool_call arguments, unnecessary CLI/config recovery and two child-Hermes attempts that failed before inference. It eventually recovered through actual native MCP, applied the repair and completed legitimate current review. These failed attempts remain in the record and do not count as successful edits.

This exposed a grounded instruction gap at the native deferred-call boundary. Sclip's existing profile prompt now explicitly explains top-level name/arguments, target-schema nesting, schema errors versus connection loss, no child-agent/config workaround and claims only after committed edits. Existing user prompt/cwd preserved and guidance appended idempotently. Files: `main/sclip/hermesRuntime.ts`, `hermesSettings.test.ts`. Before-change regression failed; after-change30settings/terminal/skill tests and main typecheck pass. This is native session guidance, not an argument auto-remapper or a scripted editor. Its v4 build/native unchanged-fixture retests are pending; do not attribute frozen v3 behavior to this source change. M2 exit gate remains open until that runtime validation; wider reliability and M3–M6 are not certified.

## Current-build v4 boundary validation underway

Specific deferred-wrapper guidance is built and native verified: left repair completed in19requests/197.1seconds with3confirmed tool-error results (down from9in v3) and no CLI/child-agent detours; valid title completed in24requests/367.7seconds with8confirmed error results and exact authored composition preservation. Both outputs fully decode and visible text checks pass. However, the valid model reason incorrectly says3-minute for the actual3-second title. This is a factual reporting FAIL, saved separately in `review-reason-factual-error.json`; objective delivery and legitimate current-review lifecycle are not certification of arbitrary model prose.

The frozen ten-case acceptance is now executing on v4. These two already executed v4 controls are reused only after exact original prompt and normalized initial-state equality checks. All other eight cases execute anew. First gap case PASSes (13requests/179.0seconds,cost0). The initial fixture reuse comparator incorrectly expected a track kind field; the real model has track flags/role. Harness stopped, failed log retained, comparator corrected to actual flags, suite resumed without rerunning completed cases. `m2-v4-suite.log` and `m2-v4-suite-retest.log`, `m2-v4-results.json`, `m2-v4-build-identity.json` retain provenance. Remaining cases are unrun or active, not passes. No M2 final reliability claim or M3 outcome yet.

## M2 bounded engineering exit gate — PASS on current v4 build

All10frozen current-build cases executed or were reused only after exact prompt/normalized initial-state equality on the same build:9ordinary current-review/media-verified completions and1safe native cancellation. Correct artifact/lifecycle/integrity:10/10; ordinary completion:9/9. Both valid-title variants and the User-mutated stale-evidence control preserved authored compositions. Cancellation observed35seconds without late mutation. All completed artifacts fully decode; relevant synthetic title visibility checks are separate independent QA, never repair/review credit. No universal reliability or creator-quality claim is implied by nine ordinary synthetic trials.

| Case | Native outcome | Artifact/lifecycle/state | Requests | Confirmed errors | Seconds |
|---|---|---|---:|---:|---:|
| gap-1 | completed | PASS | 13 | 1 | 179.0 |
| offscreen-original-1 | completed | PASS | 19 | 3 | 197.1 |
| valid-original-1 | completed | PASS | 24 | 8 | 367.7 |
| offscreen-original-2 | completed | PASS | 13 | 1 | 158.2 |
| gap-2 | completed | PASS | 13 | 4 | 174.0 |
| offscreen-right | completed | PASS | 20 | 3 | 215.1 |
| valid-wide | completed | PASS | 25 | 7 | 248.8 |
| stale-after-user-edit | completed | PASS | 23 | 6 | 264.6 |
| native-user-cancel | cancelled | PASS | 4 | 1 | 95.4 |
| bad-note-recovery | completed | PASS | 12 | 3 | 172.7 |

166providerrequests; reportedcost0; HTTP200 and usage present throughout. Median188.0seconds,range95.4–367.7seconds.37confirmed tool-error results include honest evidence/protocol refusals and cancellation; invalid arguments and deferred-wrapper errors are categorized separately in per-run trace-metrics.json. No failures from v1/v2/v3 are overwritten or pooled into v4 reliability. All limits and creator prompts remained unchanged.

Factual prose remains fallible: the valid-title reason incorrectly calls3seconds3minutes; one left-title reason mislabels1500000us as1500000ms. These are explicit reporting FAILs, even though actual tool times, current receipts, state and decoded artifacts are correct. No certification of arbitrary model reasoning. Units now have explicit seconds alongside microseconds in M3 evidence work; its benefit is not yet certified. Registered-issue repair branches retain unit/integration evidence; these successful native tasks primarily repaired before final review and concluded no remaining repair. Do not call all subjective reviewer branches universally certified.

The existing genuine Hermes now performs these simple tasks, inspects current rendered state and legitimately finishes; no host-chosen edit or forged review verdict. M2 engineering gate closes for this bounded scope. More complex editorial work and final creator acceptance remain M3/M6 gates. Next: source speech coverage/boundaries, framing, committed multi-moment assembly and actual rendered editorial review.
