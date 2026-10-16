"""Single owned, offline generation job. Optional runtimes never share the vision venv.

Input/output are app-selected local paths, not executable prompt text. No planner,
prompt rewriting, implicit model download, TTS substitution or timeline editing.
"""
import importlib.metadata
import json
import os
from pathlib import Path
import socket
import sys


def deny_network(*_args, **_kwargs):
    raise RuntimeError("Generation is offline; install the complete model pack first")


def generate_image(req):
    import mlx.core as mx
    from mflux.models.common.config.model_config import ModelConfig
    from mflux.models.flux2.variants import Flux2Klein

    if importlib.metadata.version("mflux") != req["runtime_version"]:
        raise RuntimeError("Image runtime differs from the verified pack")
    if hasattr(mx, "set_memory_limit"):
        mx.set_memory_limit(req["working_bytes"])
    if hasattr(mx, "set_cache_limit"):
        mx.set_cache_limit(256 * 1024 * 1024)
    model = Flux2Klein(model_path=req["weights"], quantize=4,
                      model_config=ModelConfig.flux2_klein_4b(), compute_precision=mx.float16)
    image = model.generate_image(seed=req["seed"], prompt=req["prompt"],
                                 num_inference_steps=4, width=req["width"], height=req["height"])
    image.save(req["output"])


def local_t5_paths(value, root):
    if isinstance(value, dict):
        if value.get("type") == "t5" or "t5_model_name" in value:
            config = value.setdefault("config", {}) if value.get("type") == "t5" else value
            config["model_path"] = str(root / "t5")
        for item in list(value.values()):
            local_t5_paths(item, root)
    elif isinstance(value, list):
        for item in value:
            local_t5_paths(item, root)


def generate_music(req):
    import torch
    import numpy as np
    import wave
    from safetensors.torch import load_file
    from stable_audio_tools.models.factory import create_model_from_config
    from stable_audio_tools.inference.generation import generate_diffusion_cond

    if importlib.metadata.version("stable-audio-tools") != req["runtime_version"]:
        raise RuntimeError("Music runtime differs from the verified pack")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    root = Path(req["weights"])
    config = json.loads((root / "model_config.json").read_text())
    if config.get("sample_rate") != 44100:
        raise RuntimeError("Unexpected music model sample rate")
    local_t5_paths(config, root)
    # CPU is deliberate for the first compact audio integration. Metal support
    # is not inferred from CUDA benchmarks or silently selected.
    model = create_model_from_config(config)
    model.load_state_dict(load_file(str(root / "model.safetensors"), device="cpu"), strict=True)
    model = model.to("cpu").eval()
    with torch.inference_mode():
        audio = generate_diffusion_cond(model, steps=8, cfg_scale=1.0,
            conditioning=[{"prompt": req["prompt"], "seconds_total": req["duration_seconds"]}],
            sample_size=config["sample_size"], seed=req["seed"], sampler_type="pingpong", device="cpu")
    frames = round(req["duration_seconds"] * 44100)
    if audio.ndim != 3 or audio.shape[0] != 1 or audio.shape[1] != 2 or audio.shape[2] < frames:
        raise RuntimeError("Music generator returned an unexpected shape")
    audio = audio[0, :, :frames].detach().float().cpu().numpy()
    if not np.isfinite(audio).all():
        raise RuntimeError("Music generator returned nonfinite samples")
    peak = float(np.max(np.abs(audio)))
    if peak > 0.98:
        audio *= 0.98 / peak
    pcm = (np.clip(audio.T, -1, 1) * 32767).astype("<i2")
    with wave.open(req["output"], "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(44100)
        output.writeframes(pcm.tobytes())


def main():
    req = json.loads(sys.stdin.read(16385))
    weights = Path(req["weights"])
    if not weights.is_absolute() or not weights.is_dir() or not Path(req["output"]).is_absolute():
        raise RuntimeError("Generation requires configured absolute local paths")
    # Defense in depth: an incomplete library cache cannot turn into a WAN call.
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_DATASETS_OFFLINE="1",
                      HF_HUB_DISABLE_TELEMETRY="1", DO_NOT_TRACK="1")
    socket.socket.connect = deny_network
    socket.create_connection = deny_network
    if req["kind"] == "image":
        generate_image(req)
    elif req["kind"] == "music":
        generate_music(req)
    else:
        raise RuntimeError("Unknown generator")


if __name__ == "__main__":
    main()
