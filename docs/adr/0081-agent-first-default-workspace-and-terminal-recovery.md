# 0081: Agent-first default workspace and bounded terminal startup

Date: 2026-10-18
Status: Accepted

The owner supplied an editing reference with preview above timeline on the left and Agent in a full-height right tab group. New/default-reset layouts now match it: 44px Quick Actions, then 70/30 columns, with a 72/28 preview/timeline split. Attribute, Effect, Playhead, Media Pool, Transitions and Caption share the right group. Existing saved layouts remain authoritative.

Both serialized reset layouts and imperative initial layouts use this structure. This supersedes earlier default-layout geometry decisions, without changing docking or persistence formats.

Terminal open must have visible progress and recovery. Gateway/session startup and first output are bounded to 30 seconds each; initial editorial-evidence/reviewer HTTP requests are bounded to 20 seconds. Runtime failure cancels stale startup; runtime-ready triggers reconnection. Terminal exit events display a retryable failure for their project/session. Opening the terminal reads local session metadata instead of fetching every historical transcript. Other session-list consumers retain full message loading by default.

Verification uses synthetic projects and an isolated profile. Real xterm, PTY and Hermes composer helpers were exercised without model requests. These checks do not certify every historical user project or all unrelated app features.
