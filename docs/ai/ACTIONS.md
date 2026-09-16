# AI actions

## 2026-09-16 — Phase 1 continuation: lifecycle and ownership hardening

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
  project readback.
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
