# Existing rough-cut contract repair and free bulk gate

Verdict: **BULK GATE STILL NEEDS WORK**.

## Root cause and actual contract

The old Sclip MCP definitions hand-authored `plan` as object/string with no nested properties. This was not an MCP generation/transport or Hermes truncation problem: TypeScript interfaces are erased, `mergeMcpCatalog` preserves the supplied schema, Hermes `_convert_mcp_schema` normalizes it, and `dispatch_tool_describe` returns its full parameters. No code automatically converted the RoughCutPlan interface into an advertised schema.

The production validator requires:

- Plan top level: `version:1`, `brief`, `source_summary`, `editorial_thesis`, `sections`, `removed_ranges`, `estimated_duration_us`, `uncertainties`.
- Brief: nonblank `goal`/`audience`, positive finite `target_duration_us`, nonempty `tone` array.
- Each section: unique nonblank `id`, nonblank `purpose`, `clips` array. At least one clip overall.
- Each clip: an existing `media_id`, finite nonnegative `source_start_us`/`source_end_us` with end > start and within media duration, `action:"keep"|"reorder"`, nonblank `reason`.
- Removed ranges may be empty. Nonempty entries require media ID, valid source bounds and reason. `uncertainties` may be empty, otherwise contains strings.
- Every time/duration uses **microseconds**. `estimated_duration_us` is the sum of chosen source durations before frame snapping, within the existing 1000us validation tolerance. `brief.target_duration_us` is request metadata, not a second timeline clock.
- Ordering is section-array order, then clip-array order. There is no per-clip timeline position; existing mechanics assemble gaplessly from zero.
- Only `plan` is required at the tool-argument level. `track_id`, `composition_id`, `dry_run`, `reapply` are optional; omitted track/composition use existing defaults. Track replacement, linked A/V, snapping, checkpoints and history are unchanged.

The brief, summary, thesis, purposes and reasons are existing required metadata, not inputs to creative selection by the compiler. For already-decided work, short factual labels suffice. They were not removed or silently invented by code.

Minimum concrete object payload, assuming this illustrative media ID exists with at least two seconds of source (substitute the actual imported ID):

```json
{
  "plan": {
    "version": 1,
    "brief": {
      "goal": "Execute already-decided ranges",
      "audience": "User",
      "target_duration_us": 2000000,
      "tone": ["unchanged"]
    },
    "source_summary": "Existing source",
    "editorial_thesis": "Already decided by user",
    "sections": [{
      "id": "decided",
      "purpose": "Ordered assembly",
      "clips": [{
        "media_id": "00000000-0000-7000-8000-000000000201",
        "source_start_us": 0,
        "source_end_us": 2000000,
        "action": "keep",
        "reason": "User-decided range"
      }]
    }],
    "removed_ranges": [],
    "estimated_duration_us": 2000000,
    "uncertainties": []
  }
}
```

A JSON string encoding the same plan remains accepted. No compatibility path, validator or compiler changed.

## Contract change

Added one inline `ROUGH_CUT_PLAN_INPUT_SCHEMA` beside the existing plan types. Both existing MCP tools, `apply_rough_cut_plan` and `validate_rough_cut_plan`, reference it. Nested required properties, enums, media IDs, source units, ordering and duration arithmetic are now visible. Its description specifically distinguishes top-level summary/thesis/estimated duration from `brief`, and identifies empty arrays as valid when nothing was removed/uncertain.

There is no example containing benchmark ranges, generated solution payload, repair mapping or creative instruction in the schema. The old tool descriptions and WeftCut skill remain unchanged. No schema resolver/$ref dependency added. The rebuilt app's actual tools/list contract was captured and asserted before the live session: apply input schema 3475 JSON characters, validate 2941. Hermes's normal deferred disclosure remains intact; complete nested schemas become model context when Hermes requests them, not through a new prompt injection.

## Local tests and build

Before changes: existing rough-cut plan/execution and catalog-bijection suites **35/35 PASS**.

After changes: six focused suites **79/79 PASS**, including three new contract tests:

1. Required-only example constructed from the advertised schema passes the real validator; both tools publish the same complete shape after JSON serialization.
2. Deleting every advertised required top-level/brief/section/clip field still fails validation. Misnested summary, incorrect enum and wrong duration still fail.
3. Six synthetic decided ranges execute through one existing actor operation, with zero-write dry run, six linked A/V pairs, gapless snapped timings, checkpoint, exact one-step undo/redo, and serialization/reopen equivalence.

Existing equivalence, validator, MCP tool-table, catalog and skill-conformance tests remained passing. **`npm run build:e2e`: PASS**. No native mechanics edits or rebuild required. No caption test rerun.

## Free live bulk run

