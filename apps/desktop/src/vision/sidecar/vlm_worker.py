#!/usr/bin/env python3
"""
Sclip Vision Sidecar — vlm_worker.py (Optimized & Hardened)

A long-lived HTTP server (FastAPI + uvicorn) that loads a local VLM via mlx-vlm
and answers visual questions about frames.

Key improvements:
  - Model lifecycle state machine:
      not_downloaded | downloading | ready | loading | loaded | error
  - Adaptive resolution scaling:
      - 512px long-edge default for subject/framing queries (~1.5s–2.5s latency)
      - 672px long-edge for text/caption queries (~2.0s–3.0s latency)
      - "original" or "high" (768px) when explicitly requested
  - Multi-frame batching support (single prompt across N images)
  - Concise token limits: default 64 max tokens (<0.8s generation)
  - Keep-warm idle timeout: 300s (5 minutes) for active Hermes editing loops
  - Structured evidence parsing without creative edits
"""

import asyncio
import gc
import logging
import os
import re
import sys
import tempfile
import threading
import time
import traceback
from enum import Enum
from pathlib import Path
from typing import Optional, Union

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

# ── Logging to stderr (parent process reads this) ────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[vlm-sidecar] %(levelname)s %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("vlm-sidecar")


# ── Config from environment ───────────────────────────────────────────────────
MODEL_HF_ID   = os.environ.get("SCLIP_VLM_MODEL",        "mlx-community/Qwen3-VL-2B-Instruct-4bit")
IDLE_TIMEOUT  = int(os.environ.get("SCLIP_VLM_IDLE_TIMEOUT", "300"))   # 5 minutes default
MAX_TOKENS    = int(os.environ.get("SCLIP_VLM_MAX_TOKENS",    "64"))    # Concise evidence default
PORT          = int(os.environ.get("SCLIP_VLM_PORT",           "0"))    # 0 = ephemeral
HOST          = os.environ.get("SCLIP_VLM_HOST",               "127.0.0.1")


# ── Model Lifecycle States ───────────────────────────────────────────────────
class ModelState(str, Enum):
    NOT_DOWNLOADED = "not_downloaded"
    DOWNLOADING    = "downloading"
    READY          = "ready"
    LOADING        = "loading"
    LOADED         = "loaded"
    ERROR          = "error"


# ── Request / Response schemas ────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    image_path:   Optional[str] = None
    image_paths:  Optional[list[str]] = None
    question:     str
    context:      Optional[str] = None
    resolution:   Optional[str] = "auto"  # "auto" | "low" (512) | "high" (768) | "original"
    max_tokens:   Optional[int] = None


class AnalyzeResponse(BaseModel):
    description:      str
    confidence:       Optional[str] = None  # no calibrated confidence available
    latency_ms:       float
    model:            str
    visible_content:  list[str]
    framing_ok:       Optional[bool] = None
    subject_visible:  Optional[bool] = None
    subject_position: Optional[str] = None
    raw_response:     str
    resolution_used:  str
    input_frames:     int


class HealthResponse(BaseModel):
    ok:           bool
    state:        str
    model_loaded: bool
    model:        str
    idle_s:       float
    error:        Optional[str] = None


class AudioAnalyzeRequest(BaseModel):
    audio_path:        str
    cut_timestamps_us: Optional[list[int]] = None
    word_boundaries:   Optional[list[dict]] = None


class SequenceInspectRequest(BaseModel):
    image_paths:       list[str]
    timestamps_s:      Optional[list[float]] = None
    focus:             Optional[str] = "continuity_and_framing"
    max_tokens:        Optional[int] = 128


# ── State ─────────────────────────────────────────────────────────────────────
_model        = None
_processor    = None
_model_id     = None
_last_used    = time.time()
_model_lock   = threading.Lock()
_state: ModelState = ModelState.READY
_error_detail: Optional[str] = None


# ── Resolution & Preprocessing Helpers ────────────────────────────────────────
TEXT_QUERY_KEYWORDS = [
    "text", "caption", "words", "subtitles", "read", "spelling", "written",
    "letters", "ocr", "title", "lower third", "headline", "band"
]

def _is_text_query(question: str, context: Optional[str]) -> bool:
    q = (question + " " + (context or "")).lower()
    return any(w in q for w in TEXT_QUERY_KEYWORDS)


