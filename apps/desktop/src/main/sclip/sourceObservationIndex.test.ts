import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SourceObservationIndex } from './sourceObservationIndex.js'
import type { MediaItem } from '../state/model.js'

const media = {
  id: 'source-1',
  label: 'source',
  path_abs: '/tmp/source.mp4',
  path_rel: null,
  kind: 'Video',
  metadata: { duration_us: 40_000_000, video: { width: 1920, height: 1080 } },
  file_hash_blake3: 'hash-1',
  file_size: 10,
  file_mtime: 1,
  imported_at: '',
  decode_route: 'source',
  conform_path: null,
  waveform_path: null,
  thumbnails_dir: null,
} as unknown as MediaItem

describe('SourceObservationIndex', () => {
  it('persists bounded visual evidence and serves subsequent requests from cache', async () => {
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'sclip-observation-test-'))
    const analyze = vi.fn(async () => ({
      ok: true, description: 'A presenter is visible beside a slide.', model: 'test-vlm',
      confidence: null, latencyMs: 1, visibleContent: [],
    }))
    const analyzeAudio = vi.fn(async () => ({
      ok: true, tempo_bpm: 89.3, beats_us: [1_000_000], has_clipping: false,
      awkward_silences: [{ start_us: 2_000_000, end_us: 3_000_000, duration_s: 1 }],
    }))
    const index = new SourceObservationIndex({
      cacheDir,
      visionSidecar: { analyze, analyzeAudio } as never,
      readTranscript: async () => ({ segments: [{ text: 'A source sentence.', t_start_us: 4_000_000, t_end_us: 5_000_000 }] }),
      frameExtractor: async (_source, _time, output) => { await import('node:fs/promises').then(fs => fs.writeFile(output, 'frame')) },
      audioExtractor: async (_source, _start, _end, output) => { await import('node:fs/promises').then(fs => fs.writeFile(output, 'audio')) },
    })

    const first = await index.retrieve(media, 0, 40_000_000, 12)
    expect(first.cached).toBe(false)
    expect(first.observations.some((observation) => observation.evidence === 'model_observation')).toBe(true)
    expect(first.observations.some((observation) => observation.evidence === 'transcription')).toBe(true)
    expect(first.observations.some((observation) => observation.evidence === 'verified_measurement')).toBe(true)
    expect(first.audio.status).toBe('available')
    expect(analyze).toHaveBeenCalledTimes(2)
    expect(analyzeAudio).toHaveBeenCalledTimes(1)

    const second = await index.retrieve(media, 0, 40_000_000, 1)
    expect(second.cached).toBe(true)
    expect(second.observations).toHaveLength(1)
    expect(analyze).toHaveBeenCalledTimes(2)
    const cache = await readFile(path.join(cacheDir, 'source-observations', 'hash-1-v2-vision-sidecar+audio-analyzer+transcript-cache-0-40000000.json'), 'utf8')
    expect(cache).toContain('"analysis_version": 2')
    expect(cache).toContain('"source_t_us"')

    const secondWindow = await index.retrieve(media, 20_000_000, 40_000_000, 1)
    expect(secondWindow.cached).toBe(false)
    expect(analyze).toHaveBeenCalledTimes(4)
    expect(analyzeAudio).toHaveBeenCalledTimes(2)
  })
})
