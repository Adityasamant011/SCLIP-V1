# Optional local music tool

`generate_music` uses **Stable Audio Open Small**, a different model from Stable
Audio Open 1.0 and Stable Audio 3. It creates a 1–11 second, 44.1 kHz stereo PCM
WAV asset inside a saved project's `Media/Generated` folder. Import the returned
path with `import_media`, audition it, then place/mix it using normal audio tools.
It does not add a layer automatically. There is no cloud fallback or per-use API
charge. The author's text-model provider still has its own costs.

This is an optional technical beta on macOS Apple Silicon with at least 16 GiB
RAM. Admission requires 8 GiB free memory for audio, 2 GiB free output disk and
one owned generation job at a time. The CPU worker has a 4 GiB RSS budget and a
five-minute timeout; cancellation kills its owned process before publishing a
result. These are application guards, not an OS memory reservation. No MLX speed
claim has been verified. Listen to the result: musical quality, seamless looping
and absence of vocals are not guaranteed. Small's upstream model card says it
is better at effects/field recordings than music.

The CPU worker releases diffusion/text models before waveform decoding, then
uses float32 decoding in 64-latent windows with 32-latent overlap. This avoids
the slow half-precision CPU decoder and bounds convolution workspace memory.
One verified 8-second candidate took about 23–24 seconds on the development
16 GiB Mac; this is a single local observation, not a general latency promise.

On macOS, headroom uses the system's `memory_pressure -Q` query rather than
counting only currently unused RAM pages. An idle vision model is released
before admission; a running inspection is preserved and generation asks to retry.

## Setup

Use a **separate Python 3.11 virtual environment**, never the vision environment.
The pinned dependency file is `apps/desktop/scripts/music-requirements.txt`.
For example, from `apps/desktop`:

```bash
python3.11 -m venv "$HOME/.sclip-music-runtime"
"$HOME/.sclip-music-runtime/bin/python" -m pip install -r scripts/music-requirements.txt
"$HOME/.sclip-music-runtime/bin/hf" auth login
```

Enter a read token at the hidden login prompt. Do not put tokens in commands,
source files or chat. First review and accept access terms yourself on the
[official Small repository](https://huggingface.co/stabilityai/stable-audio-open-small).
Commercial use is governed by the [Stability license](https://stability.ai/license).
The setup script cannot accept provider terms for you.

If the older runtime client rejects token login, the official 2.2.0 client
supports browser/device authorization. Keep it in a separate environment so
upgrading the login client does not break Transformers' runtime requirements:

```bash
python3.11 -m venv "$HOME/.sclip-hf-auth"
"$HOME/.sclip-hf-auth/bin/python" -m pip install huggingface-hub==2.2.0
"$HOME/.sclip-hf-auth/bin/hf" auth login
```

Choose browser login and complete the authorization on Hugging Face. The clients
share the default credential location; the music worker itself runs offline with
a separate model cache. Browser authorization does not accept model access
terms automatically.

Call `get_local_generation_status` in the running Sclip app for its `model_root`.
Use that exact absolute directory below (or select a separate test root and set
`SCLIP_GENERATION_MODELS_DIR` when launching a development app):

```bash
"$HOME/.sclip-music-runtime/bin/python" scripts/setup-music-pack.py \
  --root "/absolute/model_root/from/status" --license-accepted
```

Setup needs 4 GiB free disk, authenticated model access and a network connection.
It downloads from the official model and T5 repositories, records exact resolved
revisions, and installs a complete pack atomically with SHA-256 hashes for all
files. Existing packs are preserved. `--revision` and `--text-revision` can pin
earlier exact revisions. No inference occurs during setup.

The installed T5 checkpoint retains only the encoder in the float16 precision
already used by the runtime. Its unused text decoder is omitted. The manifest
records the original source-checkpoint hash and this transformation; the full
pack is approximately 1.8 GiB. A fixed-seed acceptance check produced byte-for-byte
identical WAV output before and after this compaction. Downloads use standard
HTTPS; an incomplete pack is never marked ready. The prepared cache migration
marker is included in the integrity manifest so first inference does not add an
unverified file.

Inference verifies the files and runtime versions, uses the pack's isolated HF
cache in offline mode, disables telemetry, and rejects network connections. It
never receives the login token. Cache hits revalidate the actual WAV and recorded
hash. Source/license/model/seed metadata is stored next to the generated asset.

The stock-image/video tools are separate. In this desktop beta, each user enters
their own Pexels/Pixabay keys in Settings → Stock media. Do not distribute an
owner's shared API key inside the app. Shared credentials require a backend and
appropriate provider permission/quotas.