Fresh disposable source/project/profile using the production secure credential launcher and rebuilt MCP app. Exact same user-decided six intervals and same mechanical prompt as the preceding gate. Prompt contained no bulk-tool name or hand-written plan. Main model resolved to **OpenRouter / nvidia/nemotron-3-ultra-550b-a55b:free**; no fallback or profile/reasoning change. Budget stayed **16 turns**. No added reminders/interventions to help the model.

| Turns | Observed behavior |
| --- | --- |
| 1 | Read current project |
| 2–4 | Three rejected `apply_rough_cut_plan` calls |
| 5 | Malformed ordinary placement call, rejected before MCP |
| 6–11 | Six sequential successful `add_video_layer` calls |
| 12 | Began verification reasoning; request interrupted during shutdown |

- **Tool searches: 0. Tool describes: 0.** Hermes independently selected bulk, but never requested its now-complete deferred schema.
- **Successful bulk calls: 0. Rejected bulk calls: 3.** No turn reached successful bulk execution.
- **Successful timeline mutation calls: 6**, all ordinary per-range placement. Sequential fallback: **YES**.
- Eleven completed main-model responses, a twelfth main request interrupted; one separate title request. Thirteen SDK receipts total, not 13 completed editing turns.
- Stop requested at the specified failure condition after observing bulk rejection and sequential fallback. By process shutdown, all six sequential placements had already completed. The interrupted SDK stream was recorded as `stream_failed_usage_unknown`, exit 86; this is the deliberate interruption, not evidence of a provider spending-limit failure. Playwright's success-exit assertion consequently **FAILED**; evidence collection and post-run checks still completed.
- Completed requests reported $0 provider cost; canceled request usage/cost unavailable. All observed requests targeted the exact selected free model. No paid/model fallback, Jev, vision, captions or export.

### Exact remaining issue

The new schema was verifiably available through the built-app catalog, but **was not loaded into Hermes context** by any `tool_describe`. Therefore this run does not prove whether Nemotron would form a correct call after reading it.

Hermes instead guessed `items`/`target_track_id` inside `plan`, then placed `sections`, `source_summary`, `editorial_thesis`, `estimated_duration_us` and uncertainties under `brief`, using `kept_ranges`/`label` rather than the actual `sections[].clips` contract. It also supplied an incorrect 23,920,000us duration during those guesses. Required top-level fields were consequently missing; production validation correctly rejected the calls. It abandoned bulk without reading the available contract. This is now an observed **agent procedure / deferred-contract loading failure**, not demonstrated ambiguity in the published nested schema or an execution-mechanics bug. No stronger claim that it understood and consciously ignored the full contract is warranted.

### Actual resulting timeline

All six requested source intervals are present in order via the fallback:

| Source seconds | Video timeline seconds |
| --- | --- |
| 155.360–158.400 | 0–3.033333 |
| 163.200–168.560 | 3.033333–8.400000 |
| 177.520–182.960 | 8.400000–13.833333 |
| 183.040–190.080 | 13.833333–20.866667 |
| 190.080–194.960 | 20.866667–25.766667 |
| 205.600–210.640 | 25.766667–30.800000 |

Actual composition duration **30.800000s**, not the existing bulk oracle's **30.766667s**. Six VideoClip/Audio pairs and six two-member links exist. Ordinary placement uses the separate frame/sample grids and retained requested source endpoints; the strict six-pair exact-co-boundary check does not pass. No orphaned partner or missing link; no claim of playback/audio quality without inspection. The fallback's canonical state does not equal the expected bulk state, and it is not counted as a bulk PASS.

One undo removes only the final ordinary placement pair (five remain), not the whole cut. Redo restores the six-pair canonical state. **Save/reopen equivalence: PASS. MCP usable afterward: PASS.** Atomic whole-cut undo/reopen mechanics passed locally, not through this live agent.

## Architecture and stopping

Only production change: nested schema exposure in the existing plan module and two existing MCP definitions. No new tool/batching system, ProjectActor change, validator weakening, compiler modification, timeline/controller, hidden creative action, workflow, Jev work, Hermes core change or model swap. Hermes selected its own tools and fallback order; the external stop only enforced the user's failure condition. Existing dirty work and previous gate artifacts preserved.

Artifacts: `apps/desktop/e2e/bench-results/mechanical/bulk-contract-v1.{catalog.json,outcome.json,project.json,hermes-trace.txt,live-usage.jsonl}`. Snapshot is diagnostic/disposable, not a durable media-complete user project.

**BULK GATE STILL NEEDS WORK**. No additional description expansion, agent rerun, caption test, GLM, Jev or full edit after this failure. The remaining question is why this model skips existing deferred schema loading, not whether another batching architecture is needed.
