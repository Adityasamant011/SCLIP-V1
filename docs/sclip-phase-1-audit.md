# Sclip Phase 1 audit — 2026-09-16

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

## Phase 1 remediation implemented

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
- Sidecar start, stop, and reconnect are serialized, so concurrent UI actions
  cannot create competing owned gateways. Startup authenticates against the
  gateway session API (rather than its public health route), detects a child
  exit, and leaves a usable reconnect path without touching the editor.
- Before a run is sent, Sclip asks the Project Actor for the current project
  id and verifies that the selected non-archived session belongs to it. A
  renderer-supplied stale or cross-project session is rejected before Hermes
  receives a request. The session-store tests cover Project A / Project B
  ownership and an archived session cannot be reused.
- Development MCP connection logging no longer prints bearer credentials. The
  Electron MCP integration test gets its temporary connection through the
  existing renderer bridge instead, preserving coverage without token output.
- The panel provides an OpenRouter setup control for
  `dots-studio/dots-3-note-preview:free`. It sends a key only to the main
  process, which trims and stores it in Electron safeStorage, then performs a
  serialized reconnect. It never writes the provider key to profile YAML,
  session metadata, project data, or logs.
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

After the lifecycle fixes, `npm run build` passed and the focused desktop
Vitest command covering model downloads, MCP lifecycle/bind, CLI integration,
AgentPanel, and session storage passed **27/27** when granted ordinary local
loopback binding. The managed sandbox rejects the same bind with `EPERM`.
The independent script/E2E helper suite now passes **84/84** after the
repository FFmpeg bundle was installed.

The real Electron MCP test was updated to avoid the removed token log. Its
first run was blocked because the host FFmpeg lacked `drawtext`; fetching the
repository's verified FFmpeg bundle provided that filter and generated real
local fixtures. The isolated built Electron app then passed the MCP test:
it created a workspace, connected an MCP client, read project state, performed
a real Project Actor mutation, and read the changed project back. Hermes
provider validation remains outstanding below.

The live panel reproduced a transcript-scroll defect: the first conversation
event called browser-wide `scrollIntoView`, moving the whole editor below the
viewport. Commit `7f13efad` confines scrolling to the panel's own message
list; TypeScript and focused panel/session tests pass after the fix.

## Release blockers — Phase 1 is not ready

- A human must approve macOS Keychain access and enter an OpenRouter API key in
  the Sclip panel. No credential was supplied to this task, so a real model
  run cannot be performed or claimed.
- The pre-existing development Hermes profile contains plaintext gateway and
  MCP credentials. Treat every credential in it as exposed and rotate it; do
  not migrate the plaintext profile wholesale. The application intentionally
  does not read it.
- No live provider-backed Hermes run could therefore execute against the live
  MCP host. Session isolation across real gateway history, approvals, stop,
  crash recovery, synchronization after manual edits, and the requested real
  media edit matrix remain unverified.
- A real media import/decode/preview and the mandatory model-driven edit matrix
  still need execution in the integrated Sclip instance. The prior visible GUI
  evidence was a standalone WeftCut app and is deliberately not accepted as
  Sclip/Hermes evidence. Retiming remains explicitly unsupported; export MCP
  commands are still absent.

## Additional product gaps

`export_composition` and `render_preview_range` are not exposed by the MCP
command catalog. The editor's export pipeline should be wrapped at that
authoritative boundary rather than duplicated. Variable video `speed` is also
accepted into project state but explicitly deferred by trim/split/hybrid paths;
Sclip must not advertise retiming as working.
