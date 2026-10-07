# Phase 4B acceptance routing (manual, never routine inference)

This directory changes only isolated acceptance configuration. It does not change
Sclip/Hermes production code, the skill, evidence, prompt or editorial decisions.

- `config.mjs` pins the normal OpenRouter endpoint/model and one eligible provider
  (`openai`, excluding Flex/Fast). Both Hermes fallback config keys are empty.
  Hermes does not expose `allow_fallbacks` through its request builder; the
  supported `only`/`ignore` settings eliminate alternate provider candidates.
- The existing Electron benchmark launcher decrypts the selected Sclip key with
  OS secure storage and injects `OPENROUTER_API_KEY` into its child environment.
  Only the encrypted key-store file is copied into the temporary isolated profile;
  no plaintext key, command argument or credential log is written.
- `hermes_acceptance.py` validates the resolved route before CLI startup. Title
  generation, compression and background review are disabled by supported config.
  All auxiliary-client entrypoints are disabled in this process before CLI imports:
  auxiliary `free_only` alone is insufficient because explicit auxiliary routes
  can fall back to the main paid model. This is a helper-disable boundary, not an
  HTTP proxy, credential router or editorial instruction. Local Sclip senses remain
  unchanged. Unexpected generic auxiliary requests report unavailable rather than
  spend money. No global Hermes/profile changes are made.
- `check.ts` performs authenticated **GET metadata only** and a Python `--check`
  that forbids all network connections. It verifies the real copied encrypted-store
  credential reaches the intended Python runtime and SDK auth header without
  emitting it. It never updates allowance or calls chat/completions.
- `run.mjs` is prepared but **NOT RUN**. It refuses to start without a separately
  authorized `SCLIP_PAID_HOLDOUT_OPT_IN=1` and fresh metadata. It uses the existing
  compiled `.scratch/phase4b-final/launcher.cjs`. The existing provider key allowance
  is the spending guard, not the account balance. There is no custom budget proxy.
  New results go to `phase4b-final-poffertjes-authorized`; the invalid attempt is
  preserved. Routine tests cannot start the paid runner.

Offline tests, from the editor root:

    node --test apps/desktop/e2e/acceptance-routing/config.test.mjs
    PYTHONDONTWRITEBYTECODE=1 /Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python apps/desktop/e2e/acceptance-routing/test_routing.py

Metadata checker is bundled with esbuild, externalizing Electron, and executed by
Electron to use the same Sclip secure-store identity. Recheck it before any later
paid authorization; this task authorizes no inference.

## Clarification safety

The acceptance bootstrap observes the real `HermesCLI._clarify_callback` without
changing its arguments, result, timeout or behavior. At entry it calls the same
`resolve_clarify_timeout(cli.CLI_CONFIG)` used by Hermes. Structured events expose
session identity and **effective** timeout; they contain no question, answer,
credential or hidden reasoning. Configuration defaults are never used by the
Node supervisor to guess how long a clarification should take.

`session-supervisor.mjs` waits for the original callback to return and observes
the same process afterward. It does not auto-answer, classify question text,
restart, or terminate on clarification/idle time. Even when the effective timeout
expires, it keeps waiting for Hermes's actual return event. The original absolute
20-minute deadline remains in force; SIGTERM then a bounded SIGKILL grace stops
an unresponsive launcher. Progress and `session-lifecycle.jsonl` make waiting,
natural return and deadline termination explicit. Operators must let this
supervisor own session lifetime; direct OS kills cannot be prevented by telemetry.

The clarification schema has no explicit procedural/creative category. No
heuristic classification or neutral answer injection was added.

Poffertjes is **RETIRED AS HOLDOUT**, but remains valid regression/debug media.
The existing result directory prevents the old prepared entrypoint from running
it again. A future unseen holdout requires newly authorized media/configuration.
No new media or model session was used for these tests.

Additional offline tests:

    node --test apps/desktop/e2e/acceptance-routing/session-supervisor.test.mjs
    PYTHONDONTWRITEBYTECODE=1 /Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python apps/desktop/e2e/acceptance-routing/test_clarify_observer.py
