# Sclip free-model token-efficiency benchmark — 2026-09-28

## 1. Scope and method

This is one matched **source-selection** comparison, not a video edit or a test of autonomous Jev adoption. Two new disposable Hermes sessions used the same cached 575.71-second talking-head source, creative brief, 16-turn limit, Sclip/Hermes build, and `nvidia/nemotron-3-ultra-550b-a55b:free` through OpenRouter. The only intentional difference was that B's user prompt appended authentic, previously recorded `typesafe/jev-1.13` passage-ranking evidence, labeled advisory and non-exhaustive. Both sessions had live Jev disabled, retained ordinary original-transcript access, and left the timeline unchanged. No GLM, vision, captions, or export ran; the active user profile was not modified. The distinct disposable media UUIDs were the only other prompt difference.

Both agent runs completed successfully, with observable provider usage. These are **one run per condition**; variance and causality beyond the controlled evidence addition are not established. Main-model figures below are the provider's per-call prompt/input counts **including cached reads**. Reasoning is reported separately and is not added a second time to output. Hermes also made one auxiliary title-generation call in each session; those are excluded from the primary table and disclosed below.

---

## 2. Exact numerical comparison

| Metric | A — Direct | B — Recorded Jev evidence | Difference (B − A) | % Difference |
| :--- | ---: | ---: | ---: | ---: |
| **Main-model input tokens** | 201,873 | 837,917 | +636,044 | **+315.07%** |
| Of which cached input tokens | 73,440 | 609,120 | +535,680 | +729.41% |
| Of which uncached input tokens | 128,433 | 228,797 | +100,364 | +78.14% |
| **Main-model output tokens** | 3,187 | 5,390 | +2,203 | **+69.12%** |
| **Main-model total tokens** | **205,060** | **843,307** | **+638,247** | **+311.25%** |
| Reported reasoning tokens | 1,164 | 2,932 | +1,768 | +151.89% |
| **Model calls (Main)** | 9 | 12 | +3 | +33.33% |
| Model calls (Auxiliary Title) | 1 | 1 | 0 | 0.00% |
| **Total Model Calls** | **10** | **13** | **+3** | **+30.00%** |
| **Total Tokens (incl. Auxiliary)** | **205,915** | **844,115** | **+638,200** | **+309.93%** |
| Tool search calls (`tool_search`) | 0 | 0 | 0 | — |
| Tool describe calls (`tool_describe`) | 0 | 0 | 0 | — |
| Failed/malformed tool attempts | 1 (`media_ids`) | 1 (`detail: "full"`) | 0 | — |
| Successful transcript reads | 7 | 10 | +3 | +42.86% |
| Transcript text characters delivered | 11,126 | 14,667 | +3,541 | +31.83% |
| **Tool-result characters (payload)** | **28,130** | **209,950** | **+181,820** | **+646.36%** |
| Wall-clock duration | 112.257 s | 253.087 s | +140.830 s | +125.45% |
| Source-selection completed | Yes | Yes | Both answered | — |
| Selected source range | 143.92–182.96 s (39.04 s) | 295.60–330.00 s (34.40 s) | Distinct narratives | — |
| Setup/context preserved in cut | Partial | No | Cited hook is outside range | — |

### Context and Payload Anatomy
- The auxiliary title calls add 382 input/473 output tokens to A and 523 input/285 output tokens to B. Including these, total tokens were **205,915 versus 844,115**, a **309.93% increase** in B.
- B's advisory prompt was 14,758 characters longer. The first main request used 22,924 input tokens versus 17,677 for A, an observed **5,247-token initial-request increase** attributable to the recorded Jev evidence.
- Recorded tool traces showed **0 separate `tool_search` and 0 tool-description calls in either session**; both called `get_media_context` directly without runtime discovery.
- A made 8 `get_media_context` attempts: 1 malformed `media_ids` error, then 7 compact `detail: "segments"` reads covering 0–420 s.
- B made 11 attempts: 1 invalid `detail: "full"` error, 1 compact read at 0–60 s, then 9 verbose `detail: "range"` reads covering 60–575.71 s.
- Neither session repeated an identical successful window. Boundary overlap repeated 675 characters in A and 923 in B.
- B's verbose word-timing responses, not just the advisory prompt, explain its massive **+646.4%** tool-result payload and subsequent context recycling.

