# Phase 3F — rollback coherence and generalization gate

## Verdict

**Deterministic rollback coherence PASS. Live generalization E — INVALID /
INSUFFICIENT (allowance gate).** No inference was started; no quality improvement
or live agenticness result is claimed.

## Root cause / fix

ProjectActor restored A, while the MCP-session guard retained B identity and
verification obligations. Successful checkpoint restoration now notifies the
existing guard, invalidates pre-restore receipts (including earlier equal-content
A receipts), clears abandoned verification and retained-repair eligibility,
updates review identity, preserves the selected issue and attempt counts, and
clears visual caches. Failed restores do not alter obligations. Rollback is
observable with checkpoint, abandoned/restored hashes and invalidated receipt IDs.

Before: A → chosen repair B → restore A → guard expects B → honest unresolved
closure blocked.

After: A → chosen single/batch repair B → restore A → B observations invalidated
→ original issue remains → Hermes chooses fresh evidence / alternative repair /
grounded withdrawal / unresolved finish / stop. A restore cannot resolve an
issue; a new retained repair and relevant fresh verification are required.

Reuse: ProjectActor/history restoration, RevisionLoopGuard, existing mutation
funnel, typed modalities and evidence receipt checks. No new editing architecture,
creative tool, packet contents, perception, skill, actor mutation or continuation
changes.

## Deterministic tests

- Typecheck: PASS.
- Desktop / CLI / skills build (`build:e2e`): PASS; existing dynamic-import warning.
- 11 focused suites, **76 unique tests PASS**, including **13 new tests**.
  - 10-suite run: 54 pass (includes original 10 transaction tests).
  - Transaction suite after adding paired rollback coverage: 12 pass (10 repeated,
    2 new), so 56 unique non-MCP tests.
  - MCP loopback suite: 20 pass, all model/perception calls mocked.
- New guard suite covers four varied issue dimensions/ranges/IDs, stale B and old
  A receipts, issue retention, no automatic resolution, alternative repairs,
  fresh evidence, unresolved finish, grounded withdrawal/no repair, pending
  verification cancellation and preserved maximum attempts.
- MCP tests cover real actor equality after ordinary and atomic restoration,
  receipt invalidation, alternative repair/reverification, failed restore
  preservation and honest unresolved completion.
- Paired actor/guard tests cover explicit unequal A/V transaction and ordinary
  audio-only edits, followed by exact rollback. No auto-sync or generated repair.
- Existing typed verification, stale state, packet bounds, per-frame observation,
  opening-context, automatic review, skill conformance and checkpoint tests pass.
- Diff whitespace check: PASS. No model calls in testing.

## Architectural / anti-overfitting audit

**Benchmark-specific creative production logic found: NO. Deterministic creative
leakage: NO. Architecture agenticness: PASS.** Reviewed 21 production/skill paths
changed during Phase 3B–3E, current Phase 3F diff and supporting geometry. Audited
fixture phrases/times/hash fragments and all 77 UUIDs from the preserved starting
project: no production matches for fixture identities or specific repair values.

Generic visual wording mentions wall/light/signage as examples of geometric
coverage, never a content trigger or prescribed edit. Context windows bound
transcript evidence, not authored cut durations. Canvas-fit arithmetic answers
Hermes's requested mode/focus; it selects no subject or repair and mutates nothing.
Existing authored links propagate only through an explicitly chosen linked-edit
contract; transactions do not infer partner operations.

The pre-Phase-3B skill includes optional Jev scouting examples (five-second hooks,
caption emphasis). These are existing editorial guidance, not deterministic
benchmark logic, and were not changed. No genre/face/caption recipe was added in
Phases 3B–3F. This audit does not claim the entire historic codebase is free of
all editorial guidance or every possible implicit bias.

Hermes chooses issue, repair, tools, creative values, transaction members,
rollback and quality judgment. Alternative valid edits, deliberate A/V offsets,
one edit, no repair and honest unresolved finish remain available. Infrastructure
supplies evidence/provenance/state safety and lifecycle bookkeeping only.

## Evaluation discipline / new media

**Old 55.866667-second talking-head: REGRESSION FIXTURE ONLY.** Prior artifacts
unchanged. It cannot alone establish improved editorial quality. Policy:
[`sclip-editorial-evaluation-policy.md`](sclip-editorial-evaluation-policy.md).

Different existing holdout candidate (not used/run):
`/Users/adityasamant/Downloads/Fun Family Morning, Garden Update & New FS Tracksuits.mp4`.
Family/lifestyle vlog, 1314.010794 seconds, 1280×720, video + audio, 122260604 bytes.
SHA256 verified against prior source inventory:
`759bc4124516b87899bbcc34d76ffcab43869fc59fe4d61a454416dc35329396`.
Its previous Phase 3 preparation was stopped; no completed editorial run exists.
No scene inspection or expected edit was constructed for this fix.

Proposed natural prompt (not submitted): “Make a short, engaging family vlog from
this footage. Keep the moments that tell a natural story.”

## Luna gate / live result

Authenticated metadata checked **2026-10-05 15:47:30 UTC**:
`openai/gpt-5.6-luna-pro` exists, tools supported, accessible in authenticated
catalog. Base price $0.20/M input, $1.20/M output, $0.02/M cached input; catalog
lists higher pricing above 272k prompt tokens.

Key limit $0.70; usage $0.651435; remaining **$0.048565**. Account balance
$1.074189089 does not override the key limit. Conservative minimum headroom
$0.30 (last bounded review cost $0.26844092); insufficient even for that prior
review, without assuming a long-source first pass will be cheaper.

**Stopped before inference.** Limits unchanged; no purchases. Incremental Luna
cost **$0.00**; runtime/iterations/tool calls: **N/A / 0 / 0**. No partial session,
retry, second model, edit, render or independent editorial QA occurred.

Editorial behavior, edit result, live self-correction/rollback, chosen issue,
repair, modalities, final judgment and quality are **UNASSESSED / INCOMPLETE**.
There is no live model-vs-architecture failure attribution.

### Live agenticness checklist

Issue: N/A; repair: N/A; tools: N/A; parameters: N/A; transaction contents: N/A;
rollback: N/A; final quality judgment: N/A. Infrastructure generated creative
choice: NO. Benchmark-specific creative production logic: NO. Alternative valid
edit possible by architecture: YES. Final live agenticness: **NOT ASSESSED**.

## Artifacts

Separate ignored artifact directory:
`apps/desktop/e2e/bench-results/phase3f-rollback-generalization/`:
`preflight.json`, `holdout-readiness.json`, `production-audit.json`,
`deterministic-results.json`. Metadata only; no credentials or hidden reasoning.
Rollback design: ADR 0076. All earlier acceptance artifacts preserved.

## Limits / next step / Git

This proves deterministic rollback coherence, not editorial generalization.
Receipt invalidation deliberately requires reacquisition; fresh relevance uses
existing sampled-range/modality coverage, not an aesthetic judge. Restore changes
outside this MCP session still trigger ordinary stale-state protection. No broad
history/undo/redo or runtime-stability work was performed.

**Exactly one recommendation: D — Need another genuinely different holdout genre
later**, once sufficient allowance is explicitly available. Do not execute it now.

Implementation follows `c226bad2`; Phase 3E remains `066c3f6f`. Phase 3F commit
contains guard/server changes, focused tests, ADR and evaluation policy/report.
Working tree clean after commit. No live model inference and no next-phase work.
