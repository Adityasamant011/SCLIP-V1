# Milestone 1 safety implementation

Status: four historical reproductions pass. This certifies the documented controls, not general editing quality or release readiness. Existing dirty changes were preserved; no commit, production install, real creator-project edit or hosted inference occurred.

## Repairs and actual proof

| Defect | Root cause and repair | Runtime result |
|---|---|---|
| R1 late synthesis writes | MCP signal was discarded by the hybrid; project UUID alone did not distinguish openings. Forward request signal into the owned local worker, validate opening and native turn/request lease synchronously before ProjectActor placement. Native cancellation/supersession/closure now aborts only that binding’s operations. Shared cache is preserved. | Historical 40+ word Kokoro request: AbortError at34ms, no Audio/media/timeline/history change after91.5s, next request places one Audio layer. Native Ctrl-C without SDK cancellation: unchanged after35s, next synthesis succeeds. |
| R2 mixed-media acceptance | Audio-track phrase overrode video intent; generic audio was not required independently. Explicit requiresVideo/requiresAudio/requiresSpeech now drive state and decoded stream checks. | Both historical30s wrong-media outputs end incomplete. New30s M4a actually has audio/no video; new30s MP4 has video/no audio; both fully decode. Silent30s, black30s, audio-only14s and mixed3s controls complete with full decoded delivery proof. |
| R3 in-flight A→B→A freshness | Receipt issuance compared equal ending content, then assigned the ending epoch. Capture opening/actor, epoch, monotonic observed changes, source fingerprint, request serial and guard/ownership at start; reject changed bindings. | Actual completed compositor chunk followed by two User edits A→B→A: no receipt, INSPECTION_BINDING_CHANGED. An unchanged subsequent inspection receives a current receipt. |
| R4 active renderer cancellation | Abort was checked around executeJavaScript but never forwarded to the executing export. Use an owned UUID cancellation bridge and existing controller/worker/native sink; clean owned partials before releasing the render lock. Final artifact verification also receives native cancellation. | After actual chunk: SDK cancellation releases in40ms; native Ctrl-C releases in41ms; concurrent read and next export work; cancelled artifact and directory removed. Real user Cancel returns in203ms; next30s user export ignores unrelated ID and fully decodes. |

## Evidence

All new evidence is under `.scratch/sclip-v1-implementation/`, separate from retained audit fixtures:

- `initial-state.json`, `m1-source-delta.json`: exact starting dirty state, hashes and implementation delta.
- `r1-cancel-edit/results.json`; `r1-native-turn-synthesis-cancellation-retest/race-results.json`.
- `output-actual-streams-*/actual-streams.json` and `verification.json`; retained wrong-output media.
- `output-r2-controls-*/verification.json`; `output-r2-mixed-positive-correct-video/verification.json`; retained control media.
- `r3-evidence-races-chunk-proof/race-results.json` (final rerun), including actual User commits and unchanged inspection.
- `r4-active-render-cancellation/race-results.json`; `r4-native-turn-render-cancellation/race-results.json`; `r4-user-export-cancellation-retest/results.json`; `user-owned-recovery.mp4`.

These mechanical review fixtures use actual native lifecycle hooks, authenticated MCP and compositor, with synthetic review decisions. They do not credit Hermes with creative judgment or satisfy Milestone2.

## Validation

449 affected tests pass,8 existing skips,30 files (`m1-affected-retest.log`). Rust619 pass,1 existing ignored (`m1-rust-full.log`), including109 speech tests separately. Production build passes (`m1-build-verified.log`); main/typecheck evidence `m1-typecheck-verified.log`. Git diff whitespace check passes. The new regression covers cancellation before/during/post-compute, shared cache preservation, native request supersession, same-ID reopening, verifier cancellation, exact in-flight ABA, user preparation cancellation and subsequent recovery.

Failed attempts remain: sandbox loopback denial (R2), initially incorrect ABA scale restoration and reopening transport expectations (R3), an inventory mock without opening snapshot, an incorrectly staged native-synthesis fixture, and a user-export fixture whose reopened dialog reset its output folder. Each is corrected and rerun; none counts as a pass. Initial broad suite was interrupted after the inventory failure and replaced by the affected30-file run.

## Boundaries

A cancellation arriving before authoritative placement prevents that placement. Cancellation does not retrospectively undo an already committed edit. Local subprocess cancellation cleans private temporary files, not shared verified cache. The5s active-render release acceptance bound passed on these controlled supported fixtures (40–203ms); it is not a guaranteed latency for arbitrary hung hardware, filesystem, external provider or noninterruptible native finalization. Cancellation of readiness waits stops the request’s wait, preserving shared derivative jobs needed by other work. Required speech means explicit speech review modality and audible state; this is not a transcript-semantic quality certificate. The modality parser documents direct English single-output nouns and direct negations; arbitrary paraphrases/multiple deliverables remain outside its supported scope.

ProjectActor remains the sole writer; Hermes retains every creative decision. Full source files changed in this implementation are listed in `m1-source-delta.json`; existing Phase1/2 source modifications and audit reports remain intact. M2–M6 remain pending, including real agent completion, editorial quality, canonical style, standalone packaging and external human/clean-machine gates.

## Post-gate admission strengthening (2026-10-13)

A new regression reproduced ordinary tool admission after a native turn was cancelled while its terminal remained open (`m1-late-native-call-before.log`). Tool-handler admission now validates request authority before early review/lifecycle paths and before ordinary dispatch. Real Electron/PTY Ctrl-C with the fixture process kept open refuses late mutation and review calls with no project/history change, permits unrelated User edits and a subsequent valid turn on the same connection (`m2-envelope-runtime-retest/results.json`). This is a mechanical lifecycle fixture using real installed native hooks, not a model acceptance claim. Latest64focused tests, main typecheck and production build pass; historical M1 artifacts remain unchanged.
