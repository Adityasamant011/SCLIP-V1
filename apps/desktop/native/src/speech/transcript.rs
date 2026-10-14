//! The normalized transcript shape every speech backend converges on.
//!
//! Backends emit different *styles* (SRT, whisper JSON, FunASR JSON); a
//! per-style [`parse`](super::parse) turns each into this one structure so
//! consumers (the `transcribe_clip` tool, the scene/content-analysis
//! word-transcript resource) see a single shape regardless of engine. The only
//! thing that differs across backends is [`WordTiming`] — the provenance of the
//! per-word timestamps — and it is inspectable.
//!
//! Timestamps are microseconds. As produced by a parser they are
//! **audio-slice-relative** (0 = first sample of the extracted window); the
//! tool layer calls [`Transcript::shift`] to place them on the timeline before
//! returning to the agent. [`Transcript::render_srt`] is the bridge back to the
//! `apply_subtitles` caption flow (SRT is cue-granular, so word spans are not
//! represented there — by design; they live in the JSON `segments`).

use serde::{Deserialize, Serialize};

/// Provenance of the per-word timestamps in a [`Transcript`]. Downstream
/// text-editing reads this to know whether a word boundary is frame-trustworthy
/// (`Exact`, straight from an engine's token offsets) or approximate
/// (`InterpolatedFromCue`, derived by splitting a cue span across its words).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WordTiming {
    /// Word times come straight from the engine's per-token offsets.
    Exact,
    /// Word times were derived by distributing a cue span across its words by
    /// length — approximate, not sample-accurate.
    InterpolatedFromCue,
    /// No word-level timing available (segment granularity only).
    None,
}

/// One word with its own `[t_start_us, t_end_us]` span.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Word {
    pub t_start_us: i64,
    pub t_end_us: i64,
    pub text: String,
}

/// One transcript segment — an SRT cue, or a whisper `transcription[]` entry:
/// a timed span of text plus its constituent [`Word`]s.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Segment {
    pub t_start_us: i64,
    pub t_end_us: i64,
    pub text: String,
    pub words: Vec<Word>,
}

/// The single normalized shape produced by every backend after parsing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Transcript {
    pub segments: Vec<Segment>,
    pub language: Option<String>,
    pub word_timing: WordTiming,
}

impl Transcript {
    /// Validate model timing against decoded audio. Boundary intersections are
    /// explicit observations, never claimed to be exact engine timestamps.
    /// Entirely out-of-window segments are refused rather
    /// than moved into the window or silently discarded.
    pub fn validate_audio_bounds(
        &mut self,
        duration_us: i64,
    ) -> Result<Vec<serde_json::Value>, super::error::SpeechError> {
        let mut adjustments = Vec::new();
        for (i, seg) in self.segments.iter_mut().enumerate() {
            if seg.t_start_us < 0 || seg.t_end_us <= seg.t_start_us || seg.t_start_us >= duration_us
            {
                return Err(super::error::SpeechError::Parse(format!("segment {i} has invalid/out-of-audio timing [{}, {}] for {duration_us}us; recognition is not usable", seg.t_start_us, seg.t_end_us)));
            }
            if seg.t_end_us > duration_us {
                adjustments.push(serde_json::json!({"segment":i,"original_end_us":seg.t_end_us,"bounded_end_us":duration_us}));
                seg.t_end_us = duration_us;
            }
            if seg.words.iter().any(|w| w.t_end_us <= w.t_start_us || w.t_start_us < seg.t_start_us || w.t_start_us >= seg.t_end_us) {
                adjustments.push(serde_json::json!({"segment":i,"reason":"unusable_word_timing","original_words":seg.words,"retained_text":seg.text}));
                // Unusable token offsets cannot support a cut interval. Retain the full
                // recognized text and segment span, but do not invent word times.
                seg.words.clear();
            }
            for (j, word) in seg.words.iter_mut().enumerate() {
                if word.t_start_us < seg.t_start_us
                    || word.t_end_us <= word.t_start_us
                    || word.t_start_us >= seg.t_end_us
                {
                    return Err(super::error::SpeechError::Parse(format!("word {i}:{j} has invalid/out-of-segment timing [{}, {}]; recognition is not usable", word.t_start_us, word.t_end_us)));
                }
                if word.t_end_us > seg.t_end_us {
                    adjustments.push(serde_json::json!({"segment":i,"word":j,"original_end_us":word.t_end_us,"bounded_end_us":seg.t_end_us}));
                    word.t_end_us = seg.t_end_us;
                }
            }
        }
        if !adjustments.is_empty() {
            self.word_timing = WordTiming::None;
        }
        Ok(adjustments)
    }