def _scale_image(image_path: str, target_long: int) -> tuple[str, bool]:
    """
    Scale image so max(width, height) == target_long, preserving aspect ratio.
    Ensures dimensions are divisible by 28 (Qwen-VL patch size requirement).
    Returns (scaled_path, is_temp).
    """
    try:
        with Image.open(image_path) as img:
            w, h = img.size
            max_dim = max(w, h)
            if max_dim <= target_long:
                return image_path, False

            scale = target_long / max_dim
            new_w = max(28, int(round(w * scale / 28.0)) * 28)
            new_h = max(28, int(round(h * scale / 28.0)) * 28)

            resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            tmp = tempfile.NamedTemporaryFile(suffix=".png", prefix="sclip_scaled_", delete=False)
            tmp_path = tmp.name
            tmp.close()
            resized.save(tmp_path, format="PNG")
            return tmp_path, True
    except Exception as e:
        log.warning(f"Image scaling failed for {image_path}: {e}, using original")
        return image_path, False


# ── Model lifecycle ───────────────────────────────────────────────────────────
def _ensure_model_loaded(hf_id: str):
    global _model, _processor, _model_id, _state, _error_detail
    if _model is not None and _model_id == hf_id:
        _state = ModelState.LOADED
        return

    if _model is not None:
        _unload_model()

    _state = ModelState.LOADING
    _error_detail = None
    log.info(f"Loading model: {hf_id}")
    t0 = time.time()
    try:
        from mlx_vlm import load
        _model, _processor = load(hf_id)
        _model_id = hf_id
        _state = ModelState.LOADED
        elapsed = time.time() - t0
        log.info(f"Model loaded in {elapsed:.1f}s: {hf_id}")
    except Exception as e:
        _state = ModelState.ERROR
        _error_detail = str(e)
        log.error(f"Failed to load model {hf_id}: {e}")
        raise


def _unload_model():
    global _model, _processor, _model_id, _state
    if _model is None:
        _state = ModelState.READY
        return
    log.info(f"Unloading model: {_model_id}")
    _model     = None
    _processor = None
    _model_id  = None
    _state     = ModelState.READY
    gc.collect()
    try:
        import mlx.core as mx
        mx.metal.clear_cache()
    except Exception:
        pass
    log.info("Model unloaded")


def _run_inference(
    image_paths: list[str],
    question: str,
    context: Optional[str],
    max_tokens: int,
) -> tuple[str, float]:
    """Run inference on 1 or more images. Returns (raw_response, latency_s)."""
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.utils import load_config

    full_question = question
    if context:
        full_question = f"Context: {context}\n\n{question}"

    try:
        config = load_config(_model_id or MODEL_HF_ID)
        prompt = apply_chat_template(_processor, config, full_question, num_images=len(image_paths))
    except Exception as e:
        log.warning(f"apply_chat_template failed: {e}, falling back to raw question")
        prompt = full_question

    img_arg = image_paths[0] if len(image_paths) == 1 else image_paths

    t0 = time.time()
    try:
        response = generate(
            _model,
            _processor,
            image=img_arg,
            prompt=prompt,
            max_tokens=max_tokens,
            verbose=False,
        )
    except TypeError:
        # Fallback for older mlx-vlm API
        response = generate(_model, _processor, img_arg, prompt, max_tokens=max_tokens)

    latency = time.time() - t0

    if hasattr(response, "text"):
        raw = response.text
    elif isinstance(response, str):
        raw = response
    else:
        raw = str(response)

    return raw, latency


