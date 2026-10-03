# Audio Editing: Dialogue, Music, Sound Design, Silence, Mixing

Audio is not a finishing pass. Viewers forgive soft focus; they do not forgive muddy sound, and music alone can change what a scene means. This document covers how editors decide with sound.

---

## Part 1: Dialogue

### Principle: Dialogue intelligibility outranks everything else in the mix
**Purpose.** If the words cannot be understood effortlessly, nothing else matters.
**When relevant.** Every project with speech.
**Evidence to examine.** Can every sentence be understood on laptop speakers and a phone, at first pass, by someone who does not know the content?
**Good decision.** Clean the dialogue first (noise, level rides, de-essing as needed); keep music and effects ducked under speech; when in doubt, favor the voice. Loudness targets depend on platform - measure against the platform's normalization rather than maximizing volume [E/S; platform practice].
**Potential mistake.** Music competing with speech at the same frequencies; effects (whooshes, stings) masking consonants; room noise changing audibly at every cut.
**Exceptions.** Intentional overwhelm moments (a crowd roar swallowing the words for effect) - rare, deliberate, brief.
**How to evaluate.** The phone test: play the edit on a phone speaker in a mildly noisy room. Any sentence that requires replay is a defect.

### Principle: Cut dialogue on speech rhythm, and keep the breaths that carry meaning
**Purpose.** Natural speech has cadence: pauses, hesitations, emphasis, breath. Over-trimming destroys it; under-trimming bores.
**When relevant.** All spoken content; interviews and podcasts most critically.
**Evidence to examine.** Where are the rhetorical beats: the pause before the answer, the breath before the emotional statement, the laugh, the restart that adds character?
**Good decision.** Remove filler that adds nothing; keep pauses that add weight. A documentary subject stripped of every hesitation reads as scripted, and audiences distrust scripted in nonfiction [E: ScriptCut]. Cutting between speakers: the rhythm of conversation includes its gaps; a pause before a response can be the most eloquent part of the exchange.
**Potential mistake.** "Silence removal" that cuts every gap to a fixed floor: the result is breathless, uncanny speech with no thought in it (see `common-ai-editing-failures.md`). Also: cutting a response's first syllable by trimming too tight to the waveform start.
**Exceptions.** High-energy short-form tolerates (even wants) tighter-than-natural speech; even there, keep the pauses that land jokes and points.
**How to evaluate.** Listen with eyes closed: does the person sound like a person? Does any cut clip a word, a breath onset, or a laugh?

### Principle: Delivery pace shapes perception - respect it, don't normalize it
**Purpose.** Speed and enthusiasm are signals, not defects.
**When relevant.** Trimming talking-head, educational, and interview material; deciding how aggressively to tighten.
**Evidence to examine.** At scale (6.9M edX sessions), faster, more enthusiastic speech correlated with higher engagement - the study explicitly advises against coaching speakers to slow down [R: Guo, Kim & Rubin 2014]. One small experiment (n=75 students) found fast, fluent delivery raised perceived trustworthiness and persuasiveness vs. slow, hesitant delivery [R: Yokoyama & Daibo 2012 - single small study, directional only].
**Good decision.** Remove hesitation and redundancy; keep the speaker's natural tempo and energy. Slow, hesitant delivery usually needs better selects, not faster playback.
**Potential mistake.** Treating fast speech as a flaw to correct, or normalizing all speakers to one pace - you flatten the very energy the engagement data rewards.
**Exceptions.** When clarity is at risk (dense technical content, non-native audience), comprehension wins over pace - see the cognitive-load principle in `editing-foundations.md`.
**How to evaluate.** Does the tightened cut preserve the speaker's characteristic tempo? Would a listener describe the person as energetic or as rushed?

