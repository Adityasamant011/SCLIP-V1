# Common AI Editing Failures: Anti-Patterns and How to Avoid Them

Why automated editors produce generic or broken work. Each entry: what the failure looks like, the underlying editorial mistake, how to recognize it in a plan or a cut, and what to do instead. This document exists because these failures are not random - they are what happens when legitimate techniques are applied mechanically, without the judgment that makes them work.

Context from Sclip's own user research [I]: professional editors' dominant pains with existing AI tools include caption errors requiring manual QC every time, outputs that need so many revision loops that credits and time burn away, and clips that fail the publish bar almost entirely (in one documented case, 2 of 30 AI-generated clips were publishable). Pros consistently ask for transcript-based assembly and a handoff into their NLE, not a black-box replacement. The patterns below are why.

---

## 1. Arbitrary silence removal
**Looks like.** Every pause trimmed to a fixed floor; speech that never breathes; a cut that feels breathless and uncanny.
**Underlying mistake.** Treating silence as waste. In speech, pauses carry meaning: the breath before an answer, the beat after a joke, the hesitation that signals thought. Remove them and you remove the person's thinking [E: ScriptCut cadence warning; Zhou's "emotions take time"].
**Recognize it.** Listen eyes-closed: does the speaker sound like a person or a text-to-speech render? Are there zero pauses longer than your floor?
**Instead.** Remove silence that adds nothing (dead air, setup fumbling, long tech checks). Keep silence that works: before answers, after payoffs, inside emotional beats. Judge each pause by what it does, not by its duration.

## 2. Excessive jump cuts
**Looks like.** A cut every phrase or sentence, regardless of content; twitchy, exhausting playback.
**Underlying mistake.** Confusing "retention editing" with "cutting a lot." Jump cuts are legitimate grammar at thought boundaries; at sub-thought frequency they destroy comprehension and feel like malfunction.
**Recognize it.** Play at full speed: does any cut land mid-thought without covering a mistake? Do you lose the thread when not looking at captions?
**Instead.** Cut at idea boundaries. If the material is one continuous good take, let it run; a single confident take beats five stitched fragments.

## 3. Repetitive zooms (the metronome punch-in)
**Looks like.** A zoom every N seconds with no relationship to content; the single most-recognized "AI edit" tell.
**Underlying mistake.** Applying a pattern interrupt as a timer instead of a signal. A zoom redirects attention toward an important detail or reaction; used mechanically it points at nothing and trains the viewer to ignore it [E/S; signaling research shows cues lose value when overused, R: Mayer boundary conditions].
**Recognize it.** Extract zoom timestamps: regular intervals = guilty. Ask of each: what should the viewer notice because of this zoom?
**Instead.** Zoom when the content calls for emphasis (the key number, the tell on the face, the detail being named). Arrive and hold; do not drift.

## 4. Unrelated B-roll (wallpaper)
**Looks like.** Stock offices, coffee pours, handshakes, city skylines under specific narration; the picture and the words on parallel tracks.
**Underlying mistake.** Filling a B-roll quota instead of answering the narration. The best cutaway shows the thing being said; generic footage actively costs comprehension and credibility [E: editorcuts; R: Mayer temporal contiguity - showing the named thing at the named moment aids understanding].
**Recognize it.** The sentence-pairing test: does this exact shot make this exact sentence more concrete or credible? Swap test: would the same B-roll work under any video on the topic? Then it is wallpaper.
**Instead.** Use the speaker's face (it is often the best content), actual footage of the thing discussed, screen recordings, or nothing. No B-roll beats wrong B-roll.

