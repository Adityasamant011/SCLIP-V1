<p align="center">
  <img src="apps/desktop/src/renderer/public/icons/icon.svg" alt="SCLIP" width="128" height="128" />
</p>

<h1 align="center">SCLIP (v1)</h1>

<p align="center">
  <strong>The Agentic AI Desktop Video Editor</strong><br/>
  An autonomous desktop NLE designed for human-AI creative collaboration. Embedded with Hermes AI, a complete Model Context Protocol (MCP) tool surface, on-device speech and vision intelligence, and a high-performance WebGPU timeline.
</p>

<p align="center">
  <a href="https://github.com/Adityasamant011/SCLIP-V1"><img alt="Platform" src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-5B7196?style=flat-square&labelColor=475569" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-blue?style=flat-square&labelColor=475569" /></a>
  <img alt="Protocol" src="https://img.shields.io/badge/Protocol-MCP%20Tools-orange?style=flat-square&labelColor=475569" />
  <img alt="Co-Pilot" src="https://img.shields.io/badge/Co--Pilot-Hermes%20Agent-purple?style=flat-square&labelColor=475569" />
</p>

![An agent editing the timeline live over MCP](docs/assets/agent-edit.gif)

<p align="center"><em>SCLIP Agent working over MCP while playback runs: trimming footage, styling typography, placing B-roll, and executing editorial workflows in real time.</em></p>

Most editors bolt AI on as a decorative feature: a text prompt that generates an isolated clip in a modal, or a sidebar that suggests a generic cut. **SCLIP** exposes the video editor *itself* as a native tool surface. 

A localhost **Model Context Protocol (MCP)** server publishes the entire suite of editing tools — place, trim, split, restyle, keyframe, group, caption, mix, inspect, and checkpoint — directly to AI agents. Paired with an embedded **Hermes** creative engine, SCLIP can understand footage, follow user briefs, synthesize voiceovers, align captions, inspect canvas aesthetics, and assemble polished video timelines autonomously.

---

## ✨ Key Capabilities

### 🤖 Embedded Agentic Video Editor (Hermes & MCP)
* **Live Interactive Editing**: Agents edit the exact project you are looking at while playback runs. No clunky import/export cycles.
* **Full Transparency**: Every agent tool call appears in real time in the Sclip Activity panel and timeline undo history.
* **Deterministic & Reversible**: Safe atomic checkpoints before every multi-step edit with instant one-click rollbacks and collision-free `dry_run` simulations.
* **Dedicated MCP Suite**: Comprehensive tool catalog covering timeline edits, keyframes, transitions, shaders, audio mixing, project inspection, and export.

### 👁️ Visual Intelligence & Live Canvas Review
* **Local Frame Understanding**: Evaluates shot composition, brightness, sharpness, and semantic scene content.
* **Preview Canvas Vision**: Captures and reviews live composited preview frames to verify typography contrast, layout balance, and pacing before finalizing cuts.
* **Background Feedback Observer**: Bounded local monitoring that detects editorial opportunities without interrupting the user.

### 🎙️ Speech, Audio & Voiceover Engine
* **Local Kokoro Neural TTS**: High-fidelity text-to-speech voiceovers synthesized locally without third-party API dependencies or costs.
* **On-Device Whisper & SenseVoice**: Automatic transcription, subtitle generation, and precise audio-to-text alignment.
* **Intelligent Audio Mixer**: Role-based console (dialogue, music, sound effects, voiceover) with automated dead-air / pause detection and ripple excision.

### 🎨 Code as Video: Motifs
* **Dynamic Web Overlays**: Author on-screen motion graphics, animated lower thirds, countdowns, and kinetic typography using standard HTML, CSS, SVG, and Canvas.
* **Pure Functions of Time**: Motifs render deterministically with the timeline clock, guaranteeing identical pixels in preview, scrubbing, and final export.

### ⚡ Professional NLE Architecture
* **Frame-Accurate Multi-Track Timeline**: A/B-roll tracks, SMPTE timecode accuracy, ripple editing, linked audio/video trimming, and nested compositions.
* **Curve Keyframing**: Bezier easing, tangent manipulation, motion paths, and parameter extrapolation.
* **Hardware-Accelerated Exports**: Streamed encoding for H.264, HEVC, and AV1 via native FFmpeg and WebCodecs pipelines.

