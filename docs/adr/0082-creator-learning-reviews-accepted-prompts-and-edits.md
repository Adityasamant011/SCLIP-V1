# Creator learning reviews accepted prompts and committed edits

Date: 2026-10-19

## Problem

Canonical creator memory captured manual changes but not ordinary creator prompts
or reactions. Terminal context was staged at startup and usually exposed two
recent observations. No durable record distinguished evidence that was reviewed
from evidence silently ignored. A prior native trial collected repeated
corrections without creating any canonical preference.

## Decision

Keep a single canonical editing-memory store and the foreground Hermes agent.
Do not reactivate the legacy caption clustering provider or automatic background
memory/skill model reviews. General Hermes memory and skills remain available
for non-style facts and procedures.

The authenticated native `pre_llm_call` lifecycle exchanges fresh creator context
on each accepted turn. Accepted text (including short reactions) is recorded as
`user_prompt` evidence, not inferred from terminal keystrokes. Generated completion
and learning checkpoints, child-agent messages and CLI commands are excluded.
Prompt capture is idempotent within bounded replay receipts and isolated by
creator, project, session and generation.

Prompts retain bounded authored composition measurements and preceding agent
proposal details. Agent proposals retain their originating prompt and bounded
before/after facts. Manual corrections retain exact matching proposal provenance;
temporal adjacency is explicitly not proof of creator intent. Agent output never
becomes creator support by itself. Video/audio meanings still require existing
rendered and source inspection tools; measurements are not perception.

`creator_style_memory` now provides:

- `observations`: an initial read establishes fresh bindings; later pages require
  that exact creator/revision. It pages retained prompts, reactions,
  edits, corrections and reference facts across applicable projects, including
  previously reviewed observations. Request relevance is lexical, not semantic
  classification. Detailed evidence remains separately inspectable.
- Hypotheses with optional `lesson_kind`, `rationale` and `applicability` so
  Hermes can synthesize conditional style or mistake-prevention principles.
  Scope, evidence, exceptions, counterexamples and creator controls remain
  authoritative. No count-based confidence promotion is introduced.
- `review`: a reasoned outcome for considered evidence. `learned` requires a
  successful live evidence-linked preference write; alternatives are
  `insufficient`, `project_specific`, `technical_repair` and `not_style`.
  Reviewing ambiguous evidence does not delete it or stop later corroboration.

If a normally completed foreground turn leaves actionable observations pending,
the terminal can submit at most one labelled learning continuation for that user
submission, through the same native conversation. Delivery review has priority;
learning does not close an unverified edit. Cancellation, newer input, creator
changes and terminal closure invalidate queued continuation. No extra creative
edits are authorized. Host admission limits the learning continuation to twelve
canonical memory calls and rejects other MCP tools. The native pre-tool hook
also blocks generic memory/skill writes and external work during that labelled
pass; a genuine next user turn restores ordinary tools. This continuation consumes ordinary foreground model
requests; it is not free background inference.

Historical generic style notes can be explicitly archived with
`archiveLegacyStyleNotes` after reviewing the exact source entries. They remain
`legacy_memory` evidence, never approved taste, and cannot alone support a
hypothesis. Archiving invalidates old creator context and does not itself edit
generic Hermes files. Any local file migration must preserve originals and
verify exact source bytes; no runtime keyword classifier decides which personal
memory to delete.

## Limits and validation

Storage remains bounded (600 recent observations / 2 MB per creator, existing
capsule and proposal budgets). Prompt text is capped at 6,000 characters and
truncation is disclosed. The app does not collect OS-wide activity or silently
import all historical chats. Existing correction evidence is available immediately;
new accepted turns supply prompt evidence going forward. Retention loss is
reported rather than treated as complete history.

There is no deterministic taste extractor, numeric averaging, automatic approval,
or assertion that every repair is an aesthetic preference. Tests must distinguish
capture/retrieval/write validity from an actual native model forming a useful
candidate. Cross-project caption trials cannot certify general pacing, story,
audio or framing quality. Record native outcomes separately from infrastructure
test results.
