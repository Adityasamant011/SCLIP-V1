# Phase 4B.2A — Editorial intelligence research

Research date: 2026-10-10. Sclip checkout: `667c522d1ef48cb9fd288e9653f3a6f2a24af699`.

## Conclusion and evidence standard

The best supported next experiment is **a focused, source/render-grounded speech-boundary decision pass by Hermes after initial assembly**. Make the editor compare what the selected opening, closing and relevant joins actually say with the surrounding omitted source, then decide to retain, change or leave uncertain. Existing tools can supply this evidence. This is narrower than building a new story planner or take-ranking system.

This recommendation follows the Manchester trace, not a claim that all Sclip quality problems have the same cause. Its story was coherent; selected speech boundaries and their approval were weak. Actual rendered speech exposed the problem. The source transcript also disagreed with rendered boundary content, so transcription timestamps alone cannot certify a selection.

Evidence grades used below:

- **Implemented:** inspected public code at a pinned revision; not executed or quality-certified here.
- **Documented:** primary engineering account or product specification; proprietary internals remain unknown.
- **Evaluated:** published experiment with stated task and limitations; not automatically transferable to Sclip.
- **Illustrative:** an editorial counterfactual, not an executed benchmark or fabricated professional assessment.

No provider inference, credential inspection, personal creator-history access, app installation or production changes occurred. Public repositories were read, not executed.

## 1. Public editing systems

### Descript / Underlord — documented, proprietary

Descript's engineering account describes one Underlord core across app, API and MCP, with different supervision expectations. The app has selected composition/layer context and permits questions; automation should complete independently. Transcripts for MCP are working context, available before publication, rather than only an export deliverable. This supports timely current-project evidence and explicit operating mode; it does not reveal a proprietary best-take selector. [Engineering account](https://www.descript.com/blog/article/dont-ship-your-api-as-an-mcp).