    /// Shift every segment and word timestamp forward by `offset_us` (the
    /// slice's timeline-absolute start), clamping at zero so a negative result
    /// never underflows. Shifts the parsed struct; a caller that needs a cue
    /// body re-renders it via [`render_srt`].
    ///
    /// [`render_srt`]: Transcript::render_srt
    pub fn shift(&mut self, offset_us: i64) {
        for seg in &mut self.segments {
            seg.t_start_us = shift_us(seg.t_start_us, offset_us);
            seg.t_end_us = shift_us(seg.t_end_us, offset_us);
            for w in &mut seg.words {
                w.t_start_us = shift_us(w.t_start_us, offset_us);
                w.t_end_us = shift_us(w.t_end_us, offset_us);
            }
        }
    }

    /// Render the segments back to an SRT body (cue granularity — index /
    /// `HH:MM:SS,mmm --> HH:MM:SS,mmm` / text / blank line). This is what
    /// `transcribe_clip` returns in the envelope's `srt` field so the existing
    /// `apply_subtitles` flow keeps working. Cue indices are renumbered from 1;
    /// per-word times are intentionally not emitted (SRT can't represent them).
    pub fn render_srt(&self) -> String {
        let mut out = String::new();
        for (i, seg) in self.segments.iter().enumerate() {
            out.push_str(&(i + 1).to_string());
            out.push('\n');
            out.push_str(&format_srt_timestamp(seg.t_start_us));
            out.push_str(" --> ");
            out.push_str(&format_srt_timestamp(seg.t_end_us));
            out.push('\n');
            out.push_str(&seg.text);
            out.push('\n');
            out.push('\n');
        }
        out
    }
}

/// Persistent transcript derivative stored at `<cache>/transcripts/{key}.json`.
/// Timestamps in `segments` are in **source-media relative time** (0 = start of source media).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CachedTranscript {
    #[serde(default)]
    pub timing_adjustments: Vec<serde_json::Value>,
    pub source_hash: String,
    pub is_full_source: bool,
    pub source_duration_us: Option<i64>,
    pub in_us: i64,
    pub out_us: i64,
    pub backend: String,
    pub language: Option<String>,
    pub word_timing: WordTiming,
    pub segments: Vec<Segment>,
}

impl CachedTranscript {
    /// Validate persisted observations too: older cache entries must not bypass
    /// the same bounds policy applied to fresh recognition.
    pub fn validated(mut self) -> Result<Self, super::error::SpeechError> {
        let mut transcript = Transcript { segments: self.segments, language: self.language.clone(), word_timing: self.word_timing };
        transcript.segments.retain(|s| s.text.trim() != "[BLANK_AUDIO]");
        for seg in &mut transcript.segments {
            seg.t_start_us -= self.in_us; seg.t_end_us -= self.in_us;
            for w in &mut seg.words { w.t_start_us -= self.in_us; w.t_end_us -= self.in_us; }
        }
        let end = self.source_duration_us.map(|d| d.min(self.out_us)).unwrap_or(self.out_us);
        self.timing_adjustments.extend(transcript.validate_audio_bounds(end - self.in_us)?);
        transcript.shift(self.in_us);
        self.segments = transcript.segments; self.word_timing = transcript.word_timing;
        Ok(self)
    }

