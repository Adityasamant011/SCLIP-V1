# Installed Sclip / Hermes capability sanity check — 2026-10-07

## Verdict

**A — INSTALLED SCLIP READY FOR PHASE 4B HOLDOUT**, for the deterministic installation, discovery and session checks requested here. No editorial acceptance, web search or provider inference ran. Paid cost **$0.00**. This does not establish that a model will always answer capability questions accurately.

## Installation

The previous `/Applications/Sclip.app` was stale: its compiled MCP module omitted `ripple_cut_range`, `inspect_rendered_audio` and `inspect_timeline_temporal_window`. Its main entry SHA256 was `bb1714aefe5e3646b67ee79829cc2a54aa40b13b8c8f937774ff34f0e71ff184`. Both old and current bundles use app version **0.1.8**, so the version string alone cannot detect this drift.

The final bundle was rebuilt and installed from code commit **35ecf236**, release-health base **132d22aa**. All 30 compiled main-process JavaScript files match the build byte-for-byte; the bundled editor skill matches too. `/Applications/Sclip.app/Contents/Resources/sclip-build.json` records the code commit, base and main hash. The signature verifies and the installed executable launches successfully.

Original app backup: `/Users/adityasamant/SCLIP V1/backups/installed-apps/Sclip-backup-20261007-202846.app`. Intermediate installation backups are also kept in that directory, outside Applications. Projects, credentials, local model settings and existing user profile files were not replaced.

The existing bundled Hermes launcher is deliberately preserved: it invokes `/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python` in the local checkout. Its upstream agent version **0.20.4** is separate from Sclip's app version and does not identify a Sclip workspace commit. This remains a local development installation, not a self-contained distributable Hermes runtime.

## Actual tool catalog

- Installed Sclip MCP `tools/list`: **115 unique tools**, with external B-roll disabled.
- Actual Hermes registration against that endpoint: **119 deferred tools**, including four generated MCP utility wrappers: `list_resources`, `read_resource`, `list_prompts`, `get_prompt`.
- Exact-name search and describe succeed for `ripple_cut_range`, `inspect_rendered_audio`, `inspect_timeline_temporal_window`, `apply_repair_transaction`, `render_timeline_range`. Their live schemas are present and descriptions specify purpose and constraints.
- `add_audio_layer`: **HALLUCINATED / not registered**, in either the examined source or the current Hermes catalog. Audio creation uses the existing media-layer path; no new tool was added.

Correction to the earlier chat assessment: resource/prompt helper names are legitimate callable Hermes wrappers, although they are not Sclip editing-server tools. The old chat's `116` deferred-tool count also matches its saved tool-search results; that historical number was not itself invented. Counting optional skills as currently callable tools to advertise approximately 190 capabilities was misleading.

## Capability overclaim

The captured session's tool-search results show only a connected WeftCut catalog and no web-search matches. Its final catalog narration was not grounded in an additional tool-discovery call. Current offline backend probes report all built-in web backends unavailable: no configured backend or usable free DDGS package. **WEB SEARCH: OPTIONAL / NOT CONFIGURED**; unavailable in this session. Arbitrary shell/API access is distinct from a configured web search or authenticated GitHub/service integration.

The profile SOUL describes a general assistant, but does not explicitly promise web search. Generic capability knowledge and an index of optional skills were overgeneralized by the model; the stale installed editing catalog separately explains the missing Phase 4B tools. No evidence shows that those newer tools were missing from the release-health source.

Small fix: the generated profile's existing system-prompt overlay now tells Hermes to ground capability reports in current tool definitions/search/describe and prerequisite configuration, mark optional/unavailable/unverified features honestly, distinguish generated protocol wrappers, and avoid fabricated totals. Existing manual system instructions and configured terminal cwd are preserved. There is no static capability list, new tool, creative decision or editorial workflow change. No cloud behavioral test was used to claim that this instruction guarantees model compliance.

## Sessions and presentation

The actual captured session DB contains **7 user messages, 11 assistant entries and 4 tool replies**, with each user message appearing once in order. Therefore the repeated capture is not duplicated stored turns or loss of that conversation. The initial empty-session notice describes the newly created session before its first messages; its later stored state is populated. Repeated terminal redraw/replay in the capture is the supported explanation, not repeated independent sessions. The precise clipboard/terminal capture operation cannot be reconstructed from the pasted text alone.

Checks cover real Hermes SQLite persistence/resume (A survives close/reopen and precedes B), renderer output sequence deduplication, and a real node-pty/fake-Hermes A/B session: one startup, both inputs and both outputs in one snapshot. No session-loss or truncation blocker reproduced. Mid-response cutoffs in the capture coincide with explicit redirected user turns; they are not proof of unexplained truncation.

The deprecated `TERMINAL_CWD` setting is absent from current profile/source dotenv files and the checked process environment. No config migration or credential changes were necessary. Current xterm handles ANSI output; no literal escape rendering failure reproduced. Fixed the partial banner substitution that left `Agentework`. Updated only the editor skill's product-name prose to Sclip, retaining compatible `weftcut` tool/skill identifiers and all editorial instructions.

Packaging exposed a stale afterPack assertion for a deleted Qwen TTS worker. It now validates the existing, packaged Kokoro worker used by the runtime. No TTS behavior changed.

## Validation

| Check | Result |
|---|---|
| Typecheck | PASS |
| Production desktop / CLI / skills builds | PASS |
| macOS directory package, package gates, code signature | PASS |
| Relevant desktop catalog/settings/terminal/session/skill/logging tests | 85 PASS, 0 FAIL |
| Build-script/local-browser tests | 85 PASS, 0 FAIL |
| Hermes offline discovery/resume/DB tests | 51 PASS, 0 FAIL (one dependency deprecation warning) |
| Branding/skill recheck (subset) | 26 PASS, 0 FAIL |
| Installed-app live catalog + actual Hermes search/describe + DB resume + real fake-Hermes PTY | PASS |
| Compiled files + bundled skill identity | PASS |
| git diff --check | PASS |
| Provider/editorial acceptance | NOT RUN, as required |

Initial validation attempts encountered sandbox browser restrictions and test-probe API/callback mismatches; corrected probes and authorized local test execution passed. Packaging initially encountered network restriction fetching Electron, then used the already installed local Electron distribution. The obsolete Qwen packaging gate was fixed as documented above. These initial failures are not presented as successful tests or Hermes product-session failures.

Local evidence: `.scratch/installed-sanity/results/live-catalog.json`, `result.json`, and the reproducible local probe scripts alongside them. They contain no credentials or hidden model reasoning. Logs are under `/tmp/sclip-sanity-*.log`.

## Scope / Git

Code commit **35ecf236** changes only capability-reporting profile guidance/preservation, a banner substitution, product-name prose, the stale packaging check, and focused regression tests. Phase 4B editorial architecture, tools, ProjectActor, perception, transactions and creative parameters remain unchanged. No holdout was run.