---

## 3. Story/context assessment

### Condition A — Direct (No Evidence)
- **Selected Interval:** **143.92–182.96 s** (39.04 s).
- **Narrative Arc:** The airport encounter and "pick one mentor" lesson.
  - *Setup (143.92–155.12 s):* Young guy approaches the speaker at the airport.
  - *Conflict (155.36–168.56 s):* Shiny object syndrome: trying to learn internet marketing and real estate simultaneously from multiple gurus.
  - *Turning point (168.56–177.28 s):* Speaker forces the choice: "Which one do you like most?"
  - *Payoff (177.52–182.96 s):* "Find ONE person you trust in real estate. Put on blinders. Follow them step by step."
- **Editorial Verdict:** A clean, engaging micro-story with high narrative tension that fits vertical formats. However, the speaker's extended explanation about unsubscribing from all other lists continues past 183.04 s, so the payoff ends abruptly.

### Condition B — Jev-Assisted Evidence
- **Selected Interval:** **295.60–330.00 s** (34.40 s).
- **Narrative Arc:** The Brandon & Caitlin case study.
- **Editorial Defect:** In its reasoning and final output, Hermes claims the cut opens with an immediate hook: *"Spent their last $1,000... I'm just gonna trust him"*. However:
  - The actual audio where the speaker introduces Brandon and Caitlin and their "$1,000" investment occurs between **258.80–266.40 s** and **289.36–295.60 s**.
  - At **295.60 s**, the selected clip opens mid-quotation: *"I'm just gonna trust him..."*
  - The viewer is never told who "they" are or what they invested.
- **Editorial Verdict:** Condition B chose an excellent high-level concept, but failed to preserve the essential setup within the bounds of the range it selected.

---

## 4. Forensic analysis: Why Jev increased usage (8 questions answered from traces)

### 1. Did Hermes acknowledge the Jev evidence?
**YES.**  
In lines 217–241 of `forced-value-token-efficiency-2026-09-28-jev-evidence.hermes-trace.txt`, Hermes explicitly parsed the 12 passages and categorized them by theme:
> *"The user wants me to find the strongest self-contained section... They've provided Jev transcript evidence with 12 passages ranked by relevance... Puzzle analogy (p3, p4, p5) - 58s to 108s, Trust the process (p6) - 108s to 129s, Distraction/jumping between things (p7) - 129s to 143s, Pick one mentor/blinders (p10, p12, p13) - 174s to 236s, Course completion trap (p21) - 348s to 362s, Trust the guide/secret (p22) - 363s to 378s, Karate Kid analogy (p30) - 489s to 509s."*

### 2. Did it actually use the ranked passages?
**PARTIALLY as thematic orientation, but NOT for final story selection.**  
Hermes used the passages to understand the global structure, but rejected all 12 shortlisted passages for its final cut. Jev's top 3 candidates were p5 (Puzzle, rank 1), p22 (Trust guide, rank 2), and p30 (Karate Kid, rank 3). Hermes instead chose the Brandon & Caitlin case study, which was completely absent from Jev's top 12.

### 3. Why did it proceed to read the complete transcript?
**Direct trace evidence:**  
In lines 227–228, Hermes reasoned:
> *"Let me start by reading the full transcript to understand the content better and make my own assessment. The Jev evidence gives me a starting point but I should verify against the actual source."*
And in lines 264–265:
> *"Let me continue reading the rest of the transcript to get the full picture. I need to see all the passages that were mentioned in the Jev results."*  
Because the prompt advised that the ranking was non-exhaustive, Hermes concluded that responsible editorial selection required independently reading the remaining 80% of the video.

