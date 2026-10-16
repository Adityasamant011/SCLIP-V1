# SCLIP caption alignment: measurements and recommendation — 2026-10-15

## Decision

Keep Whisper.cpp as primary ASR. Do not integrate an additional alignment model yet. The isolated English acoustic aligner is feasible and provides much more complete word-boundary coverage, but absolute accuracy superiority has NOT been established: there are no independent human word-boundary labels for these clips. CapCut parity is NOT tested. No guessed accuracy percentage is reported.

First address timing semantics and the unsupported cached-retimed-clip path. Preserve the mixed-timing text coverage repair. If a blinded comparison establishes a meaningful accuracy gain, the smallest subsequent architecture is an optional local alignment step over the unchanged Whisper transcript and identical decoded PCM, feeding the existing caption/ProjectActor path. No replacement ASR, timeline writer, renderer or creative agent is justified by this experiment.

## Scope and preservation

English speech fixtures: the original 186.683333-second TikTok project (`Documents/1/99`, original media duration metadata 186.675374 s), existing authorized tutorial first 34.95825 s, and existing Kokoro speech 4.7146875 s. TikTok decoded benchmark PCM is 186.642 s; media/container duration and decoded sample count are distinct. All methods for a case received the exact same 16 kHz mono PCM. Original sources and original project are read only, hash checked before/after. No hosted requests and no media upload. Native Hermes was not invoked: this is a speech/timing benchmark, not a creative-editing trial.

No production implementation, installed app, model configuration, dependency lock, creator memory, Git baseline/tag/stash or existing uncommitted repair was changed. A separate Python 3.11 venv and model cache exist ONLY under this evidence directory. Full original tracked diff and production/app pins match the start of the experiment (`preservation-check.json`). New report/ledger documentation is added after that check. No commit/tag.

## Current code path

1. `native/src/speech/backends/whisper_cpp.rs` drives the configured Whisper CLI using `-ojf` for word timing, `-osrt` otherwise. The current configured binary/model are the existing Homebrew CLI and `WeftCut/models/ggml-base.bin`; hashes are recorded. Production word-timing arguments do NOT enable DTW.
2. `speech/parse/whisper_json.rs` reads token offsets in milliseconds and multiplies by 1,000 for microseconds. It groups subword tokens into words. `t_dtw` is not deserialized/consumed. The enum name `exact` means direct engine token offsets; it is NOT independently verified acoustic truth or sample accuracy.
3. `speech/transcript.rs` bounds-checks recognition. A single unusable word span can clear a whole segment's words while retaining its complete text; adjustments retain original words and reason. A timing adjustment downgrades the transcript-level precision. Cached observations are source-relative; slicing and native transcribe mapping shift the requested window into source/timeline coordinates.
4. The GUI auto-caption flow (`renderer/speech/transcribeRun.ts`) gets structured transcripts and applies them through the existing single ProjectActor transaction. Native clip-audio selection refuses speed != 1 for VideoClip. No claim is made that complete paired audio/video retiming is supported.
5. The separate cached MCP/hybrid path in `state/hybrids.ts` maps `timeline = layer_start + (source - src_in)`, clamps to clip range, preserves complete word arrays per segment, and falls back to complete segment text when timing is unusable. Long untimed segments receive equal-duration word estimates; these are marked interpolated, never exact. It currently lacks the native retimed-clip refusal/rate mapping.
6. Phrase construction groups approximately 3–5 words with punctuation/pause rules. Cue tails may extend by up to 150 ms for readability. ProjectActor creates Text layers and stores relative word timing/provenance. Text rendering shows the whole phrase; it does not consume word metadata as automatic karaoke highlighting.

This distinction matters: in the actual TikTok project, all 351 words remain in 88 cues, but 47 words across 3 invalid-timing segments are estimated. There are 76 cues tagged `none` and 12 tagged `interpolated_from_cue`; the transcript-wide downgrade means the 76 `none` cues can still retain direct token word arrays. Do not equate those tags with independent accuracy. Because the phrase is shown together, individual words are visible a median 570 ms before their own stored word-start times; 237/351 have >250 ms of such phrase-display lead. This is display design, not a measured ASR error.

