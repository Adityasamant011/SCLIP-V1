# Isolated speech-boundary A/B experiment

Offline implementation; **no live inference is authorized by these files**.
The default source `skills/weftcut/SKILL.md` remains byte-identical. The new
reference is only linked/activated in the disposable intervention skill.
Normal skill packaging explicitly omits this unpromoted reference, so it also
stays out of the default linked-file discovery catalog.

## Prepare (no inference)

From the repository root, build the current desktop/CLI/skills, then:

```sh
node apps/desktop/e2e/editorial-boundary-experiment/variants.mjs prepare .scratch/boundary-ab
```

This refuses an existing destination. It freezes versioned baseline/intervention
bundles, hashes every file and creates separate arm profiles under `runs/`.
It also creates `runs/<arm>/hermes-python` for the existing launcher's `python`
field, using `SCLIP_HERMES_SOURCE` or the installed local source's Python.
The baseline excludes the new reference; the intervention differs only in its
small review addition and reference. Subsequent activation rejects modified bundles.

Validate each arm with the installed Hermes source Python, with `PYTHONPATH` set
to that source and `HERMES_HOME` set to the arm's `profile/sclip-hermes`:

```sh
python apps/desktop/e2e/editorial-boundary-experiment/hermes_variant.py --experiment-root .scratch/boundary-ab --variant baseline --check
python apps/desktop/e2e/editorial-boundary-experiment/hermes_variant.py --experiment-root .scratch/boundary-ab --variant boundary --check
```

Use a fresh process per arm; the `--check` blocks socket connections and calls
the real `build_preloaded_skills_prompt` plus reference lookup. It writes hashes
and preload metadata only. It does not call an agent/model. Both profiles must
have memory off and no external skill directories for the actual comparison.

## Later live integration — separate authorization required

Use the existing `hermesBenchmarkLauncher.ts`, bundled from the frozen checkout,
and existing `acceptance-routing/config.mjs`, `hermes_acceptance.py`,
`clarify_observer.py` and `session-supervisor.mjs`. Do not use the historical
hardcoded `acceptance-routing/run.mjs` as a generic A/B runner.

The launcher's `userDataPath` must be the selected `runs/<arm>/profile`. Its
`python` executable is the generated `runs/<arm>/hermes-python` wrapper. It invokes
the installed Hermes Python with `hermes_variant.py --experiment-root
<absolute-root> --variant <arm> -- "$@"`. The launcher sends its existing
`-m hermes_cli.main ...` arguments.
The selector runs **after** the launcher refreshes the normal skill; it preserves
the staged current-evidence skill and config. It delegates to the established
routing/auxiliary-disable/clarification wrapper without rewriting model, tools,
prompt, fallback or timeout behavior. It refuses live delegation without the
existing `SCLIP_PAID_HOLDOUT_OPT_IN=1`; that variable is not authorization by itself.

Before each separately authorized arm: verify route, pricing, key allowance,
fallback/auxiliary disable and Jev off through existing preflight. Launch exactly
one new project/session per arm, same source hash/natural request/model/config,
memory off, same runtime limits, rendering pipeline and tool catalog. Let the
effective clarification timeout resolve naturally within the absolute deadline.
Never retry an editorial failure. Do not feed evaluator findings to Hermes.

Record source and initial-project hashes, catalog, exact brief, skill manifest,
config without secrets, provider usage, supervisor lifecycle, observable tools,
final project/diff and export. Preserve the disposable Hermes session DB locally
until collection finishes. It may contain internal reasoning and **must not be
published wholesale**.

Collect only visible decisions after the session stops:

```sh
python apps/desktop/e2e/editorial-boundary-experiment/export_session.py --experiment-root .scratch/boundary-ab --variant boundary --session-id THE_ACTUAL_SESSION_ID
```

Repeat collection for baseline. Missing records remain missing; the baseline has
no record obligation. Compare its actual tool activity/result with the intervention.
The collector stores all supplied updates without deduplicating or inventing
decisions. A null post-repair record means no recorded verification, not success.
Tool receipts/project diffs remain the independent authority for actual commits.

## Evaluation inputs (not yet supplied)

Require one consented **raw educational/expert source with imperfect speech** and
the creator's genuine brief. Prepare a second previously unexposed source/brief
for a separate validation pair. Their paths, hashes, consent/exposure status and
briefs must be recorded before runs. No current Downloads file is silently
substituted, and no unseen status is asserted without confirmation. Manchester
is an exposed regression reference only. Do not infer the desired timeline from
creator notes; hold any final edit/correction notes for independent QA.

The comparison adapter must perform normal new-project/import/bootstrap and
pass live MCP/project identities to the existing launcher. This preparation
supplies the skill selector and collection path, not a new provider runner.
Freeze the remaining bootstrap parameters before separately authorizing live work.

Use blind human A/B review where possible, plus source-grounded and technical QA.
Assess opening context, ending completeness, meaning/qualifiers, natural speech,
unnecessary changes, pacing/visual regressions, A/V integrity, actual repairs,
fresh relevant verification, final judgment and remaining corrections. Record
total runtime, inference tokens/cost and extra local inspections. CHANGE labels,
longer clips and more tool calls are not success. Preserve every failure exactly.

## Offline commands

```sh
node --test apps/desktop/e2e/editorial-boundary-experiment/*.test.mjs
python3 apps/desktop/e2e/editorial-boundary-experiment/test_export_session.py
npm test -- src/main/sclip/speechBoundaryExperiment.test.ts
```

Fake model choices prove evidence/operation availability, not editorial intelligence.
Neither a new holdout nor live quality improvement has been demonstrated here.
