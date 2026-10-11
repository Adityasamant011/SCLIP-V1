# Local audio understanding — 2026-10-11

## Choice and scope

SenseVoiceSmall INT8 (roughly 234M parameters; 239,233,841-byte ONNX model)
through sherpa-onnx 1.13.4 CPU. An efficient deployment for this Mac rather than
another resident multi-billion-parameter GPU model. This is coarse audio
observation, **not open-ended audio question answering or a voice-quality judge**.
Languages/emotion/event tags and recognition may be wrong or unknown. Speech
boundaries still require local Whisper and actual relevant review.

Primary sources: [SenseVoice](https://github.com/QwenAudio/SenseVoice),
[model card](https://huggingface.co/FunAudioLLM/SenseVoiceSmall),
[sherpa integration](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html).
Pinned artifacts, licenses and ownership decision: ADR0078 and content catalog.

## Implemented

- `inspect_rendered_audio` optional `include_understanding:true`: actual current
  production mix, not projected source audio. Maximum 30s; independent 10s
  windows with current timeline coordinates, unknown/conflicting labels kept.
- `get_audio_understanding_status`: readiness without loading anything.
- CPU-only, one low-priority thread/job, 60s hard timeout, bounded output,
  cancellation cleanup, 8-entry content/model identity cache with fresh temporal
  remapping. Process exits after each uncached job; no resident GPU allocation.
- Existing Whisper/measurements remain available if SenseVoice is missing/fails;
  coarse recognition cannot upgrade missing Whisper to speech verification.
- Existing ProjectActor freshness, modality receipts and single-writer ownership
  unchanged. No creative issue/repair/voice/partner edit is generated.
- Reused pinned content downloader. Verified macOS runtime required local ad-hoc
  signing in staging; preparation failure publishes nothing. Setup added only
  managed model/runtime/tokenizer directories and license provenance.
- Hermes skill/catalog describes when the optional sense may be useful and its
  limits. It is not silently enabled for every background timeline review.

## Executed validation

- Typecheck PASS; production desktop, CLI and skills build PASS.
- 122 focused tests PASS across 8 files: audio adapter, actual mix inspection,
  pinned catalog, downloader preparation, MCP catalog/execution, review grounding
  and completion review. Covers contradiction preservation, missing/malformed
  models/results, bounds, busy state, active cancellation, cache eviction and
  artifact changes, temporal remapping, no mutation and modality separation.
- One local Electron/MCP synthetic test PASS: render -> Whisper + native
  SenseVoice -> current timeline evidence receipt -> repeat/cache -> unchanged
  ProjectActor identity. 14s mix: 5.311s model, 7.670s complete inspection.
- Native two-window synthetic test: 14.635s audio, 5.519s inference wall time;
  `/usr/bin/time -l` peak RSS 619,839,488 bytes (~591 MiB), zero swaps. This is a
  small workload measurement, not a universal latency/RAM guarantee.
- Actual English synthetic narration recognized; Speech tags, emotion unknown.
  No claim that emotion accuracy or all event classes are behaviorally proven.
- Initial unit catalog fixture wrongly used an async helper synchronously;
  corrected. Localhost test servers required sandbox escalation. Initial E2E
  assertion expected a receipt in the first content block; corrected to start
  an ad-hoc review and read the actual separate receipt block. No production
  behavior changed to satisfy those expectations.
- `git diff --check` PASS. No Rust/media-engine changes; no paid/provider calls.

## Installation / limitations

User requested Applications update. Use the existing safe install procedure:
production build, signed bundle, byte comparisons of main/preload/renderer/CLI/
skills/workers, previous app backup, graceful quit and atomic replacement,
profile-file hashes preserved. Installed production launch must independently
report ready and run actual local rendered-audio inference in a disposable
project, without provider credentials or real creator history.

Currently macOS arm64 only. Installed model storage is approximately 265MB of
compressed downloads plus extracted runtime libraries. CPU inference may still
use one core and around 600MB while active; no guarantee of zero slowdowns.
No image/video generator, paid experiment or extra editorial agent was added.
Kokoro remains synthesis, Qwen remains vision, Whisper remains word-timing ASR.

Local test artifacts: `.scratch/audio-understanding/{focused.log,typecheck.log,
electron-result.json,electron-trace.json,native-benchmark.json,native-resources.log,
setup-result.json,build-production.log,package.log,installed-audio-result.json}`.
Provider cost: **$0.00**. No allowances/settings/credentials changed.