---

## 🛠️ Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                               SCLIP App                                │
├────────────────────────────┬───────────────────────────────────────────┤
│ Shell & UI                 │ • Electron 44 + TypeScript 7              │
│                            │ • React 19 + Tailwind CSS v4 + Base UI    │
│                            │ • Zustand state + Immer mutations         │
├────────────────────────────┼───────────────────────────────────────────┤
│ Preview & Compositor       │ • PixiJS v8 + WebGPU / WebGL              │
│                            │ • WebCodecs VideoDecoder pool             │
│                            │ • Custom YUV→RGB WebGL shaders            │
├────────────────────────────┼───────────────────────────────────────────┤
│ Native Core & Acceleration │ • Rust engine (napi-rs 3) + Tokio runtime │
│                            │ • In-process LGPL FFmpeg decode           │
│                            │ • GPU-lane hardware video acceleration    │
├────────────────────────────┼───────────────────────────────────────────┤
│ Agent Bridge (MCP)         │ • Localhost MCP Server (HTTP / stdio)     │
│                            │ • Full editing and checkpointing catalog  │
├────────────────────────────┼───────────────────────────────────────────┤
│ Speech & Vision Sense      │ • Local Kokoro TTS engine                 │
│                            │ • SenseVoice / FunASR & Whisper STT       │
│                            │ • Bundled Hermes creative agent           │
└────────────────────────────┴───────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Hand Your Timeline to an Agent

1. Open **SCLIP** and navigate to your project.
2. In the SCLIP settings panel, copy your local MCP connection configuration.
3. Add the MCP endpoint to your client (Claude Desktop, Cursor, Codex, or the embedded Sclip terminal).
4. Direct the agent:
   > *"Analyze this 2-minute raw interview, cut out all pauses greater than 1.5 seconds, generate captions, and add an animated lower-third motif for the speaker."*

---

## 💻 Build from Source

### Prerequisites
* **Node.js 24+** and **npm**
* **Rust** (stable via `rustup`)
* Platform C++ build tools (Xcode Command Line Tools on macOS, MSVC on Windows, GCC/Clang on Linux)

### Setup & Run
```bash
# Clone repository
git clone https://github.com/Adityasamant011/SCLIP-V1.git
cd SCLIP-V1

# Install JavaScript dependencies
npm install

# Bootstrap FFmpeg binaries and compile native Rust addons
npm run bootstrap

# Launch SCLIP in development mode
npm run dev
```

### Common Commands
* `npm run build` — Build production application bundles
* `npm run typecheck` — Typecheck all workspace TypeScript modules
* `npm test` — Run comprehensive Vitest unit test suite
* `npm run e2e` — Execute Playwright end-to-end regression suites
* `npm run package` — Create platform installers / DMG packages

---

## 📖 Documentation

* **[Architecture Overview](docs/architecture.md)** — Core subsystem map and data flows.
* **[MCP Server & Agent Protocol](docs/mcp.md)** — Complete tool surface, resources, and multi-agent contracts.
* **[Motif Overlay Guide](docs/motifs.md)** — Writing deterministic code-as-video components.
* **[Data Model & State](docs/data-model.md)** — Timeline schema, serializations, and actor mutations.
* **[Preview & Renderer](docs/preview.md)** — PixiJS, WebCodecs, and compositor pipelines.
* **[Export Engine](docs/export.md)** — Muxing, proxy workflows, and audio encoding.
* **[Captions & Audio](docs/captions.md)** — Subtitle ingestion, voiceover, and role-based audio mixing.
* **[Architectural Decision Records (ADRs)](docs/adr/)** — Historical engineering decisions and technical rationales.

---

## 👤 Maintainer

**SCLIP** is built and maintained by **Aditya Samant** ([@Adityasamant011](https://github.com/Adityasamant011)).

---

## 📄 License

SCLIP is open-source software licensed under the [MIT License](LICENSE). Packaged distribution installers bundle FFmpeg binaries under their respective LGPL/GPL licenses — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [docs/licensing.md](docs/licensing.md) for full compliance details.