    /// Slice segments and words to a requested sub-window `[req_in_us, req_out_us]`.
    /// Segments intersecting `[req_in_us, req_out_us]` are kept.
    pub fn slice_window(&self, req_in_us: i64, req_out_us: i64) -> Self {
        let mut sliced_segments = Vec::new();
        for seg in &self.segments {
            if seg.t_end_us > req_in_us && seg.t_start_us < req_out_us {
                let mut s = seg.clone();
                s.words
                    .retain(|w| w.t_end_us > req_in_us && w.t_start_us < req_out_us);
                if !seg.words.is_empty() && s.words.is_empty() {
                    continue;
                }
                for w in &mut s.words {
                    w.t_start_us = w.t_start_us.max(req_in_us);
                    w.t_end_us = w.t_end_us.min(req_out_us);
                }
                if !s.words.is_empty() {
                    s.t_start_us = s.words.first().unwrap().t_start_us.max(req_in_us);
                    s.t_end_us = s.words.last().unwrap().t_end_us.min(req_out_us);
                    s.text = s
                        .words
                        .iter()
                        .map(|w| w.text.trim())
                        .filter(|t| !t.is_empty())
                        .collect::<Vec<_>>()
                        .join(" ");
                } else {
                    s.t_start_us = s.t_start_us.max(req_in_us);
                    s.t_end_us = s.t_end_us.min(req_out_us);
                }
                if s.t_end_us > s.t_start_us {
                    sliced_segments.push(s);
                }
            }
        }
        CachedTranscript {
            timing_adjustments: self.timing_adjustments.clone(),
            source_hash: self.source_hash.clone(),
            is_full_source: false,
            source_duration_us: self.source_duration_us,
            in_us: req_in_us,
            out_us: req_out_us,
            backend: self.backend.clone(),
            language: self.language.clone(),
            word_timing: self.word_timing,
            segments: sliced_segments,
        }
    }

    /// Convert back to a `Transcript` shifted to timeline placement:
    /// `t_timeline = (t_source - source_in_us) + timeline_start_us`.
    pub fn to_shifted_transcript(&self, source_in_us: i64, timeline_start_us: i64) -> Transcript {
        let mut segments = self.segments.clone();
        for seg in &mut segments {
            seg.t_start_us = (seg.t_start_us - source_in_us).max(0) + timeline_start_us;
            seg.t_end_us = (seg.t_end_us - source_in_us).max(0) + timeline_start_us;
            for w in &mut seg.words {
                w.t_start_us = (w.t_start_us - source_in_us).max(0) + timeline_start_us;
                w.t_end_us = (w.t_end_us - source_in_us).max(0) + timeline_start_us;
            }
        }
        Transcript {
            segments,
            language: self.language.clone(),
            word_timing: self.word_timing,
        }
    }
}

/// Content-addressed transcript cache key:
/// `blake3(source_hash | full_or_range | backend | language | want_word_timing)`
pub fn transcript_cache_key(
    source_hash: &str,
    range: Option<(i64, i64)>,
    backend: &str,
    language: Option<&str>,
    want_word_timing: bool,
) -> String {
    let mut h = blake3::Hasher::new();
    h.update(b"audio-bounds-v2\0");
    h.update(source_hash.as_bytes());
    h.update(b"\0");
    match range {
        None => {
            h.update(b"full\0");
        }
        Some((in_us, out_us)) => {
            h.update(b"range\0");
            h.update(&in_us.to_le_bytes());
            h.update(&out_us.to_le_bytes());
            h.update(b"\0");
        }
    }
    h.update(backend.as_bytes());
    h.update(b"\0");
    if let Some(lang) = language {
        h.update(lang.as_bytes());
    }
    h.update(b"\0");
    h.update(&[if want_word_timing { 1 } else { 0 }]);
    h.finalize().to_hex().to_string()
}

fn shift_us(base_us: i64, offset_us: i64) -> i64 {
    base_us.saturating_add(offset_us).max(0)
}

