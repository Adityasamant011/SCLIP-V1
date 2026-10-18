"""Provision the optional Stable Audio Open Small pack, separate from inference.

Requires an authenticated Hugging Face account with accepted model terms.
Never embeds credentials or accepts access terms. Existing packs are preserved.
Run using the isolated music Python; see docs/local-music.md.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

MODEL = "stabilityai/stable-audio-open-small"
RUNTIME = "0.0.19"
VERSIONS = {"stable-audio-tools": RUNTIME, "torch": "2.5.1", "torchaudio": "2.5.1",
            "torchvision": "0.20.1", "transformers": "4.46.3", "numpy": "1.23.5", "scipy": "1.12.0"}


def sha256(file):
    h = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def compact_text_encoder(snapshot):
    """Keep the encoder and precision actually used by the music runtime.

    The official T5-base checkpoint also contains an unused text decoder. The
    inference runtime already casts its T5 encoder to float16. Saving exactly
    those encoder weights reduces the installed pack without quantization.
    """
    import torch
    from transformers import T5EncoderModel
    source_hash = sha256(snapshot / "model.safetensors")
    encoder = T5EncoderModel.from_pretrained(str(snapshot), local_files_only=True,
                                             use_safetensors=True, torch_dtype=torch.float16)
    with tempfile.TemporaryDirectory(prefix=".encoder-", dir=snapshot.parent) as temporary:
        encoder.save_pretrained(temporary, safe_serialization=True)
        for name in ("model.safetensors", "config.json"):
            os.replace(Path(temporary) / name, snapshot / name)
    del encoder
    return {"variant": "encoder-only-fp16", "source_safetensors_sha256": source_hash}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="model_root returned by get_local_generation_status")
    parser.add_argument("--license-accepted", action="store_true", help="confirm you have already accepted Small's terms on Hugging Face")
    parser.add_argument("--revision", default="main", help="optional exact model revision; resolved SHA is recorded")
    parser.add_argument("--text-revision", default="main", help="optional exact T5 revision; resolved SHA is recorded")
    args = parser.parse_args()
    if not args.license_accepted:
        parser.error("Review and accept the model's terms yourself before using --license-accepted")
    for name, expected in VERSIONS.items():
        if importlib.metadata.version(name) != expected:
            raise RuntimeError(f"Install the pinned music requirements first: {name} must be {expected}")
    # Standard HTTPS streams progress to disk and avoids the accelerated Xet
    # transport's large parallel buffers/stalls on some desktop connections.
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    from huggingface_hub import HfApi, get_token, hf_hub_download, get_hf_file_metadata, hf_hub_url
    from huggingface_hub.errors import GatedRepoError
    if not get_token():
        raise RuntimeError("Hugging Face login is required. Run this environment's hf auth login; never put a token in a command or chat.")
    root = args.root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    target = root / "music"
    if target.exists():
        raise RuntimeError("An existing music pack is present; preserve it or choose another root")
    if shutil.disk_usage(root).free < 4 * 1024**3:
        raise RuntimeError("At least 4 GiB free space is required to prepare the optional music pack")
    api = HfApi()
    revision = api.model_info(MODEL, revision=args.revision).sha
    try:
        get_hf_file_metadata(hf_hub_url(MODEL, "model_config.json", revision=revision), token=True,
                             headers={"Cache-Control": "no-cache"})
    except GatedRepoError:
        raise RuntimeError("This signed-in Hugging Face account does not yet have Small access. Review its access section at https://huggingface.co/stabilityai/stable-audio-open-small and complete the agreement yourself; login alone does not grant model access.") from None
    text_revision = api.model_info("t5-base", revision=args.text_revision).sha
    text_files = set(api.list_repo_files("t5-base", revision=text_revision))
    names = {"config.json", "model.safetensors", "spiece.model", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"} & text_files
    if not {"config.json", "model.safetensors", "spiece.model"} <= names:
        raise RuntimeError("Unexpected T5 layout; no incomplete pack was installed")
    with tempfile.TemporaryDirectory(prefix=".music-setup-", dir=root) as temporary:
        staging = Path(temporary)
        weights = staging / "pack" / "weights"
        weights.mkdir(parents=True)
        cache = staging / "downloads"
        def fetch(repo, name, revision, output):
            print(f"Downloading {repo}/{name} at {revision}", flush=True)
            downloaded = Path(hf_hub_download(repo, name, revision=revision, cache_dir=cache,
                                               headers={"Cache-Control": "no-cache"}))
            output.parent.mkdir(parents=True, exist_ok=True)
            # No duplicate model bytes and no cache symlinks in the installed pack.
            os.link(downloaded.resolve(), output)
        for name in ("model_config.json", "model.safetensors"):
            fetch(MODEL, name, revision, weights / name)
        config = json.loads((weights / "model_config.json").read_text())
        if config.get("sample_rate") != 44100:
            raise RuntimeError("Unexpected Small sample rate")
        t5 = weights / "hub" / "models--t5-base"
        for name in sorted(names):
            fetch("t5-base", name, text_revision, t5 / "snapshots" / text_revision / name)
        text_encoder = compact_text_encoder(t5 / "snapshots" / text_revision)
        (t5 / "refs").mkdir(parents=True)
        (t5 / "refs" / "main").write_text(text_revision)
        # Transformers 4.x otherwise writes this migration marker on first
        # import, which would add an unverified file to the immutable pack.
        (weights / "hub" / "version.txt").write_text("1")
        manifest = {"schema": 1, "model": MODEL, "revision": revision,
                    "runtime": "stable-audio-tools", "runtime_version": RUNTIME,
                    "python": str(Path(sys.executable).absolute()), "license_acknowledged": True,
                    "text_model": "t5-base", "text_revision": text_revision,
                    "text_encoder": text_encoder,
                    "runtime_versions": VERSIONS,
                    "files": {str(p.relative_to(weights)): sha256(p) for p in sorted(weights.rglob("*")) if p.is_file()}}
        (staging / "pack" / "manifest.json").write_text(json.dumps(manifest, indent=2))
        # Renaming a complete pack on the same filesystem publishes it atomically.
        # The directory is unique; never replace an existing installation.
        if target.exists():
            raise RuntimeError("Another pack was installed during setup; preserved it")
        (staging / "pack").rename(target)
    print(f"Music pack installed: {target}. No generation or timeline editing was performed.")


if __name__ == "__main__":
    main()
