# GLM 5.2 versus Nemotron: bounded self-management comparison

Conclusion: **MODEL QUALITY CONTRIBUTES, BUT IS NOT THE ONLY BOTTLENECK**.

GLM made materially better progress, but the unchanged completion gate failed:
the run reached 16/16 iterations. This is not a voluntary-completion PASS.
No full Phase 2F benchmark or final MP4 was produced.

## Conditions and evidence

- Active provider/model resolved through production `readHermesProfile`: `openrouter / z-ai/glm-5.2`.
- Existing authenticated `testHermesConnection`: PASS. Actual GLM inference then executed through the existing secure Electron benchmark launcher.
- Normal Hermes profile setting `agent.reasoning_effort=high`; the session database records `reasoning_config={enabled:true,effort:high}`. No fallback configured or observed; session model remains GLM 5.2.
- Existing `self-management` harness, unchanged prompt, source preparation, 16-turn limit, permissions, toolsets, local speech/vision, and `--skills weftcut` preload.
- Skill preload uses the existing CLI `finalize_preloaded_skills` before agent creation; its loaded text becomes the ephemeral system prompt. The runtime trace acknowledges the already-preloaded skill; no missing-skill warning occurred. Installed and built WeftCut skill SHA-256 match: `7b3356eb0ac2dbfb9608377ff20c1775b72b0c91d9924d56e80b334afb2015ba`. The skill was not changed.
- GLM session ID: `20260926_110633_18cb4b`. Database: the production profile's `state.db`; main-run API count 16.
- Control trace: `apps/desktop/e2e/bench-results/phase2f/talking-head-foundation-self-management.nemotron-control.hermes-trace.txt`.
- GLM trace: `apps/desktop/e2e/bench-results/phase2f/talking-head-foundation-self-management.glm-5.2.hermes-trace.txt`.
- There were 25 attempted tool invocations: four rejected, 21 successful. Local `vision_inspect`: four successful / five attempted. Returned evidence names local `mlx-community/Qwen3-VL-2B-Instruct-4bit`; cloud vision toolset was disabled.
- The profile's reasoning setting was the only additional run configuration change requested for GLM. The historical control trace does not establish its reasoning level, so this is not a rigorously isolated comparison of identical reasoning settings. The same current build includes the separately requested terminal fixes; no model-test production or harness code changes were made.

## Per-turn purpose

| Turn | Primary purpose | Observed actions |
| --- | --- | --- |
| 1 | TIMELINE INSPECTION | Timeline context; session-start call rejected for missing reason. |
| 2 | SOURCE UNDERSTANDING | Corrected session start; media context. |
| 3 | TIMELINE INSPECTION | Cut context and composed frames before/after the cut. |
| 4 | ERROR / RETRY | Vision call used `prompt` rather than required `question`; rejected before inference. |
| 5 | VISION INSPECTION | Corrected multi-frame local Qwen call. |
| 6 | VISION INSPECTION | Follow-up because evidence was truncated; opening/ending frame captures. |
| 7 | VISION INSPECTION | Opening/ending multi-frame local Qwen call. |
| 8 | SOURCE UNDERSTANDING | Transcribed both clips using local Whisper. |
| 9 | TIMELINE INSPECTION | Proposed ending frame and context after transcript analysis. |
| 10 | VISION INSPECTION | Local Qwen inspection of proposed ending. |
| 11 | ERROR / RETRY | Checkpoint used `name` instead of required `label`; rejected. |
| 12 | PLANNING | Corrected checkpoint saved before mutation. |
| 13 | ERROR / RETRY | Trim used `edge=end`; tool requires `in` or `out`. |
| 14 | EDITING MUTATION | Corrected trim with `edge=out`. |
| 15 | TIMELINE INSPECTION | Re-read linked A/V and captured ending frame. |
| 16 | FINAL ASSESSMENT | Assessed landed trim/alignment; ended editor session with reason `Improvement complete`. |

After turn 16, Hermes inserted a user message explicitly requiring a final summary
without further tools. The following summary is outside the 16-iteration budget
and is not evidence of voluntary stopping. The independent turn-16 assessment
does exist, but is narrower than that forced overall summary.

## Actual edit and limitations

GLM identified the puzzle analogy correctly from transcription and chose an ending
trim. Duration changed from 38.4 to 36.7 seconds. Second linked video/audio both
end at timeline 36.7 seconds and source 99.6 seconds; there are no introduced gaps
or overlaps. The transcript places the end of “fulfilling” at 36.68 seconds, so
the chosen boundary is 20 ms after that estimate. This mechanically supports the
edit; listening/export quality was not evaluated in this deliberately small test.

