"""
Phase 2F.1 Vision Benchmark — Task Definitions
10 tasks (A–J) designed around real Sclip Phase 2F assets.
"""
from dataclasses import dataclass
from typing import Any

# Frame assets available on disk (from prior Phase 2F sessions)
FACE_PRESENT_FRAME = "/tmp/test-frame-initial.png"   # Speaker visible, upper center-right, gesturing
FACE_ABSENT_FRAME  = "/tmp/test-frame-current.png"   # Hand/forearm + mic, speaker off-screen
SOURCE_16_9_FRAME  = "/tmp/test-frame-source-16-9.png"  # Raw 16:9, speaker centered

# Fallback: extract fresh frames if any are missing
SOURCE_VIDEO = "/Users/adityasamant/Documents/1/3/Media/Raw Talking head tutorial video for editing practice.mp4"


@dataclass
class BenchTask:
    id: str            # A–J
    name: str
    image_path: str
    question: str
    # Evaluation: callable(response_text) -> (pass: bool, note: str)
    evaluate: Any
    weight: float = 1.0  # task importance weight


def _has_keywords(text: str, *words: str) -> bool:
    t = text.lower()
    return any(w in t for w in words)


def _lacks_keywords(text: str, *words: str) -> bool:
    t = text.lower()
    return not any(w in t for w in words)


BENCHMARK_TASKS: list[BenchTask] = [
    # ── TASK A: Face presence — positive ─────────────────────────────────────
    BenchTask(
        id="A",
        name="FACE_PRESENT — speaker visible",
        image_path=FACE_PRESENT_FRAME,
        question="Is a person's face clearly visible in this image? Describe what you see.",
        evaluate=lambda r: (
            _has_keywords(r, "person", "face", "speaker", "visible", "yes", "man", "woman",
                          "looking", "talking", "human"),
            "Expected face/person keywords",
        ),
        weight=2.0,
    ),

    # ── TASK B: Face presence — negative ────────────────────────────────────
    BenchTask(
        id="B",
        name="FACE_ABSENT — speaker off-screen",
        image_path=FACE_ABSENT_FRAME,
        question=(
            "Is a person's face clearly visible in this image? "
            "If not, what body parts or objects are visible instead?"
        ),
        evaluate=lambda r: (
            # Should NOT say face visible. Should mention hand/arm/mic or absence.
            _lacks_keywords(r, "face is visible", "face visible", "clearly visible face",
                            "person's face is visible") and
            _has_keywords(r, "no face", "not visible", "hand", "arm", "microphone",
                          "mic", "off", "absent", "not", "cannot see face"),
            "Expected: face NOT visible + description of hand/mic",
        ),
        weight=2.0,
    ),

    # ── TASK C: Subject position (spatial) ──────────────────────────────────
    BenchTask(
        id="C",
        name="SPATIAL — speaker position in frame",
        image_path=FACE_PRESENT_FRAME,
        question="Where in the frame is the main subject located? Describe their position using: left, center, right, top, bottom.",
        evaluate=lambda r: (
            _has_keywords(r, "right", "center", "upper", "top"),
            "Expected right/center/upper (speaker is upper center-right in this frame)",
        ),
        weight=1.5,
    ),

    # ── TASK D: Crop quality — 16:9 source ──────────────────────────────────
    BenchTask(
        id="D",
        name="CROP_OK — 16:9 source has centered speaker",
        image_path=SOURCE_16_9_FRAME,
        question=(
            "Is the main subject (speaker/person) clearly visible and reasonably centered "
            "in this wide-format (16:9) image? Answer yes or no and explain."
        ),
        evaluate=lambda r: (
            _has_keywords(r, "yes", "visible", "centered", "center", "clearly"),
            "Expected: yes, speaker centered in 16:9",
        ),
        weight=1.5,
    ),

    # ── TASK E: Caption / text detection ────────────────────────────────────
    BenchTask(
        id="E",
        name="TEXT — detect black caption bar",
        image_path=FACE_PRESENT_FRAME,
        question="Is there a black band or caption area at the bottom of this image? What text if any is in it?",
        evaluate=lambda r: (
            _has_keywords(r, "black", "bar", "band", "caption", "bottom", "yes", "area",
                          "region", "strip"),
            "Expected: yes, black band / caption area at bottom",
        ),
        weight=1.0,
    ),

    # ── TASK F: Color / exposure sanity ─────────────────────────────────────
    BenchTask(
        id="F",
        name="COLOR — basic image quality (not black)",
        image_path=FACE_PRESENT_FRAME,
        question="Is this image properly exposed (not completely black or white)? Describe the general color palette.",
        evaluate=lambda r: (
            _has_keywords(r, "yes", "properly", "exposed", "color", "not black",
                          "bright", "light", "warm", "cool", "neutral") and
            _lacks_keywords(r, "completely black", "all black", "entirely black", "pure black"),
            "Expected: image is properly exposed, not black",
        ),
        weight=0.5,
    ),

    # ── TASK G: Object identification ───────────────────────────────────────
    BenchTask(
        id="G",
        name="OBJECT — microphone identification",
        image_path=FACE_ABSENT_FRAME,
        question="List the main objects you can identify in this image.",
        evaluate=lambda r: (
            _has_keywords(r, "microphone", "mic", "hand", "arm", "stand"),
            "Expected: microphone and/or hand/arm in object list",
        ),
        weight=1.0,
    ),

    # ── TASK H: Aspect ratio / composition ──────────────────────────────────
    BenchTask(
        id="H",
        name="ASPECT — vertical (9:16) composition",
        image_path=FACE_PRESENT_FRAME,
        question=(
            "Does this image appear to be in a vertical (portrait / 9:16) orientation, "
            "or horizontal (landscape / 16:9)? Explain how you can tell."
        ),
        evaluate=lambda r: (
            _has_keywords(r, "vertical", "portrait", "9:16", "tall", "narrow"),
            "Expected: vertical / portrait orientation detected",
        ),
        weight=1.0,
    ),

    # ── TASK I: Yes/No factual question (simple instruction following) ───────
    BenchTask(
        id="I",
        name="YESNO — simple binary answer",
        image_path=FACE_ABSENT_FRAME,
        question="Answer ONLY with 'YES' or 'NO': Is there a human face visible in this image?",
        evaluate=lambda r: (
            r.strip().upper().startswith("NO") or
            ("no" in r.lower()[:50] and "face" in r.lower()[:80]),
            "Expected: NO (face not visible)",
        ),
        weight=1.5,
    ),

    # ── TASK J: Detailed framing analysis ───────────────────────────────────
    BenchTask(
        id="J",
        name="FRAMING — detailed analysis for editing decision",
        image_path=FACE_ABSENT_FRAME,
        question=(
            "This is a 9:16 (vertical) video frame. Describe:\n"
            "1. Is the main speaker/subject visible? Where in frame?\n"
            "2. What is the dominant content visible (face, body, object, background)?\n"
            "3. Would this frame need to be reframed for a good social-media crop?"
        ),
        evaluate=lambda r: (
            # Must mention reframing is needed AND that speaker is not visible / off-frame
            _has_keywords(r, "yes", "reframe", "reframing", "needed", "off", "not visible",
                          "missing", "absent", "cannot see") and
            _lacks_keywords(r, "well framed", "correctly framed", "no reframing needed"),
            "Expected: reframing needed, speaker not visible",
        ),
        weight=2.0,
    ),
]