/// `HH:MM:SS,mmm` — the SRT cue-timestamp format.
fn format_srt_timestamp(us: i64) -> String {
    let us = us.max(0);
    let total_ms = us / 1000;
    let ms = total_ms % 1000;
    let total_s = total_ms / 1000;
    let s = total_s % 60;
    let total_m = total_s / 60;
    let m = total_m % 60;
    let h = total_m / 60;
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn word(a: i64, b: i64, t: &str) -> Word {
        Word {
            t_start_us: a,
            t_end_us: b,
            text: t.to_string(),
        }
    }

    fn sample() -> Transcript {
        Transcript {
            segments: vec![
                Segment {
                    t_start_us: 1_000_000,
                    t_end_us: 2_500_000,
                    text: "Hello world".into(),
                    words: vec![
                        word(1_000_000, 1_750_000, "Hello"),
                        word(1_750_000, 2_500_000, "world"),
                    ],
                },
                Segment {
                    t_start_us: 3_000_000,
                    t_end_us: 4_000_000,
                    text: "Bye".into(),
                    words: vec![word(3_000_000, 4_000_000, "Bye")],
                },
            ],
            language: Some("en".into()),
            word_timing: WordTiming::InterpolatedFromCue,
        }
    }

    #[test]
    fn shift_moves_segments_and_words_together() {
        let mut t = sample();
        t.shift(500_000);
        assert_eq!(t.segments[0].t_start_us, 1_500_000);
        assert_eq!(t.segments[0].t_end_us, 3_000_000);
        assert_eq!(t.segments[0].words[0].t_start_us, 1_500_000);
        assert_eq!(t.segments[0].words[1].t_end_us, 3_000_000);
        assert_eq!(t.segments[1].words[0].t_start_us, 3_500_000);
    }

    #[test]
    fn shift_clamps_at_zero() {
        let mut t = sample();
        t.shift(-5_000_000);
        for seg in &t.segments {
            assert!(seg.t_start_us >= 0 && seg.t_end_us >= 0);
            for w in &seg.words {
                assert!(w.t_start_us >= 0 && w.t_end_us >= 0);
            }
        }
    }

    #[test]
    fn render_srt_emits_renumbered_cues() {
        let t = sample();
        let srt = t.render_srt();
        assert!(srt.starts_with("1\n00:00:01,000 --> 00:00:02,500\nHello world\n\n"));
        assert!(srt.contains("2\n00:00:03,000 --> 00:00:04,000\nBye\n\n"));
    }

    #[test]
    fn word_timing_serializes_snake_case() {
        assert_eq!(
            serde_json::to_string(&WordTiming::InterpolatedFromCue).unwrap(),
            "\"interpolated_from_cue\"",
        );
        assert_eq!(
            serde_json::to_string(&WordTiming::Exact).unwrap(),
            "\"exact\""
        );
        assert_eq!(
            serde_json::to_string(&WordTiming::None).unwrap(),
            "\"none\""
        );
    }

    #[test]
    fn cached_transcript_roundtrip() {
        let t = sample();
        let cached = CachedTranscript {
            timing_adjustments: Vec::new(),
            source_hash: "abcd1234ef".into(),
            is_full_source: true,
            source_duration_us: Some(10_000_000),
            in_us: 0,
            out_us: 10_000_000,
            backend: "openai".into(),
            language: Some("en".into()),
            word_timing: WordTiming::InterpolatedFromCue,
            segments: t.segments,
        };
        let json = serde_json::to_string(&cached).unwrap();
        let deserialized: CachedTranscript = serde_json::from_str(&json).unwrap();
        assert_eq!(cached, deserialized);
    }

    #[test]
    fn cached_transcript_slice_window() {
        let t = sample();
        let cached = CachedTranscript {
            timing_adjustments: Vec::new(),
            source_hash: "hash123".into(),
            is_full_source: true,
            source_duration_us: Some(10_000_000),
            in_us: 0,
            out_us: 10_000_000,
            backend: "openai".into(),
            language: Some("en".into()),
            word_timing: WordTiming::InterpolatedFromCue,
            segments: t.segments,
        };
        // Slice window [2_000_000, 3_500_000]:
        // Segment 1 is [1_000_000, 2_500_000], intersects. Word "world" is [1_750_000, 2_500_000], intersects [2_000_000, 3_500_000].
        // Segment 2 is [3_000_000, 4_000_000], intersects. Word "Bye" is [3_000_000, 4_000_000], intersects.
        let sliced = cached.slice_window(2_000_000, 3_500_000);
        assert_eq!(sliced.segments.len(), 2);
        assert_eq!(sliced.segments[0].words.len(), 1);
        assert_eq!(sliced.segments[0].words[0].text, "world");
        assert_eq!(sliced.segments[1].words.len(), 1);
        assert_eq!(sliced.segments[1].words[0].text, "Bye");

        // Out of window:
        let empty = cached.slice_window(5_000_000, 6_000_000);
        assert!(empty.segments.is_empty());
    }

    #[test]
    fn cached_transcript_slice_window_drops_ghost_and_clamps_bounds() {
        let cached = CachedTranscript {
            timing_adjustments: Vec::new(),
            source_hash: "hash123".into(),
            is_full_source: true,
            source_duration_us: Some(10_000_000),
            in_us: 0,
            out_us: 10_000_000,
            backend: "whisper_cpp".into(),
            language: Some("en".into()),
            word_timing: WordTiming::Exact,
            segments: vec![
                Segment {
                    t_start_us: 0,
                    t_end_us: 3_000_000,
                    text: "Keep this".into(),
                    words: vec![
                        word(500_000, 1_000_000, "Keep"),
                        word(1_000_000, 1_500_000, "this"),
                    ],
                },
                // Ghost segment: t_start_us is inside window, but all words start after window!
                Segment {
                    t_start_us: 1_900_000,
                    t_end_us: 4_000_000,
                    text: "Ghost speech".into(),
                    words: vec![
                        word(2_200_000, 2_800_000, "Ghost"),
                        word(2_800_000, 3_500_000, "speech"),
                    ],
                },
            ],
        };
        // Window [0, 2_000_000]:
        // Segment 0 words are in [500_000, 1_500_000], fully inside.
        // Segment 1 intersects window [0, 2_000_000] at segment level (t_start=1.9s),
        // but its first word is at 2.2s! After retain, words is empty -> MUST BE DROPPED!
        let sliced = cached.slice_window(0, 2_000_000);
        assert_eq!(sliced.segments.len(), 1);
        assert_eq!(sliced.segments[0].text, "Keep this");
        assert_eq!(sliced.segments[0].t_start_us, 500_000);
        assert_eq!(sliced.segments[0].t_end_us, 1_500_000);
    }

    #[test]
    fn transcript_cache_key_differs_by_range_and_params() {
        let k_full = transcript_cache_key("hash", None, "openai", Some("en"), true);
        let k_ranged =
            transcript_cache_key("hash", Some((0, 5_000_000)), "openai", Some("en"), true);
        let k_whisper = transcript_cache_key("hash", None, "whisper_cpp", Some("en"), true);
        let k_no_words = transcript_cache_key("hash", None, "openai", Some("en"), false);

        assert_ne!(k_full, k_ranged);
        assert_ne!(k_full, k_whisper);
        assert_ne!(k_full, k_no_words);
    }
}

