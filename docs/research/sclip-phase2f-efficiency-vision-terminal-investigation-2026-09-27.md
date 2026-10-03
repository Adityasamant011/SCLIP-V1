# Sclip Phase 2F efficiency, vision, and terminal investigation — 2026-09-27

Status: **investigation and implementation proposal only**. No production, Hermes core, skill, provider configuration, timeline, compositor, vision-runtime, or transcription changes were made. No paid inference, credit top-up, model rotation, full editing benchmark, or export was performed.

## EXECUTIVE SUMMARY

Three separate failures are supported by evidence:

1. **Cost/context:** the agent retained verbose full-source transcript windows and a later full-track resource in its ordinary history. The active Hermes configuration defers tools and achieves strong provider caching, but its cost-oriented deterministic pruning is disabled. Its normal compression trigger is far above this run's context. This is not evidence that Hermes needs an editing workflow.
2. **Visual judgment:** the rendered pixels were genuinely bad. Qwen provided incomplete/incorrect head-framing evidence, the response parser turned negated positioning language into positive structured evidence and assigned unsupported high confidence, and Hermes accepted limited centering checks as an overall framing assessment. Increasing the existing resolution and token allowance alone did not fix the clipped-head false positive.
3. **Terminal:** OSC 11 color and DA1 device-attribute replies travel through xterm's input event. Historical startup-query replay or late delivery recreates those replies after Hermes's query listener is gone, contaminating prompt input. This is reproduced locally using the production main terminal runtime, real xterm, and the installed Hermes query function, without an agent or model call.

Recommended first implementation, only after approval: enable a modest existing Hermes deterministic-prune policy through the existing Sclip profile; make existing vision evidence conservative and attach small factual geometry/occupancy evidence using existing geometry; supply Hermes's existing terminal-background hint matching Sclip's terminal theme. No new agent, VLM, editor, renderer, pipeline, creative scheduler, secrets/settings platform, or automatic repair mapping.

Confidence: issue 1 HIGH; issue 2 HIGH for the mixed failure class, not a promise that a new question will solve head detection; issue 3 HIGH for the reproduced protocol mechanism, MEDIUM for identifying which historical UI lifecycle triggered this particular user incident.

## PHASE 0 — WORKTREE SAFETY AND SCOPE

Before diagnostics, inspected `git status --short`, `git diff --stat`, and the existing diff. The repository was already substantially dirty: 50 tracked modified files, 3,037 insertions and 253 deletions, plus existing untracked implementation/tests/research. That state was preserved. No reset, revert, checkout, clean, commit, or production build was run.

The tracked diff statistics remain unchanged at the end. Production/skill trees contain 1,447 files; their latest modification time is 2026-09-26T11:03:12.558Z, before this investigation. The only intended repository addition is this report. Temporary diagnostic scripts, isolated user-data directories, copies, and frames live outside the repository.

The actual user project was read, never edited. Every compositor reconstruction used an isolated copy with media symlinks and independent userData. Original project SHA-256 remained:

`5364d7fc69bf63091ced24bd92fe828f9a46d0123aea7b744fe968b57c768d49`

Hermes was disabled in the isolated compositor apps with a non-agent executable. The local-Qwen checks used the running production MCP tool with an existing image path; they did not invoke Hermes or OpenRouter. Credentials were read only internally for local MCP authorization and were not printed or copied into this report. Read-only MCP evidence calls may append normal diagnostic logs or update the existing local inference cache; they do not mutate the timeline or project JSON.

Evidence types below are explicit: **repository/runtime evidence**, **upstream/public documentation**, **local deterministic reproduction**, or **inference/proposal**.

## LATEST RUN RECONSTRUCTION

### Identity and authoritative sources

- Actual session: `sclip-01a0ddaa-2d18-7879-8d1c-b6aec29cfc93-924ffdce-f831-411b-9030-63ac93ffed57`.
- Project: [mega test 2/project.json](</Users/adityasamant/Documents/1/mega test 2/project.json>).
- Main model/provider in every successful logged main call: `z-ai/glm-5.2` / `openrouter`.
- Active dedicated home: `/Users/adityasamant/Library/Application Support/Sclip/sclip-hermes`.
- Authoritative message/usage tables: [state.db](</Users/adityasamant/Library/Application Support/Sclip/sclip-hermes/state.db>), opened SQLite read-only.
- Model/tool completion logs: [agent.log](</Users/adityasamant/Library/Application Support/Sclip/sclip-hermes/logs/agent.log>).
- Production editor command log: [session-20260926-213309.jsonl](</Users/adityasamant/Documents/1/mega test 2/Logs/session-20260926-213309.jsonl>).
- Installed Hermes source: `/Users/adityasamant/SCLIP/hermes-agent-src`, clean worktree at `8fd95f5c75a97418c983be7baaa55a408bed206a`. Its configured remote is a fork; current official upstream documentation must not be assumed identical to this checkout.

Log times below are local CEST. Editor JSONL times are UTC; account for the two-hour offset. Session metadata timestamps can lag actual messages; use message and agent-log timestamps.

### What happened

The user asked for an agent-chosen, polished 30–45-second vertical talking-head short. The actual editing request began at 23:36:52, with zero conversation history; the session itself had been created earlier. There were 52 successful main model calls, 110 tool-result messages, one user message, and no final assistant completion answer.

The agent inspected the empty horizontal project and source overview, began an editing session, and checkpointed. It placed the full ~575.71-second source as linked A/V. The initial transcription window was a few milliseconds past the source bound and was rejected; Hermes corrected the end and obtained the real transcript. It then read ten <=60-second transcript windows spanning the whole source, selected a mentorship/focus section, removed the full-source pair, and placed nine linked A/V sections.

Selected source intervals, in seconds:

| # | Source in | Source out | Duration |
|---:|---:|---:|---:|
| 1 | 155.36 | 158.40 | 3.04 |
| 2 | 158.40 | 165.92 | 7.52 |
| 3 | 168.56 | 174.40 | 5.84 |
| 4 | 177.52 | 182.96 | 5.44 |
| 5 | 185.92 | 190.08 | 4.16 |
| 6 | 195.36 | 200.88 | 5.52 |
| 7 | 205.60 | 210.64 | 5.04 |
| 8 | 215.52 | 220.56 | 5.04 |
| 9 | 220.88 | 225.28 | 4.40 |

Total: **46.00 seconds**, not the ~34–35.7 seconds stated during planning. This is a planning/arithmetic discrepancy and exceeds the requested upper target by one second; not proof of an editor primitive failure. Video endpoints use the retained 60-fps grid while audio uses its own timing; small grid differences are not newly classified as a repair-mechanics bug.

After the rough-cut checkpoint, Hermes set the canvas to 1080×1920, scaled all nine video clips to 1.5, and moved them to y=-420. It visually inspected 1s and 18s, moved all clips horizontally to x=-200, and inspected 18s, 1s, and 35s. It then publicly asserted the framing was good. The visible head remained clipped and most of the canvas remained black.

It applied cached transcripts to all nine selected video layers, produced eleven native caption cues, restyled them, read the entire track resource for caption IDs, moved captions to y=1500/x=540 with bottom anchors and wide boxes, and added a hook at y=200. A second hook overlapped the first on the same track and was correctly refused. Hermes responded by simplifying its intended hook and adding an empty CTA track.

The next model request failed at ~23:42:50 with **provider key spending-limit exhaustion**. This was not voluntary completion and not exhaustion of the configured 60-turn ceiling. The record contains no final composed assessment after caption/hook changes and no export. Do not rate an unfinished editing run as a finished-video acceptance pass.

Saved state: nine video clips, nine linked audio clips, eleven captions, one hook, and an empty CTA track. No added B-roll/music/effects/transitions. The large colored cursor graphic visible in captures is baked into the source, not a new Hermes overlay. One saved clip has slightly different position values than the logged blanket transforms; historical reconstructions normalize it to the recorded transform instead of silently treating the final save as an exact historical snapshot.

### Every successful main model call

Numbers are provider-reported usage from `API call #N` lines, joined in order to the 52 assistant records. **Input includes cache hits; uncached = input minus cache-read.** Output includes reported reasoning output, not just visible text. Times are completion-log times. Each call receives the conversation plus preceding call's tool results; the action column identifies the tool/action that produces the next loop trigger. Call 1 is triggered by the user request.

Need labels are analytical, not instructions to the agent: **N** = useful/needed evidence or operation; **A** = avoidable failed/redundant round trip or a clear batching/scoping opportunity, not necessarily an unnecessary underlying edit; **C** = conditional overhead/judgment step whose necessity cannot be established merely from a trace. No proposed code chooses an editing order.

