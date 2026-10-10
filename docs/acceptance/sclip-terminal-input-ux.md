# Agent input visibility regression

## Cause and fix

The terminal renderer fitted xterm and sent resize IPC while asynchronous Hermes startup could still be creating the PTY. The runtime silently ignored resizes before a session existed. The renderer nevertheless remembered those dimensions as synchronized, leaving the child UI with an obsolete width. Reattaching an existing PTY also ignored the opening panel's dimensions.

The renderer now fits immediately, synchronizes the current size after startup/history parsing, and serializes size synchronization with input. Each input checks the current dimensions before delivery and scrolls the terminal to its live cursor. The runtime updates the existing PTY size on reattachment without replacing the conversation. Resize errors are surfaced rather than silently recorded as successful.

No editorial, model, credential, prompt or creator-memory changes.

## Verification

- Two regression assertions failed against the previous implementation: resize during deferred startup and reattachment at a new width.
- Focused Vitest: 14/14 passed (HermesTerminal, HermesTerminalRuntime and SclipAiPanel).
- Typecheck: PASS.
- Production desktop, CLI and skills build: PASS (existing dynamic-import warnings).
- Electron regression against the production build: PASS. Real React component, xterm, node-pty, and installed Hermes prompt_toolkit input-height/output helpers; an offline composer replaces the agent. No completion requests.
- 452-character input, individual keystrokes crossing the first row, long paste beyond the eight-row composer limit, widths 280/300/500/650/800 px, left-arrow/backspace/insertion, and unmount/reattachment. Tail and cursor remain inside the viewport; input remains intact; the child PID stays unchanged.
- git diff --check: PASS.

The Electron test requires the installed Hermes source/runtime and explicitly skips when unavailable; unit regressions are portable. This verifies the reproduced input geometry failure, not an assertion that all future UI bugs are impossible. It does not exercise provider inference or editorial behavior.

Installation receipts and checksums: `.scratch/terminal-input-ux/` (local, ignored). The prior app is backed up; existing profile data and Hermes launcher are preserved.

Provider cost: **$0.00**.

## Installed bundle

Installed fix commit: `3f290599`. All 61 compiled assets, 14 external CLI/skill files, and three vision workers match the tested production build. Signature verification passes. All 27,089 protected profile files and the native Hermes launcher remained unchanged. Backup: `/Users/adityasamant/SCLIP V1/backups/installed-apps/Sclip-backup-20261010-221841.app`.

The additional installed-bundle automation check was **inconclusive**: Playwright connected to the packaged process and reported backend initialization, but its launch handshake stalled. Only that disposable offline process was terminated. Two native computer-use observation attempts also timed out. The normal app was requested to reopen, but its visible launch could not be confirmed. These automation failures are not counted as passing installed UI verification; the production-build Electron input regression above did pass.