#[cfg(test)]
mod audio_bounds_tests {
    use super::*;
    fn transcript(start: i64, end: i64) -> Transcript {
        Transcript { segments: vec![Segment {t_start_us:start,t_end_us:end,text:"A complete thought.".into(),words:vec![Word {t_start_us:start,t_end_us:end,text:"thought.".into()}]}],language:None,word_timing:WordTiming::Exact }
    }
    #[test]
    fn boundary_word_retains_text_and_discloses_timing_adjustment() {
        let mut t=transcript(14_010_000,15_040_000);
        let adjustments=t.validate_audio_bounds(14_634_667).unwrap();
        assert_eq!(t.segments[0].words[0].t_end_us,14_634_667);
        assert_eq!(t.segments[0].text,"A complete thought.");
        assert_eq!(adjustments.len(),2);
        assert_eq!(t.word_timing,WordTiming::None);
    }
    #[test]
    fn genuine_speech_outside_audio_is_refused_not_moved_or_erased() {
        assert!(transcript(14_100_000,23_840_000).validate_audio_bounds(14_000_000).is_err());
        assert!(transcript(-100,100).validate_audio_bounds(14_000_000).is_err());
    }
    #[test]
    fn source_window_offsets_and_timeline_positions_remain_distinct() {
        for (start,end,duration,source,timeline) in [(0,900_000,1_000_000,0,0),(300_000,900_000,1_000_000,0,0),(0,600_000,1_000_000,0,0),(0,100_000,100_000,0,0),(0,900_000,1_000_000,5_000_000,8_000_000),(0,900_000,1_000_000,2_000_000,0),(0,900_000,1_000_000,3_000_000,10_000_000)] {
            let mut t=transcript(start,end);assert!(t.validate_audio_bounds(duration).unwrap().is_empty());t.shift(source);
            let cached=CachedTranscript {timing_adjustments:vec![],source_hash:"synthetic".into(),is_full_source:false,source_duration_us:Some(source+duration),in_us:source,out_us:source+duration,backend:"whisper_cpp".into(),language:None,word_timing:t.word_timing,segments:t.segments};
            let mapped=cached.slice_window(source,source+duration).to_shifted_transcript(source,timeline);
            assert_eq!(mapped.segments[0].t_start_us,timeline+start);assert_eq!(mapped.segments[0].t_end_us,timeline+end);
        }
    }
    #[test]
    fn point_token_does_not_invent_a_word_interval_or_lose_segment_text() {
        let mut t=transcript(0,100_000);t.segments[0].words[0].t_end_us=0;
        assert!(!t.validate_audio_bounds(100_000).unwrap().is_empty());
        assert!(t.segments[0].words.is_empty());assert_eq!(t.segments[0].text,"A complete thought.");
    }
}