## 5. Misleading hooks
**Looks like.** An opening that promises what the video does not deliver: the most dramatic frame stripped of context, a claim the content never supports, a fake "you won't believe" setup.
**Underlying mistake.** Optimizing the first seconds in isolation from the whole. The hook is a contract; breaking it costs trust, comments, and returning viewers - and platforms increasingly punish bait [E: Kallaway's lock-in zone requires the post-hook seconds to confirm the claim, not abandon it].
**Recognize it.** State the opening's implied promise in one sentence; find where the video pays it off. No payoff = misleading.
**Instead.** Open with the strongest moment that the video genuinely delivers on. Strong and honest beats stronger and false.

## 6. Losing context
**Looks like.** A clip whose excerpt is technically accurate but incomprehensible or misleading without what surrounded it: an answer without its question, a reaction without its cause, a claim without its qualifier.
**Underlying mistake.** Selecting by local quality (a punchy sentence) without checking what the excerpt inherits from its surroundings.
**Recognize it.** Show the excerpt to someone who has not seen the source (or evaluate it cold): can they tell what is being discussed and what is meant? Does the excerpt change the speaker's apparent meaning?
**Instead.** Include the minimum setup that makes the moment legible - sometimes one prior sentence, sometimes a 2-second establishing beat. Context belongs in the structure, not in overlong clips [E: ScriptCut].

## 7. Unnatural sentence joins
**Looks like.** Frankenbites: sentences assembled from fragments with audible seams - pitch, room tone, energy, or cadence shifting mid-sentence.
**Underlying mistake.** Treating speech as text to rearrange rather than a performance. Beyond sounding wrong, stitching fragments to construct statements the speaker never made is an ethical breach in nonfiction and a legal/reputational risk in commercial work [E: Becker/doc ethics].
**Recognize it.** Listen for seams (tone, pace, room noise). Check the construction against source timecodes: would the speaker agree this is what they said?
**Instead.** Join at natural boundaries (sentence ends, thought ends) or do not join. If the needed sentence does not exist in the footage, it cannot be manufactured - restructure around what exists.

## 8. Poor visual timing
**Looks like.** Cuts in dead stillness when motion was available; cutaways arriving after the thing was named; text appearing after the narration passed; reactions cut too early.
**Underlying mistake.** Scheduling elements by counting (seconds, beats, words) instead of aligning to the content's own events.
**Recognize it.** Check each element against its referent: does the cutaway arrive with the noun? Does the cut land on motion? Does the reaction get its beat? [R: Smith et al. 2012 on motion-masked cuts; R: Mayer temporal contiguity]
**Instead.** Anchor every visual event to the content event it serves: the word, the gesture, the reaction, the musical phrase.

## 9. Unnecessary effects
**Looks like.** Whooshes on every graphic, transitions between every shot, animated captions, stings on every point - the "transition pack" aesthetic.
**Underlying mistake.** Equating production value with element count. Every element spends attention; elements without purpose degrade the work [R: Mayer coherence; E: Steed].
**Recognize it.** The removal test: mentally delete the element. Anything whose removal loses nothing should actually be removed.
**Instead.** Hard cuts by default; one element per justified moment; effects that a viewer would describe as part of the point, not the packaging.

## 10. Captions that overwhelm the frame
**Looks like.** Word-by-word karaoke over the speaker's face; multi-line captions over busy B-roll; text fighting the action for the same seconds.
**Underlying mistake.** Optimizing captions as an engagement device while ignoring them as a comprehension channel. Captions that steal the picture defeat both channels [R/standard: BBC positioning and timing discipline; R: Mayer split attention].
**Recognize it.** Two test viewings: captions-only (complete? timed? unbroken?) and picture-only (did the captions keep stealing your eye at the wrong moments?).
**Instead.** Readable speed (BBC 160-180 wpm guidance), position off the face and product, one text element at a time, style from the creator's profile.

## 11. Cutting on every beat
**Looks like.** Every cut nailed to the grid, dialogue scenes included; the edit feels like it is obeying the song rather than telling the story.
**Underlying mistake.** Outsourcing rhythm to the music's structure. Editors call this lazy: it makes the edit predictable, calls attention to the cuts, and cedes storytelling control [E: Steed; PowerEdit]. Murch's hierarchy puts rhythm third, after emotion and story - the beat is a servant, not the master [E].
**Recognize it.** Mute the music: does the cut still have its own rhythm? Map cut times to beat times: near-100% alignment outside a montage is the tell.
**Instead.** Cut to the content's rhythm; align only the moments (drops, hits, phrase turns) in music-driven sections; under dialogue, align at most to phrase boundaries [E: ToolsForFilm].

## 12. Ignoring the creator's personality
**Looks like.** Output that could belong to anyone: the creator's verbal tics cleaned out, their humor paced like a corporate explainer, their signature elements missing.
**Underlying mistake.** Optimizing to a generic "good edit" average. An unguided process drifts to the mean; the mean is by definition generic [E: the generative "drift toward the mean" critique, applied to editing].
**Recognize it.** The swap test: could this cut belong to a different creator with find-and-replace? Compare against the creator's previous videos: does it feel like their work?
**Instead.** Sclip's style-learning system owns this: apply the creator's learned preferences on top of general quality, and preserve the raw personality signals (their laugh, their cadence, their catchphrases) rather than cleaning them away.

## 13. Over-editing simple footage
**Looks like.** A clean single-take thought chopped into jump cuts, zoomed, captioned word-by-word, scored, and stickered - a 20-second idea wearing a costume.
**Underlying mistake.** Assuming footage needs transformation to be "edited." Often the highest-value edit is selection and light trim: the discipline is in what you do not do (see `editorial-taste.md` Part 4).
**Recognize it.** Compare the edited version against the raw take: what did each intervention add? If the raw take was already clear, engaging, and complete, most interventions subtract.
**Instead.** Match effort to need. A strong take gets: top-and-tail trim, maybe captions, done.

## 14. Template structure on non-template content
**Looks like.** Every video forced through the same skeleton (hook -> three points -> CTA) regardless of content; a tutorial paced like an ad; a memorial clip with hype energy.
**Underlying mistake.** Encoding one content type's grammar as universal. The principles are universal; the defaults are not (see `content-types.md`).
**Recognize it.** Name the content type, then check the plan against that type's section in `content-types.md`. Structure-from-template with no reference to the actual material is the tell.
**Instead.** Derive structure from the material and the brief; use type defaults as starting weights, not a skeleton.

## 15. Confidence without verification (the silent error pipeline)
**Looks like.** Captions with wrong words (transcription errors published unreviewed), clips that miss the actual best moment, exports with black frames or clipped audio - shipped because no step checked its own work.
**Underlying mistake.** No QC loop. In Sclip's user research, caption errors requiring manual QC on every output are a top complaint with existing tools [I]. Objective defects are exactly the class of problem automation should eliminate, not produce.
**Recognize it.** Run the Tier-1 defect checks in `editing-review.md` on every output, every time. Verify captions against the transcript. Watch the export, not the timeline.
**Instead.** Build review into the workflow: first cut -> self-review against the rubric -> fix -> present with notes on what was checked. Pros want a handoff they can trust, not a render they must audit frame by frame [I].

## 16. Inset floating video / Partial screen coverage
**Looks like.** A video scaled down or floating in a corner (e.g. top-right) with giant black voids around it, or an unscaled 1.0x horizontal video inside a vertical frame with massive pillarboxing.
**Underlying mistake.** Forgetting canvas geometry and leaving default 1.0x transforms instead of fitting the composition.
**Recognize it.** Inspect current reviewer geometry and composed frames. Determine whether the empty region or inset was intentional for this brief.
**Instead.** Choose `calculate_video_fit` with `cover`, `contain`, or unchanged framing according to the content and brief. Verify subject visibility and layout in actual composed frames; full canvas coverage alone does not establish quality.

