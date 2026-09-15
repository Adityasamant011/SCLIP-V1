# Sclip quality rules

- The WeftCut Project Actor is the only authority allowed to mutate a project.
- Hermes reaches project state and editing operations only through WeftCut MCP.
- Sclip stores project-to-Hermes-session associations only; it must not copy timeline or conversation state into React state or project files.
- Never report a service, tool count, edit, or test as successful without evidence from the running component that owns it.
- Do not hard-code developer machine paths, credentials, or mutable loopback ports.
- Credentials belong in OS-backed application storage where available, never source, logs, terminal output, or project files.
- New user-visible behavior requires meaningful tests; mocked checks are not end-to-end validation.