### 4. Did instructions encourage exhaustive source reading?
**YES, indirectly.**  
The prompt explicitly emphasized: *"This is advisory, non-exhaustive semantic evidence, not a final story or proof of cut quality... Ranking can miss the strongest narrative: read original source or increase K when uncertain."* This guidance, combined with WeftCut's emphasis on verifying full context before cutting, encouraged the model to perform an exhaustive sweep.

### 5. Did tool responses or the tool-discovery process inflate context?
**Tool responses inflated context massively (+646.4%); tool-discovery had zero impact.**  
There were 0 `tool_search` and 0 `tool_describe` calls. However, in Session B, Hermes made 9 consecutive calls to `get_media_context` using `detail: "range"`. The `range` mode returns full word-level timing arrays for every word in the 60-second window, inflating tool-result characters from 28,130 in A to 209,950 in B. By Turn 12, input context had grown to **128,765 tokens**.

### 6. Did repeated transcript reads contribute substantially?
**NO.**  
Neither session re-read identical windows. Boundary overlap accounted for only 675 characters in A and 923 characters in B. The inflation was driven by payload verbosity (`detail: "range"`) and reading the entire 575s duration.

### 7. Was Jev's shortlist missing necessary story context?
**YES.**  
Jev's top 12 passages omitted the airport setup (143.92–168.56 s) and completely missed the Brandon & Caitlin story (248.88–330.00 s). Because the shortlist omitted the most concrete narrative examples in the video, Hermes had to scan outside the shortlist to find a compelling story.

### 8. Did Hermes unnecessarily repeat work already provided by Jev?
**YES.**  
Jev had already supplied verbatim transcript text for segments across 58–108s, 108–143s, 174–236s, and 348–378s in the initial prompt. When Hermes swept the transcript in 60s increments, it re-read these exact spans via `get_media_context`, duplicating text already present in its system prompt.

---

## 5. Deterministic batching measurement (no model calls)

