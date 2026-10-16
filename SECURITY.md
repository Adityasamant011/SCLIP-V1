# Security Policy

## Supported versions

SCLIP is under active development. Security fixes land on the latest release and on `main`.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/Adityasamant011/SCLIP-V1/security/advisories/new) — the report stays
private until a fix ships. Email **adityasamant011@gmail.com** instead if you'd rather not
go through GitHub.

Either way, include what you found, the version or commit you saw it on, and a
minimal reproduction if you have one. Please don't open a public issue for
anything exploitable.

## What's worth reporting

The parts of SCLIP most worth your attention:

- **The MCP server.** It binds to localhost and exposes the editor as a tool
  surface, which makes it the largest attack surface in the app. Anything that
  lets a client reach files, commands, or state beyond what the tool catalog
  exposes is in scope.
- **The custom protocol handlers.** `weftcut-media://` and `motif://` serve
  local files to the renderer; path traversal or scope escape through either is
  in scope.
- **Project, media, and motif inputs.** Motif templates are user-authored web
  content rendered by the app. Anything that lets a project file, a media file,
  or a motif escape its intended sandbox and run code is in scope.

## Out of scope

- Vulnerabilities in the bundled FFmpeg binaries themselves — report those
  upstream to FFmpeg. Do tell me as well if SCLIP's usage is what makes one
  reachable.
- Findings that assume the attacker already has code execution on the machine.