| # | Local completion time | Input | Cached | Uncached | Output | Latency s | Purpose; action produced | Need |
|---:|---|---:|---:|---:|---:|---:|---|---|
| 1 | 23:36:57.320 | 18,371 | 1,664 | 16,707 | 521 | 4.2 | DISCOVERY — Describe four context/resource tools | N |
| 2 | 23:36:58.296 | 19,072 | 18,304 | 768 | 26 | 0.9 | INSPECTION — List project resources | A |
| 3 | 23:36:59.869 | 19,728 | 19,008 | 720 | 126 | 1.6 | INSPECTION — Read four startup resources | N |
| 4 | 23:37:02.047 | 23,000 | 19,776 | 3,224 | 251 | 2.1 | SOURCE — Source overview | N |
| 5 | 23:37:03.414 | 23,592 | 22,912 | 680 | 129 | 1.3 | DISCOVERY — Describe import/transcription/checkpoint/session | N |
| 6 | 23:37:06.569 | 25,309 | 23,616 | 1,693 | 476 | 3.1 | SESSION — Begin agent session | N |
| 7 | 23:37:07.956 | 25,689 | 25,216 | 473 | 90 | 1.4 | SESSION/DISCOVERY — Checkpoint + describe trim/split/ripple | N |
| 8 | 23:37:10.306 | 26,841 | 25,664 | 1,177 | 151 | 2.3 | EDIT — Place full source A/V | N |
| 9 | 23:37:11.894 | 27,169 | 26,816 | 353 | 97 | 1.5 | ERROR — Transcribe (source-end range error) | A |
| 10 | 23:37:13.425 | 27,389 | 27,200 | 189 | 71 | 1.5 | ERROR RECOVERY — Correct transcription end; succeed | N |
| 11 | 23:37:48.677 | 27,667 | 27,328 | 339 | 360 | 1.9 | SOURCE — Read source windows 0–240s (4) | N |
| 12 | 23:37:52.562 | 61,038 | 27,904 | 33,134 | 439 | 3.8 | SOURCE — Read source windows 240–480s (4) | N |
| 13 | 23:38:28.048 | 95,625 | 60,928 | 34,697 | 7,810 | 35.4 | SOURCE — Read last two source windows | N |
| 14 | 23:39:00.547 | 108,449 | 95,552 | 12,897 | 7,548 | 32.4 | PLANNING — Update todo / source selection | C |
| 15 | 23:39:49.242 | 109,013 | 108,352 | 661 | 7,746 | 48.7 | DISCOVERY — Describe delete_layer (not used) | A |
| 16 | 23:39:51.192 | 109,296 | 108,928 | 368 | 85 | 1.9 | EDIT — Remove full-source pair | N |
| 17 | 23:39:53.597 | 109,390 | 109,312 | 78 | 219 | 2.4 | PLANNING — Update todo / rough-cut plan | N |
| 18 | 23:39:58.568 | 109,858 | 109,504 | 354 | 497 | 4.9 | EDIT — Place selected pair 1 | N |
| 19 | 23:40:00.678 | 110,529 | 110,272 | 257 | 130 | 2.1 | EDIT — Place pair 2 | A |
| 20 | 23:40:02.556 | 110,834 | 110,592 | 242 | 130 | 1.9 | EDIT — Place pair 3 | A |
| 21 | 23:40:04.452 | 111,142 | 110,848 | 294 | 130 | 1.9 | EDIT — Place pair 4 | A |
| 22 | 23:40:07.037 | 111,438 | 111,168 | 270 | 131 | 2.6 | EDIT — Place pair 5 | A |
| 23 | 23:40:08.802 | 111,741 | 111,488 | 253 | 130 | 1.7 | EDIT — Place pair 6 | A |
| 24 | 23:40:10.696 | 112,045 | 111,744 | 301 | 130 | 1.9 | EDIT — Place pair 7 | A |
| 25 | 23:40:12.634 | 112,350 | 112,064 | 286 | 131 | 1.9 | EDIT — Place pair 8 | A |
| 26 | 23:40:14.391 | 112,657 | 112,384 | 273 | 132 | 1.7 | EDIT — Place pair 9 | A |
| 27 | 23:40:16.193 | 112,961 | 112,704 | 257 | 90 | 1.8 | DISCOVERY — Describe composition/transform/context | C |
| 28 | 23:40:18.808 | 115,169 | 112,960 | 2,209 | 27 | 2.6 | INSPECTION — Read timeline context | N |
| 29 | 23:40:21.052 | 122,161 | 115,072 | 7,089 | 113 | 2.2 | EDIT/SAFETY — Checkpoint + set vertical canvas | N |
| 30 | 23:40:23.154 | 122,388 | 122,176 | 212 | 219 | 2.0 | PLANNING — Update todo | C |
| 31 | 23:40:29.364 | 122,856 | 122,496 | 360 | 1,177 | 6.2 | EDIT — Set scale 1.5 / y −420 on nine videos | N |
| 32 | 23:40:31.139 | 124,098 | 123,968 | 130 | 60 | 1.7 | DISCOVERY — Describe frame inspection | C |
| 33 | 23:40:32.817 | 124,347 | 124,032 | 315 | 35 | 1.7 | VISION INPUT — Inspect composed opening (image saved) | C |
| 34 | 23:40:35.059 | 124,550 | 124,288 | 262 | 22 | 2.0 | DISCOVERY — Describe local vision | C |
| 35 | 23:40:37.108 | 125,033 | 124,480 | 553 | 95 | 2.0 | VISION — Qwen opening, x=0 | N |
| 36 | 23:40:53.805 | 125,429 | 111,631 | 13,798 | 124 | 5.5 | VISION — Qwen 18s, x=0 | N |
| 37 | 23:41:08.883 | 125,886 | 113,297 | 12,589 | 836 | 11.8 | EDIT — Set x −200 on nine videos | N |
| 38 | 23:41:14.758 | 126,787 | 112,840 | 13,947 | 129 | 5.7 | VISION — Qwen 18s + 1s, x=−200 | N |
| 39 | 23:41:25.251 | 127,535 | 112,230 | 15,305 | 100 | 4.1 | VISION — Qwen 35s | N |
| 40 | 23:41:33.746 | 127,952 | 108,759 | 19,193 | 260 | 5.2 | ASSESSMENT — Mark framing good / todo | C |
| 41 | 23:41:37.744 | 128,461 | 114,330 | 14,131 | 120 | 4.0 | DISCOVERY — Describe captions + alternative subtitles | C |
| 42 | 23:41:51.049 | 129,192 | 109,813 | 19,379 | 955 | 13.3 | CAPTIONS — Apply transcript to pair 1 | N |
| 43 | 23:42:00.121 | 129,422 | 116,479 | 12,943 | 454 | 9.0 | CAPTIONS — Apply transcripts to other eight videos | N |
| 44 | 23:42:03.786 | 131,009 | 111,357 | 19,652 | 71 | 3.5 | DISCOVERY — Describe caption restyling | C |
| 45 | 23:42:07.528 | 131,327 | 114,254 | 17,073 | 70 | 3.7 | CAPTIONS — Restyle caption track | N |
| 46 | 23:42:11.485 | 131,406 | 115,637 | 15,769 | 69 | 3.9 | INSPECTION — Read full project tracks for caption IDs | A |
| 47 | 23:42:24.572 | 155,388 | 139,849 | 15,539 | 1,005 | 13.0 | CAPTIONS — Reposition eleven captions | N |
| 48 | 23:42:29.656 | 156,472 | 133,001 | 23,471 | 86 | 4.9 | DISCOVERY — Describe track + text tools | C |
| 49 | 23:42:33.878 | 157,558 | 138,651 | 18,907 | 102 | 4.2 | EDIT — Add text-overlay track | N |
| 50 | 23:42:39.800 | 157,767 | 141,990 | 15,777 | 296 | 5.9 | EDIT — Add hook text | N |
| 51 | 23:42:45.510 | 158,172 | 142,354 | 15,818 | 224 | 5.7 | ERROR — Second hook overlaps; refused | A |
| 52 | 23:42:49.845 | 158,695 | 141,238 | 17,457 | 92 | 4.3 | ERROR RECOVERY — Add CTA track after overlap | C |

### Usage and cost reconstruction

| Bucket | Uncached input | Cache-read input | Output | Reasoning subset | Calls |
|---|---:|---:|---:|---:|---:|
| Main edit | 402,823 | 4,908,430 | 34,517 | 21,386 | 52 successful |
| Title generation | 457 | 0 | 717 | 704 | 1 recorded |
| Combined recorded | 403,280 | 4,908,430 | 35,234 | 22,090 | 53 successful |

Main cumulative input: **5,311,253** tokens. Cache hit fraction: **92.42%**. Peak successful request input: **158,695** tokens. Sum of main logged inference latencies: **296.9s**. There was an additional failed next request; its charge is not established by these usage records.

