# Speech-boundary decisions

This reference is activated by the isolated boundary-decision experiment. It is
not a new editing engine. You remain the editor; the current request takes priority.

After assembling footage containing speech, compare the **actual rendered opening
and ending** with relevant omitted source context. Reuse fresh, adequate rendered
evidence already available. Inspect another join only when you have a meaningful
reason to suspect a problem. Non-speech work does not need this procedure.

## Compare evidence, then decide

1. Establish current project/state, participating layers and source ↔ timeline
   mappings. Source time describes original media; timeline time describes the
   composition. Deliberate A/V offsets can be valid: inspect the audible layer's
   mapping rather than assuming video and audio select identical source words.
2. Use `inspect_rendered_audio` for actual resulting speech observations, or reuse
   its fresh receipt covering the boundary. A source transcript, visual frame or
   clean technical critique does not establish what the output says. Local ASR
   is fallible; a transcript is not proof that you personally listened.
3. Use `get_source_speech_context` or existing media/transcript evidence to examine
   the omitted setup or continuation when relevant. Keep requests bounded and
   narrow them if necessary. Preserve disagreements between source timing and
   rendered recognition; do not silently substitute one for the other.
4. Compare the viewer's received meaning with the intended point. Does the opening
   orient the viewer sufficiently? Does the ending complete its intended thought?
   Is an unexplained reference accidental, or intentional for this request?
   Punctuation, word counts, silence thresholds and longer ranges cannot decide.
5. Choose **KEEP**, **CHANGE** or **UNCERTAIN**. Keep coherent boundaries and
   intentional cold opens/discontinuities. Unavailable or contradictory evidence
   may justify uncertainty and targeted investigation, not invented assurance.
6. If changing, choose your own repair, tools, layers and values. Use existing
   issue/checkpoint/revision machinery when applicable; one edit or an explicit
   transaction are both valid. Never assume an audio partner must follow video.
   After the complete repair, inspect fresh relevant audio/speech evidence and
   judge whether it worked, warrants reconsideration/rollback or remains unresolved.

Do not force padding, complete grammatical sentences, longer clips, removal of
pauses, a particular hook or inspection of every cut. Stop within existing review
bounds. A grounded no-repair decision is valid.

## Concise visible record

Emit one short JSON block per examined boundary, fenced as
`sclip-boundary-decision`. Update the same `id` after repair. These are observable
decisions for the creator, not private reasoning. Do not invent missing evidence.

```text
id: your stable label
boundary: opening | ending | join
state_version: current authoritative identity
sources: [{media_id, layer_ids, source_range_us, timeline_range_us}]
evidence_refs: actual receipt IDs or identifiable tool-result references
rendered_speech: actual observation, including recognition uncertainty
omitted_context: relevant source context, none, or unknown
decision: KEEP | CHANGE | UNCERTAIN
reason: brief evidence-grounded justification for the current request
operation: null, or the actual chosen tool name(s) and arguments after execution
post_repair: null, or {state_version, evidence_refs, observation, judgment}
```

Keep the record factual and compact. A CHANGE label is not a committed repair;
fresh observations are not automatically an improvement. Report rejected or
unfinished actions honestly. Do not manufacture tool results to fill the record.

## Alternatives depend on context

- An opening says “This fixes the second problem.” Omitted speech explains two
  problems. You could restore needed context, select a self-contained statement,
  restructure, or keep it if the current visuals already explain the reference.
- A comparison ends before its object. Source ASR may project more words inside
  the range than rendered recognition does. Compare actual output and surrounding
  source; choose a repair or uncertainty rather than trusting nominal timestamps.
- A complete opening needs no change. An intentionally interrupted statement in
  a suspenseful brief can also be appropriate; do not extend it mechanically.
