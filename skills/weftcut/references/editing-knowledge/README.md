# Sclip Professional Video Editing Knowledge Base

Purpose: give the Hermes editing agent the editorial judgment of a skilled human editor. These documents are for reasoning, not for rules. They describe what a good editor pays attention to, why, and how to tell a good decision from a bad one in a specific situation.

## How to use these documents

Hermes edits a real timeline from raw footage plus a creative brief. A typical edit decision flows through the documents like this:

1. **Start with the content type.** Open `content-types.md` and read the section matching the footage and brief (talking-head, podcast, UGC, tutorial, vlog, sports, gaming, montage). It sets the defaults: what the audience came for, what "good" looks like, what mistakes are common for that format.
2. **Ground decisions in the universal principles.** `editing-foundations.md` holds the ten cross-cutting principles (attention, clarity, story, rhythm, emotion, continuity, visual hierarchy, audio, coherence, restraint). Each has a structured entry: when it is relevant, what evidence in the footage to examine, what a good decision looks like, the likely mistake, and the exceptions.
3. **Go deep where the decision lives.** Story structure, hooks, pacing: `storytelling-and-pacing.md`. Shot choice, framing, B-roll, text, transitions: `visual-editing.md`. Dialogue, music, sound, silence: `audio-editing.md`.
4. **Check yourself against taste.** Before adding any effect, zoom, transition, caption style, or music cue, consult `editorial-taste.md`. Its core question: does this element serve the viewer's understanding or feeling, or is it decoration? When in doubt, leave the footage alone.
5. **Review the first cut.** Use `editing-review.md` to evaluate your own first assembly before presenting it. It separates objective defects (fix always) from editorial concerns (fix if the brief supports it) from subjective preferences (defer to the creator's style profile, which Sclip learns separately).
6. **Know the failure modes.** `common-ai-editing-failures.md` catalogs the specific ways automated editors produce generic or broken work. Run your plan and your first cut against this list explicitly.

`research-sources.md` is the citation ledger. Every load-bearing claim in the other documents traces to a source listed there.

## Evidence tags

Claims in these documents are tagged by the kind of support behind them:

- **[R]** Research-supported: peer-reviewed studies or systematic professional guidelines (e.g., BBC subtitle guidelines). Citations in `research-sources.md`.
- **[E]** Expert practice: stated methods of working professional editors, creators, or educators (Murch, Kallaway, Hillier-Smith, Film Booth, documentary editors, etc.). These are skilled opinion, not law. Where experts disagree, the documents say so.
- **[S]** Synthesis: our recommendation, built by combining research and expert practice for Hermes' situation. Treat as a reasoned default, not a fact.
- **[I]** Internal product research: findings from Sclip's own user pain research. Useful for prioritization; not external evidence.

## What this knowledge base is NOT

- **Not a rules engine.** It contains almost no numbers. Where numbers exist (subtitle reading speed, frames-per-beat math), they are documented standards or arithmetic, not invented thresholds. There is no "cut every N seconds" rule anywhere in this KB, deliberately.
- **Not a style preset.** It teaches general editing quality. Individual creator style (this creator's caption look, pacing feel, music taste) is learned by Sclip's separate style system. `editorial-taste.md` explains the boundary.
- **Not a pipeline.** The structured entries describe how to reason about one decision at a time, using evidence in the footage. They do not prescribe an order of operations beyond the obvious: understand the material, find the story, assemble, refine, review.

## The one-line version

Every editing choice should be answerable to one question: **what does the viewer understand or feel because of this choice, that they would not without it?** If there is no answer, do not make the choice.
