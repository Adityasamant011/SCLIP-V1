# Phase 4B.2B — Boundary-decision implementation report

Date: 2026-10-10. Implementation commit: `8bee4de7` (following research `b722b814`).

## Verdict

**A — EXPERIMENT IMPLEMENTED AND READY FOR LIVE A/B VALIDATION.**

This is software/contract readiness, **not demonstrated editorial improvement**.
No agent/model inference, holdout consumption or global installation occurred.
Provider cost: **$0.00**. A suitable source pair, natural briefs and separate
inference authorization remain prerequisites for live evaluation.

## 1. Exact changes

| File(s) | Change |
|---|---|
| `skills/weftcut/references/editing-knowledge/speech-boundary-decisions.md` | Compact 606-word comparison procedure, decision shape, uncertainty and intentional-discontinuity examples |
| `apps/desktop/e2e/editorial-boundary-experiment/skill-addition.md` | 101-word main-skill insertion, applied only to the generated intervention |
| `variants.mjs` in that directory | Explicit baseline/boundary selection, version-stamped bundle copies, immutable file-hash manifest, disposable arm profiles, generated launcher adapters and post-refresh activation |
| `hermes_variant.py` | Acceptance-only selection after normal launcher refresh; offline actual-Hermes preload check; future live delegation to existing routing/auxiliary/clarification wrapper with explicit opt-in |
| `decisions.mjs`, `export_session.py` | Collect supplied visible decision blocks from one selected disposable session; preserve omissions/updates and report malformed records without inventing decisions or rating quality |
| `variants.test.mjs`, `decisions.test.mjs`, `test_export_session.py` | Isolation, preload, restart, shell argument preservation, collection and privacy-contract fixtures |
| `apps/desktop/scripts/build-skills-lib.mjs`, `build-skills.mjs`, `build-skills.test.mjs` | Small packaging guard: omit the unpromoted reference from normal linked-file discovery; keep existing guidance/references intact |
| `apps/desktop/src/main/sclip/speechBoundaryExperiment.test.ts` | Nine synthetic/fake-model evidence and actual ProjectActor/review-guard contract tests |
| `apps/desktop/src/main/state/__tests__/mcp.skill-conformance.test.ts` | Include experimental guidance in existing catalog anti-drift validation |
| Experiment `README.md` | Reproducible preparation, launcher integration, collection and controlled evaluation protocol |

No changes to Hermes internals, production MCP schemas, ProjectActor, evidence
contracts, rendering, creator memory, routing or clarification behavior. The
pre-existing dirty `acceptance-routing/run.mjs` was preserved byte-for-byte and
excluded from commits. The ordinary `skills/weftcut/SKILL.md` was not edited.

## 2. Procedure and editorial ownership

After speech assembly, Hermes compares actual rendered opening/ending meaning
with relevant omitted source context, reusing fresh evidence when adequate.
Other joins are investigated only for a meaningful suspected issue.

It chooses KEEP / CHANGE / UNCERTAIN; intentional cold opens/abrupt endings and
no repair remain valid. If repairing, Hermes supplies every tool, participating
layer and creative value, then judges fresh relevant observations after the
complete repair. Source/render recognition disagreements remain visible.

No runtime completeness detector, forced padding, fixed pacing, take ranking,
second critic or automatic A/V synchronization was added. Current briefs override
the procedure. Existing bounded revision, transaction and rollback capabilities
are reused.

## 3. Baseline isolation

The normal source main-skill SHA256 remains:

`4d232bdfbb3e1104e25864207d43142eaf8887297bf7733c86c81f2714eacc3d`

The baseline is copied from the tested `build:skills` output, retaining version
metadata and existing references. The new reference is absent from both the
normal bundle and isolated baseline. Intervention differences are exactly the
main-skill insertion and new reference.

Prepared local artifacts: `.scratch/phase4b2b/ab-ready-v2/`. Its manifest freezes
each file hash and its two arm profiles; no media or sessions are assigned.
Preparation refuses existing destinations. Activation rejects unexpected profiles,
symlinks, unknown arms and altered frozen bundles. It replaces only the selected
disposable `weftcut` skill and preserves evidence skills/configuration.

