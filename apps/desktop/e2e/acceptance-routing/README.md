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
