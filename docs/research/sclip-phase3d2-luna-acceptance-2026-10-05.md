# Phase 3D.2 — one Luna live acceptance, interrupted by key allowance

## Verdict

**E. INSUFFICIENT EVIDENCE.** Provider allowance failure interrupted an active repair before speech verification. **Quality improvement: NO** in the preserved partial result. This is not a successful autonomous editing acceptance or proof that either model is the main bottleneck.

## Control / cost

Exactly one `openai/gpt-5.6-luna-pro` session through the prepared `94b42031` harness, continuing `e284ba05`. Same normal objective, unchanged Phase 3D/skill/MCP/perception/ProjectActor/continuation fingerprints and exact original55.866667s project hash `e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`. External B-roll disabled. No hint, first-pass regeneration, raw-source edit, result patch, model retry/substitution, spending-limit change or credit purchase.

Authenticated preflight at2026-10-05 10:46:02 UTC: existing key limit$0.25; remaining **$0.10311409**, above the prepared$0.08 planning estimate. Listed prices remain$0.20/M input,$1.20/M output,$0.02/M cached input below the long-context threshold. Catalog listing alone was not treated as proof of inference access; real requests did proceed.

Final provider-reported key and account usage delta **$0.13232123**. The preflight estimate was too low. Final key usage$0.27920714, remaining$0; the metadata delta exceeded the initial allowance and configured limit before a later HTTP403 “Key limit exceeded (total limit)” rejection. Cause of the accounting overshoot is not established; do not claim the key limit was a strict per-request cost cap. No concurrent inference was initiated by this task. Exact token/request totals are unavailable.

## Runtime / iterations / continuation

Hermes runtime **262.363s**; entire harness approximately4.8 minutes with setup/render. **14 completed MCP tool calls**,6 inspection attempts,3 successful range inspections/13 per-frame observations (two before, one after mutation),1 effective actor mutation,1 changed layer. CLI's40 tool messages include discovery/wrappers and are not40 MCP calls.

**No continuation used.** Provider failure occurred before the normal16 ceiling; nine observable tool-preparation batches appear in the safe trace, but exact provider/model-iteration count is not exposed and is not equated to those batches. There is one CLI/session identity and no extension-start event. The normal16/conditional4/hard20 controller remained unchanged.

Playwright passed execution/preservation assertions. Raw metrics report `code:0` and `providerFailed:false` because the existing heuristic misses this billing error; independent trace QA overrides that classification. No test or heuristic was patched. A passed wrapper is not editorial success.

## Packet / issue / evidence

Luna cited initial **p0** plus current timeline **e2** in its accepted issue. It also read `project://current`, timeline context and representative opening/middle visuals. Timeline/source coordinates were used correctly. Individual frame descriptions preserve initial light/signage vs speaker differences; cached transcription is distinguished from authoritative clip mapping in the independent audit.

Its independently chosen issue is supported: final incoming Audio source starts540.000s inside cached word “you'll”539.920–540.170s, at timeline51.266667s. Severity “critical” and the perceptual extent of onset damage are model judgments, not independently calibrated measures.

First registration requested speech+audio+timeline using unsupported receipts and was rejected. Luna corrected it to **speech+timeline**, citing p0/e2. It chose both incoming layer IDs, selected issue-1 and checkpointed. No deterministic issue/repair was nominated.

## Repair / actual mutation

Luna independently chose source-only changes to both incoming video and audio at **539920000us**, preserving all timeline positions and outgoing speech. It committed:

**Incoming VideoClip `src_in_us`:540000000→539920000.**

All other parameters/layers, including paired Audio and53 captions, remain unchanged. The resulting video-minus-audio source offset is **−80ms**, initially0. Source relationship-change notes were available. Luna's separate attempt to apply the same source start to the paired Audio establishes relationship awareness, but the guard blocked that second mutation while fresh verification of the first remained pending.

## Post-mutation verification

Luna acquired fresh current timeline context over50–55.866667s, then three fresh visual samples over the same area. These supported timeline/text/visual/geometry dimensions, **not speech**. Speech verification stayed pending; the issue was neither resolved nor falsely auto-accepted.

The fresh visual request was appropriate for observing the changed video but insufficient for the selected speech claim. No fresh speech packet/audio evidence was acquired. After visual inspection the next provider request failed for allowance; no final model success/failure judgment was returned. Do not infer what Luna would have done with another request.

## Independent QA / regressions

