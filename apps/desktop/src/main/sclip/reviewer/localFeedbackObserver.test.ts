import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AnalyzeRequest } from '../visionSidecar'
import type { Project } from '../../state/model'
import type { RangeRenderOptions } from '../rangeRender'
import { createLocalFeedbackObserver } from './localFeedbackObserver'
import { blankProject } from '../../state/model'
import { seededGen } from '../../state/ids'
import { audioParams, mediaItemTemplate } from '../../state/mutations/media'
import { colorParams } from '../../state/mutations/add'

function fixture(audio = true, visual = true) {
  const p = blankProject(seededGen(), 'Synthetic paused feedback'), comp = p.compositions[p.root_id]
  comp.duration_us = 8_000_000
  const layer = (params: any) => ({ id: crypto.randomUUID(), enabled: true, locked: false, t_start_us: 0, t_end_us: 8_000_000, params, effects: [], metadata: {} }) as any
  if (visual) comp.tracks[0].layers.push(layer(colorParams({ r: 0, g: 0, b: 0, a: 255 }, comp.width, comp.height)))
  if (audio) {
    const m = mediaItemTemplate(crypto.randomUUID(), 'Audio', 8_000_000, true)
    p.media_pool[m.id] = m; comp.tracks[1].layers.push(layer(audioParams(m.id, 0, 8_000_000)))
  }
  const window = { isDestroyed: () => false, webContents: { executeJavaScript: vi.fn(async (code: string) => code.startsWith('({') ? { ready: true, playing: false, t: 4_000_000 } : true) } }
  const vision = { status: vi.fn(async () => ({ running: true, state: 'loaded', modelLoaded: true, model: 'synthetic-local', idleS: 0, port: 1 })), analyze: vi.fn(async (_req: AnalyzeRequest) => ({ ok: true, description: 'A dark background.', model: 'synthetic-local', outputLimitReached: true, confidence: null, latencyMs: 1, visibleContent: [] })) }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-feedback-render-'))
  const render = vi.fn(async (_project: Project, _options: RangeRenderOptions) => { const file = path.join(dir, 'mix.m4a'); fs.writeFileSync(file, 'synthetic artifact'); return { path: file, duration_us: 6_000_000, has_audio: true, cached: false } })
  const decode = vi.fn(async () => { const pcm = Buffer.alloc(16000 * 6 * 4); for (let i = 0; i < pcm.length / 4; i++) pcm.writeFloatLE(0.1, i * 4); return pcm })
  const frame = vi.fn(async () => ({ pngBase64: 'eA==', dataUrl: '', t_us: 4_000_000, timeline_t_us: 4_000_000, coordinate_space: 'timeline' as const, composition_id: p.root_id, width: comp.width, height: comp.height, source: 'live_compositor' as const, factualEvidence: { canvas: { width: comp.width, height: comp.height }, layer_bounds: [] } }))
  const deps = { window: () => window, vision, render, decode, frame, memory: () => ({ free: 4 * 1024 ** 3, total: 16 * 1024 ** 3 }) }
  return { p, deps, dir, window, vision, render, decode, frame }
}
describe('local background observations use real composition/audio seams', () => {
  it('measures standalone Audio without requiring two A-roll clips and preserves visual uncertainty', async () => {
    const f = fixture()
    const understand = vi.fn(async () => ({ status: 'available', windows: [{ event: 'Speech', transcript: 'Synthetic recognition' }] }))
    const out = await createLocalFeedbackObserver({ ...f.deps, understand } as any)(f.p, new AbortController().signal)
    expect(out.audio.status).toBe('measured'); expect(out.audio.signal!.rms).toBeCloseTo(.1)
    expect(out.visual.truncated).toBe(true); expect(out.provider_calls).toBe(0)
    expect(f.render.mock.calls[0]![1]).toMatchObject({ audioOnly: true, start_us: 2_000_000, end_us: 8_000_000 })
    expect(understand).toHaveBeenCalledOnce(); expect(fs.existsSync(f.dir)).toBe(false)
  })
  it('does not load vision on audio-only work, and does not render audio for a silent visual project', async () => {
    for (const [audio, visual] of [[true, false], [false, true]]) {
      const f = fixture(audio, visual)
      try {
        const out = await createLocalFeedbackObserver(f.deps as any)(f.p, new AbortController().signal)
        if (!visual) { expect(f.vision.analyze).not.toHaveBeenCalled(); expect(out.visual.status).toBe('no_visual_layer_at_sample') }
        if (!audio) { expect(f.render).not.toHaveBeenCalled(); expect(out.audio.status).toBe('no_audible_material') }
      } finally { fs.rmSync(f.dir, { recursive: true, force: true }) }
    }
  })
  it('defers without capture, render or models during playback/export', async () => {
    const f = fixture()
    try {
      f.window.webContents.executeJavaScript.mockResolvedValue({ ready: true, playing: true, t: 0 } as any)
      await expect(createLocalFeedbackObserver(f.deps as any)(f.p, new AbortController().signal)).rejects.toThrow(/Deferred/)
      expect(f.frame).not.toHaveBeenCalled(); expect(f.render).not.toHaveBeenCalled(); expect(f.vision.analyze).not.toHaveBeenCalled()
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }) }
  })
  it('reports insufficient visual memory honestly while still measuring audio', async () => {
    const f = fixture()
    const out = await createLocalFeedbackObserver({ ...f.deps, memory: () => ({ free: 0, total: 16 * 1024 ** 3 }) } as any)(f.p, new AbortController().signal)
    expect(out.visual.status).toBe('unavailable'); expect(out.visual.reason).toContain('memory')
    expect(out.audio.status).toBe('measured'); expect(f.vision.analyze).not.toHaveBeenCalled()
  })
  it('cancellation during sensing prevents downstream audio/render and cleans owned frame files', async () => {
    const f = fixture(), controller = new AbortController()
    try {
      f.vision.analyze.mockImplementationOnce(async (req: any) => { expect(fs.existsSync(req.imagePath)).toBe(true); controller.abort(); return { ok: true } as any })
      await expect(createLocalFeedbackObserver(f.deps as any)(f.p, controller.signal)).rejects.toThrow()
      expect(f.render).not.toHaveBeenCalled()
    } finally { fs.rmSync(f.dir, { recursive: true, force: true }) }
  })
})
