# Acceptance clarification safety — 2026-10-07

## A — HARNESS SAFE FOR NEW HOLDOUT

No model/provider requests, allowance changes or production changes occurred.
Paid cost: **$0.00**. Existing OpenRouter key cap remains untouched.

## Root cause

The operator (Codex) inspected the shared resolver's one-hour default rather
than the effective CLI session value, then manually SIGTERM'd Hermes. The actual
saved trace says `clarify timed out after 120s — agent will decide` and records
subsequent begin-agent-session, checkpoint and source placement. Hermes recovered
normally. The interrupted result is preserved, with no retry or manual repair.

## Why Hermes asked

**C — Sclip skill instruction**, with model interpretation of whether batch work
was already authorized. Installed `SKILL.md`, Session etiquette item 4, says:
ask whether to begin a batch and enter the lightweight agent view unless already
authorized, then call `begin_agent_session`. The exact question follows that
instruction; the acceptance runner did not author it. This supports the source
classification without claiming knowledge of hidden model reasoning.

Normal Sclip UX concern: **YES, potentially redundant confirmation** after an
editing request. Normal interactive app users can answer it; this event does not
establish a production deadlock. No skill/tool/editorial behavior was changed.

The clarify schema has question, choices, multi-select and batched questions;
there is no explicit procedural category. **No auto-answer or heuristic text
classification** was added.

## Acceptance-only changes

- Observe the existing callback and resolve timeout from the actual
  `cli.CLI_CONFIG` at callback entry using Hermes's own shared resolver.
- Emit waiting/returned events with session ID, effective timeout and elapsed
  time. Leave original callback arguments, result and exceptions unchanged.
- Supervisor parses these structured events, reports waiting status and keeps
  observing the same process. It never kills for clarify, timeout guesses or
  inactivity, never sends a creative/procedural answer, and never restarts.
- Keep the absolute 20-minute runner deadline. Only that deadline initiates
  termination; a bounded SIGKILL grace handles a launcher ignoring SIGTERM.
- Collect final result on process close; preserve lifecycle events separately.

Telemetry cannot prevent an operator from directly killing a child PID outside
this runner. Such external intervention must be recorded as an invalid experiment,
not inferred as a clarification/runtime failure. Waiting progress is now explicit
so operators need not guess.

## Deterministic validation

**15 tests PASS**:
- 3 fake-process supervisor tests: natural clarification expiry → same-session
  fake tool → final result, with no kills; no recovery → absolute deadline only;
  ignored SIGTERM → bounded SIGKILL.
- 3 callback observer tests: reads effective runtime/legacy override at entry,
  preserves 120s/unlimited values, preserves original callback return/arguments
  and exceptions; no answers injected.
- Existing 3 configuration and 6 offline routing tests remain green.
- JavaScript runner syntax and `git diff --check`: PASS.

Tests use Node fake processes and Python fake callback objects. No Hermes model
session was launched. No catalog/authentication request or completion was made.

## Preserved media

**POFFERTJES: RETIRED HOLDOUT / VALID REGRESSION MEDIA.** Strong-model exposure
occurred in the invalid operator-interrupted run, so it is no longer unseen.
The original source, project snapshots, observable trace, cost/QA record and
partial render remain unchanged under
`apps/desktop/e2e/bench-results/phase4b-final-poffertjes-authorized/`.

Production code changed: **NO**. Editorial behavior changed: **NO**.
No new holdout, model run, architecture work or Phase 4C followed. STOP.
