# Sclip editorial evaluation: regression fixtures and holdouts

Adopted in Phase 3F, 2026-10-05.

## Development / regression set

The repeatedly used 55.866667-second talking-head project is **REGRESSION FIXTURE
ONLY**. Its starting SHA256 is
`e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7`.
All previous artifacts remain preserved. Historic acceptance reports describe
those historic experiments; they do not establish future editorial improvement.
Use this case to reproduce known failures and protect technical capabilities.
It cannot alone support a claim that Sclip became a better editor.

## Holdout editorial set

Use accessible real creator footage materially different from cases used to
design the current fix. Choose a short natural creator request. Record source
hash, prompt, model, architecture commit, bounds, budget gate and actual outcomes.
No hidden expected cut, opening, timing, crop or repair is supplied. Do not tune
production logic after inspecting an expected answer, or feed independent QA
back into a running acceptance. No production patch during/after the acceptance.

Technical reproduction and editorial quality assessment are separate: passing
synthetic rollback tests demonstrates rollback semantics, not editing quality.
A successful single holdout is promising evidence, not proof across genres.
One session only per authorized experiment; no editorial retries or cherry-picks.
Normal justified no-repair and honest unresolved outcomes remain valid options.

## Phase 3F holdout readiness

Candidate: existing family/lifestyle vlog, **Fun Family Morning, Garden Update &
New FS Tracksuits.mp4**, source SHA256
`759bc4124516b87899bbcc34d76ffcab43869fc59fe4d61a454416dc35329396`.
It was prepared for Phase 3 but no completed editorial benchmark was run.
This candidate was not used to design the rollback fix. Source inventory/hash
checking is not an expected editorial answer.

Proposed natural request:
“Make a short, engaging family vlog from this footage. Keep the moments that tell
a natural story.”

Luna allowance gate must pass before any inference. This document does not
schedule or authorize an additional session beyond the user's existing scope.
If blocked, report insufficient evidence without attributing failure to the
model or editorial architecture. Preserve readiness metadata separately from
historic talking-head artifacts. Future explicitly authorized holdout evaluation
must record the architecture commit actually used at that time.
