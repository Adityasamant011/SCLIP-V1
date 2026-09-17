# AI actions

## 2026-09-17 — Phase 1 finalization: persistent storage, local speech-to-text, and runtime reliability

- Migrated runtime persistence out of `/private/tmp` into macOS Application Support:
  `${HOME}/Library/Application Support/Sclip/` now holds the persistent Whisper Base
  model (`models/whisper.cpp/ggml-base.bin`, verified SHA-256 `60ed5bc...`),
  `speech_config.json`, isolated `sclip-hermes/` profile, project session index,
  and safeStorage credentials. Updated `/Applications/Sclip.app/Contents/MacOS/Sclip`
  to point `SCLIP_USER_DATA_DIR` permanently to `${HOME}/Library/Application Support/Sclip`.
- Verified the isolated Hermes Python virtual environment: all dependencies
  (`rich.markdown`, `certifi`, `openai`, `httpx`) resolved cleanly; valid SSL CA
  bundle verified; `hermes doctor` passes with zero deprecated config or env warnings.
- Deprecated configuration cleanup: deleted `TERMINAL_CWD` from child process environments
  and ensured canonical `terminal: cwd: "."` is written in profile `config.yaml`.
- Real speech-to-text backend: configured local offline `whisper_cpp` sidecar with
  `whisper-cli` and `ggml-base.bin`. Verified on real talking-head footage
  (`videoplayback.mp4`), producing accurate timestamped segments and SRT.
- Caption generation & anti-hallucination: applied real transcription to timeline via
  `apply_subtitles` creating text layers on caption tracks. Added explicit rule to
  `skills/weftcut/SKILL.md` strictly prohibiting fabricated dialogue or visual guessing.
- Immediate duplicate mutation loop guard: added session-scoped duplicate mutation
  filter in `AgentActivityService` that detects and rejects repeated identical tool mutations
  within a 5-second window in the same agent work session without intervening reads.
- Terminal & live MCP verification: verified docked Hermes terminal loads all 93 WeftCut
  MCP tools over loopback authenticated streamable HTTP. Verified checkpoint creation,
  marker addition, checkpoint rollback, and immediate ping response with zero latency/hangs.
- Cold-restart persistence: cleanly restarted `/Applications/Sclip.app` from cold,
  verified model survived without redownloading, and re-verified live transcription and
  subtitles.
- Quality gates: `npm run typecheck` passed (0 errors); `npm run build` passed; all 87
  focused Vitest tests passed.

- Completed the interrupted sidecar work on `sclip/phase1` in commit
  `593b2865`: serialized Hermes lifecycle operations, authenticated startup
  readiness, crash/reconnect recovery, a Project Actor-backed current-project
  guard, session ownership checks, and a secure OpenRouter setup control.
- Removed the development MCP bearer-token log and migrated the affected
  Electron MCP test to use the existing renderer bridge instead of parsing
  stdout. No credentials were added to source or documentation.
- Validation: `npm run typecheck`, `npm run build`, and targeted desktop
  Vitest passed; loopback-dependent MCP/CLI coverage passed 27/27 with local
  binding permitted. The project FFmpeg bundle was fetched to replace a host
  FFmpeg missing `drawtext`, allowing real fixture generation. The isolated
  built Electron MCP test then passed: MCP read → Project Actor mutation →
  project readback. `npm run test:scripts` now passes 84/84.
- Follow-up fix: a live panel run exposed whole-editor scrolling from the
  transcript's `scrollIntoView`; commit `7f13efad` scrolls only the transcript
  container. Typecheck and focused panel/session tests pass.
- Still blocked on human-only input: approve macOS Keychain access and enter
  an OpenRouter key in Sclip before a genuine Hermes/OpenRouter/MCP media edit,
  approvals, stop, and crash/restart matrix can be verified. Phase 2 was not
  started.

## 2026-09-15 — Codex Phase 1 independent audit

- Goal: independently validate the claimed Sclip/Hermes Phase 1 integration.
- Result: found the claim materially incomplete; replaced the hard-coded,
  stateless bridge with project-bound Hermes session metadata and API-backed
  session/history wiring, exact separated MCP capability display, scoped SSE
  events, stop and approval wiring, and a session terminal UI.
- Areas: `apps/desktop/src/main/sclip/`, main IPC, renderer Sclip panel.
- Validation: lockfile dependencies installed; session-store test passes. Full
  native typecheck/build and live Electron/Hermes validation remain blocked as
  documented in `docs/sclip-phase-1-audit.md`.
- Commit: unavailable — supplied editor directory has no `.git` metadata.
- Next: package/provision Hermes, migrate the legacy plaintext profile into
  application credentials, dynamically register the running MCP address, then
  execute real media and restart/crash lifecycle tests.