### Principle: Preserve meaning; never manufacture it
**Purpose.** Compression is normal; construction is an ethical line.
**When relevant.** Any edit of someone's speech, especially interviews and testimonials.
**Evidence to examine.** Does the edited sentence say what the speaker meant in context?
**Good decision.** Trim a rambling answer to its clearest sentence; reorder answers for structure when the meaning survives; keep the edit traceable to source timecodes [E: ScriptCut/professional doc ethics].
**Potential mistake.** The Frankenbite: stitching fragments from different answers into a sentence the subject never said. Editing researcher Manfred Becker's line: using the tool to clarify what someone meant is defensible; using it to make them say something they did not mean breaks the documentary's contract with subject and audience [E: Becker via ScriptCut]. In commercial work the same act is a legal and reputational risk.
**Exceptions.** None for deceptive construction in nonfiction. Clearly signaled satire or obvious remix is a different genre.
**How to evaluate.** For each constructed sentence: would the speaker agree this is what they said? Check the source timecodes.

---

## Part 2: J-cuts, L-cuts, and sound bridges

### Principle: Let audio lead or lag the picture to make cuts flow
**Purpose.** Split edits (J-cut: next scene's audio arrives before its picture; L-cut: current audio continues over the next picture) soften transitions and manipulate flow.
**When relevant.** Scene changes, dialogue scenes, any cut that feels abrupt or staccato.
**Evidence to examine.** Does the cut jar? Is there a sound connection between the scenes? Is a reaction more valuable than the speaker's face for a beat?
**Good decision.** J-cut to create anticipation or urgency (hear the next scene before we see it); L-cut to linger on reactions, to show a scene's effect on the next, or to smooth dialogue coverage [E: Adobe]. Sound bridges connect scenes by sound type: dialogue bridges (a line connecting to the prior image - Parasite's peach allergy), effect bridges (the incoming sound raises a question - The Matrix alarm clock), music bridges (score carries momentum across the cut - Reservoir Dogs) [E: StudioBinder].
**Potential mistake.** Using a bridge on every transition, which flattens them (StudioBinder: audio bridges should be intentional; overuse makes them ineffective) [E].
**Exceptions.** Hard audio cuts are themselves a tool: cutting music dead at a scene break is a punctuation mark.
**How to evaluate.** Play each scene transition: is the join smooth where it should flow and hard where it should punctuate?

---

## Part 3: Music

### Principle: Music is an interpretation, not a decoration
**Purpose.** The soundtrack tells the viewer how to feel about what they see. Choosing it is a narrative decision.
**When relevant.** Every music cue.
**Evidence to examine.** What does this scene mean, and what should the viewer feel? What does the candidate track do to that meaning?
**Good decision.** Research: the same scene with different soundtracks produces different plot interpretations, different anticipated outcomes, and different character judgments; viewers read a character's emotions through the music's emotion; even the loudness of the same piece can shift interpretation more than changing the piece [R: film-music studies, reviewed in "Influence of Music on Perceived Emotions in Film"]. So audition multiple tracks against the actual cut and notice how each changes the feeling of the same material [E: Steed Films; Hillier-Smith's music-first workflow: choose music early and let it shape the edit's emotional map, "the difference between comedy and horror is the music"].
**Potential mistake.** Choosing music by genre label or energy level alone ("upbeat corporate") without testing it against the scene; or letting a licensed track's own structure dictate the cut (see beat-cutting below).
**Exceptions.** Music-driven formats (music videos, some montages) legitimately put the track first.
**How to evaluate.** Watch the scene with two or three candidate tracks. If they produce the same feeling, the choice is low-stakes; if different, the difference IS the decision. Also: does the edit survive with music muted? If not, the story is weak [E: Steed].