## Same-text baseline versus acoustic alignment

The frozen current transcript text is retained verbatim. For each reference segment, the benchmark computes Wav2Vec2 CTC emissions over the same audio window, uses forced CTC alignment against that text, and maps character spans back to the original displayed words. No ASR hypothesis is substituted. Unsupported numeric-only words remain present with null alignment and an explicit reason. The method is a WhisperX-style acoustic post-alignment experiment, NOT the full WhisperX ASR/VAD/diarization stack.

| Clip | Reference words | Words requiring current fallback | CTC words timed | Start disagreement median / p95 | End disagreement median / p95 |
|---|---:|---:|---:|---:|---:|
| tiktok | 351 | 47 | 349 | 409 / 1252 ms | 349 / 1645 ms |
| kokoro | 14 | 0 | 14 | 49 / 255 ms | 103 / 443 ms |
| tutorial | 161 | 140 | 160 | 156 / 1662 ms | 141 / 1358 ms |

These are absolute DIFFERENCES BETWEEN ESTIMATORS, NOT word-start/end errors against ground truth. TikTok missing CTC words are `10` and `48`; tutorial missing word is `20`. Full text is preserved in every aligned result. The rendered TikTok candidate retains all 351 words/88 cues and uses original timing for the two unresolved words, explicitly recorded in `candidate-word-provenance.json`. Candidate caption payloads use `word_timing: none`, not forged `exact` provenance. ASR transcription correctness and whether all real utterances were recognized are separate, not independently certified by a text-preservation check.

## DTW comparison and identical-transcript control

