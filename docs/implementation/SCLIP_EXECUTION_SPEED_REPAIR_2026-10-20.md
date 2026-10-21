# Execution speed and vision repair — 2026-10-20

## Original failure

Latest real native session: `20261020_132028_e7b305`, selected model
`minimax/minimax-m3.1-flash:free`. Request at 13:35:42 CEST; actual rough-cut commit
at 14:07:11 (31m29s). Full-source placement at 13:35:59 was not a rough cut.
The frame pipeline was running, but 74 of 126 distinct inspection results were
marked possibly truncated. Whole-video analysis was separately unselected
(`active.vlm = null`). One default description window also overshot the source
by a fraction of a video frame. Later malformed array/numeric arguments and
per-mutation review loops caused additional work. Style learning was not the
cause of the initial delay.

## Changes

- Schema-directed argument transport repair; strict operation/revision validators retained.
- Source discovery bound per accepted request, shared over MCP reconnects; cached reads included. Initial assembly discovery is bounded to 45 seconds / twelve admissions; one committed assembly unlocks a 45-second / six-admission refinement, without repeated resets.
- Bounded native image fallback, including the source-discovery deadline.
- One public cached transcript read over up to fifteen minutes; native windows stay sixty seconds.
- Low native-session reasoning default only where no explicit setting exists.
- Concise local frame prompts, bounded output allowance, improved text resolution.
- Explicit whole-video unavailability and safe full-source default description bounds.
- Compact explicit-ranges input reusing the existing atomic cut executor; no generated story metadata is required.
- Complete output verification across at most eight contiguous render/decode windows instead of rejecting any output longer than a single window.
- Prompt/skill guidance to assemble justified ranges early, defer uncertain names, and use
  atomic dependent repairs before current rendered verification.

No model/provider replacement, weight download, privacy-mode change, or weakening
of rendered completion checks. The general small vision model remains fallible;
a venue spelling is not a verified business identity.

## Validation and package scope

Focused TypeScript tests: 152 passing across 18 files, including an offline test of the pinned Hermes Python argument coercer. Python worker tests: 7 passing.
Typecheck and diff checks pass. A process-start timing test failed once under
concurrent benchmarking load and passed in isolation and the final full focused run.

Actual packaged native-agent synthetic edit on supplied cut ranges: first correct
assembly 25.7 seconds, both labels by 35.0 seconds in the first candidate. A subsequent
run reached assembly in 23.6 seconds and labels by 41.5 seconds; final review in that
run was unavailable because the initial harness had not opened the editor view.
The harness was corrected to create/open the project through its normal UI.
These are assembly measurements, not certification of semantic scene selection.

The actual local frame worker read a synthetic sign without truncation. A real
venue overlay was read as “Dubilot” rather than “Dubillot”, demonstrating that
untruncated output is still uncertain OCR. An experimental Apple Vision text path
failed its accuracy/latency acceptance and was removed from source and delivery.

Real-footage provider tests were paused by automatic approval review until the
user explicitly approved sharing Paris-video transcript/frame descriptions with
the configured OpenRouter model. Early acceptance exposed both a cached-read
budget loophole and a compiled terminal staging function separate from the updated
helper. Both were corrected; these failed intermediate candidates are not the
shipping acceptance evidence.

Final timing, scope and installation receipts live in
`maintenance/editing-speed-20261020/`. The final result must be read together with
its scope: a rough assembly is distinct from verified completion, and one tested
video does not establish a universal one-minute completion promise.

## Final real-footage result

The ready package produced first cuts at 161.961 seconds and at least two labels by 197.136 seconds. Verified completion was not observed within the five-minute test. This is a measured latency improvement over the original 31-minute discovery loop, not a one-minute performance pass or semantic certification of all eating scenes/venue labels. The real project and protected profile files remained unchanged.

The native trace exposed Hermes wrapping XML-style array arguments in a singleton list before MCP transport. The boundary now normalizes that exact schema-directed shape; an offline pinned-coercer regression and a packaged direct-MCP probe both pass. Hermes integration contributed to retries; model latency and editing orchestration also contributed. No replacement Hermes runtime was shipped.