The agent preserved the initial framing, did not decorate or add captions, and
created a checkpoint. No destructive crop or clearly known-worse mutation was
observed. It chose to skip optional categories and explicitly discussed what
remained. No endless identical-call stall occurred. However, it spent much of
the budget inspecting before acting, and four argument mistakes cost turns.
Some Qwen descriptions were truncated; GLM noticed and followed up. Those are
evidence/interaction efficiency limitations, not a proven infrastructure fault.

Both models exhausted the same budget. Nemotron repeatedly inspected and made
no useful edit or independent final assessment. GLM acted and verified, but did
not produce a voluntary final response before budget enforcement. Do not infer
an agent-loop defect from this single comparison, or fix it in this task.

## Requested results

| Measure | Nemotron control | GLM 5.2 |
| --- | --- | --- |
| Turn budget / used | 16 / 16 | 16 / 16 |
| Budget exhausted | YES | YES |
| WeftCut loaded | YES | YES |
| Source context used | YES | YES |
| Vision used | NO | YES: 4 successful / 5 attempted |
| Useful edits | NO | YES: ending trim, mechanically verified |
| Repeated local stalling | YES | NO; still inefficient inspection/argument overhead |
| Tool error recovery | Not rescored | PASS: all four corrected on the next turn |
| Known-bad state knowingly left | Not rescored | NO observed |
| Independent completion assessment | NO | YES, limited turn-16 edit assessment |
| Voluntarily stopped | NO | NO; summary forced by budget |
| Agent completion | FAIL | PARTIAL; strict gate FAIL |

```text
ACTIVE MODEL: z-ai/glm-5.2
PROVIDER: openrouter
REASONING LEVEL: high (session database verified)
MODEL FALLBACK OCCURRED: NO

TURN BUDGET: 16
TURNS USED: 16 / 16
TURN BUDGET EXHAUSTED: YES

WEFTCUT SKILL LOADED: YES
SOURCE CONTEXT USED: YES
VISION_INSPECT USED: YES
USEFUL EDITS MADE: YES
REPEATED LOCAL STALLING: NO
TOOL ERROR RECOVERY: PASS
KNOWN-BAD STATE LEFT: NO observed
OVERALL COMPLETION ASSESSMENT: YES, limited independent assessment on turn 16; fuller summary was forced
VOLUNTARILY STOPPED: NO
AGENT COMPLETION: PARTIAL (strict completion gate FAIL)

VS NEMOTRON: BETTER
DOES GLM 5.2 MATERIALLY OUTPERFORM NEMOTRON: YES in this task's progress/tool use, not voluntary completion
MODEL QUALITY APPEARS TO BE PRIMARY BOTTLENECK: PARTIAL

HERMES CHOOSES OWN NEXT ACTION: YES
HERMES CAN SKIP/REORDER: YES
EXTERNAL CODE CHOOSES CREATIVE ORDER: NO
MANDATORY EDITING PIPELINE: NO
FULL GENERAL HERMES PRESERVED: YES

SCLIP CHANGES DURING MODEL TEST:
production code changed: NO
Hermes core changed: NO
ProjectActor changed: NO
editor architecture changed: NO
vision architecture changed: NO
transcription system changed: NO
WeftCut skill changed: NO
MCP architecture changed: NO

RECOMMENDED NEXT STEP: Review this partial result before authorizing any next test. Do not treat GLM as completion-ready or launch full Phase 2F automatically. The remaining issue is finishing the same bounded interaction efficiently, including argument accuracy and a voluntary final response.
```

## Separate terminal work completed before comparison

The previously authorized terminal fix changed production terminal code before
the model-only freeze: prefix-aware secret redaction avoids whole-key-length
echo lag; startup snapshot/event sequence deduplication avoids duplicate output;
serialized input preserves typing order; session ownership checks no longer
fetch gateway messages on each keystroke; stale PTY callbacks are ignored.

Focused terminal/settings/bridge tests: 20/20 PASS. Built Electron IPC smoke:
1/1 PASS. Production and E2E builds PASS. The reopened production terminal banner
rendered cleanly; the app was reopened after the comparison. Pasted test text
appeared, but native UI automation did not reliably deliver individual key or
clear-input events, so end-to-end live keystroke timing remains unconfirmed.
Mocked rapid-input ordering and runtime echo tests passed. No claim is made that visual verification
alone proved every intermittent terminal issue fixed. Repository-wide TypeScript
checking remains blocked by existing unrelated errors.
