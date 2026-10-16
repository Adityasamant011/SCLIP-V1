# 0078 — Audio understanding is an on-demand CPU observation

SenseVoiceSmall INT8 via sherpa-onnx 1.13.4 provides coarse language, emotion,
event and transcript observations. It supplements rendered audio measurements
and local Whisper, never replaces word-timing evidence or Hermes's judgment.
The initial supported platform is macOS arm64. No other platform is advertised
as configured merely because model bytes are portable.

The model is 239,233,841 bytes; the CPU runtime archive is 25,046,327 bytes.
Artifacts are pinned by upstream revision/release, exact size and SHA256 in the
existing content catalog, installed through the existing verified downloader.
macOS ad-hoc signing occurs in staging before publication. Model licensing is
FunASR Model Open Source License v1.1, not the runtime's Apache-2.0 license.
Upstream attribution/license accompanies the installed model.

`inspect_rendered_audio` accepts `include_understanding:true`. Current-timeline
provenance, state freshness and ordinary audio/speech modality requirements are
unchanged. Analysis is explicit, at most 30 seconds, divided into independent
10-second windows. Conflicting/unknown observations remain visible. No global
emotion summary, confidence invention, voice-quality rating, creative diagnosis
or repair is computed. Whisper remains the word-timing verifier.

One low-priority process, one CPU thread, maximum 60 seconds, bounded output and
8-entry content/model-identity cache. The process exits and unloads the model;
there is no GPU allocation, always-on worker, background inference or cloud
fallback. Cancelled/failed results are not cached. Missing installation is
explicit. `get_audio_understanding_status` does not load a model.

References: [SenseVoice](https://github.com/QwenAudio/SenseVoice),
[Sherpa SenseVoice](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html),
[model license](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE).

2026-10-16: [ADR 0079](0079-background-feedback-is-bounded-local-observation.md)
extends scheduling to bounded creator-requested background observations. The
original explicit tool remains; interpretation, process bounds and local-only
constraints are unchanged.
