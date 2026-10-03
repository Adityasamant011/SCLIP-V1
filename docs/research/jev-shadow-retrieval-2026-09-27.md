# Provider Gate

**SUCCESS.** One minimum production-path request: secure Sclip OpenRouter credential → existing built-app MCP `evaluate_source_passages` → current production Jev client → OpenRouter Decisions API. HTTP **200**, answer IDs/types/model validated. Requested **`typesafe/jev-1.13`**; returned its version **`typesafe/jev-1.13-20260917`**, not a fallback.

Gate: **810 ms** end-to-end MCP latency; **774 ms** production client latency; **1,867 request bytes**, **836 provider input tokens**, **one provider request**. Normal timeline-context MCP afterward passed; timeline unchanged. The prior 403 report is historical, not this run's result.

Production code/build/settings were not changed. The test's existing executable override points to a nonexistent file in disposable userData so `HermesRuntime.resolveLaunch` refuses BEFORE child spawn. Hermes gateway, terminal and main-model calls did not run. The user's current **OpenRouter / Nemotron** selection was copied/read but not changed or called. No Qwen inference.

# Jev Cost

| Stage | Requests | Input tokens | Submitted bytes | Provider-reported cost |
| --- | ---: | ---: | ---: | ---: |
| Minimum gate | 1 | 836 | 1,867 | $0.000035112 |
| Full-source shadow retrieval | 3 | 21,707 | 63,981 | $0.000911694 |
| **Total** | **4** | **22,543** | **65,848** | **$0.000946806** |

These are actual numeric `usage.cost` values returned by the provider, not a reconstructed token-price estimate or independently reconciled invoice. Total is approximately **0.095 cents**, below $0.001. No retry, duplicated ranking, cached ranking presented as fresh inference, substitute model, or spending-limit workaround.

Whole-source production batching: **16 / 16 / 3 candidates**, with **48 / 48 / 9** evidence questions in the respective requests. All HTTP 200; all response schemas accepted; **0/4 request failures or malformed results** in this small sample. Production client latencies: **543 / 569 / 454 ms**. Whole-source measurement wall time was **1,623 ms** (including subsequent lightweight local verification); the summed request latency is **1,566 ms**. This is one run, not a reliability-rate claim.

A test-only numeric fetch observer in the existing thin Electron adapter records byte/count/usage metadata without retaining headers, credentials or source text. It refuses further Decisions requests at $0.04 cumulative spend, before approaching the user's $0.05 safety boundary. It did not trigger. It passes the same requests to the same production endpoint/client, with no ranking or creative decisions. No production provider/credential implementation was added.

# Source Size

Historical local talking-head source: approximately **575.71 seconds**. The cached transcript covers **0–575.7 seconds**, **140 segments** (last speech segment ends at 571.92s), grouped by the existing evaluator into **35 candidates**. No transcription or source edits were performed. The cache/resource retains `is_full_source:false`; the reported range covers virtually the source duration, but that flag was not changed or silently represented as true.

Exact compact segment-text/timestamp JSON: **21,533 bytes**. Plain segment text: **13,883 bytes**.

Brief used the historical task's source-selection wording:

> Find the strongest self-contained section of this complete talking-head source for a useful, engaging 30–45 second vertical short for TikTok/Reels/Shorts. Preserve the speaker's actual message and personality.

No airport/mentor answer, winning timestamp, ground-truth label, fixed story or cut selection was supplied to Jev. The **155.36–225.28s** historical interval was applied only after the result for evaluation. All 35 windows were evaluated with the existing relevance / self-containedness / context-needed questions; no keyword prefilter or probability cutoff.

# Retrieval Results

The result's top 12, in actual order. Top 3/5/8 are prefixes of this SAME ranking, not separate paid requests. R/S/C are uncalibrated relevance / self-contained / context-needed Noul values, **not probability-of-correctness**. Source and neighboring-context references are retained verbatim in the JSON artifact; context ranges below decode those references into seconds.