The vendor/customer case study describes moving from fixed script-chunking workflows to an agent with broad context and low-level tools. Its reported evaluation uses over 100 difficult real-user cases across project safety, intent adherence and quality, with an LLM judge calibrated to human reviewers. Export/conversion metrics and reported model advantages are not independent proof of autonomous publishability. The described product is also a collaborative editor. [Case study](https://claude.com/customers/descript).

A public changelog documents attachable files/scenes/timestamps/layers and an automatic diff review after editing turns for unwanted deletions, missed targets and overcorrection. The implementation, judging model and cost are not public. [Changelog](https://feedback.descript.com/changelog/the-descript-telethon-begins-but-first-releases).

**Sclip implication:** preserve its existing single editor and current-state receipts. Evaluate safety, intent and editorial quality separately. Do not copy an undocumented background judge or assume a technically correct diff is a coherent video. No public evidence here establishes how Underlord compares performances or represents redundant takes internally.

### OpusClip AI Producer — implemented public agent instructions

Inspected revision: `b1a605fa1ace3c2c692572b7b637454b19e741c6`.

The [main skill](https://github.com/opus-pro/ai-producer-plugin/blob/b1a605fa1ace3c2c692572b7b637454b19e741c6/plugins/aip/skills/aip/SKILL.md) separates source ingestion, rough-cut cleanup and locally authored fine-cut work. Cleanup scope is negotiated; it distinguishes failed takes/restarts from fluent content removal. For shortening/highlights, it explicitly protects a complete ending rather than fitting length by truncating the last thought. These are operational instructions, not exposed proprietary clip-ranking algorithms.

However, this revision also prescribes conspicuous visual styles, treatment frequency and geometry, and explicitly stops after delivery without inspecting the resulting preview/output. Those choices are unsuitable as general Sclip policy. Its public workflow is not evidence of a rendered self-correction loop.

Useful narrower mechanisms:

| Public source | Mechanism observed | Transfer boundary |
|---|---|---|
| [Framing skill](https://github.com/opus-pro/ai-producer-plugin/blob/b1a605fa1ace3c2c692572b7b637454b19e741c6/plugins/aip/skills/aip-framing/SKILL.md) | Measures speaker geometry for chosen windows before placement; distinguishes speaker/footage/canvas ownership | Measurement and visibility are useful evidence; prescribed layouts and caption policy are not universal taste |
| [Caption skill](https://github.com/opus-pro/ai-producer-plugin/blob/b1a605fa1ace3c2c692572b7b637454b19e741c6/plugins/aip/skills/aip-dynamic-caption/SKILL.md) | Segment text first, word IDs for chosen emphasis, per-window caption placement and explicit returned geometry | Efficient detail acquisition and word provenance transfer; default captions and automatic emphasis do not |
| [Composition contract](https://github.com/opus-pro/ai-producer-plugin/blob/b1a605fa1ace3c2c692572b7b637454b19e741c6/plugins/aip/skills/aip-composition/SKILL.md) | Source/output timing, one audible speaker, independently editable moment ownership | Clear execution contracts transfer; Sclip already has layers, authored links and ProjectActor |

The separate [opus-skills editing contract](https://github.com/opus-pro/opus-skills/blob/a627553682acd07ce64f3d2772f4dba2b8d511a1/skills/opusclip/references/editing-script.md), revision `a627553682acd07ce64f3d2772f4dba2b8d511a1`, exposes fetch–agent-modify–apply–rerender over tracks/sections/elements. It explicitly separates source offsets from output-relative time and explains coordinated caption/timing edits. Server rendering is charged. Clip/highlight scores exposed by the service are outputs, not a public explanation of how ranking works.

**Sclip implication:** adopt the distinction between selecting useful content and preserving its spoken completion. Do not copy HTML composition architecture, mandatory effects, server inference, or the no-inspection delivery standard.

### FireRed OpenStoryline — implemented pipeline, not proven editorial taste

Inspected revision: `c9e945215586f45c12a61c1951ee9a8e9c43a027`. All six requested nodes and associated speech/filter/group/understanding prompts were inspected.

| Node / pinned source | Actual mechanism | Benefit and limitation |
|---|---|---|
| [speech_rough_cut.py](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/c9e945215586f45c12a61c1951ee9a8e9c43a027/src/open_storyline/nodes/core_nodes/speech_rough_cut.py) | Per-ASR-sentence model call with full text, neighbors and earlier rough-cut text; retained timed spans are grouped and physically cut | Local context matters. Cost grows with sentences, with repeated input. ASR timing is treated as cut evidence; this is not acoustic verification |
| [understand_clips.py](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/c9e945215586f45c12a61c1951ee9a8e9c43a027/src/open_storyline/nodes/core_nodes/understand_clips.py) | Per-source-window visual caption/aesthetic score, bounded retries, then overall summary | Clip IDs preserve a joinable representation. Aesthetic scores and summaries do not establish performance or explanatory value |
| [filter_clips.py](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/c9e945215586f45c12a61c1951ee9a8e9c43a027/src/open_storyline/nodes/core_nodes/filter_clips.py) | Model selects IDs from descriptions and request; malformed selection falls back to all | Selection is distinct from understanding. Caption omissions propagate; fallback may preserve unwanted footage |
| [group_clips.py](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/c9e945215586f45c12a61c1951ee9a8e9c43a027/src/open_storyline/nodes/core_nodes/group_clips.py) | Model outputs ordered groups with summaries; invalid/duplicate IDs are removed; parse failures fall back to original order | A readable intermediate plan helps. Normalization does not guarantee that every selected ID survives |
| [plan_timeline.py](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/c9e945215586f45c12a61c1951ee9a8e9c43a027/src/open_storyline/nodes/core_nodes/plan_timeline.py) | Timing assembly: concatenation without narration/beats, otherwise duration allocation from voiceover/text, music and minimum lengths, with source-window/rate adjustment | The name does not imply an independent semantic planner. Timing heuristics can alter creative content |
| [plan_timeline_pro.py](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/c9e945215586f45c12a61c1951ee9a8e9c43a027/src/open_storyline/nodes/core_nodes/plan_timeline_pro.py) | Deterministic material/text/music duration and speed allocation; special path preserves speech-rough-cut timings | Reuses prior decisions. Not evidence of alternative-performance comparison or rendered semantic review |

The [speech prompt](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/c9e945215586f45c12a61c1951ee9a8e9c43a027/prompts/tasks/speech_rough_cut/zh/system.md) also prescribes later repeated takes; the [group prompt](https://github.com/FireRedTeam/FireRed-OpenStoryline/blob/c9e945215586f45c12a61c1951ee9a8e9c43a027/prompts/tasks/group_clips/en/system.md) supplies default hook/core/vibe/end structure and group-duration expectations. Do not import these as genre-independent judgment.

Static caution: speech-node failure handling is commented as retaining original ASR, but its exception path only records a warning; it does not append the original sentence. This is a source-observed risk, not a reproduced runtime failure. More stages do not prove quality or safe failure behavior.

**Sclip implication:** retain source-linked evidence and explicit model decisions. Do not replace Hermes with independent creative pipeline stages, deterministic timing allocation, forced take selection or a fixed story recipe.

### Eddie AI — useful documented representation, internals unknown

Its public paper-edit workflow describes ordered verbatim soundbites with source/timecode, beat purpose and optional supporting-visual cues before NLE assembly. It claims an exportable rough cut and iteration on choices. Public performance/time-saving examples are vendor illustrations, not reproduced measurements. [Workflow](https://www.heyeddie.ai/blog/how-to-create-paper-edits-from-interviews).

Sclip already records purpose and source ranges. Verbatim selected content and omitted context are the more relevant distinction. Gling/CapCut feature catalogs and Remotion animation demos were not used as evidence of editorial reasoning; they would not resolve the trace's semantic approval failure.

## 2. Professional decisions, not treatment quotas

### What evidence was actually available

The [official Resolve training page](https://www.blackmagicdesign.com/products/davinciresolve/training) provides lesson projects. The [Editor’s Guide 20](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Editors-Guide.pdf) was downloaded and text-read: interview rough/fine editing and alternative-take exercises include catch-up timelines. These are paired **instructional** materials, not an independently reviewed creator publishability dataset. The lesson media/timelines were not downloaded or replayed here.

Other examples below are practitioner accounts or finished-scene breakdowns. No complete 10–30 minute imperfect educational recording, creator's final edit and correction rationale was verified as a paired dataset in this phase. That limits best-take/generalization conclusions.

| Source situation → alternatives | Editorial decision and why | Evidence an AI needs |
|---|---|---|
| **Resolve interview exercise**, printed pp. 33–34: useful soundbite sits inside a longer answer; cut at last word, retain the look-away, or finish speech before the look-away | Keep the meaning and appropriate exit performance, rather than selecting an arbitrary duration | Source speech context plus actual sound/frames around the selected endpoint |
| **Same guide**, pp. 46–48: assembled soundbites touch; tighten further or let them breathe | Allow comprehension time and natural breath; cover picture gaps with relevant B-roll where available | Joined audio, semantics of adjacent points and supplied visual coverage; silence duration alone is insufficient |
| **Same guide**, pp. 166–169: Harper's response has weak delivery and distracting gesture; keep it or audition another take | Compare performance in the surrounding exchange; replace if the alternative serves it better | Candidate audio/video and preceding/following reactions, not word count alone |
| **Practitioner radio-edit account**: a key word sounds hesitant; keep, remove, or compare another delivery | Compare recorded alternatives and their cadence before accepting the splice. The account describes searching alternate occurrences and reviewing waveform/intonation. This is not permission to change a speaker's meaning | Neighboring words, actual alternate audio, semantic fidelity and resulting join. [Account](https://blog.frame.io/2023/10/16/premiere-pro-text-based-editing/) |
| **Interview-story workflow**: a vivid quote begins mid-idea; use as-is, restore setup, or choose a self-contained quote | Choose a complete thought appropriate to the story; preserve needed orientation without necessarily preserving the entire answer | Timecoded source before/after, intended point and actual selected speech. [Practitioner workflow](https://miamivideoservices.net/blog/9863701-editing-interviews-into-story-transcripts-selects-paper-edit-radio-cut/) |
| **The Martian reaction-shot breakdown**, finished-scene evidence: adjacent same-setup lines create an awkward jump; hold original, insert reaction, or use another view | The demonstrated reaction both bridges the join and gives the audience processing/emotional context | Relevant supplied reaction coverage, actual dialogue continuity, surrounding emotional meaning. [Breakdown](https://www.filmeditingpro.com/why-reaction-shots-do-more-than-convey-emotion/) |
| **Mark Toia profile discussed by an editor**, finished-only: talking head throughout versus narrated supporting pictures | The cited film uses voice with meaningful B-roll. This is an alternative visual argument, not a rule to hide every presenter | What each supplied image proves, narration mapping and authenticity; no raw-to-final causality claim. [Editor commentary](https://blog.frame.io/2018/12/03/remain-sane-cutting-mundane/) |

**Illustrative target-domain counterfactual:** three recorded explanations differ: short but omits a condition, clear with a meaningful pause, enthusiastic but technically wrong. A competent choice may be the longer clear version. Hermes needs the complete utterances, question/context, actual delivery where accessible and the brief. No reviewed source establishes a reliable general automatic performance ranker for Sclip; transcript similarity must not silently decide the winner.

For a screen tutorial, showing the actual control/result may resolve comprehension better than decorative captions; holding the result can matter more than shortening a pause. This is an illustrative application of evidence-to-purpose comparison, not a newly researched fixed tutorial recipe. Source OCR/dense screen-state understanding remains a separate capability question.

Review should compare the viewer's received meaning with the intended argument, then audition questionable joins and visuals. Technical measurements answer whether a signal or timeline is legal; they do not answer whether a pause carries emphasis or an ending finishes the thought.

## 3. Technical approaches and transfer limits

Costs below describe work required, not current provider quotes or measurements on Sclip. No models were run.

| Primary method | Evidence / computation / evaluation | Sclip fit and how to verify |
|---|---|---|
| [ChunkyEdit, CHI 2024](https://doi.org/10.1145/3613904.3642667) | Thematic interview chunks, four modeling approaches, paper edits/EDL; evaluated with eight professional editors | Strong target-domain rationale for organizing candidate content. Not proof of autonomous take taste. Existing transcripts/source refs can support a later lightweight experiment; evaluate missed qualifications and human correction burden |
| [VideoTree, CVPR 2025](https://arxiv.org/html/2405.19209v3) | Query-adaptive frame clustering, captioning and coarse-to-fine relevance expansion; long-video QA evaluations | Additional feature/caption/relevance work and query-specific indexing. Sclip already supports bounded coarse observations and targeted queries. Adopt only if missed visual information is demonstrated; QA accuracy is not editing quality |
| [VideoAgent, 2024](https://arxiv.org/abs/2403.10517) | LLM iteratively seeks relevant frames through vision/search tools; long-video QA | Useful evidence acquisition pattern for the existing Hermes, not another agent. Multiple retrieval/VLM rounds cost time. Measure factual coverage per call and whether newly observed facts change a justified decision |
| [QVHighlights / Moment-DETR, 2021](https://arxiv.org/abs/2107.09609) | Query-related moments and saliency annotations; learned multimodal representations predict windows | Requires model/features/training infrastructure for retrieval. Relevance is not standalone completion, performance or story order. Sclip's optional transcript shortlist already addresses part of retrieval; don't add a ranker for a known approval failure |
| [HIVE, EMNLP Industry 2025](https://aclanthology.org/2025.emnlp-industry.185.pdf) | Scene-level multimodal narrative, highlight localization, candidate opening/ending pairs, pruning; DramaAD edited advertising references and human viewing measures | Supports treating boundary choice as its own comparison. Multiple model passes and candidate combinations; paper gives no usable per-Sclip dollar estimate. Drama-ad suspense rules, nonlinear-story limits and remaining human gap prevent direct recipe transfer |
| [Computational dialogue editing, SIGGRAPH 2017](https://graphics.stanford.edu/papers/roughcut/) | Align scripted lines across takes, label framing/sentiment, select via user-specified HMM editing idioms; fast assembly after preprocessing | Transfer the addressable alternatives, not deterministic creative selection. Scripted short scenes differ from rambling explanations; does not establish best vocal performance. Evaluate candidate recall separately from editor choice |
| [WhisperX, Interspeech 2023](https://arxiv.org/abs/2303.00747) | VAD plus forced phoneme alignment improves word timing | Additional local models/compute; Sclip currently parses whisper.cpp token offsets. Alignment cannot decide thought completeness. Consider only if controlled acoustic boundary tests establish timing as dominant; rendered confirmation still matters |
| [Lost in the Middle, TACL](https://arxiv.org/abs/2307.03172) | QA/retrieval position sensitivity in long contexts | Supports compact relevant evidence, not a measured diagnosis of Luna's attention. Compare same model/input with localized evidence; don't infer context failure solely from prompt length |
| [Netflix VMAF](https://github.com/Netflix/vmaf) | Reference-based perceptual distortion assessment | CPU/local technical quality metric, not story/take/pacing assessment. Decode, audio measurements and geometry already address much technical QA; no reason to add it to the first semantic-boundary experiment |

The distinct [2026 VideoAgent preprint](https://arxiv.org/abs/2606.23327) proposes more than thirty specialized editing agents and reports orchestration/human ratings. Only its public abstract was screened here. It is not the 2024 QA method; its multi-agent design conflicts with Sclip's single creative editor and its aggregate claims do not justify replacing the current architecture.

### What the research does not establish

- No public comparator code here proves an autonomous publishable edit from arbitrary imperfect creator footage.
- Highlight retrieval and scene summaries do not resolve editorial necessity or causal explanation.
- ASR punctuation/timing and signal quietness are fallible observations, not semantic completeness or delivery quality.
- More independent planners/critics add cost and contradict the required ownership boundary.
- Professional comparison makes alternatives and received meaning explicit; it does not imply that every clip needs more cuts/effects.

## 4. Engineering decision

Detailed current-code and causal evidence are in [the gap analysis](sclip-editorial-gap-analysis.md). The four-option comparison and the single proposed implementation/evaluation are in [the experiment plan](first-editorial-experiment-plan.md).

**Verdict B — LIKELY BOTTLENECK IDENTIFIED; LIMITED VALIDATION NEEDED.** The trace supports a failure to use semantic boundary evidence, compounded by imperfect source timing. It does not establish a universal raw-footage bottleneck or prove the proposed procedure will change model behavior. Test that narrow mechanism before adding candidate infrastructure.
