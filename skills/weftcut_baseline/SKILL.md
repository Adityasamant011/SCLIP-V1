---
name: weftcut_baseline
description: Drive the WeftCut video editor over its MCP tools for media inspection and perception.
---

# Driving WeftCut (Baseline)

WeftCut is a desktop video editor; you operate it over MCP while the user watches the same project live in the app.

## Media Perception & Inspection
- Media perception: `get_media_context` returns unified source facts across transcripts, shots, and frame pointers in source time.
- Transcripts: `transcribe_clip` returns transcripts.
- Shot analysis: `analyze_clip` returns shot detection.