The existing binary successfully emits DTW attention points with `-dtw base -nfa`; disabling flash attention is required for this mode. Upstream describes `t_dtw` as roughly the token emission moment, not a word onset/offset pair. Reading it as both start and end would be incorrect. A simplistic next-point endpoint inference is retained only as an explicitly estimated diagnostic in the comparison files, not proposed production behavior. [Whisper.cpp CLI serialization](https://github.com/ggml-org/whisper.cpp/blob/v1.9.1/examples/cli/cli.cpp), [token data definition](https://github.com/ggml-org/whisper.cpp/blob/master/include/whisper.h).

Independent DTW and default decoding changed some words/segment boundaries on real clips (TikTok 351 vs 350 words; tutorial 161 vs 160). That comparison alone would confound recognition with alignment. Therefore a second, stricter experiment supplies each DTW run's exact decoded segment text and identical PCM to the acoustic aligner. Exact text and word sequence equality PASS for all three cases. See `strict-fixed-transcript-dtw-comparison.json` and `*-dtw-fixed-{reference,aligned}.json`.

- tiktok: 350 identical input words; 348 acoustic alignments; median DTW-point/CTC-onset disagreement 117 ms, p95 433 ms. Still not an independently measured error.
- tutorial: 160 identical input words; 159 acoustic alignments; median DTW-point/CTC-onset disagreement 82 ms, p95 324 ms. Still not an independently measured error.
- kokoro: 14 identical input words; 14 acoustic alignments; median DTW-point/CTC-onset disagreement 205 ms, p95 348 ms. Still not an independently measured error.

No independent reference exists to rank these attention points or derived endpoints against actual word starts/ends. DTW is not a free, already-consumed improvement in the current app; it needs a justified boundary interpretation, provenance and evaluation.

## Runtime, memory, languages, license and packaging

Controlled method settings: existing base Whisper model; CPU (`-ng`), default CLI threads, English; acoustic model CPU/4 threads and original segment windows, no padding. Single-pass wall times are illustrative; compilation/download are excluded, and some independent worker activity overlapped the initial runtime pass. They are not a statistically controlled performance ranking. Separate workers provide per-Whisper-run RSS. Acoustic memory is whole-process high-water mark across the case sequence, not a per-case incremental allocation.

| Clip | Default Whisper wall / peak RSS | Whisper DTW wall / peak RSS | Extra acoustic alignment time after ASR |
|---|---:|---:|---:|
| tiktok | 22.13 s / 546 MB | 19.04 s / 629 MB | +16.27 s |
| tutorial | 8.70 s / 477 MB | 10.84 s / 587 MB | +1.31 s |
| kokoro | 2.02 s / 315 MB | 1.53 s / 390 MB | +0.16 s |

Acoustic process peak is approximately 1.28 GB in the original-text run and 1.41 GB in the strict DTW-text run. Model load about 0.72–0.74 s; the strict TikTok-text warm alignment took 9.47 s. These are additional costs after transcription, not replacement ASR costs. Weights: 377,664,473 bytes, observed SHA-256 `488fd4f16de84438ffc945334278c1b9fb9b7159a806c1080b16111a958c945d`. Disposable environment ~565 MiB plus ~360 MiB model cache; neither is bundled into Sclip. `requirements-frozen.txt` records actual experimental dependencies.

- Existing Whisper.cpp/Whisper base is multilingual, with language-specific accuracy not measured here. DTW reuses the same Whisper weights and needs matching attention-head preset; this experiment is English/base only.
- Tested acoustic bundle `WAV2VEC2_ASR_BASE_960H` is English-specific. WhisperX chooses language-specific alignment models and can fail if none is configured; its supported-language registry is not proof of equal quality or identical licensing. No new language was certified. [WhisperX alignment source](https://github.com/m-bain/whisperX/blob/main/whisperx/alignment.py).
- TorchAudio explicitly redistributes the tested English weights under MIT. WhisperX code is BSD-2-Clause; its code license does not automatically license every model/dependency. Existing Whisper.cpp remains MIT. Other language-model redistribution must be checked separately. [Tested model license](https://docs.pytorch.org/audio/2.8.0/generated/torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H.html), [WhisperX license](https://github.com/m-bain/whisperX/blob/main/LICENSE), [Whisper.cpp license](https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE).
- Python 3.11 arm64, torch 2.8.0 and torchaudio 2.8.0 wheels successfully ran locally on this Mac. Public wheel metadata and observed model hash are retained. This is local compatibility proof, NOT packaged/clean-machine acceptance.
- TorchAudio's forced-align APIs were deprecated in 2.8 and removed in 2.9. Pinning this benchmark is intentional, not a production dependency recommendation. A future production proposal needs a maintained alignment implementation/runtime, integrity-checked provisioning, cancellation ownership, offline readiness and packaged tests. Do not inject packages into the immutable bundled Hermes Python or existing local-model environment. [Upstream deprecation](https://docs.pytorch.org/audio/stable/tutorials/ctc_forced_alignment_api_tutorial.html).

## Mapping tests and failures

The diagnostic calls the real ProjectActor and cached caption hybrid; it is stored outside normal source/CI discovery.

- Normal source clock, timeline offset, trimmed source+offset, and actual split/right fragment: PASS, zero start/end mapping error in these controlled cases.
- Cached application on 2x VideoClip: FAIL. A source word [2.0,2.5] s is authored at [2.0,2.5] instead of the rate-mapped [1.0,1.25] s: +1,000/+1,250 ms mathematical discrepancy.
- Cached application on 0.5x: FAIL. Same word authored at [2.0,2.5] instead of [4.0,5.0]: −2,000/−2,500 ms.

These are mathematical mapping/unsupported-operation failures, not proof of a fully retimed A/V playback workflow: native transcription already refuses speed != 1, and coherent paired-audio retiming is not certified here. The smallest safe first repair is to make cached application honor that same refusal, or implement the source/audio clock mapping only after its actual playback contract is verified. Do NOT blindly divide caption times by video speed while paired audio may still be at normal rate.

Final diagnostic: 4 PASS / 2 FAIL, intentionally preserved as observed failures (`mapping-correct-contract.log`, `mapping-results.json`). Existing caption preservation/mutation regressions: 40 PASS in 2 files. No production code was changed to make tests green. No broad/Rust rebuild is claimed.

## Actual exported video and audio

Six H.264/AAC videos exported through `/Applications/Sclip.app`'s live compositor, 1080x1920, 60 fps: original and experimental captions at [0,12], [80,92], [166,178] seconds. All six full decodes PASS. See `baseline-{0,80,166}.mp4` and `ctc-candidate-{0,80,166}.mp4`. Original project is cloned, never opened for writing by the benchmark. Candidate captions are authored through ProjectActor, retaining original text/phrase grouping, without an alignment backend in production. Actor-generated candidate caption styling can differ from the original; visual style quality is not scored by this timing test.

Decoded audio compared against corresponding original PCM windows has normalized correlation 0.982–0.989 and consistent +5 ms lag in both variants. Candidate and baseline decoded audio agree, so the caption experiment did not introduce an A/V difference. This does not establish phonetic word timing.

Local macOS Vision OCR plus direct frame inspection verifies the first cue's appearance/disappearance at its authored boundaries: baseline begins frame 24 (0.400 s), ends/replaces at frame 119 (1.983333 s); candidate begins frame 45 (0.750 s), ends at frame 117 (1.950 s). The frame immediately before start/end is checked. These sample boundaries match authored times on the 60 fps grid. This is rendered timing proof for the sampled cue, not a claim every word has been manually reviewed. Original/candidate preview files contain real audio, not only screenshots.

The first export attempt had missing relative fixture Media links and an unready export surface. A second attempt exposed test-startup navigation racing; the third used the proven editor bootstrap sequence and completed all six exports. Failed attempts are retained. Initial native OCR inside the sandbox returned Vision initialization errors; the same local OCR with approved native access succeeded. Initial `time -l` measurement failed its sandboxed sysctl counters despite valid transcription JSON; replaced by per-worker resource usage measurements with native exit code 0. Initial diagnostic-runner configuration errors and the interrupted inherited broad include run are also retained; they are not counted as passing tests or hidden production defects.

## Recommended next experiment and acceptance gate

1. Retain the existing ASR, text preservation, provenance, actor and compositor. Address cached-retimed caption refusal separately; test both actual audio behavior and mapping before advertising speed support.
2. Document `exact` as engine-derived timing, not acoustic certainty; future compatible observation fields should identify engine/version, timing method, source clock, resolution, supported language, confidence, invalid spans and explicit fallback reasons. Keep original transcript text and original timings available.
3. Annotate the frozen 54-word reference sheet independently, preferably with two reviewers using audio/waveform before seeing algorithm timing. Measure median/p95 absolute start and end errors, within-50/100/200 ms rates, coverage, failures and disagreement of annotators. A numeric template is not an annotation: `human-word-reference-template.csv` is presently blank.
4. Compare default offsets, a clearly specified DTW boundary estimator and CTC on those SAME words/audio, then unseen held-out talking-head/interview/noisy/multilingual examples. Proposed pilot gate: >=30% median improvement in both start/end errors, no p95 regression; desired median <=50 ms and p95 <=150 ms; 100% retained text, >=99% aligned words on supported English with explicit fallback; no >1-frame render-placement error or new A/V drift. These are proposed thresholds, not achieved scores or CapCut's published specifications.
5. Only if approved evidence meets that gate, implement an OPTIONAL local acoustic post-aligner over immutable transcript+PCM. Cache by audio hash, transcript hash, model/version/language and requested source window; preserve request-owned cancellation, project-opening authority, bounded resource use and honest null timestamps. ProjectActor continues to create caption layers. Keep Hermes free to make editorial decisions.
6. Word-progress highlighting/reveal is a separate display option. Preserve phrase captions for users who want them. Accurate words do not require forcing universal karaoke effects or rewriting the renderer.

## Current gate status

PASS: real-fixture coverage preservation; baseline/DTW and dedicated acoustic execution; exact-transcript control; supported normal-speed mapping; six composed A/V exports; sampled cue frame timing; existing 40 caption regressions; app/source/project preservation.

FAIL: cached-caption path accepts unsupported speed mapping without native-style refusal.

PARTIAL: alignment quality, language breadth, CPU speed ranking and candidate packaged compatibility. No language/model upgrade justified yet.

BLOCKED pending independent annotations: absolute acoustic word-start/end accuracy, proof that extra model cost buys sufficient improvement, and any CapCut-equivalence claim. Prepared media/CSV enable that review; no invented labels or scores.