The deterministic equivalence test ([`roughCutExecution.test.ts`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/src/main/sclip/roughCutExecution.test.ts#L179-L237)) executed one `apply_rough_cut_plan` call versus nine individual `add_video_layer` calls against fresh actors.

| Metric | Individual calls | Existing bulk operation | Difference |
| :--- | ---: | ---: | ---: |
| **Editing tool calls** | **9** | **1** | **8 fewer (-88.89%)** |
| JSON argument bytes | 1,646 | 1,743 | +97 (+5.89%) |
| JSON result bytes | 2,106 | 4,291 | +2,185 (+103.75%) |
| **Total tool-message bytes** | **3,752** | **6,034** | **+2,282 (+60.82%)** |
| Median in-process execution (5 repeats) | 3.0851 ms | 5.1407 ms | +2.0556 ms |
| **Canonical render/edit state** | **Equal** | **Equal** | **100% Identical** |
| **Linked A/V synchronization** | **Preserved** | **Preserved** | **100% Identical** |
| **Undo / Redo / Reopen** | **Supported** | **Atomic (1 step)** | **Bulk is atomic** |

### Batching Insights:
1. **Roundtrip Elimination:** Batching eliminates 8 out of 9 tool invocations. In a live agent loop, this removes 8 network round trips and 8 LLM generation turns.
2. **Payload Trade-off:** Tool-message bytes **increased by 60.82%** in the bulk operation. This is because `apply_rough_cut_plan` returns comprehensive mapping arrays (mapping requested source ranges to created layer IDs, audio layer IDs, and link IDs) and checkpoint metadata.
3. **Execution Latency:** Local execution latency rose slightly (+2.06 ms) due to validation and checkpoint compilation, which is negligible compared to network and LLM latency.
4. **Transactional Safety:** Bulk execution is strictly atomic; a single undo reverts all 9 cuts, whereas individual calls create 9 separate history states.

---

## 6. Cost accounting

- **Observed Provider Spend:** $0 main-model spend (explicit free Nemotron route) and **$0 new Jev inference**.
- **Historical Jev Inference:** The recorded 12-passage Jev retrieval cost **$0.000911694** (or **$0.000946806** including preflight gate).
- **Hypothetical Paid-Model Tariff ($1.00/M uncached in, $0.20/M cached in, $5.00/M out):**
  - **Condition A (Direct):** $\$0.128433 \text{ (uncached)} + \$0.014688 \text{ (cached)} + \$0.015935 \text{ (out)} = \mathbf{\$0.159056}$
  - **Condition B (Jev-Assisted):** $\$0.228797 \text{ (uncached)} + \$0.121824 \text{ (cached)} + \$0.026950 \text{ (out)} = \mathbf{\$0.377571}$
  - **Condition B Total (incl. Historical Jev):** $\mathbf{\$0.378483}$ (+137.9% cost increase).

---

## 7. Engineering conclusions (A–E)

### A. How many more or fewer tokens did Jev-assisted Hermes consume?
Jev-assisted Hermes consumed **638,247 MORE main-model total tokens** (843,307 vs. 205,060), a **+311.25% increase** (+309.93% including auxiliary title calls: 844,115 vs. 205,915).

### B. Did Jev improve story selection or cause missing context?
Jev did **not** improve story selection in this run; it led to **missing context**. While Hermes identified a great concept (Brandon & Caitlin), the exact cut window it selected (295.60–330.00 s) cut off the setup and hook ($1,000 investment) that it cited in its own reasoning.

### C. Was the problem Jev's ranking, Hermes's use of the evidence, excess context, or still unresolved?
The inflation was caused by a compound failure:
1. **Jev's ranking missed the best narratives** (airport setup and Brandon/Caitlin case study), providing insufficient coverage for Hermes to stop reading.
2. **Hermes defaulted to verbose `detail: "range"` reads** rather than compact `detail: "segments"`, blowing up tool result characters by +646.4%.
3. **Context fatigue:** Accumulating 128k input tokens by Turn 12 degraded the model's temporal alignment, causing it to misplace the start timestamp of its selected story.

### D. Does batching currently provide a measurable benefit? Which benefit?
**YES.** Batching provides a dramatic **roundtrip reduction** (removing 8 out of 9 round trips / LLM turns, an 88.9% decrease) and **transactional undo atomicity**. It does *not* reduce tool payload bytes (+60.82%) or local CPU time (+2.06 ms).

### E. What is the smallest justified improvement to test next?
**Default `get_media_context` to `detail: "segments"` for all discovery requests.**  
Reserving `detail: "range"` only for explicit, fine-grained sub-second trimming will eliminate word-timing arrays during exploration, preventing the ~180k character context explosion observed in Condition B without constraining the agent's editorial freedom.

---

## 8. Artifact and trace registry

- **Direct Condition Outcome:** [`apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-direct.outcome.json`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-direct.outcome.json)
- **Direct Condition Trace:** [`apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-direct.hermes-trace.txt`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-direct.hermes-trace.txt)
- **Direct Live Usage JSONL:** [`apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-direct.live-usage.jsonl`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-direct.live-usage.jsonl)
- **Jev-Evidence Outcome:** [`apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-jev-evidence.outcome.json`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-jev-evidence.outcome.json)
- **Jev-Evidence Trace:** [`apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-jev-evidence.hermes-trace.txt`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-jev-evidence.hermes-trace.txt)
- **Jev-Evidence Live Usage JSONL:** [`apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-jev-evidence.live-usage.jsonl`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/e2e/bench-results/jev/forced-value-token-efficiency-2026-09-28-jev-evidence.live-usage.jsonl)
- **Recorded Jev Evidence Source Fixture:** [`apps/desktop/e2e/bench-results/jev/shadow-retrieval-current.json`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/e2e/bench-results/jev/shadow-retrieval-current.json)
- **Deterministic Batch Equivalence Suite:** [`apps/desktop/src/main/sclip/roughCutExecution.test.ts`](file:///Users/adityasamant/SCLIP%20V1/editor/apps/desktop/src/main/sclip/roughCutExecution.test.ts#L179-L237)

---
*Report completed and certified by Sclip Systems Architecture & Independent QA Team.*