Historical Hermes OpenRouter metadata contains rates per million tokens of $0.6496 uncached input, $0.12064 cache-read input, and $2.0416 output. Applying those rates reproduces the recorded main estimate exactly:

- Uncached main input: $0.2616738208.
- Cached main input: $0.5921529952.
- Main output: $0.0704699072.
- Main total: **$0.9242967232**.
- Recorded title estimate: **$0.0017606944**.
- Combined recorded estimate: **$0.9260574176**.

The session row's main estimate should not be mistaken for an auxiliary-inclusive bill. Actual billing cost is null/unavailable, so these are estimates, not an invoice. Do not count reasoning again on top of output.

The public [OpenRouter GLM 5.2 endpoint listing](https://openrouter.ai/api/v1/models/z-ai/glm-5.2/endpoints), retrieved without authentication on 2026-09-27, shows provider-specific prices; its Novita endpoint matches those historical cached rates. That does not prove Novita served every historical request. Exact provider routing and account billing were not recovered.

## ISSUE 1 — GLM COST / CONTEXT ROOT CAUSE

### OBSERVED

Context rises from 18,371 tokens on call 1 to 158,695 on call 52. A one-time source understanding operation remains attached to many later small editing calls. Cached tokens still cost money.

### PRIMARY ROOT CAUSE

**Large tool results retained and repeatedly resent below the normal large-window compression threshold, with no cost-oriented proactive prune enabled.**

The full transcript was sensibly cached locally and retrieved in bounded windows, but each window includes detailed segment/word timing and repeated JSON envelopes. The current narrow tools did not spill a giant transcription result directly into history; that earlier fix is working. Ten bounded results cumulatively recreate a large full-source transcript in main-model context.

The final track inspection is disproportionately verbose for the task of discovering eleven caption IDs and placements. This should be distinguished from a useful full project snapshot retained on disk.

### Largest context contributors

Character counts are exact saved-message counts, including wrapper/escaping. Token proxies are **characters/4 only**, not GLM tokenizer measurements, and must not be summed to claim the exact wire prompt. Actual request deltas above are more authoritative.

| Component | Saved characters | Approx. tokens | Retention observation |
|---|---:|---:|---|
| Source/media context, 11 responses | 230,951 | 57,738 | Overview + ten transcript windows stay in history |
| Resource reads, 5 responses | 98,075 | 24,519 | Last full-track result alone: 89,059 saved characters |
| Tool descriptions, 22 responses | 30,912 | 7,727 | 21 unique tools; one repeated timeline-context schema |
| Timeline context | 20,737 | 5,184 | Rich source/timing context, not only a track list |
| Assistant tool-call argument JSON | 43,483 | 10,871 | Separate from visible assistant text |
| Assistant visible message text | 9,704 | 2,426 | Small relative to transcript data |
| Five vision responses | 6,216 | 1,554 | Not the context-growth driver |
| Todo outputs, four | 3,374 | 844 | Minor |
| User request | 1,155 | 289 | Must remain intact |
| Transcription results, two | 1,376 | 344 | Includes error and compact cache summary |
| Frame-inspection result | 622 | 156 | Image cache path + metadata; not a huge base64 transcript blob |
| Other tool results | ~16,516 | ~4,129 | Ordinary edit acknowledgments and context metadata |
| Stored base system prompt | 23,107 | 5,777 | Stable, saved by hash separately from message history |
| Active WeftCut skill body | 16,430 | 4,108 | CLI preload is an ephemeral system overlay, not the stored base prompt |
| Stored memory + user profile | 1,654 | 414 | Part of the stored base prompt; do not double-count |

Two especially revealing measured input changes:

- Calls 11→14: 27,667→108,449, **+80,782 tokens** across the full-source transcript retrieval phase and associated assistant calls.
- Calls 46→47: 131,406→155,388, **+23,982 tokens** after the full-track read.

Together these phases account for roughly 75% of the 140,324-token start-to-peak growth, though their deltas also include associated arguments/output overhead.

The stored reasoning and reasoning_content fields each contain 83,892 characters and duplicate one another. **Do not add both to context.** Installed `apply_reasoning_content_policy` strips reasoning_content for routes that do not require thinking echo-back; the GLM/OpenRouter route is not in the DeepSeek/Kimi/MiMo echo family. The enormous output from calls 13–15 also does not reappear as a same-sized input jump on the next call. Persistent database reasoning is not proven to be ordinary replayed prompt content. Those three calls do produce 23,104 output tokens—66.94% of the main output—so source-selection/planning inference is itself a significant latency/output-use event.

Tool-search activation log: **12 visible/core tools, 106 deferred, ~33,682 estimated eager-schema tokens deferred**, manifest budget ~4,000. Actual native schema bytes and ephemeral overlays are not captured per request, so their precise contribution cannot be independently decomposed from this historical wire log. Do not add 33,682 deferred tokens to the request as if they were eagerly sent.

Source context/backend data remains valuable and must stay retrievable. Compact stale observations, not the evidence cache or editing truth.

### Call frequency and redundant work

The runtime already accepts multiple model-chosen tool calls per turn. This run demonstrates:

- Four source-window requests in one model response.
- Nine transform mutations in one response, twice.
- Eight caption applications in one response.
- Eleven caption-position mutations in one response.

There is no missing batching primitive. Nine clip placements were nevertheless spread across calls 18–26, even though the chosen source ranges/track were already known. These are a model-level mechanical-batching opportunity; do not create a scheduler to force them.

The 22 schema views are not 22 redundant views. Only `get_timeline_context` was described twice; trim/split/delete and the alternative subtitle tool were described but not used. Most initial cold schema views are legitimate progressive disclosure. Extra tiny describe→call rounds and the oversized caption-ID resource read are avoidable overhead, not evidence to remove tools or narrow general Hermes.

The overlap refusal worked. Spending another call/track operation after it is not inherently wrong; stacking text layers without checking intended overlap is a tool-use/planning mistake.

### What is Hermes core vs Sclip-specific

**Hermes core:** general conversation/tool loop, deferred tool catalog, stable base prompt, reasoning replay policy, cache accounting, tool-result retention, normal compression, deterministic prune, parallel-safe/ordered execution, title/auxiliary inference. No core change proposed.

**Sclip-specific:** dedicated home/profile generation, WeftCut payload sizes, transcript detail/read-resource choices, skill preload, selected provider/model credential injection, and terminal UI. Sclip's profile writer reconstructs a small config at startup; it currently writes `tools.tool_search: true` and `agent.max_turns: 60`, but no compression or auxiliary settings. Manually adding advanced YAML alone is not a durable fix because profile refresh will overwrite it.

### Enabled, disabled, and not proven

Repository evidence from `hermes_cli/config_defaults.py`, `agent/agent_init.py`, `agent/context_compressor.py`, and Sclip's [profile writer](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/sclip/hermesRuntime.ts:239>):

| Mechanism | Actual current state |
|---|---|
| Progressive tool disclosure | Enabled; activation and use proved in trace |
| Provider prompt caching | Working; 92.42% cumulative cache-read fraction |
| Stable system/tool prefix construction | Existing core mechanism; exact request bodies not logged |
| Automatic context compression | Enabled through Hermes defaults |
| Ratio threshold | 0.50; GLM metadata context 1,048,576 |
| Absolute compression threshold cap | None in this installed version/profile |
| Tail mode | Installed default legacy |
| Protected recent messages | Default 20 |
| Cost-oriented proactive pruning | **Disabled: proactive_prune_tokens=0** |
| Micro-compaction | Installed default false |
| Independent tool batching | Supported and already used |
| Safe-read parallelism / mutation barriers | Supported by installed executor |
| Local tool-search helper inference | Not required; installed catalog search is deterministic BM25 |
| Session title generation | One paid main-provider auxiliary call recorded |
| Paid cloud vision | No such call recorded in this session |
| Compression summarizer during this run | No recorded call or compression event |
| Delegate/reviewer/editor agents | None used |
| Explicit high reasoning setting | Not pinned in saved Sclip YAML; exact wire effort not proved here |

A local explicit-context constructor reports a **524,288-token** threshold with no output reservation. Runtime output reservation may lower it, but it remains far above 158,695 for the cached GLM window. No compression event occurred. The modern documentation's defaults differ; it would be incorrect to claim its 256K cap/lean default is already active here.

### Auxiliary spend audit

Authoritative `session_model_usage` has main GLM and one GLM title-generation bucket. The title consumed 457 uncached input and 717 output tokens (704 reasoning subset), estimated ~$0.0018. No recorded compression, cloud vision, memory-review, tool-search LLM, fallback-model, or delegate calls for this editing request.

The warning about a paid Gemini auxiliary fallback describes a possible fallback lane. The actual route log and accounting say title generation used **GLM 5.2**; no proof Gemini was called. Nous authentication warnings likewise are not proof of billed Nous requests. Missing unaccounted provider-side costs cannot be ruled out absolutely without the account billing record.

### Existing-feature offline prune diagnostic

Invoked the installed `ContextCompressor.prune_tool_results_only` on an in-memory copy of the 163 saved messages, with candidate `proactive_prune_tokens=48000`, existing 8,000-character result floor, 4,096-token reclaim gate, and 20-message protected tail. No DB was attached; no summarize/compress/network function was called.

Result:

- 13 large tool results compacted.
- Message content: **419,638→81,089 characters**, **80.68% reduction**.
- Message count stays 163.
- User goal unchanged.
- Last 20 messages unchanged.
- Production config/session DB unchanged.

This validates that a useful existing mechanism is available, not an end-to-end rollout or a guaranteed billing reduction. It was a final-snapshot dry run, not a live incremental run. A prune invalidates an already-cached prefix and can cause temporary uncached refill. Measure net spend and evidence recovery before choosing the threshold.

## UPSTREAM HERMES RESEARCH

Current official [compression/caching documentation](https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching/) describes normal compaction, cheap old-tool-result pruning, protected recent context, recovery pointers, and cache-aware history design. Its current documented default cap/tail differ from the installed checkout: verify deployed configuration, not documentation alone. Compaction/pruning can invalidate cache prefixes; lower raw token count is not automatically lower total cost.

Current [micro-compaction documentation](https://hermes-agent.nousresearch.com/docs/developer-guide/micro-compaction/) describes additional local-context management, including summarization work. Do not enable it merely because it exists: auxiliary inference may add cost and latency. The already-installed no-LLM proactive prune is the narrower first candidate.

Current [tool-search documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/tool-search/) explains progressive disclosure and the cache/extra-round-trip tradeoff. Its current plural/array bridge examples are not the installed run's singular bridge schema. Keep deployed schemas unchanged; multiple top-level calls in one response are already supported.

Installed `agent/tool_executor.py:2727` preserves model emission order across barrier/sequential segments and parallel-safe runs. That is not permission to run ProjectActor mutations concurrently. No global mutation parallelism, core rewrite, or automatic next-action selector is justified.

The installed skill preload joins before agent setup and passes the skill through `ephemeral_system_prompt`; this explains why the saved base prompt contains the skill catalog but not the full body. The runtime's existing `--skills weftcut` path remains intact. The latest session has no explicit skill_view call; the base-prompt hash alone is not proof of an ephemeral overlay's historical bytes. Do not diagnose skill non-use from that omission alone.

## ISSUE 2 — VISION / FRAMING JUDGMENT ROOT CAUSE

### OBSERVED and exact-frame evidence

HEAD ACTUALLY CLIPPED: **YES**.
BLACK/EMPTY REGION CONFIRMED: **YES**.
FRAME GIVEN TO QWEN MATCHED USER FRAME: **PARTIAL**.

“PARTIAL” means historical QA happened before captions/hook and before the later saved local adjustment. The exact screenshot discussed by the user was not attached as a file in this request. It does **not** mean a composition-path mismatch was found.

Recovered original frame-inspection PNG, logged at 1s immediately before the first Qwen inspection, with no intervening visual mutation:

[Original cached compositor frame](</Users/adityasamant/Library/Application Support/Sclip/sclip-hermes/cache/images/img_acabad8a6fdd.png>).

Metadata reports `live_compositor`, 1080×1920. It shows a mouth/lower face/torso, no eyes/hair/top of head, and a black lower canvas. Deterministic pixels:

- Entire full-width region y=660 through 1919 is exactly black.
- **1,260/1,920 rows = 65.625%** of canvas.
- Exact-black and max-RGB<=8 fractions both 65.625%.

Reconstructed logged before/after states on isolated copies using the **built production compositor + MCP inspect_timeline_frame**, not an FFmpeg approximation:

- Before horizontal change: scale 1.5, x=0, y=-420; 1s and 18s historical sample points.
- After change: scale 1.5, x=-200, y=-420; 1s, 18s, 35s.
- No caption/text layers in those reconstructions, matching their chronology.
- Every reconstructed frame retains a 65.625% exact-black region and clipped head.
- The reconstructed before-state 1s image is **pixel-identical** to the original cached PNG (mean absolute error 0.0).

The original vision tool's per-call temporary PNGs were deleted by its normal finally block. Except for the adjacent original 1s image, these are explicitly **reconstructions**, not claimed recovered original five-request bytes. Their transforms/times are trace-grounded and one state is pixel-validated against the actual historical artifact.

Final saved-state frames, likewise production captures on an isolated copy:

| Timestamp | Actual saved-state frame | Exact-black fraction |
|---|---|---:|
| 1s | [opening](</private/tmp/sclip-final-frame-1000000-20260927.png>) | 63.8888% |
| 18s | [middle](</private/tmp/sclip-final-frame-18000000-20260927.png>) | 62.6849% |
| 35s | [late section](</private/tmp/sclip-final-frame-35000000-20260927.png>) | 62.7121% |

All three clip the top/head/eyes. Captions occupy the black lower area, far from the speaker; hook is over the upper image at 1s. Sampled text is inside canvas, but dense multi-line cues/layout are not proof of finished caption QA. Black-pixel percentage is a factual measurement, not a creative score and not a rule that black must always be removed.

An initial read-only capture against the already-running app timed out after the SDK's 60s limit. The same production capture succeeded in isolated built-app copies. No transport/seek/compositor fix was attempted or justified by that one timeout; the user's live window state was not established.

### All five actual Qwen calls

All five succeeded through local `vision_inspect`, used `mlx-community/Qwen3-VL-2B-Instruct-4bit`, `auto_512px`, one frame, and cached=false. None requested a token/resolution override. Raw descriptions and mechanical structured fields follow; `confidence: high` is the parser's output, not calibrated confidence from Qwen.

### Inspection 1: 1s, model call 35, 23:40:37→~23:40:48

Transform: scale 1.5 on both axes; x=0; y=−420. [Production reconstruction](</private/tmp/sclip-reconstructed-before-frame-1000000-20260927.png>).

Question:

> Is the speaker's face and upper body visible in this 9:16 vertical frame? Where is the speaker positioned? Is the framing good for a talking-head short, or is the speaker cut off / too high / too low / too zoomed? Describe what you see.

Returned description (worker raw text copied into description):

> Yes, the speaker's face and upper body are visible in this 9:16 vertical frame. The speaker is positioned in the upper right portion of the image, with their face and shoulders clearly visible. The frame is cut off at the bottom, and the speaker is not cut off or too high or too low

Structured fields: `subject_visible=true; subject_position=upper-right; framing_ok=null; confidence=high`. Visible-content labels: face, person. Inference latency: 4999.9ms.

Hermes interpretation/outcome: Hermes requests a second sample; first answer does not identify the missing eyes/top of head.

### Inspection 2: 18s, model call 36, 23:40:53→~23:40:57

Transform: scale 1.5 on both axes; x=0; y=−420. [Production reconstruction](</private/tmp/sclip-reconstructed-before-frame-18000000-20260927.png>).

Question:

> Describe the framing of this vertical video frame. Is the speaker well-centered or off-center? Is there too much empty space? Is the speaker's face in the upper third of the frame? Would this look good on TikTok/Reels?

Returned description (worker raw text copied into description):

> The speaker is off-center, positioned on the right side of the frame, with the left side being more empty. The speaker's face is in the upper right, which is off-center but not in the upper third of the frame. The speaker's face is in the upper right, and the speaker's face is in

Structured fields: `subject_visible=null; subject_position=upper-right; framing_ok=false; confidence=high`. Visible-content labels: face, person. Inference latency: 2697.3ms.

Hermes interpretation/outcome: Hermes responds to off-center evidence with only a horizontal shift. It does not address vertical clipping or lower black canvas.

### Inspection 3: 18s, model call 38, 23:41:14→~23:41:18

Transform: scale 1.5 on both axes; x=−200; y=−420. [Production reconstruction](</private/tmp/sclip-reconstructed-after-frame-18000000-20260927.png>).

Question:

> Describe the framing. Is the speaker now centered in the vertical frame? Is his face visible and well-positioned? Is the framing good for TikTok/Reels?

Returned description (worker raw text copied into description):

> Based on the provided image, here is an analysis of the framing:
> 
> -   **Speaker's Position and Centering:** The speaker is positioned in the upper portion of the frame, but not centered. The vertical alignment is off, with the top of the frame being more towards the left and the bottom being more towards the

Structured fields: `subject_visible=null; subject_position=center; framing_ok=null; confidence=high`. Visible-content labels: person. Inference latency: 2958.7ms.

Hermes interpretation/outcome: No targeted vertical correction follows, despite 'not centered'/'alignment is off' in the description.

### Inspection 4: 1s, model call 38, 23:41:14→~23:41:21

Transform: scale 1.5 on both axes; x=−200; y=−420. [Production reconstruction](</private/tmp/sclip-reconstructed-after-frame-1000000-20260927.png>).

Question:

> Describe the framing. Is the speaker centered? Is his face visible? Good for vertical short?

Returned description (worker raw text copied into description):

> Based on the provided image, here is an analysis of the framing:
> 
> -   **Speaker's Position and Centering:** The speaker is positioned in the center of the frame, though not perfectly centered. The camera is angled slightly to the right, placing the speaker more towards the right side of the frame. The microphone is

Structured fields: `subject_visible=null; subject_position=center; framing_ok=null; confidence=high`. Visible-content labels: person, microphone. Inference latency: 2665.6ms.

Hermes interpretation/outcome: Read alongside inspection 3; Hermes proceeds to a 35s sample, not a vertical correction.

### Inspection 5: 35s, model call 39, 23:41:25→~23:41:28

Transform: scale 1.5 on both axes; x=−200; y=−420. [Production reconstruction](</private/tmp/sclip-reconstructed-after-frame-35000000-20260927.png>).

Question:

> Is the speaker visible and centered in this vertical frame? Is his face clearly visible? Describe what you see.

Returned description (worker raw text copied into description):

> Yes, the speaker is visible and centered in the vertical frame. He is positioned in the upper portion of the image, with his face and upper body clearly visible. He is wearing a black t-shirt and appears to be speaking, with his mouth slightly open. His right arm is raised, and he is holding a microphone

Structured fields: `subject_visible=true; subject_position=center; framing_ok=null; confidence=high`. Visible-content labels: face, person, arm, microphone. Inference latency: 2597.2ms.

Hermes interpretation/outcome: Hermes subsequently declares framing good across all segments; limited samples do not support that broad assessment.

The description in inspection 3 explicitly says **not centered**, while its structured field says **center**. That is a proven parser error, not speculation about Qwen capability. Inspections 1 and 5 confidently claim face visibility despite clipped eyes/head. Subsequent centering language is not a head-boundary check.

At 23:41:33, the public assistant assessment was: “Framing is good — speaker is centered with face and upper body visible across all segments.” It is contradicted by the recovered/reconstructed pixels. The final caption and hook state was never visually inspected before the provider failure.


### Current preprocessing, generation, and parser

Repository evidence: [vision tool handler](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/mcp/server.ts:337>), [sidecar/cache](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/sclip/visionSidecar.ts>), and [existing worker](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/vision/sidecar/vlm_worker.py>).

- The tool requires the real composed capture for timestamp inspection. It passes the full PNG; no raw-source fallback is used.
- Full 1080×1920 input is resized as a whole, not cropped. The worker rounds each dimension to a multiple of 28.
- Auto subject/framing: 512 target long edge → approximately **280×504**.
- Auto text/caption: 672 target → approximately **392×672**.
- Existing high mode: 768 target → approximately **420×756**.
- Independent dimension rounding introduces small aspect-ratio distortion, but does not remove the top/bottom image boundary. The head is already missing in the full compositor PNG.
- Prompt construction is plain question + optional context using the MLX model chat template. Qwen is not required to return a typed JSON observation.
- Defaults: 64 output tokens for framing/subject questions, 96 for text questions. Several historical answers end mid-phrase. That is consistent with truncation; generation finish reason/token count is not returned, so historical limit exhaustion cannot be proved precisely.
- The “structured” fields are keyword extraction from prose, not verified model JSON. Positive substring matches precede some negative matches. “not centered” therefore becomes center.
- High confidence is assigned whenever response length exceeds 40 characters and the response does not begin ERROR. It is **not** model uncertainty or calibrated confidence.
- Unknown/null framing_ok appears in four of five calls. Hermes nevertheless declares overall success.
- Multi-frame input exists, but this session uses single frames.
- Cache is keyed by file path/question/context/resolution/tokens plus file metadata. Timestamp captures use newly generated temporary paths, so repeating an otherwise identical capture/question need not hit that cache. All five historical queries are also different, so this run does not prove wasted identical inference. Not the primary paid-cost issue.

### Local-only neutral diagnostic performed now

Used the exact recovered historical PNG through the current **production MCP vision_inspect** with:

> Describe only visible facts. Is the entire head, including the top of the head and both eyes, inside the image, or is any part outside a frame edge? Identify the edge if cut off. Does the lower part contain image content or a black area? State where.

| Existing parameters | Inference latency | Response |
|---|---:|---|
| auto, max_tokens=64 | 2707.9ms | Says entire head and both eyes are inside; recognizes lower black area |
| high, max_tokens=160 | 3037.8ms | Same incorrect head claim; recognizes lower black area |

Both descriptions are complete enough to expose the substantive false positive; both are marked high confidence by the existing parser. This is **not** a test showing “change the wording/resolution and it is fixed.” Two tests are not a statistical model evaluation, but they directly disprove a resolution/token-only explanation for this frame.

No additional VLM, cloud vision, Qwen model change, new geometry engine, auto-reframe, or creative heuristic was used.

### PRIMARY FAILURE: MIXED

- **QWEN / VISUAL PERCEPTION:** false positive about complete head/face visibility on visibly clipped pixels, including with higher existing resolution.
- **EVIDENCE PARSER / EXISTING TOOL BUG:** negation misparse and unsupported high confidence amplify unreliable prose.
- **PROMPT / EVIDENCE DESIGN:** broad “good for TikTok?”/“centered?” questions mix subjective quality with factual head-boundary checks. The first question allows bad framing, so it is not wholly a presupposition-only explanation. Later “now centered” wording can prime confirmation; neutral wording alone did not solve this diagnostic.
- **HERMES / EDITORIAL JUDGMENT AND PROCEDURE:** it attends to horizontal centering while vertical clipping and occupancy remain unresolved, ignores/overgeneralizes inconsistent evidence, and treats three sampled times as approval across all nine segments. No final caption/hook visual check occurred before provider interruption.
- **PROVIDER:** prevents final review/completion; cannot excuse the earlier false framing assertion.
- **PREPROCESSING:** downsizing may make fine visual distinctions harder, but no evidence of a fresh seek/path/full-frame failure in these historical frames. Do not reopen compositor/ProjectActor architecture.

MISSING EDITOR PRIMITIVE PROVEN: **NO**.

### Existing geometry that can be reused

No subject/face tracker exists or is needed for the proposed first step. Existing media-layer geometry must not be presented as a semantic head bounding box.

- [CompositionNode.naturalSizeOf and textFitOf](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/render/CompositionNode.ts:995>): media dimensions, staged text/graphic natural sizes, text fit status.
- [layerFrameAt](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/preview/centerInFrame.ts>): existing animated transform evaluation and per-kind origin conventions.
- [layerQuad](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/preview/gizmoGeometry.ts>): authoritative transformed corners, including rotation, flip, anchor, scale.
- [quadAabb](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/preview/previewSnap.ts>): reusable envelope.
- [TextSprite](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/render/sprite/TextSprite.ts>): measured glyph/layout bounds and effective font size. Layout box != actual glyph box.
- [textHitTest](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/preview/textHitTest.ts>): existing precedent reusing those exact geometry functions, not maintaining another private formula.
- Existing composed PNG provides measurable edge-connected black regions/pixel fractions.

A small read-only evidence attachment could report canvas dimensions, active video footprints/canvas intersections, measured text bounds/overflow, and black-region measurements. It must preserve unknown/not-staged states, distinguish actual glyphs from intended boxes, and not claim black pixels prove “ugly” or a layer rectangle proves the head is clipped. No fixed safe-area recipe; only actual canvas bounds or explicitly supplied safe-area constraints.

Head/eyes/hair observations remain semantic evidence. If existing Qwen cannot verify them, retain uncertainty and do not invent a positive assurance. Proposed structured factual observations/bounds from the **same Qwen** need balanced tests before being trusted.

## VISION / MULTIMODAL RESEARCH

The official [Qwen3-VL repository](https://github.com/QwenLM/Qwen3-VL) exposes grounding with boxes/points, OCR, multi-image/video use, and image-detail reasoning. These are family capabilities, not a guarantee that this particular 2B 4-bit model's layout critique is reliable. Its examples demonstrate grounding as evidence; they do not justify building a new creative framing system.

The [Qwen3-VL technical report](https://arxiv.org/abs/2511.21631) and [official 2B model card](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct) document the model family and variant. They do not establish calibrated “good framing” confidence for this production setup. Small/quantized-model sensitivity and loss of small details at low resolution are reasonable hypotheses, not a proven explanation for this false complete-head claim.

[Microsoft OmniParser's public source](https://github.com/microsoft/OmniParser) separates screenshot parsing into grounded elements, labels, and coordinates. The transferable principle is to give the reasoning model factual spatial evidence. Its detector/OCR/model stack is **not** proposed for Sclip.

[Windows Agent Arena's technical paper](https://microsoft.github.io/WindowsAgentArena/static/files/windows_agent_arena.pdf) reports visual/language alignment and grounding-boundary problems, and benefits from supplementing image evidence with existing native structural information. UI evidence is not a talking-head aesthetic benchmark; it supports the narrower distinction between geometry and judgments, not automatic centering or zoom rules.

Public, authoritative production architecture for OpusClip/ChatCut/Descript/Captions/Runway was not established in this investigation. Their marketing claims cannot prove how they solve framing or cost. No invented private architecture or competitor-inspired editing pipeline is recommended.

## ISSUE 3 — TERMINAL CONTROL-SEQUENCE ROOT CAUSE

### OBSERVED and identification

User saw:

`]11;rgb:0b0b/0d0d/1212[?1;2c`

The complete corresponding reply bytes are:

```text
ESC ] 11 ; rgb:0b0b/0d0d/1212 ESC \     OSC 11 default-background response
ESC [ ? 1 ; 2 c                        DA1 primary device attributes response
```

The RGB components exactly match Sclip's configured xterm background **#0b0d12** expanded to 16-bit channel notation. This is protocol answerback, not user text or an LLM response.

### Complete current path

[HermesTerminal.tsx](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/agent/HermesTerminal.tsx:57>):

1. xterm receives PTY output through terminal.write.
2. Live output is sequence-deduplicated.
3. Startup snapshot/history is also passed to terminal.write.
4. xterm processes queries in both cases and generates replies through onData.
5. onData sends every string through the same serialized promise queue, awaiting terminal opening and IPC completion.

[Renderer IPC](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/ipc/sclip.ts:86>) → main `sclip_terminal_input` → [HermesTerminalRuntime.input](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/sclip/hermesTerminalRuntime.ts:152>) → validates project/session → pty.write(data).

The runtime creates a real Hermes CLI PTY, preserves output protocol bytes through its stream-safe secret redactor, and stores bounded 256KB output history. Keyboard/paste and generated protocol replies intentionally share xterm's onData surface. There is no answerback-vs-human provenance carried through IPC.

Installed [Hermes query code](</Users/adityasamant/SCLIP/hermes-agent-src/cli.py:2899>) sends an OSC 11 query fenced by DA1 in one write:

`ESC ] 11 ; ? ESC \ ESC [ c`

It reads in cbreak mode up to one second until DA1, then restores the terminal and drains another 50ms. Normal replies belong to this listener. Replies arriving later land in the CLI prompt input parser. Replaying the historic query when the CLI is already at a prompt has no listener at all.

Existing history sequence dedup prevents duplicate live chunks; it does **not** stop protocol side effects generated afresh by parsing stored query bytes. Input serialization preserves reply order but can delay delivery; it does not distinguish replies from keystrokes. The redactor preserves the query/reply protocol in the reproduction; no evidence it creates these bytes. Existing Hermes leaked-response cleanup handles CPR/mouse reports, not this OSC11+DA1 payload.

### Deterministic reproduction without GLM

Temporary test harness:

- Imports/bundles the **current production HermesTerminalRuntime**, including PTY ownership/history/input/redaction.
- Overrides only its launch target to an isolated local Python diagnostic instead of an agent.
- Extracts and executes only the installed Hermes color-query function via AST; no CLI startup/provider initialization/model client.
- Uses real xterm in an isolated Electron window, the Sclip theme, and a serialized input queue equivalent to the renderer's.
- Uses the installed prompt_toolkit VT100 input parser to show late payload becoming printable prompt text.
- Does not claim this replaces a full React→IPC user-session regression test; that remains in the approval-stage test plan.

| Case | xterm generated OSC11 + DA1 | Color query consumed | Prompt contaminated |
|---|---|---|---|
| Normal live delivery | YES | #0B0D12 | NO; empty buffer |
| Historical query replay after listener exits | YES | No listener / None | YES |
| Serialized replies each delayed 1250ms | YES | Timeout / None | YES |

Both failure cases produce the same printable color/device-attribute body as the user's observation, with a printable ST backslash also retained by the focused parser harness. The user's exact visible terminator degradation was not separately reproduced in a full Hermes prompt_toolkit application. That nuance does not change the confirmed origin/misrouting mechanism.

**REPRODUCED: YES.**

The historical event was not input-logged, so cannot prove whether this incident followed a panel remount/history replay or a delayed startup reply. Both mechanisms are concrete, not speculative. Provider credit exhaustion itself does not generate OSC replies; a UI lifecycle change or outstanding query around that failure is the missing historical timing evidence.

Existing terminal regression suite run unchanged:

```sh
# cwd: /Users/adityasamant/SCLIP V1/editor/apps/desktop
npx vitest run src/main/sclip/hermesTerminalRuntime.test.ts src/renderer/agent/HermesTerminal.test.tsx
```

**2 files / 7 tests PASS.** These tests do not currently cover protocol answerback replay.

### Likely smallest safe fix — proposal only

Use Hermes's already-supported **HERMES_TUI_BACKGROUND=#0b0d12** for the Sclip-controlled terminal. Installed `_detect_light_mode` checks this before its OSC color query. An isolated function test confirmed the explicit dark background returns before querying, with the query stub set to fail if called.

This avoids the known color+DA1 probe entirely for this known-theme host, without dropping input or disabling terminal responses globally. It should be verified in a fresh PTY; an old PTY's existing history can still contain the prior query until restarted. No Hermes core modification or PTY rewrite is necessary.

## XTERM / PTY RESEARCH

Official [xterm supported terminal sequences](https://xtermjs.org/docs/api/vtfeatures/) identifies OSC 10/11 foreground/background controls and DA1/DA2 queries. The [Terminal API](https://xtermjs.org/docs/api/terminal/classes/terminal/#ondata) describes forwarding onData to the backing PTY. Terminal-generated replies must normally be forwarded; blanket stripping would break legitimate protocol behavior.

Installed xterm `InputHandler.sendDeviceAttributesPrimary` returns exactly ESC[?1;2c for the xterm identity. Its background-color report reaches the same core data event. Official [xterm InputHandler source](https://github.com/xtermjs/xterm.js/blob/master/src/common/InputHandler.ts) confirms protocol responses are generated by the emulator, not typed by users.

Official [parser-hook documentation](https://xtermjs.org/docs/guides/hooks/) offers targeted OSC/CSI handling. If theme-hint prevention proves insufficient, a replay-only query handler is a possible narrow alternative. Returning handled only for historical queries is materially safer than filtering all onData during replay, which could discard real keyboard/paste.

## OPTIONS CONSIDERED

These are alternatives, not a request to implement all nine. Risks are assessed relative to this dirty current repository.

### Issue 1 — cost/context

| Approach | Components likely affected | Impact | Complexity | Sclip risk | Agenticness risk | Overengineering risk | Validation |
|---|---|---|---|---|---|---|---|
| C1: Enable existing no-LLM proactive pruning in dedicated profile; consider normal compaction cap only after measuring | hermesRuntime.ts profile writer + profile/settings tests; Hermes config only, not core | Large stale-result retention reduction; possible temporary cache refill | LOW | MEDIUM: recall/cache-prefix tradeoff; restart must preserve intended config | LOW: no next-action/order changes | LOW | Offline trace replay, goal/tail preservation, cache-cost sensitivity, built-profile restart and source re-read |
| C2: Make discovery evidence compact and request exact word detail only when needed; scope track/caption evidence instead of dumping all tracks | Existing get_media_context/read_resource/get_timeline_context response path and tests; optional backward-compatible detail selection if current parameters cannot express it | Lower context before retention/pruning; retains authoritative cache | LOW–MEDIUM | MEDIUM: accidentally omitting word boundaries or IDs | LOW if agent chooses scope | LOW if no new tool/store | Full-source coverage + selected word timing unchanged; response size comparison; cached caption application unchanged |
| C3: Use already-supported multiple calls and schema reuse more effectively, with optional general advisory guidance—not automation | No core/runtime batch implementation; at most existing advisory skill after separate approval | Potentially avoids eight extra clip-placement rounds and some cold-schema overhead | LOW | LOW–MEDIUM: dependent calls cannot be blindly batched | LOW if Hermes still decides | LOW; HIGH if converted to scheduler | Deterministic sequential mutation barriers; error/interrupt handling; agent selects batch/order |

Choose **C1 first**. C2 is a measured follow-up if retained/active payloads remain excessive. C3 is an agent-behavior opportunity, not an architecture change and not a promise of eight fewer calls in every edit.

### Issue 2 — evidence/judgment

| Approach | Components likely affected | Impact | Complexity | Sclip risk | Agenticness risk | Overengineering risk | Validation |
|---|---|---|---|---|---|---|---|
| V1: Stop positive extraction from negated prose; preserve unknowns; remove unsupported confidence; make existing factual output concise and completion/truncation explicit where available | Existing vlm_worker.py parser/output and visionSidecar/server mapping/tests | Removes proven contradictory assurances; no guarantee Qwen will perceive the head correctly | LOW | LOW–MEDIUM: consumers may assume high/center today | NONE: evidence only | LOW | Negation/contradiction/truncation cases; unchanged local backend/cache/batch routes |
| V2: Attach small read-only layer/text geometry and black-region measurements to existing inspection evidence using authoritative current geometry | Existing capture metadata/timelineFrame/server evidence attachment; read-only PixiPreview/CompositionNode probe access if needed; reuse existing geometry functions | Truthful occupancy/text evidence even when VLM prose fails; no semantic head guarantee | LOW–MEDIUM | MEDIUM: anchors, rotation, crop, glyph-box distinction; no draw/seek changes allowed | NONE if no quality score or repair choice | LOW with reuse; HIGH if private geometry engine added | Rotated/flipped/anchored layouts, staged/unknown states, letterboxing intentionality, footprint/capture alignment |
| V3: Test same-Qwen concise structured head/face boundary observations or validated bounding boxes, with neutral prompts and existing high/multi-frame support | Existing prompt/output schema only; same model/runtime | Could improve semantic evidence; this diagnostic shows resolution alone is insufficient | MEDIUM, evidence not established | MEDIUM–HIGH: plausible JSON can still be false | NONE if observations only | MEDIUM; reject new detector/VLM/tracker | Balanced good/bad frame pairs, original partial-face fixture, negatives, text-boundary cases; require truthful uncertainty, not just valid JSON |

Choose **V1 + a minimal V2 attachment** as the bounded evidence repair proposal. Do not encode “head near top→move y” or “black>threshold→zoom”. V3 is a small local validation question, not a committed new semantic subsystem. If the same Qwen still falsely guarantees the head is intact, mark that ability unreliable rather than manufacture a PASS.

### Issue 3 — terminal

| Approach | Components likely affected | Impact | Complexity | Sclip risk | Agenticness risk | Overengineering risk | Validation |
|---|---|---|---|---|---|---|---|
| T1: Pass existing Hermes background hint matching current xterm theme | hermesTerminalRuntime.ts launch environment + tests | Prevents this Hermes OSC11/DA1 probe at source | VERY LOW | LOW: keep in sync if terminal theme changes; old sessions need fresh PTY | NONE | VERY LOW | Existing hint function + real fresh PTY; rapid typing, remount, replay, resize, secrets unchanged |
| T2: Suppress only historical terminal query execution via existing xterm parser hooks during snapshot replay; live replies remain functional | HermesTerminal.tsx + focused renderer tests | Prevents replay answerbacks even for retained queries | LOW–MEDIUM | MEDIUM: async write/replay/live boundaries; never suppress real input | NONE | LOW if exact query hook, not generic terminal protocol layer | Split sequences, OSC setters vs queries, live query during/after replay, keyboard/paste retention, sequence dedup |
| T3: Strip OSC/DA fragments at CLI input or rewrite protocol routing | Hermes core or new Sclip input filter | Could hide leaks but may damage literal paste/protocol functionality | MEDIUM–HIGH | HIGH | MEDIUM for general terminal behavior | HIGH | Would require broad protocol/literal-text coverage |

Choose **T1**. T2 is only justified if fresh-PTY validation exposes remaining replay queries from another concrete source. Reject T3 for this task.

## RECOMMENDED MINIMUM-DIFF PLAN

**Nothing in this plan has been implemented.**

1. After user approval, add tests for the proven failures first: transcript retention dry-run preservation, vision negation/unsupported confidence, and terminal historical/late answerbacks.
2. Apply C1 using the existing generated dedicated profile, with a narrow explicit set of existing non-secret compression keys. Candidate values for validation: proactive_prune_tokens=48000, current protect_last_n=20, result floor=8000, reclaim gate=4096. Do not generically import legacy YAML or secrets; do not create another settings store. Confirm restart behavior. Do not blanket enable paid micro-compaction or auxiliary fallback changes.
3. Apply V1 conservative evidence handling. Add only minimal V2 facts to the **existing** inspection response if the capture/probe path can expose them without changing render/seek behavior. Keep semantic head evidence uncertain when not established. Do not build face tracking or duplicate geometry.
4. Apply T1 using the existing Hermes theme hint. Preserve input queue, redaction, replay sequence dedup, stale callbacks, and PTY ownership. Validate fresh sessions and resumed existing sessions with historical data.
5. Run deterministic and focused built-app integration checks described below. Stop if cost refill outweighs savings, source evidence becomes inaccessible, or render geometry needs a second authority.
6. Only after those gates and explicit approval for paid usage, perform **one real user edit**, with the same existing source/model/general goal and user-controlled credits. Measure actual usage and exported-video quality. Hermes chooses evidence, tool order, edits, and completion. No controller/reviewer/automatic final-review callback.
7. Stop and report. Do not start style learning or another Sclip phase.

## FILES LIKELY TO CHANGE LATER

First-pass production candidates, not changes in this task:

- [hermesRuntime.ts](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/sclip/hermesRuntime.ts>): existing profile's compression keys only.
- [hermesTerminalRuntime.ts](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/sclip/hermesTerminalRuntime.ts>): terminal-background environment hint only.
- [vlm_worker.py](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/vision/sidecar/vlm_worker.py>): evidence/parser truthfulness, not model loading/recovery architecture.
- [visionSidecar.ts](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/sclip/visionSidecar.ts>) and [server.ts](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/mcp/server.ts>): only necessary evidence-field mapping.
- [timelineFrame.ts](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/main/sclip/timelineFrame.ts>) and [PixiPreview.tsx](</Users/adityasamant/SCLIP V1/editor/apps/desktop/src/renderer/render/PixiPreview.tsx>): **conditional read-only metadata plumbing only**, not seeking, scheduling, draw/export logic.
- Colocated existing terminal/profile/vision tests, plus focused built-app checks.

Reuse `CompositionNode.naturalSizeOf/textFitOf`, `layerFrameAt`, `layerQuad`, `quadAabb`, and text measurement. No planned change to their geometry formulas. If metadata requires deeper renderer changes, stop for another scope decision.

C2 may later involve the existing native MCP resource formatter and its tests. Do not edit that backend just because it appears in the options table. No WeftCut skill, task-management guidance, model/provider configuration, or Hermes core change is in the chosen first-pass plan.

## REGRESSION RISKS

- Pruning changes old context and cache reuse; aggressive pruning can increase uncached spend or cause repeated schema/transcript fetches.
- Sclip's profile refresh may erase a manual setting; preserving arbitrary config could reintroduce secret/legacy toolset problems. Use only the necessary existing non-secret keys.
- Whole-source understanding still matters. Compact exact cache evidence without deleting transcripts/word timings or forcing a shorter story.
- Unknown vision fields may change consumers' expectations. Preserve compatibility thoughtfully; never turn absence into PASS.
- Layer footprints are not subject bounds. Text layout bounds are not always glyph bounds. Off-stage data is unknown, not zero.
- Black can be intentional or content. Measurements must not choose aesthetics.
- Read-only evidence plumbing must not change rendered pixels, playback, decoder readiness, actor authority, or export.
- Dropping all terminal input during replay would lose real user text. Dropping all CSI/OSC would break terminal functionality.
- A background hint must match the actual terminal theme; old history may remain until that PTY is restarted.
- Additional semantic vision questions can increase local latency and paid main-loop calls; avoid repeated identical inspections.

## EXACT TEST PLAN

### Already completed during this investigation

| Diagnostic | Result |
|---|---|
| Current worktree/diff inspection | Preserved existing state |
| Read-only reconstruction of all 52 successful main calls | Complete usage table above |
| Auxiliary accounting | One GLM title call, exact recorded estimate recovered |
| Offline deterministic prune on saved message copy | 13 results; 80.68% message-content reduction; goal + last 20 unchanged |
| Original compositor PNG recovery | 1080×1920; clipped head; 65.625% contiguous lower black canvas |
| Built-app historical before/after captures on isolated copies | PASS; 1/18/35s rendered; original before-1s pixel-identical |
| Built-app current saved-state captures | PASS; 1/18/35s; 62.7–63.9% exact black; head still clipped |
| Two current production-MCP local Qwen diagnostics | Inference PASS; complete-head claim FALSE at auto/high settings |
| Local xterm→production main PTY→installed query/parser reproduction | Live clean; history and late cases contaminate |
| Existing Hermes background-hint function | Skips query successfully |
| Unchanged terminal unit regressions | 7/7 PASS |
| User project JSON digest | Unchanged |
| Paid model/export/full edit | NOT RUN |

The preliminary temporary harnesses had local launch/fixture setup failures that were corrected in temporary files only. Their final successful results above are the accepted diagnostics. The live-window frame request timed out and remains disclosed; no infrastructure fix was added.

### Deterministic approval-stage tests

**Cost/profile**

- Assert profile writes existing model/provider/MCP/permissions/skill settings unchanged and includes only the selected compression keys.
- Restart/refresh profile and verify those keys remain effective without exposing credentials.
- Replay the same trace incrementally at proposed prune boundaries on a disposable session DB: user goal, skill overlay, IDs/current plan, recent results, error/retry pair integrity survive; old transcript remains recoverable through existing cache/context tools.
- Verify no summarizer or auxiliary client is called by deterministic pruning.
- Compare retained bytes/estimated wire tokens and cache-refill sensitivity. Keep provider cache semantics separate from file-cache hits.
- Re-read a selected transcript word window and apply cached captions; no retranscription backend change.
- Verify mutation batches are ordered and a failure/interrupt cannot silently reorder editing calls.

**Vision/evidence**

- Parser cases: “not centered”, “face not visible”, “not well framed”, contradictory prose, absent/unknown fields, incomplete response. None may generate an unsupported positive or confidence assurance.
- Balanced local fixtures: entire head inside with margins; top/head cut; face absent; intentionally letterboxed composition; actual black void; readable caption; clipped caption. Ask neutral questions permitting PASS and FAIL.
- Include this partial-face historic frame. If Qwen still reports the entire head intact, record a perception limitation; do not weaken the assertion.
- Keep same Qwen weights/MLX backend and existing resolutions. Validate any concise structured observations with limits, explicit unknowns, and contradictory-text handling.
- Compare metadata to existing gizmo footprints for translated/scaled/rotated/flipped/anchored/keyframed layers; exercise text auto-fit and glyph-vs-box geometry.
- Confirm optional geometry metadata does not alter PNG bytes, decoder readiness, timeline state, playhead restoration, or ProjectActor mutations.
- Do not put private user media into committed test fixtures; generate synthetic fixtures or reference temporary local material.

**Terminal**

- Real isolated PTY: known background hint avoids OSC11/DA1 theme query; prompt stays clean.
- Live OSC11/DA1 from a deliberate dummy child still receives correct replies. Do not disable all terminal response traffic.
- Remount/replay startup history at an already-active prompt; no unsolicited answerback pollution for the proposed fix path.
- Cover split OSC/CSI chunks, ESC\\ and BEL terminators, DA1 vs DA2, slow opening, delayed IPC, redactor boundaries, and repeated snapshots.
- Verify rapid typing, spaces/arrows/backspace, Unicode, multi-line/bracketed paste, resize, clear/reopen, stale callbacks, sequence dedup, and cancellation preserve previous behavior.
- Secret split-chunk tests remain intact; no credentials in logs/history/renderer output.
- Existing terminal tests must continue passing.

### Focused built-app integration before any real edit

Use an isolated copy of the same project and disposable userData. No paid agent or final export:

1. Prove the effective Hermes profile selects the intended existing model and prune keys on a fresh runtime.
2. Read overview, a bounded transcript window, and timeline context through production MCP; verify authoritative coverage/timing/IDs.
3. Capture representative composed frames and execute a bounded local vision check with correct pixels and conservative evidence fields.
4. Exercise a fresh dummy PTY and remount/replay with production renderer+IPC, not just the focused bridge harness.
5. Confirm no timeline mutation and production frame parity unchanged. If any guardrail would require architecture changes, stop.

### One real user test after separate approval

No credits are added automatically. Confirm provider availability/credit authority first. Keep current GLM/provider, general Hermes, WeftCut skill, source, tools, and realistic bounded budget. Let Hermes decide all creative order. Capture every main/auxiliary call's usage and any prune event; measure net cost, cache hits, elapsed time, tool error recovery, and genuine completion.

The user/benchmark performs one final production export only after editing. Inspect actual frames/audio and judge the resulting MP4, not project JSON or confident assistant statements. Compare especially intact head/face, intentional occupancy/layout, caption proximity/readability/completeness, coherent story/pacing, and restraint. No compulsory workflow or extra reviewer agent.

## WHAT MUST NOT CHANGE

- ProjectActor as sole timeline authority.
- MCP protocol/ownership/authentication architecture.
- Hermes general-agent core, tool permissions, free choice of actions/order, ability to skip/revisit tasks.
- Qwen3-VL-2B as the sole production VLM, external weights, local sidecar and MLX/Metal path.
- Transcript/source cache truth and existing Whisper/backend.
- Compositor seeking/readiness/draw pipeline and export backend.
- Existing editor primitives, transforms, captions, timeline, rough-cut mechanisms.
- Provider/model/credential architecture and current task-management guidance.
- No auto-reframe, face tracking, new renderer, editor, state machine, workflow controller, scheduler, reviewer agent, repair mappings, generic secrets/settings platform, deterministic creative scoring, creator memory, or style learning.

AGENTICNESS: Hermes chooses own next action YES; may skip/reorder/revisit YES; external code chooses creative order NO; mandatory editing pipeline NO; full general Hermes preserved YES.

## ESTIMATED EXPECTED IMPROVEMENT

- **Cost/context:** the final-snapshot no-LLM prune eliminates ~338,549 saved message-content characters (~84.6K characters/4 proxy tokens). Actual GLM wire savings will differ. The largest measured source/track phases add ~104.8K actual request tokens, so material reduction in stale context is plausible. **No validated dollar/percentage cost saving is promised**: cache refill, retained fresh evidence, repeated fetches, auxiliary spend, and future agent choices must be measured. Aim for fewer historical bytes and lower net recorded spend, not only a smaller prompt number.
- **Call efficiency:** model-chosen batching could avoid up to eight clip-placement round trips in this particular trace; no forced batching schedule or guaranteed total-turn reduction.
- **Vision:** V1 should remove demonstrably false parser assurances; V2 can truthfully quantify this canvas occupancy/text geometry. Neither guarantees correct semantic head recognition or a postable edit. The two higher/longer diagnostic answers show why success cannot be claimed from perception-path availability alone.
- **Terminal:** the existing background hint should remove this known startup probe in new Sclip-controlled PTYs. It is a tightly testable hypothesis, not an excuse to ignore remount/live-protocol regressions.

## UNRESOLVED QUESTIONS

1. Which OpenRouter endpoints actually served each call, and what was the account's final invoice? Current pricing and estimates are not billing.
2. Why do cache hits become less complete after call 35? Provider routing/cache TTL vs ephemeral/request-prefix changes cannot be distinguished without historical wire/route telemetry. Do not call all caching broken; aggregate hits are 92.42%.
3. What exact reasoning effort and ephemeral skill bytes were sent historically? Stored base prompt and launch code do not capture the entire wire overlay.
4. Which historical UI lifecycle caused the unsolicited terminal reply—history replay, delayed startup, or another query source? Both reproduced paths explain the payload, but no event/input log proves this incident's timing.
5. How reliably can the same local Qwen report partial-head boundaries using concise structured neutral evidence? Two false positives remain a real limitation. Do not invent confidence, coordinates, or a guaranteed prompt fix.
6. What narrow read-only metadata can be reused without adding renderer/geometry duplication? Confirm existing probe availability before coding V2.
7. What is the net live-session cost after episodic pruning/cache refill, and will the agent re-fetch too much? Offline content savings alone cannot settle it.
8. The user's exact later screenshot and original per-Qwen temporary bytes were not retained. The recovered adjacent original frame, pixel-identical reconstruction, and final production captures establish the visual defect; do not claim all historical PNGs were recovered.
9. A read-only call against the existing live window timed out; isolated built-app captures succeeded. No root cause or transport/compositor change is justified without a focused reproduction.

## DELIVERABLE AND STOP CONDITION

This report is the only intentional repository addition. All candidate fixes remain proposals. Paid LLM calls made in this investigation: **0**. Full benchmarks/exports: **0**. The actual user project remains unchanged.

Recommended implementation is ready for approval **as a bounded test-first plan**, not a claim that semantic vision or final video quality is solved. Wait for user approval before changing production code.

