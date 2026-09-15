# Sclip Phase 1 audit — 2026-09-15

## Actual architecture

```text
Sclip session UI
  -> Hermes Gateway API (one Hermes session per Sclip session)
  -> Hermes MCP client
  -> WeftCut Streamable HTTP MCP host
  -> WeftCut Project Actor
```

Sclip's metadata file (`<Electron userData>/sclip_hermes_sessions.json`) records
only a WeftCut project id, its Hermes session ids, display labels, archived flag,
and active session. Hermes owns the conversation messages; WeftCut owns every
project mutation and history entry.

## Findings before remediation

- `sclip/hermesBridge.ts` used an absolute developer path and a fixed port.
- It returned an invented combined count of `89 tools`; the number combines
  different MCP capability types and must not be shown as a tool count.
- There was no Hermes sidecar lifecycle, session mapping, session history,
  approval UI, or terminal/session isolation.
- The inspected local Hermes profile contains plaintext gateway and MCP bearer
  credentials. It is not repository source, but must be migrated before a
  packaged release.

## Capability inventory at this pinned WeftCut source revision

The checked Rust-catalog fixture records 10 native tools, 9 native resources,
and 3 prompts. The TS Project Actor surface contains 73 tool definitions and
Motif adds 6 tools and 1 resource. The merged MCP surface is therefore **79
tools, 10 resources, and 3 prompts**. `89` is 79 + 10 and is not a valid tool
count. Hermes built-in/imported counts were not measured because the Hermes
gateway was not running during this audit; do not claim a total model-visible
count until querying a live registry.

## Phase 1 remediation completed

- The repository now has a reviewable baseline at upstream WeftCut
  `9283c8bea952debd2fa8f0e0b51ba4b429e37c78`; Sclip work lives on
  `sclip/phase1` in discrete commits.
- `HermesRuntime` owns one child gateway. It resolves a packaged binary or an
  explicit development override, creates an app-userData-only profile, chooses
  a non-fixed loopback port, waits for `/health`, reports crash/failure state,
  restarts after WeftCut MCP bearer rotation, and terminates its owned child at
  Electron shutdown. It never uses a developer home-directory path.
- The generated profile contains only `${SCLIP_MCP_URL}` and
  `${SCLIP_MCP_TOKEN}` references. The exact live WeftCut MCP URL/token and
  gateway credential are passed only in the child environment. Provider keys
  are read from Electron safeStorage and never copied into the profile.
- Hermes refuses to start when OS-backed Electron safeStorage is unavailable;
  it does not fall back to plaintext storage. The UI now gives a visible
  disconnected reason.
- The project-bound session mapping remains metadata-only. The right panel has
  session-isolated Chat, API transcript Terminal, and structured Activity views.
  Hermes Gateway does not expose a faithful interactive CLI stdin protocol, so
  a PTY/xterm was deliberately not introduced; all editor control remains MCP.

## Verified local development environment

The pinned source successfully built with Node 24, the Rust toolchain plus the
`wasm32-unknown-unknown` target, macOS Clang/Xcode command-line tools, and the
project's generated LGPL FFmpeg bundle. Required commands were:

```text
npm ci
npm --workspace apps/desktop run ffmpeg:fetch-lgpl
npm --workspace apps/desktop run napi:build
npm --workspace apps/desktop run napi:build:decode
npm --workspace apps/desktop run electron:install
```

`npm run typecheck`, the production desktop build, all three documented Rust
test commands, the session-store tests, and AgentPanel tests passed. Rust totals:
59 evaluation tests, 607 native tests (one documented live test skipped), and
60 decode tests (one benchmark skipped). Electron launched and rendered the
normal WeftCut editor/timeline successfully.

The full Vitest suite is not clean in this sandbox: 7,649 passed; 12 failed.
The remaining failures are baseline/environment-sensitive: loopback bind is
denied with `EPERM`, CLI fake-app port setup consequently fails, and two
model-download tests reject the sandbox path as unsafe. The Sclip-caused
AgentPanel default-tab failures were corrected; that focused suite now passes.

## Release blockers — Phase 1 is not ready

- The macOS keychain request was cancelled during the live launch. Secure
  storage is therefore unavailable, so Hermes correctly did not start. Re-enable
  keychain access before attempting a live sidecar/session run.
- The pre-existing development Hermes profile contains plaintext gateway and
  MCP credentials. Treat every credential in it as exposed and rotate it; do
  not migrate the plaintext profile wholesale. The application intentionally
  does not read it.
- No live provider-backed Hermes run could therefore execute against the live
  MCP host. Session isolation across real gateway history, approvals, stop,
  crash recovery, synchronization after manual edits, and the requested real
  media edit matrix remain unverified.
- A real media import/decode/preview and a full clean Vitest run must still be
  performed in a host that permits loopback test servers. Retiming remains
  explicitly unsupported; export MCP commands are still absent.

## Additional product gaps

`export_composition` and `render_preview_range` are not exposed by the MCP
command catalog. The editor's export pipeline should be wrapped at that
authoritative boundary rather than duplicated. Variable video `speed` is also
accepted into project state but explicitly deferred by trim/split/hybrid paths;
Sclip must not advertise retiming as working.
