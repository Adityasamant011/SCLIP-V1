# Phase 3C — frozen architecture intelligence bakeoff

## Experiment integrity

One paid review-only run; no Nemotron rerun, raw-source editing, first-pass regeneration, second model or editorial patch. Same 55.866667-second starting edit, hash `e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`, same normal prompt, skill, MCP tools, local vision, 24-turn ceiling, lifecycle and disabled external B-roll. Core source fingerprints match `fd433368`. The new harness copies the existing acceptance harness with only test/opt-in/output identity and the temporary profile's model changed. The user's persistent model setting is unchanged. Typecheck passed; the frozen architecture retains its preceding 192-test result.

68 previous Phase 3B artifacts and 25 original Phase 3 artifacts checked unchanged. Source SHA256 remains `43586606dedfcd16c4208860c8336d78e9f9c1de78b3d037170481a280fef857` (see preservation.json).

## Model access / cost

Authenticated OpenRouter metadata listed the exact requested `openai/gpt-5.6-luna-pro`; no substitution. Before inference: paid account available, account remaining $1.725624089; existing key limit/remaining $0.10. Prices: $0.20/M input, $1.20/M output, $0.02/M cached input below the listed long-context threshold. Rough 24-call scenarios estimated $0.077–$0.202 depending on context/output; the provider's existing key limit was retained. No purchase or limit change.

Provider-reported key and account usage both increased **$0.08077457**. Key remaining $0.01922543; account remaining $1.644849519. No provider failure. Token counts and exact provider request count are not exposed by the unchanged harness; do not infer them from cost.

## Baseline / comparison

| Metric | Nemotron Phase 3B.3 | Luna Pro |
|---|---:|---:|
| Runtime | 280.237s | 157.298s |
| Actual MCP tool calls | 15 | 15 |
| Inspection attempts | 10 | 8 |
| Representative range inspections | 0 | 2 (8 frames total) |
| Effective mutations | 0 | 1 |
| Changed-result visual verifications | 0 | 1 |
| Independently verified targeted improvements | 0 | 0 |

Nemotron reported 18 serial tool-bearing turns. Luna's safe trace has 9 consecutive tool-preparation batches, 16 tool_call invocations and 11 tool_describe invocations, with parallel calls. Exact model-turn count is unavailable; these are not interchangeable turn metrics. Both used the same 24-turn ceiling. Luna made 17 MCP protocol requests including discovery/resource access, 4 rejected MCP calls, and no no-op attempt. CLI's 36 tool messages are not 36 MCP calls.

## Behavior differences

| Dimension | Relative result | Observable evidence |
|---|---|---|
| Grounding | BETTER | Registered actual word-boundary issue with current receipts/layer IDs |
| Temporal/range reasoning | BETTER | Independently chose full-edit representative inspection, then changed-area inspection |
| Story/context understanding | NOT ENOUGH EVIDENCE | No narrative restructuring or meaningful context judgment demonstrated |
| Editorial judgment | BETTER | Real mid-word speech cut instead of unsupported whole-opening visual diagnosis; severity “critical” remains subjective |
| Tool selection | CLEARLY BETTER | Discovered range tool, checkpointed and used editing tool |
| Action completion | CLEARLY BETTER | Registered, selected, checkpointed, mutated and completed |
| Self-correction | NOT ENOUGH EVIDENCE | Recovered from rejected inspections but missed incomplete audio repair |
| Effective repair | SIMILAR | Neither produced a verified targeted quality improvement |
| Unsupported claims | BETTER, still insufficient | Avoided old diagnosis, but falsely claimed speech repair and preserved A/V synchronization |
| Efficiency | BETTER | Lower runtime and fewer inspections with equal MCP calls |
| Agenticness | SIMILAR | Both retained independent editorial choice |

## Edit result / causal evidence

Current context exposed the final cut at timeline 51.266667s, source 540.000s. The source word “you'll” spans 539.920–540.170s. Hermes selected this speech-continuity issue, cited e2/e3/e4, registered issue-1, selected it and checkpointed. It independently chose source 539.920s and called `update_layer_params` on the incoming VideoClip.

ProjectActor made one effective change: video `src_in_us` 540000000 → 539920000. **The paired Audio still starts at 540000000.** Other 64 layers, captions, timeline placement and duration are unchanged. Fresh e5 evidence sampled 50.8–55.866667s; Hermes marked resolved and completed.

Independent native render: valid H.264/AAC, 1080×1920, duration 55.866667s, no main-video gaps/overlaps. Baseline and reviewed decoded audio hashes are identical: `ccfdcfb2220fb52a128049e02d579a3532f1526d175f8fbda642a9c15bcb798d`. Thus the speech defect persists, and the final clip now has an 80ms source offset between video and audio. Perceptual impact was not quantified. This is **not a successful quality repair**.

Shared evidence/workflow limitations are also concrete: the five-frame Qwen summary falsely said the speaker was visible/central in every sample, despite the actual timeline-0 light frame and edge-clipped final sample. Hermes's speech issue cited visual receipt e4, causing the guard to require visual reinspection and reject fresh timeline context/critique before it. Visual evidence then cleared the verification gate despite unchanged audio. No fix was made during the experiment. The video-only edit and unsupported success claim remain Hermes errors; infrastructure did not force those creative choices.

## Agenticness

Issue chosen by Hermes **YES**; repair chosen by Hermes **YES**; creative parameters chosen by Hermes **YES**; deterministic creative leakage **NO**; could choose another valid issue **YES**; another valid repair **YES**; justifiably stop **YES**. Final agenticness **PASS**. Quality failure does not invalidate agency.

Evidence/context/vision are EVIDENCE; freshness and no-op checks STATE SAFETY; frame/audio lattices, schema and rendering TECHNICAL INVARIANTS; review budget/checkpoint/verification WORKFLOW/LIFECYCLE; discovery/credential resolution/audits BOOKKEEPING. No inspected deterministic component selected an issue, creative value or repair recipe. Search found no benchmark timestamp/crop/pacing/caption prescription in deterministic review paths. Scope and causal trace are preserved in agenticness-audit.json; hidden reasoning is excluded.

## Model vs architecture verdict

**PASS — MIXED BOTTLENECK IDENTIFIED**, directional evidence from one run. Model capability materially improves evidence selection and execution under the frozen system. Shared vision inaccuracies and verification requirements remain limiting; stronger-model repair completeness/self-assessment also failed. This does not establish publishable editing or a universally superior model.

## Next step

**C. Mixed — keep stronger model and design the Editorial Evidence Packet.** Recommendation only; not implemented.

## Artifacts / Git

Root: `/Users/adityasamant/SCLIP V1/editor/apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head/phase3c-luna-pro/`

Starting/loaded/reviewed projects; `edit.mp4`; safe `hermes-trace.txt`; MCP/coordinate/lifecycle events; review-decisions; mutation-evidence; representative frame PNGs and observations; `native-after-53.333.png`; metrics; access-before; provider-usage; frozen-architecture; preservation; project-diff; speech-boundary-evidence; independent-qa; agenticness-audit. These are local ignored benchmark artifacts. Only the comparison harness and report are committed; production architecture is unchanged.