def _parse_response(raw: str, question: str) -> dict:
    """Conservative prose projection, not a calibrated model assessment.

    Leave ambiguous/negated/contradictory claims unknown. In particular, a
    mention of a face is not evidence that it is visible or fully in frame.
    Raw text remains the authoritative (fallible) model observation.
    """
    lower = raw.lower()
    clauses = re.split(r'[.!?;\n]|\bbut\b|\bhowever\b', lower)
    subject = r'(?:face|person|speaker|subject|head)'
    negative = r'\b(?:not|no|never|without|cannot|can\x27t|missing|absent|off[- ]screen)\b'

    def claim(positive: str, contrary: str) -> Optional[bool]:
        yes = any(re.search(positive, c) and not re.search(negative, c) for c in clauses)
        no = any(re.search(contrary, c) for c in clauses)
        return None if yes == no else yes

    subject_visible = claim(
        rf'\b{subject}\s+is\s+(?:clearly\s+|fully\s+)?visible\b',
        rf'\b(?:no\s+{subject}\b|{subject}\s+is\s+(?:not\s+(?:clearly\s+)?visible|missing|absent|off[- ]screen))',
    )

    positions = set()
    pos_map = [
        ("upper-left",    ["upper left", "top left", "top-left", "upper-left"]),
        ("upper-center",  ["upper center", "top center", "upper-center", "top-center"]),
        ("upper-right",   ["upper right", "top right", "upper-right", "top-right"]),
        ("center-left",   ["center left", "middle left", "center-left"]),
        ("center",        ["centered"]),
        ("center-right",  ["center right", "middle right", "center-right"]),
        ("lower-left",    ["lower left", "bottom left", "lower-left"]),
        ("lower-center",  ["lower center", "bottom center"]),
        ("lower-right",   ["lower right", "bottom right"]),
    ]
    for pos_key, keywords in pos_map:
        for clause in clauses:
            if re.search(rf'\b{subject}\b', clause) and not re.search(negative, clause):
                if any(re.search(r'\b' + re.escape(kw) + r'\b', clause) for kw in keywords):
                    positions.add(pos_key)
    subject_position = next(iter(positions)) if len(positions) == 1 else None

    # Visible content scan
    visible_content: list[str] = []
    content_keywords = [
        ("face", ["face", "facial"]),
        ("head", ["head"]),
        ("person", ["person", "human", "man", "woman", "speaker"]),
        ("hand", ["hand", "hands", "fingers"]),
        ("arm", ["arm", "forearm", "elbow"]),
        ("microphone", ["microphone", "mic", "microphone stand"]),
        ("text/captions", ["caption", "text", "subtitle", "words", "writing"]),
        ("black_bar", ["black bar", "black band", "black strip", "black region"]),
        ("background", ["background", "wall", "studio"]),
    ]
    for label, keywords in content_keywords:
        if any(not re.search(negative, c) and any(
            re.search(r'\b' + re.escape(kw) + r'\b', c) and re.search(r'\b(?:visible|shows?|see|contains?)\b', c)
            for kw in keywords) for c in clauses):
            visible_content.append(label)

    # Framing evaluation
    framing_ok = claim(
        r'\b(?:well[- ]framed|properly framed|correctly framed|good framing|nicely framed)\b',
        r'\b(?:not (?:well[- ]|properly |correctly )framed|poor framing|badly framed|needs to be reframed|cropped|cut off)\b',
    )

    return {
        "subject_visible":  subject_visible,
        "subject_position": subject_position,
        "visible_content":  visible_content,
        "framing_ok":       framing_ok,
        "confidence":       None,
    }


# ── Idle watchdog ─────────────────────────────────────────────────────────────
def _idle_watchdog():
    while True:
        time.sleep(10)
        with _model_lock:
            if _model is not None and (time.time() - _last_used) > IDLE_TIMEOUT:
                log.info(f"Idle timeout ({IDLE_TIMEOUT}s) reached — releasing model memory")
                _unload_model()


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Sclip Vision Sidecar", version="1.1.0")


@app.get("/health", response_model=HealthResponse)
def health():
    with _model_lock:
        loaded = _model is not None
        idle   = round(time.time() - _last_used, 1)
        mid    = _model_id or MODEL_HF_ID
        st     = _state.value
        err    = _error_detail
    return HealthResponse(ok=True, state=st, model_loaded=loaded, model=mid, idle_s=idle, error=err)


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    global _last_used

    # Determine input image paths
    raw_paths: list[str] = []
    if req.image_paths:
        raw_paths = req.image_paths
    elif req.image_path:
        raw_paths = [req.image_path]
    else:
        raise HTTPException(status_code=422, detail="Either image_path or image_paths must be provided")

    for p in raw_paths:
        if not os.path.isfile(p):
            raise HTTPException(status_code=422, detail=f"Image file not found: {p}")

    # Determine resolution policy
    res_mode = (req.resolution or "auto").lower()
    is_text = _is_text_query(req.question, req.context)
    if res_mode == "original":
        target_long = None
        actual_res_desc = "original"
    elif res_mode == "high":
        target_long = 768
        actual_res_desc = "high_768px"
    elif res_mode == "low":
        target_long = 512
        actual_res_desc = "low_512px"
    else:  # "auto"
        target_long = 672 if is_text else 512
        actual_res_desc = f"auto_{target_long}px"

    # Preprocess / scale images
    processed_paths: list[str] = []
    temp_paths: list[str] = []
    for p in raw_paths:
        if target_long is not None:
            scaled_path, is_temp = _scale_image(p, target_long)
            processed_paths.append(scaled_path)
            if is_temp:
                temp_paths.append(scaled_path)
        else:
            processed_paths.append(p)

    # Token limit
    max_tokens = req.max_tokens or (96 if is_text else MAX_TOKENS)

    try:
        with _model_lock:
            _last_used = time.time()
            try:
                _ensure_model_loaded(MODEL_HF_ID)
            except Exception as e:
                log.error(f"Model load failed: {e}")
                raise HTTPException(status_code=503, detail=f"Model load failed: {e}")

            try:
                raw, latency = _run_inference(processed_paths, req.question, req.context, max_tokens)
                _last_used = time.time()
            except Exception as e:
                log.error(f"Inference failed: {e}\n{traceback.format_exc()}")
                raise HTTPException(status_code=500, detail=f"Inference failed: {e}")
    finally:
        # Cleanup temporary scaled images
        for tmp in temp_paths:
            try:
                if os.path.exists(tmp):
                    os.unlink(tmp)
            except Exception:
                pass

    parsed = _parse_response(raw, req.question)

    return AnalyzeResponse(
        description=raw,
        raw_response=raw,
        latency_ms=round(latency * 1000, 1),
        model=MODEL_HF_ID,
        resolution_used=actual_res_desc,
        input_frames=len(raw_paths),
        **parsed,
    )


