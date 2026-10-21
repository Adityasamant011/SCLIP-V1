---
status: accepted
---

# Bound source discovery and reuse exact cached speech before editing

A native editing session spent 31m29s between its prompt and its first actual
rough cut. Small-model frame descriptions were often truncated; unavailable
whole-video analysis and repeated venue-name checks prolonged discovery.
The selected provider also spent substantial output on reasoning. Generic
Hermes tool execution did not enforce Sclip's desired editing progress.

For ordinary native requests, the host bounds source discovery across MCP
reconnects: at most twelve admissions (a six-frame coarse scan costs six), or
forty-five seconds from first discovery, whichever comes first. The first actual
cut/assembly commit permits one focused refinement phase (six admissions, forty-five
seconds); repeated mutations cannot reset it. Cached source reads
also consume the budget: another cheap read still costs a model round trip.
A refusal tells the agent to use available evidence, make a justified requested
assembly, or explain insufficient evidence. The host never chooses cuts, names,
style, or a false completion. Current-timeline verification remains available.
A new accepted user request resets this budget. Existing review budgets remain
independent. Native image fallback has a six-call turn budget and shares the
source-discovery deadline; terminal/frame extraction must not bypass it.

Compact transcript segments may cover up to fifteen minutes in one public call.
The host coalesces bounded native sixty-second cache reads, retains exact text
and source times, removes duplicate boundary observations, and rejects oversized
responses instead of silently dropping segments. Original word-level reads stay
bounded to sixty seconds. This is projection, not generated semantic summary.

Normalize only schema-directed numeric/boolean strings, JSON container strings,
and single-key item wrappers. Existing command validators still enforce bounds,
identity, permissions, and revision state. Do not invent missing fields or parse
comma-separated lists as arrays. An unavailable whole-video backend is advertised
explicitly; frame vision is distinct and no model is silently selected/downloaded.

Native session staging supplies low reasoning effort only when no explicit global
choice exists. Per-model and explicit choices, including disabled reasoning, retain
priority. Models and providers are unchanged. Vision requests ask for concise
answers and legible text first; incomplete or uncertain observations remain such.
Dependent repairs should use the existing atomic repair transaction, followed by
fresh relevant rendered evidence. Quality/completion requirements are retained.

Packaged acceptance must exercise the actual compiled terminal staging function,
not a helper with a similarly named export. This repair is overlaid on the installed
build so unrelated shared-checkout work is not shipped.


For mechanical assembly the existing atomic apply_rough_cut_plan accepts a compact
clips array as an alternative to a full plan. Every media ID, source interval and
order still comes from the agent. Neutral descriptive fields satisfy the existing
plan validator without requiring invented audience/tone/story prose. The original
atomic executor, checkpoint, linked A/V, bounds and rollback semantics are reused.

Whole-output technical verification uses at most eight contiguous production
render/decode windows when the output exceeds the per-render resource bound.
Every window must succeed; proof records exact coverage and an ordered window
manifest digest. It never certifies a prefix or treats a window digest as a final
user export. The per-render and total QA resource limits remain bounded.
