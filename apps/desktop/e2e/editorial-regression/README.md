# Complete editorial regression

These are acceptance fixtures, not production editorial instructions.

- `../electron/complete-regression-local.spec.ts`: disposable synthetic media,
  actual MCP/ProjectActor ripple and transaction changes, production audio and
  temporal evidence, and plan → render → grounded repair → fresh verification →
  export → save/reopen. Synthetic diagnosis is not editorial-quality evidence.
- `../electron/complete-regression-agent.spec.ts`: explicitly opt-in, one exact
  free route on approved exposed regression media. It refuses an existing result
  directory and does not retry editorial failures. Routine unit tests cannot run it.
- `free-hermes.py`: installed Hermes resolver/auth checks before CLI startup;
  exact free model/provider whitelist; no model/provider fallback; auxiliary
  inference blocked process-locally. A configuration-only process exits before
  constructing the CLI/model session. No credential is printed or persisted.

The app regenerates its small supported profile at startup. Isolated acceptance
cost controls must be merged **after** startup while retaining the normal
product prompt, MCP configuration and skill. Do not remove the fail-closed guard
when a configuration field disappears. This test performs a configuration-only
check through the actual secure launcher before its one model session.

The normal 16-iteration ceiling includes a final Hermes summary request. The
20-minute absolute process deadline governs clarification/idle waits; no early
idle termination or creative clarification answer is injected. No second model
session is launched. Observable assistant/tool content is exported from the
selected disposable session; reasoning columns and reasoning displays are omitted.

Executed artifacts and verdict:
`docs/acceptance/sclip-complete-editorial-regression.md`.
The completed free session made **no editorial MCP call** and produced an empty
edit. Do not rerun the committed entrypoint to improve this result. Its opt-in and
output-directory guard are intentional. Provider cost was $0.00.

Example deterministic command, from `apps/desktop`:

```sh
../../node_modules/.bin/playwright test e2e/electron/complete-regression-local.spec.ts --project serial
```

The local rendered-audio tone fixture intentionally has no meaningful speech;
transcription unavailability is recorded separately from successful mix rendering
and signal measurements. Speech transcription/export uses the existing
`sclip-local-speech-caption.spec.ts` with explicitly configured disposable local
Whisper and an approved source supplied through `SCLIP_TEST_SPEECH_SOURCE`.