| Rank | Source seconds | Concise passage description | R / S / C | Neighbor-reference seconds |
| --- | --- | --- | --- | --- |
| 1 | 91.60–108.64 | Finish the puzzle step by step; avoid overwhelm | .48 / .45 / .62 | 86.00–112.56 |
| 2 | 363.12–378.32 | Trust a guide and implement each step before moving on | .48 / .59 / .66 | 359.12–380.40 |
| 3 | 489.76–509.44 | Karate Kid practice reveals why small tasks matter | .48 / .48 / .71 | 484.08–515.20 |
| 4 | **174.64–190.08** | **Choose one trusted mentor; stop following competing gurus** | .47 / .44 / .70 | 168.56–194.96 |
| 5 | 19.12–38.92 | Successful versus unsuccessful students: lesson introduction | .46 / .37 / .50 | 15.54–44.36 |
| 6 | 129.36–143.92 | Jumping between programs prevents completing a process | .46 / .43 / .60 | 125.76–148.72 |
| 7 | **202.32–220.56** | **One mentor, put on blinders and ignore conflicting advice** | .46 / .60 / .58 | 200.96–225.28 |
| 8 | 348.24–362.80 | Watching an entire course without implementing achieves nothing | .43 / .46 / .69 | 343.36–367.28 |
| 9 | 58.04–76.56 | Course overwhelm; introduce the puzzle analogy | .41 / .36 / .69 | 53.52–79.72 |
| 10 | 108.64–129.36 | Trust the process; students abandon it after a few modules | .41 / .47 / .62 | 105.32–133.36 |
| 11 | 220.88–236.64 | Follow one person through the end, step by step | .41 / .44 / .73 | 215.52–240.56 |
| 12 | 76.56–91.60 | Puzzle-box vision and assembling successive pieces | .40 / .35 / .65 | 70.56–97.44 |

The production tool returns 12 of 35 evaluated candidates, explicitly reports 23 unreturned candidates, keeps `confidence_cutoff:null` and warns that ranking can miss the strongest story. Detailed original-source tools remain available. No below-.5 passage was discarded.

# Winner Recall

**Discovery-hit interpretation requested for this experiment:** a substantive part of the historical mentor/focus narrative is in the shortlist, enough for Hermes to discover/use the story and choose to read its context. Rank 4 directly gives the story's central advice; rank 7 adds the payoff. This is a human-assessed hit on ONE labeled narrative, not broad retrieval accuracy.

| Metric | Discovery hit | Direct temporal coverage of the entire historical 155.36–225.28s envelope |
| --- | ---: | ---: |
| **Recall@3** | **0/1 (0%)** | 0% |
| **Recall@5** | **1/1 (100%)** | 22.1% |
| **Recall@8** | **1/1 (100%)** | 48.2% |
| **Recall@12** | **1/1 (100%)** | 54.5% |

First substantive winner hit: **rank 4**. These values do **not** mean the complete airport story is included at K5 or K12. The existing stricter offline metric requires every microsecond of the 70s envelope to be covered and therefore reports 0 full-envelope recalls at all K. Both interpretations are retained rather than relabeling that strict diagnostic as a pass or expanding windows to game recall.

# Context Quality

**PARTIAL but useful for discovery.** Every returned passage contains the existing one preceding and one following segment plus an exact expansion reference. Rank 4's preceding text explains that the listener prefers real estate; its following text explains following a blueprint to the end. Rank 7's following segment supplies the concluding step-by-step takeaway.

However, the airport/young-person/question setup at roughly 143.92–168.56s is **not fully included** in the top 12. Rank 6's following text merely hints at the airport scene, and rank 4's immediate neighbor starts after much of the setup. One-neighbor context is not sufficient to reconstruct the full anecdote. The blueprint-conflict explanation at 190.08–202.16s is also not completely present. Hermes would need a deliberate original-source expansion for a coherent story edit; Jev must not be treated as the only source evidence.

Other potentially useful ideas surfaced: puzzle/overwhelm, implementing rather than watching, and the Karate Kid analogy. These are source evidence, not Jev's final editorial selections.