Exact ProjectActor diff shows only the incoming VideoClip source-start change. Native render validH.264/AAC1080×1920,55.866667s. Main video gaps/overlaps remain0; Audio placements/ranges unchanged. All captions unchanged and aligned to their original audio state. Existing edge-clipped speaker framing remains visible in the ending sample; no crop/framing change was made.

Before/after decoded mono48kHz audio hashes are identical: `b26fb54dda8fa9853ac796e401b9f7a2fb21420d0f8df68e2758b3dbfd591a16`. Thus the speech issue persists; no audible improvement or new speech truncation occurred. New regression:80ms A/V source mismatch in the final pair. Perceptual lip-sync severity is not quantified. Native before/after51.2s and53.333s frames are preserved; unlike GLM, there is no new black gap or shortened outgoing word.

**Quality improvement: NO.** Both partial results remain unsuitable as successful repairs.

## Agenticness live audit

| Question | Result |
|---|---|
| Issue chosen by Hermes | YES |
| Repair chosen by Hermes | YES |
| Creative parameters chosen by Hermes | YES |
| Tool selection controlled by Hermes | YES |
| Deterministic creative leakage | NO |
| Alternative grounded issue possible | YES |
| Alternative valid repair possible | YES |
| Justified stop possible | YES |
| Continuation mechanism creative leakage | NO |
| Final agenticness | **PASS** |

Grounded issue, severity, layer IDs, tool choice and539920000us value originated in observable Luna tool arguments. The guards enforced dimensions, state and workflow; they did not pick creative values or declare satisfaction. The extension was available but never entered. Hidden reasoning is excluded from saved trace/audit.

## GLM + Phase 3D vs Luna + Phase 3D

Relative labels describe only observed behavior, not a completed intelligence ranking.

| Dimension | Luna relative to GLM | Evidence |
|---|---|---|
| Packet usage / grounding | SIMILAR | Both cite p0 and a real speech boundary |
| Temporal reasoning | BETTER | Exact word onset, no false room-tone trim |
| A/V understanding | SIMILAR | Both target pairs; Luna tries Audio explicitly |
| Editorial judgment | SIMILAR | Same defensible issue; neither verifies quality |
| Tool selection | BETTER | Source-only parameter tool avoids timeline displacement |
| Rejected-action response | NOT ENOUGH EVIDENCE | Corrected dimensions, then billing interrupts after blocked Audio attempt |
| Repair quality | SIMILAR | Neither fixes audio; Luna avoids GLM's gap/tail damage |
| Self-correction / verification | NOT ENOUGH EVIDENCE | Luna fresh visuals, no speech confirmation; no final judgment |
| Unsupported claims | NOT ENOUGH EVIDENCE | GLM's room-tone assertion wrong; Luna's final evaluation unavailable |
| Regressions | BETTER | No100ms black/silent gap or90ms outgoing-word cut; new80ms source offset remains |
| Runtime | BETTER observed | 262.363s vs404.997s; different termination causes |
| MCP calls | SIMILAR | 14 vs15 |
| Provider cost | WORSE | $0.13232123 vs$0.05538579 |
| Agenticness | SIMILAR | Both PASS |

GLM reached its old16-iteration ceiling without continuation; Luna ended on provider allowance before reaching the prepared continuation. Old pre-Phase3D Luna results are not used as same-architecture comparison evidence. These stop conditions prevent a reliable overall model ranking.

## Model vs architecture conclusion / Git

**E. INSUFFICIENT EVIDENCE.** Primary completion blocker: provider/key allowance. Observable workflow friction: separate video/audio mutations require relevant verification between them; Luna's fresh visual/context receipts could not establish speech. This does not prove the architecture makes completion impossible: the existing fresh speech packet path was not exercised before interruption. Nor does the trace prove Luna incapable of choosing it.

No fix, rerun or next phase. This commit records the report only; existing production and continuation code remains unchanged. Working tree clean after committing.

Artifacts root: `/Users/adityasamant/SCLIP V1/editor/apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/phase3d2-luna-acceptance/`

Starting/loaded/reviewed projects; native `edit.mp4`; initial packet, prompt/configuration; safe observable trace; lifecycle/coordinate/MCP events; actor before/after mutation; per-frame observations and13 PNGs; continuation events; before/after provider access and cost; metrics/history; project diff; audio hashes; native before/after frames and render probe; causal trace; independent QA; agenticness audit; frozen fingerprints and artifact hashes. Original project and GLM artifacts unchanged. STOP.
