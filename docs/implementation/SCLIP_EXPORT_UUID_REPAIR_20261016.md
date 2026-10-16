# Export UUID repair — 2026-10-16

## Confirmed cause and focused repair

The current eight-second logo project contained twelve animation keys with string labels such as `s1`, `k1` and `t1`. The TypeScript bulk-animation MCP parser accepted any string key ID. Preview could evaluate these tracks, but native audio-conform/export deserializes the full authoritative project and requires UUID keyframe identities. Consequently even a silent video failed at the audio-readiness gate. The same full-project boundary can affect inspection/review renders; this investigation does not certify an autonomous reviewer outcome.

The original installed app reproduced `UUID parsing failed: invalid character: found s at 0` against a disposable project copy. The precise JSON column varies with serialized request fields.

Changes:

- `apps/desktop/src/main/state/ids.ts`: shared canonical UUID predicate.
- `apps/desktop/src/main/state/mcp-commands.ts`: validate bulk animation key IDs with the existing UUID parser; schema explicitly requires UUIDs and recommends `set_keyframe` for generated identities. Invalid requests fail before actor mutation.
- `apps/desktop/src/main/state/serialize.ts`: repair historical invalid string IDs in engine-owned animation slots during load, across compositions, positions, scalar/color tracks and effect parameters. Do not change key times, values, easing, valid UUIDs, arbitrary Motif props or metadata. Report the repair. No animation deletion or export bypass.
- `apps/desktop/src/main/state/persistence.ts`, `workspace-orchestrator.ts`, `ts-actor-host.ts`: carry the repair report through normal and backup loading into the destination workspace log after rotation.
- `apps/desktop/src/main/state/__tests__/mcp.validators.test.ts`, `keyframe-id-repair.test.ts`: regression coverage for rejection, actor-state preservation, valid input, identity-only repair, nested compositions, effects, custom data exclusion, roundtrip stability and loader reporting.

Hermes retains all creative decisions; ProjectActor remains the timeline writer. No hosted inference or new dependencies. No commit/tag, baseline/stash modification, or creative project edits. The user explicitly approved Save and Close / Quit and replacement of the installed app; native menus performed that normal save/quit. The original project hash remained unchanged throughout disposable testing and installation. After normal use reopened the intro, the load repair persisted its twelve corrected IDs. An exhaustive before/after comparison confirms that every other project field is identical (`normal-project-load-repair.json`); original bytes remain preserved in the evidence.

## Verification

Evidence root: `maintenance/export-uuid-20261016/` outside the source repository.

- Native addon and original installed Electron app: historical error reproduced (`native-before.json`, `runtime-before/status.json`).
- Actual project load repair: exactly twelve IDs replaced; exhaustive comparison found all other authored timeline/animation fields identical, aside from disposable media-path reconciliation (`native-check.cjs`, `repair-map.json`, `native-after.json`). Native readiness succeeds. Silent audio export correctly returns false without producing a fake audio track.
- Focused tests: **133 PASS**. Broader affected state, persistence, MCP, export controller/readiness/baking tests: **2,231 PASS, 110 files** in the isolated release source overlay (`isolated-regression.log`). Typecheck and production Electron/Vite build PASS (`isolated-typecheck.log`, `build-pass.log`). No Rust source changed; both source and packaged native execution were tested.
- Real packaged export of original project copy: H.264, 1920×1080, 60fps, exactly 8 seconds; all frames decode. Saved/reopened copy remains exportable; malformed MCP keyframe write is rejected (`runtime-candidate/`). Beginning/middle/end frames retained; midpoint visually checked.
- Separate disposable project with synthetic regression audio: actual H.264/AAC MP4, both streams 8 seconds, complete decode, non-silent decoded audio peak −20.8 dBFS (`runtime-synthetic/av-status.json`, `audio-level.log`). No synthetic audio added to the real project.
- After installation: repeat export/save/reopen/rejection PASS using `/Applications/Sclip.app` and a fresh disposable profile (`runtime-installed/status.json`). The normal user-facing app then showed a completed Export; the actual project output MP4 was independently probed and fully decoded (`actual-ui-export.json`).
- Packaging licensing/runtime/skill gates PASS. Final `codesign --verify --deep --strict` PASS. Ad-hoc local signing is not notarization.
- Installation compared **16,568 bundle entries** with the signed candidate. Installed ASAR SHA-256: `4420e1e6acafb10690f3266565adf398df009edeef29d4bdca2b31e1487e367f`. Rollback: `maintenance/export-uuid-20261016/previous-installed-Sclip.app` (`installation.json`).

## Isolation and unsuccessful checks retained

The user-paused optional image/music integration remains untouched and unshipped. Full working-tree typecheck still reports two errors in unfinished `localGeneration.ts`; the broad working-tree test run passed 2,230 tests and failed the skill/catalog drift gate for those three unfinished generation tools. These are not credited as passing. The release overlay excludes only that paused addition, verifying exact pre-addition hashes for main entry, MCP server and skill text. All repair source/test files match the working tree (`build-overlay-integrity.json`, `source-pins.json`). Existing installed production/native dependencies were reused, rather than shipping a different local addon build. Renderer executable behavior is unchanged; differing output chunks reflect build-path comments/hash references (`renderer-preservation.json`, `package-comparison.json`).

Initial isolated packaging attempts exposed dependency collection/root-workspace layout and icon-cache permission problems; their logs are retained. The successful standard electron-builder package uses a standalone isolated staging root, pinned installed production dependencies and the existing installed icon; its afterPack gates pass (`package-verified.log`). An early signature probe was premature while signing was still running; final strict verification passes.

Several additional caption-fixture smoke attempts did not pass: signed child-process startup temporarily blocked inside macOS Keychain (confirmed with `sample`, `startup-sample.txt`), and the old fixture's original media directory no longer exists. These attempts are preserved, not counted as successful caption testing. Normal native app launch succeeded, subsequent disposable startup/export succeeded, and the focused audio regression uses explicitly synthetic audio. No security setting, Keychain permission, encryption or credential storage behavior was changed to obtain a pass.

The repair targets malformed animation identities. It does not certify unrelated editorial reasoning, caption acoustic accuracy, missing creator media, or complete autonomous review. The real intro is still silent because its authored timeline contains no audio.
