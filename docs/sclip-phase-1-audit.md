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

## Current limitation

The repository does not package or start Hermes. The revised UI honestly shows
the service as offline until a configured gateway is available, and it expects
the gateway credential in Electron safeStorage under `sclip_hermes_gateway`.
It intentionally does not read the old plaintext profile key. Sidecar
provisioning, secure profile migration, dynamic WeftCut MCP registration, and
live end-to-end validation remain required before Phase 1 can be marked ready.

## Additional product gaps

`export_composition` and `render_preview_range` are not exposed by the MCP
command catalog. The editor's export pipeline should be wrapped at that
authoritative boundary rather than duplicated. Variable video `speed` is also
accepted into project state but explicitly deferred by trim/split/hybrid paths;
Sclip must not advertise retiming as working.