### Principle: Cut to the beat deliberately, rarely, and with a reason
**Purpose.** Beat alignment is a strong effect that becomes a crutch. The debate in professional circles is real; both sides are documented here.
**When relevant.** Any music-backed sequence with cutting.
**Evidence to examine.** Is music the primary rhythmic driver here (montage, action, sports reel, music video) or the underscore (dialogue, explanation, emotion)?
**Good decision.**
- Under dialogue and underscore: cut on speech rhythm and reaction beats; let music support, not dictate. A defensible middle ground: align B-roll changes to musical *phrases* (bar boundaries) for subliminal coherence while the dialogue drives the actual cuts [E: ToolsForFilm's documentary scenario].
- In montage/action where beat-sync is intended: do it properly. Frame-accurate beat math (frames per beat = frame rate / BPM x 60; non-integer values accumulate drift - at 128 BPM/24fps a beat is 11.25 frames and error compounds to over half a second across 64 beats) - use beat detection or a computed cut list, then adjust individual cuts by 1-3 frames for image content [E: ToolsForFilm].
- Hold slow moments: cutting every beat in a quiet or emotional scene fights the music; cut every 2-4 beats (on the bar) so images have time to register [E: ToolsForFilm].
**Potential mistake.** Placing every cut exactly on every beat by default: it calls attention to the edit, becomes predictable, and lets someone else's song structure dictate your story [E: PowerEdit; Steed Films]. PowerEdit's framing: an edit point exactly on a noticeable beat makes the audience notice the edit - so ask whether you want the edit noticed. Usually no; sometimes yes (his cornfield example: when the subject is inherently static, visible rhythmic cutting can manufacture energy - a conscious trade).
**Exceptions.** Music videos, sports reels, and gaming montages have a higher tolerance for beat-sync; genre audiences expect it. Even there, sync the *moments* (drops, hits) rather than every beat [E: DOR gaming workflow - match the strongest scene to the drop].
**How to evaluate.** Mute-and-watch: does the cut have its own rhythm? Unmute: do the musical accents land on the story's accents? Is any section a metronome?

### Principle: Tension and release live in the music arc
**Purpose.** Music should trace the same wave as the edit's pacing (see storytelling-and-pacing.md).
**When relevant.** Any sequence longer than a minute.
**Evidence to examine.** Where does the track build, drop, rest? Where does the story build, pay off, rest?
**Good decision.** Map story beats to musical structure: build under rising tension, release at the payoff, strip back for intimacy. Hillier-Smith: establish a musical language, let the audience settle into it, then take it away for effect (the Civil War less-is-more example) [E].
**Potential mistake.** Wall-to-wall music at one energy: no contrast left. Also: dropping a high-energy track under a quiet scene "to give it energy" - it gives it anxiety instead [S].
**Exceptions.** Ambient and lo-fi formats hold one texture deliberately.
**How to evaluate.** Graph music intensity against story intensity section by section: correlated, with intentional exceptions?

### Principle: Silence is a sound choice
**Purpose.** Removing music and effects focuses attention and resets the ear; silence before a moment amplifies it.
**When relevant.** Before payoffs, during intimate or shocking moments, at transitions that need punctuation.
**Evidence to examine.** What would happen if everything stopped here for a second?
**Good decision.** Cut music dead at a reveal; hold room tone only under a raw emotional admission; use near-silence to make the next sound enormous.
**Potential mistake.** Fear of silence: filling every gap with music so no moment ever lands differently from any other.
**Exceptions.** -
**How to evaluate.** Where does the edit go quiet, and is that the right place?

---

## Part 4: Sound effects and design

### Principle: Effects confirm reality or punctuate story beats - not both at random
**Purpose.** Sound design grounds the picture (doors, footsteps, keyboard) and adds emphasis (hits, whooshes, risers) - each must be motivated.
**When relevant.** Product videos, sports, action, any moment needing weight.
**Evidence to examine.** What on screen makes sound? What story beat needs punctuation?
**Good decision.** Real-world sounds for physical actions, timed exactly; design accents reserved for genuine beats (a reveal, a score, a transition). Schiffer's product work builds feel through careful sound design layered onto deliberate picture moves [E]. Sports editors boost crowd noise at peak moments and pull it down under commentary - the mix follows the story [E: wearemob].
**Potential mistake.** A whoosh on every graphic, a riser before every cut, bass drops on every logo: sonic wallpaper that turns to noise and dates the piece.
**Exceptions.** Stylized content (comedy edits, meme formats) uses exaggerated SFX as the joke.
**How to evaluate.** List every non-dialogue, non-music sound: reality (what made it?) or accent (what beat does it mark?). Delete anything with no answer.

### Principle: Sound choices derive from the intended emotion - a copied effect is a dead one
**Purpose.** Sound design manipulates emotion through specific, studied acoustic mechanisms - and only works when it is motivated.
**When relevant.** Anywhere tension, dread, or discomfort is the goal; trailers and promos most of all.
**Evidence to examine.** Fear has a specific acoustic signature: horror scores over-use harsh, nonlinear sounds (scream-like roughness, noise sidebands) that mimic distress vocalizations; drama suppresses them [R: Blumstein et al. 2010; Trevor et al. 2020]. The Diary of a CEO trailers made a metallic riser famous; its creator (Anthony Smith, former DOAC Director of Trailers) chose it deliberately to create discomfort, then stopped using it once other creators copied it indiscriminately. His whole approach: derive sound from what the audience should feel, never from what another show's trailer did [E: Anthony Smith interview].
**Good decision.** Name the emotion first, then choose or build sounds that produce it; retire a signature sound when it becomes wallpaper.
**Potential mistake.** Importing another production's signature sounds (risers, braams, booms) as genre decoration - Smith's example of a gardening podcast borrowing DOAC's dramatic sound design.
**Exceptions.** Parody and homage quote sounds deliberately.
**How to evaluate.** For each designed sound: what is it meant to make the viewer feel? If the answer is "that's what videos like this use," rethink it.

### Principle: Ambience is continuity
**Purpose.** Room tone and environmental sound glue cuts together; its absence or mismatch is felt even when unnoticed.
**When relevant.** Every scene with location sound; every cut between locations or takes.
**Evidence to examine.** Does the background sound match across adjacent shots? Does ambience change at scene changes?
**Good decision.** Keep consistent room tone under dialogue edits (patch gaps); change ambience deliberately at scene changes to reorient the viewer's ear.
**Potential mistake.** Dead-silent gaps where a cut removed the room tone (the edit "breathes" audibly); a bird-filled exterior ambience continuing under an interior shot.
**Exceptions.** -
**How to evaluate.** Headphones on, eyes closed: any audible steps or holes at cut points?

---

## Part 5: Mixing and transitions

### Principle: The mix serves the story's attention, moment to moment
**Purpose.** Levels decide what the ear attends to: voice, music, effect, crowd.
**When relevant.** Final balance of any project.
**Evidence to examine.** At each moment, what should dominate? Does it?
**Good decision.** Duck music under dialogue (sidechain or manual rides); let music swell in the gaps; push effects only at their beats. Balance is dynamic, not set-and-forget [E: standard mixing practice; wearemob's crowd/commentary example].
**Potential mistake.** A static music bed at one level under everything (muddies quiet scenes, fights loud ones); effects louder than the content they punctuate.
**Exceptions.** -
**How to evaluate.** Solo-listen pass per element, then full mix on two devices (headphones, phone speaker).

### Principle: Audio transitions should match the picture's emotional join
**Purpose.** A technically smooth crossfade can still be emotionally wrong.
**When relevant.** Every scene change with continuous audio.
**Evidence to examine.** What is the emotional relationship between these two scenes - continuation, contrast, rupture?
**Good decision.** Continuation: bridge or crossfade. Contrast: hard cut or a deliberate clash. Rupture: cut all audio dead for a beat. The technique follows the intended feeling, not the other way round [S, from professional practice].
**Potential mistake.** Defaulting to a 12-frame crossfade everywhere: gentle where the story wanted a slam, and vice versa.
**Exceptions.** -
**How to evaluate.** For each audio transition: does its softness/hardness match what the story does at that point?
