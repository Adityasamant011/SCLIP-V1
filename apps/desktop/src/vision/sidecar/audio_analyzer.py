"""
Audio Perception Analyzer for Sclip AI Reviewer (Enhanced 100%).

Extracts musical beats, tempo, speech chops, crowd cheering, excitement/emotion peaks,
and audio cut clicks/pops from audio files (WAV/MP3/AAC).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np

log = logging.getLogger("audio-analyzer")


def analyze_audio(
    audio_path: str,
    cut_timestamps_us: Optional[List[int]] = None,
    word_boundaries: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Analyzes an audio file and returns beat timings, speech chops, silence spans,
    crowd reactions, excitement peaks, and cut pop defects.
    """
    import soundfile as sf
    import librosa

    try:
        y, sr = sf.read(audio_path)
    except Exception as e:
        log.warning(f"soundfile read failed ({e}), falling back to librosa.load")
        y, sr = librosa.load(audio_path, sr=22050)

    # Convert to mono if multi-channel
    if y.ndim > 1:
        y = np.mean(y, axis=1)

    duration_s = float(len(y)) / float(sr)
    duration_us = int(duration_s * 1_000_000)

    # 1. Beat & Tempo Tracking
    beats_us: List[int] = []
    tempo_bpm = 0.0
    try:
        tempo_arr, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        tempo_bpm = round(float(np.atleast_1d(tempo_arr)[0]), 1)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        beats_us = [int(round(t * 1_000_000)) for t in beat_times]
    except Exception as e:
        log.warning(f"Beat tracking failed: {e}")

    # 2. Mid-Word Speech Chop Detection
    speech_chops: List[Dict[str, Any]] = []
    if cut_timestamps_us and word_boundaries:
        for cut_us in cut_timestamps_us:
            for word_info in word_boundaries:
                w_text = word_info.get("text") or word_info.get("word") or ""
                w_start = int(word_info.get("t_start_us", 0))
                w_end = int(word_info.get("t_end_us", 0))
                if w_end - w_start > 80_000:
                    if (w_start + 30_000) < cut_us < (w_end - 30_000):
                        speech_chops.append({
                            "cut_t_us": cut_us,
                            "word": w_text,
                            "word_start_us": w_start,
                            "word_end_us": w_end,
                            "severity": "critical",
                            "description": f"Cut at {cut_us/1e6:.2f}s cuts off speech mid-word on '{w_text}'",
                            "suggested_action": f"Shift cut boundary before {w_start/1e6:.2f}s or after {w_end/1e6:.2f}s",
                        })

    # 3. Audio Pops / Clicks at Cut Boundaries
    audio_pops: List[Dict[str, Any]] = []
    if cut_timestamps_us:
        for cut_us in cut_timestamps_us:
            idx = int(round((cut_us / 1e6) * sr))
            # Check 5ms window around cut
            win = int(sr * 0.005)
            if idx > win and (idx + win) < len(y):
                left_val = float(np.mean(y[idx - win:idx]))
                right_val = float(np.mean(y[idx:idx + win]))
                step_diff = abs(right_val - left_val)
                if step_diff > 0.28:
                    audio_pops.append({
                        "cut_t_us": cut_us,
                        "step_discontinuity": round(step_diff, 2),
                        "severity": "warning",
                        "description": f"Audible click/pop detected at cut {(cut_us/1e6):.2f}s (step jump: {step_diff:.2f}).",
                        "suggested_action": "Apply a short 20ms audio crossfade or snap cut to nearest zero-crossing.",
                    })

    # 4. Energy & Emotion Peaks (High excitement / shouting / commentary roar)
    excitement_peaks: List[Dict[str, Any]] = []
    crowd_cheers: List[Dict[str, Any]] = []
    awkward_silences: List[Dict[str, Any]] = []

    try:
        hop_length = 512
        frame_length = 2048
        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        flatness = librosa.feature.spectral_flatness(y=y, n_fft=frame_length, hop_length=hop_length)[0]
        centroid = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=frame_length, hop_length=hop_length)[0]
        times = librosa.frames_to_time(range(len(rms)), sr=sr, hop_length=hop_length)

        # Silence threshold (10th percentile)
        p10 = float(np.percentile(rms, 10))
        silence_thresh = max(0.005, p10 * 1.5)

        # Excitement threshold (85th percentile of RMS and bright frequency)
        rms_p85 = float(np.percentile(rms, 85))
        centroid_median = float(np.median(centroid))

        is_silent = rms < silence_thresh
        is_excited = (rms > rms_p85) & (centroid > max(1800, centroid_median * 1.2))
        is_crowd = (flatness > 0.12) & (rms > 0.05)

        # Detect contiguous silence
        silence_start = None
        for idx, silent in enumerate(is_silent):
            t = times[idx]
            if silent and silence_start is None:
                silence_start = t
            elif not silent and silence_start is not None:
                dur = t - silence_start
                if dur >= 0.7:
                    awkward_silences.append({
                        "start_us": int(round(silence_start * 1e6)),
                        "end_us": int(round(t * 1e6)),
                        "duration_s": round(dur, 2),
                    })
                silence_start = None

        # Detect contiguous crowd cheer / roar spans (> 0.5s)
        crowd_start = None
        for idx, crowd in enumerate(is_crowd):
            t = times[idx]
            if crowd and crowd_start is None:
                crowd_start = t
            elif not crowd and crowd_start is not None:
                dur = t - crowd_start
                if dur >= 0.5:
                    crowd_cheers.append({
                        "start_us": int(round(crowd_start * 1e6)),
                        "end_us": int(round(t * 1e6)),
                        "duration_s": round(dur, 2),
                        "type": "crowd_cheering_or_applause",
                    })
                crowd_start = None

        # Detect excitement peaks (> 0.4s)
        exc_start = None
        for idx, exc in enumerate(is_excited):
            t = times[idx]
            if exc and exc_start is None:
                exc_start = t
            elif not exc and exc_start is not None:
                dur = t - exc_start
                if dur >= 0.4:
                    excitement_peaks.append({
                        "start_us": int(round(exc_start * 1e6)),
                        "end_us": int(round(t * 1e6)),
                        "duration_s": round(dur, 2),
                        "energy_score": round(float(np.mean(rms[int(exc_start*sr/hop_length):int(t*sr/hop_length)])), 2),
                    })
                exc_start = None

    except Exception as e:
        log.warning(f"Audio perception feature extraction failed: {e}")

    # 5. Beat Sync Score
    beat_sync_rate = 1.0
    if cut_timestamps_us and len(beats_us) > 0:
        synced_cuts = 0
        tolerance_us = 55_000  # 55ms beat sync window
        for c in cut_timestamps_us:
            if any(abs(c - b) <= tolerance_us for b in beats_us):
                synced_cuts += 1
        beat_sync_rate = round(synced_cuts / len(cut_timestamps_us), 2)

    # 6. Clipping Check
    clipping_count = int(np.sum(np.abs(y) >= 0.995))
    has_clipping = clipping_count > 50

    return {
        "ok": True,
        "duration_s": round(duration_s, 2),
        "duration_us": duration_us,
        "tempo_bpm": tempo_bpm,
        "beat_count": len(beats_us),
        "beats_us": beats_us,
        "beat_sync_rate": beat_sync_rate,
        "speech_chops": speech_chops,
        "audio_pops": audio_pops,
        "awkward_silences": awkward_silences,
        "crowd_cheers": crowd_cheers,
        "excitement_peaks": excitement_peaks,
        "has_clipping": has_clipping,
    }