**Why activation must be late:** `hermesBenchmarkLauncher.ts` refreshes the normal
skill before spawning Python. An earlier copy would be overwritten. The generated
arm adapter selects the variant after this refresh, before Hermes imports/load.
The normal launcher itself is unchanged. Original model/prompt/tool arguments pass
through, including literal spaces, quotes and shell metacharacters.

Version-stamped main hashes verified in the actual prepared profiles:

| Arm | SHA256 |
|---|---|
| Baseline | `6d29a28f3b0be5c98348c535c2a51d9eb844b6df00e2c7dff06eb0a59197764d` |
| Boundary | `ec8deb0349c7e7fa3bb3881ae65186f25a3357acc9212ec93cc5dc2698612729` |

No installed-app assets, user projects, credentials or creator stores were changed.

## 4. Observable decisions

The intervention asks for a concise user-visible fenced `sclip-boundary-decision`
JSON block: stable label, opening/ending/join, current state, source IDs and
source/timeline ranges, evidence references, actual rendered-speech observation,
omitted context, decision and brief reason. Executed operations and post-repair
state/evidence/judgment are included when applicable, otherwise null. Later updates
retain the same label; the collector keeps every supplied update.

Only assistant `content` is read from the selected disposable session. Reasoning
columns, unrelated sessions and tool-role text are not exported as model decisions.
No private history is accessed. Do not publish the raw Hermes DB: it can contain
internal reasoning. Actual tool receipts and ProjectActor diffs remain independent
authority for commits; format validity does not certify truth, legality or improvement.

The unchanged baseline has no new decision-record obligation. Absence of such a
record there is not failure; compare its actual output and observable tool behavior.

## 5. Offline validation

**110 distinct focused tests passed; 0 remaining failures or skips.** Repeated
checks are not added to that count.

| Gate | Result |
|---|---|
| TypeScript: 13 selected files | **84 PASS** |
| Node: experiment, skill build and after-pack contracts | **25 PASS** across selected runs |
| Python: disposable session exporter | **1 PASS** |
| Typecheck | **PASS** |
| Desktop main/preload/renderer build | **PASS** |
| CLI build | **PASS** |
| Skills build, including final default-exclusion guard | **PASS** |
| Staged `git diff --check` | **PASS** |
| Real installed-Hermes preload/linked reference, sockets blocked | **PASS**, both variants and restarts |

The TypeScript selection was:

```text
speechBoundaryExperiment.test.ts       openingContext.test.ts
sourceUnderstanding.test.ts            renderedAudioEvidence.test.ts
evidenceVerification.test.ts           revisionLoopGuard.test.ts
rollbackCoherence.test.ts              hermesTerminalRuntime.test.ts
autonomousReview.test.ts               editorialEvidencePacket.test.ts
state/__tests__/repair-transaction.test.ts
state/__tests__/mcp.skill-conformance.test.ts
state/__tests__/mcp.catalog-bijection.test.ts
```

These were executed via the ordinary offline `npm test -- <paths>` runner;
provider tests remain excluded. Build commands: `npm run typecheck`, `npm run build`,
and final `npm --workspace apps/desktop run build:skills`. Node files:
`build-skills.test.mjs`, `after-pack-skill.test.mjs`, and the experiment's two
`*.test.mjs` files. Python command: `python3 .../test_export_session.py`.

Coverage includes unexplained opening references, incomplete endings, complete
source projections contradicted by actual-result observations, self-contained
openings, deliberate abrupt endings, unavailable recognition, different legal
repairs and no repair. Two explicit alternative transactions commit through the
real ProjectActor: equal and intentionally unequal A/V source starts. Fresh visual,
stale audio and source-only evidence cannot resolve their registered speech issue;
fresh current rendered speech can satisfy evidence coverage, while Hermes still
may judge the repair unresolved. Independent single edits do not invent partner edits.

The new audio-evidence fixtures use **fake rendering/transcription dependencies**;
they do not establish real listening or semantic intelligence. The existing
rendered-audio suite additionally exercised local real-codec decode/silence/no-audio
behavior. No new source ASR/VLM/model run was performed.

