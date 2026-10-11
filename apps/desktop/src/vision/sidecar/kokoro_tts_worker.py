"""
Kokoro-82M TTS Worker for Sclip & WeftCut.
Runs ultra-compact (82M params, ~88MB) studio-quality TTS on macOS.
Provides natural American & British accents with automatic model provisioning.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

def ensure_model_files(model_arg: str | None, voices_arg: str | None) -> tuple[str, str]:
    home = os.path.expanduser("~")
    model_dir = os.path.join(home, "Library", "Application Support", "Sclip", "models", "kokoro")
    os.makedirs(model_dir, exist_ok=True)

    model_candidates = [
        model_arg,
        os.path.join(model_dir, "kokoro-v1.0.int8.onnx"),
        os.path.join(model_dir, "kokoro-v0_19.onnx"),
        os.path.join(model_dir, "kokoro-v1.0.onnx"),
    ]
    model_path = next((m for m in model_candidates if m and os.path.exists(m) and os.path.getsize(m) > 1000), None)

    voices_candidates = [
        voices_arg,
        os.path.join(model_dir, "voices-v1.0.bin"),
        os.path.join(model_dir, "voices.bin"),
    ]
    voices_path = next((v for v in voices_candidates if v and os.path.exists(v) and os.path.getsize(v) > 1000), None)

    if not model_path:
        model_path = os.path.join(model_dir, "kokoro-v1.0.int8.onnx")
        sys.stderr.write(f"Kokoro model not found locally. Auto-downloading to {model_path}...\n")
        urllib.request.urlretrieve(MODEL_URL, model_path)

    if not voices_path:
        voices_path = os.path.join(model_dir, "voices-v1.0.bin")
        sys.stderr.write(f"Kokoro voices not found locally. Auto-downloading to {voices_path}...\n")
        urllib.request.urlretrieve(VOICES_URL, voices_path)

    return model_path, voices_path

def main():
    parser = argparse.ArgumentParser(description="Generate speech using Kokoro-82M ONNX")
    parser.add_argument("--list-voices", action="store_true", help="Return installed voice IDs and aliases without generating audio")
    parser.add_argument("--text", default=None, help="Text to speak")
    parser.add_argument("--voice", default="alloy", help="Speaker name or alias (alloy, echo, fable, onyx, nova, shimmer, af_heart, am_michael, etc.)")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech rate multiplier")
    parser.add_argument("--output", default=None, help="Output destination WAV path")
    parser.add_argument("--model", default=None, help="Path to kokoro ONNX model file")
    parser.add_argument("--voices", default=None, help="Path to voices.bin file")
    args = parser.parse_args()

    model_path, voices_path = ensure_model_files(args.model, args.voices)

    import kokoro_onnx
    import soundfile as sf

    voice_alias_map = {
        "alloy": "af_heart",
        "echo": "am_adam",
        "fable": "bm_george",
        "onyx": "am_michael",
        "nova": "af_nicole",
        "shimmer": "af_sarah",
        "default": "af_heart",
        # Common short names
        "heart": "af_heart",
        "bella": "af_bella",
        "sarah": "af_sarah",
        "nicole": "af_nicole",
        "michael": "am_michael",
        "adam": "am_adam",
        "eric": "am_eric",
        "emma": "bf_emma",
        "isabella": "bf_isabella",
        "george": "bm_george",
        "daniel": "bm_daniel",
        # Legacy mappings gracefully routed to natural Kokoro voices
        "vivian": "af_heart",
        "serena": "af_bella",
        "ryan": "am_adam",
        "dylan": "bm_george",
        "aiden": "am_michael",
        "uncle_fu": "bm_george",
        "ono_anna": "af_sarah",
        "sohee": "af_nicole",
    }

    voice_key = args.voice.lower().strip()
    speaker = voice_alias_map.get(voice_key, voice_key)

    kokoro = kokoro_onnx.Kokoro(model_path, voices_path)
    available_voices = set(kokoro.get_voices())

    if args.list_voices:
        print(json.dumps({"voices": sorted(v for v in available_voices if v.startswith(("a", "b"))), "supported_languages": ["en-us", "en-gb"], "other_voice_count": sum(not v.startswith(("a", "b")) for v in available_voices), "aliases": {k: v for k, v in voice_alias_map.items() if v in available_voices}, "model": os.path.basename(model_path)}))
        return
    if not args.text or not args.output:
        parser.error("--text and --output are required for synthesis")
    if speaker not in available_voices:
        parser.error(f"Unknown Kokoro voice {speaker!r}; use --list-voices. No substitute voice was generated.")

    if not speaker.startswith(("a", "b")):
        parser.error("This worker currently supports English pronunciation only; no voice/language substitution performed.")
    lang = "en-gb" if speaker.startswith("b") else "en-us"

    output_dir = os.path.dirname(os.path.abspath(args.output))
    os.makedirs(output_dir, exist_ok=True)

    samples, sample_rate = kokoro.create(
        text=args.text,
        voice=speaker,
        speed=args.speed,
        lang=lang,
    )

    sf.write(args.output, samples, sample_rate)

    if os.path.exists(args.output) and os.path.getsize(args.output) > 100:
        print(json.dumps({"engine": "kokoro-tts", "resolved_voice": speaker, "requested_voice": args.voice,
                          "model": os.path.basename(model_path), "language": lang, "speed": args.speed, "sample_rate": sample_rate}))
        sys.exit(0)
    else:
        sys.stderr.write(f"Failed to write output audio file to {args.output}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