# False Positives / Misses

- No wholly unrelated subject in the inspected top 12 for the broad historical brief. Several candidates are setup/promotion/fragments rather than self-contained short-form lessons: especially the early introduction, puzzle setup and course-specific trust language. Broad relevance does not prove editorial strength.
- The important airport setup and parts of the connecting explanation are omitted even at K12. The practical student-success anecdote around 253–343s is also absent as a complete narrative; this single-winner test does not establish recall of every potentially good story.
- Relevance scores are tightly packed (.40–.48 in the top 12) and do not confidently distinguish best material. Ties at .48 preserve candidate order. Context-needed values generally acknowledge dependency; ranking remains fallible and uncalibrated.
- One sample proves successful inference and this particular discovery hit, not calibrated probabilities, stable cross-source ranking or safety of aggressive filtering. No thresholds/prompts/window sizes were tuned to manufacture a pass.

# Estimated Evidence Reduction

Measured from this actual response, not a GLM billing forecast:

| K | Passage text + returned neighboring text | Reduction versus 13,883-byte full text | Complete returned tool JSON, including IDs/scores/refs/usage/coverage | Reduction versus 21,533-byte full compact segment JSON |
| --- | ---: | ---: | ---: | ---: |
| 3 | 1,872 bytes | 86.5% | 4,955 bytes | 77.0% |
| 5 | 3,231 bytes | 76.7% | 7,213 bytes | 66.5% |
| 8 | 5,055 bytes | 63.6% | 10,396 bytes | 51.7% |
| 12 | 7,685 bytes | **44.6%** | 14,826 bytes | **31.1%** |

At the CURRENT generous K12, passage text alone is 5,091 bytes (63.3% smaller); neighbors and metadata reduce that advantage. The K3 shortlist misses the known narrative and is not a recommended optimization. Calculations for smaller K keep the actual result's common metadata, so they are prefix-size estimates, not separately observed API responses.

Additional source expansion will shrink these savings further. If Hermes reads the whole transcript anyway, the Jev response is extra context and cost. No GLM call/token/dollar reduction was measured; no Hermes A/B was run.

# Agenticness Check

**PASS for this read-only experiment.** Jev supplied evidence only. No Hermes process/model, Qwen inference, creative action order, timeline mutation, caption operation, video edit or export. A disposable project imported the source solely to expose existing media references; the original project/source remained untouched. Timeline state after both evaluations exactly matched the pre-evaluation snapshot; normal MCP remained usable. No user model/profile change.

Only test instrumentation in the existing reliability spec/thin Electron adapter and this report changed. Production evaluator/client, ProjectActor, skill, vision, compositor, tool schemas, Hermes core and production build were unchanged. Focused existing Jev/agency/metrics tests **23/23 PASS**; built-app gate plus shadow diagnostic **1/1 PASS**. Those test passes do not prove finished-edit quality.

# Verdict

**READY FOR MATCHED HERMES A/B**

The historical narrative is discoverable at rank 4, other useful material and context references survive, inference works and cost is tiny. This is evidence sufficient to justify the NEXT measurement, not production rollout proof or a claim that Jev preserves every story. Keep the current generous shortlist and normal original-source access for that comparison; determine whether missing setup causes extra reads, worse understanding or negates net savings.

Stopped after this shadow evaluation. No Hermes baseline/condition, GLM/Nemotron inference, full edit, production export or architecture work followed.

Evidence artifacts (gitignored):

- `apps/desktop/e2e/bench-results/jev/provider-gate-current.json`
- `apps/desktop/e2e/bench-results/jev/shadow-retrieval-current.json`

Reproduce this opt-in bounded sequence from `apps/desktop`:

```sh
SCLIP_JEV_PROVIDER_GATE=1 SCLIP_JEV_SHADOW=1 SCLIP_JEV_ENABLED=1 npx playwright test e2e/electron/jev-reliability.spec.ts --grep 'minimum authenticated Jev provider gate' --project=parallel --workers=1
```