@app.post("/unload")
def unload():
    with _model_lock:
        _unload_model()
    return {"ok": True}


@app.post("/audio/analyze")
def analyze_audio_endpoint(req: AudioAnalyzeRequest):
    if not os.path.isfile(req.audio_path):
        raise HTTPException(status_code=422, detail=f"Audio file not found: {req.audio_path}")
    try:
        from vision.sidecar.audio_analyzer import analyze_audio
    except ImportError:
        try:
            from audio_analyzer import analyze_audio
        except ImportError as e:
            raise HTTPException(status_code=500, detail=f"Failed to import audio_analyzer: {e}")

    try:
        result = analyze_audio(
            req.audio_path,
            cut_timestamps_us=req.cut_timestamps_us,
            word_boundaries=req.word_boundaries,
        )
        return result
    except Exception as e:
        log.error(f"Audio analysis failed: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Audio analysis failed: {e}")


@app.post("/sequence/inspect")
def inspect_sequence_endpoint(req: SequenceInspectRequest):
    if not req.image_paths or len(req.image_paths) == 0:
        raise HTTPException(status_code=422, detail="image_paths must contain at least 1 image")
    for p in req.image_paths:
        if not os.path.isfile(p):
            raise HTTPException(status_code=422, detail=f"Image file not found: {p}")

    processed_paths: list[str] = []
    temp_paths: list[str] = []
    for p in req.image_paths:
        scaled, is_temp = _scale_image(p, 512)
        processed_paths.append(scaled)
        if is_temp:
            temp_paths.append(scaled)

    prompt = (
        "You are an expert video editing supervisor reviewing a chronological sequence of video frames from an edit. "
        "Analyze the visual progression across time:\n"
        "1. JUMP CUT: Is there an awkward jump-cut or disorienting camera jump between consecutive frames? (yes/no + brief explanation)\n"
        "2. FRAMING: Are subjects framed well in the vertical 9:16 frame, or are heads/actions cut off? (good/bad + details)\n"
        "3. ACTION: Briefly summarize what action takes place."
    )

    try:
        with _model_lock:
            global _last_used
            _last_used = time.time()
            _ensure_model_loaded(MODEL_HF_ID)
            raw, latency = _run_inference(processed_paths, prompt, None, req.max_tokens or 128)
            _last_used = time.time()
    except Exception as e:
        log.error(f"Sequence inference failed: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Sequence inference failed: {e}")
    finally:
        for tmp in temp_paths:
            try:
                if os.path.exists(tmp):
                    os.unlink(tmp)
            except Exception:
                pass

    low = raw.lower()
    jump_cut = "jump cut: yes" in low or ("awkward jump" in low and "no" not in low)
    framing_bad = "framing: bad" in low or "cut off" in low or "head cut" in low

    return {
        "ok": True,
        "raw_critique": raw,
        "jump_cut_detected": jump_cut,
        "framing_defects_detected": framing_bad,
        "latency_ms": round(latency * 1000, 1),
        "frame_count": len(req.image_paths),
    }


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import socket

    if PORT == 0:
        s = socket.socket()
        s.bind((HOST, 0))
        actual_port = s.getsockname()[1]
        s.close()
    else:
        actual_port = PORT

    print(f"SCLIP_VLM_PORT={actual_port}", flush=True)
    log.info(f"Starting optimized vision sidecar on {HOST}:{actual_port}")
    log.info(f"Model: {MODEL_HF_ID}")
    log.info(f"Idle timeout: {IDLE_TIMEOUT}s")
    log.info(f"Default max tokens: {MAX_TOKENS}")

    t = threading.Thread(target=_idle_watchdog, daemon=True)
    t.start()

    uvicorn.run(app, host=HOST, port=actual_port, log_level="warning")