Initial new-test failures were corrected: macOS `/var` versus `/private/var`
normalization in staging, and explicit missing-disposable-DB handling in export.
A trailing blank line was corrected without changing generated intervention text.
No production behavior was changed to satisfy these failures.

Build emitted existing ineffective-dynamic-import warnings; no build failure.
No full release/native/Electron editorial acceptance was run: those systems were
unchanged and this phase requested focused offline validation.

## 6. Installed Hermes preload verification

Read-only inspection confirmed the installed app's Hermes launcher points to
`/Users/adityasamant/SCLIP/hermes-agent-src` and its `.venv/bin/python`.
Using that exact runtime, the selector called the actual
`agent.skill_commands.build_preloaded_skills_prompt(['weftcut'])` and
`tools.skills_tool.skill_view`. Both arms loaded the chosen disposable directory;
baseline had no intervention marker/reference, while boundary loaded the marker
and successfully retrieved the reference. Separate-process repetitions tested
restart selection. A real-bundle check also passed without a PYTHONPATH override.

Connections were blocked before preload imports; no agent/model was instantiated.
Receipts are in `.scratch/phase4b2b/preload-verification-v2.json` and each prepared
profile's `preload-check.json`. This proves runtime context selection, not that a
model follows the procedure.

## 7. Expected overhead

Measured addition: 101 words, **793 inserted UTF-8 bytes** including the separating
newline. Reference: 606 words, **4,490 UTF-8 bytes**. An actual model tokenizer was
unavailable offline; none was downloaded. Character/4 proxies are approximately
200 initial tokens and 1,120 reference tokens, **not verified Luna billing counts**.

Fresh existing evidence can mean zero additional inspections. Planning envelope:
0–3 localized rendered-audio inspections and 0–3 bounded source-context queries,
depending on uncertainty, with additional foreground deliberation/record tokens.
These are estimates, not quotas or measured live latency. Local renders/Whisper
may add seconds to tens of seconds per window; measure on the eventual sources.

Reference/evidence context can be billed again on subsequent requests. Compute
actual overhead from summed input/output tokens and current verified pricing at
the separately authorized preflight; do not price only one copy of the context.
No extra model session or background critic is inherent. Optional paid Jev and
auxiliary inference must remain disabled for the later matched comparison.

## 8. Remaining risks and real A/B preparation

The model may ignore the procedure, fabricate references, expand clips
mechanically, overtrust ASR, or produce verbose records without useful repairs.
Existing evidence coverage guards do not certify editorial judgment. Speech-only
comparison does not solve performance selection, long-form argument construction
or visual comprehension. No quality gain is claimed from fake-model tests.

Prepared bundles, adapters, preload verification, collection and evaluation
protocol are ready. **Evaluation media are not supplied/assigned.** Required:
one consented raw educational/expert recording with imperfect speech and its
natural creator brief; plus a second previously unseen source/brief for later
validation. Manchester stays an exposed regression reference only. No existing
Downloads footage was quietly declared unseen.

For each source, use isolated new projects/sessions, matched source hash/brief,
provider/model/config, memory off, runtime bounds, catalog and render pipeline.
Use the existing project/import bootstrap and benchmark launcher, selecting the
generated arm adapter. Freeze these parameters before the separately authorized
runs. Predeclare one run per arm, no editorial retries. Preserve all artifacts;
do not patch results or feed independent QA back. See the experiment README and
[evaluation plan](first-editorial-experiment-plan.md).

Independently inspect exports/source diffs and assess opening/ending context,
meaning/qualifiers, speech continuity, unnecessary changes, visual/A/V regressions,
actual repairs, fresh verification, final judgment, correction burden, runtime
and cost. Blind human A/B review is preferred where available; no professional
ratings were fabricated here. A longer edit, CHANGE record or additional audio
call is not success. One positive comparison would be progress, not generalization.

Rollback removes the isolated comparison/variant; normal installed behavior and
user data require no migration or restoration. Preserve failures for diagnosis.

## 9. Exactly one next action

**Supply the two consented source/brief pairs and separately authorize the bounded
matched A/B validation using the prepared variants and existing launcher.**
Do not promote the experiment or claim quality improvement before independently
evaluating the actual outputs. Stop here; no live inference is initiated.
