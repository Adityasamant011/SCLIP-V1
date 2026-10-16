vi.mock('./renderedMediaProbe.js', () => ({ renderedFileHasAudio: vi.fn(async () => false) }))
import { beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { initEval } from '../../renderer/eval/index.js'
import { freshActor, aRollId } from '../state/__tests__/pbt/harness.js'
import { inspectTimelineFrame } from './timelineFrame.js'
import { renderComposedTimelineRange } from './rangeRender.js'

describe('Sclip composed inspection adapters', () => {
  beforeAll(initEval)

  it('uses the live frame bridge and refuses a reduced fallback when unavailable', async () => {
    const actor = freshActor()
    actor.mcpCall('add_color_layer', JSON.stringify({ track_id: aRollId(actor), color: { r: 20, g: 30, b: 40, a: 255 }, t_start_us: 0, t_end_us: 60_000_000 }))
    const project = actor.snapshot()
    const capture = { pngBase64: Buffer.from('png').toString('base64'), width: 1920, height: 1080 }
    const win = { isDestroyed: () => false, webContents: { executeJavaScript: async (code: string) => {
      expect(code).toContain('__weftcutPreview.captureFrameAt')
      return capture
    } } }
    const result = await inspectTimelineFrame(project, { t_us: 0, getActiveWindow: () => win, requireLiveCompositor: true })
    expect(result.source).toBe('live_compositor')
    await expect(inspectTimelineFrame(project, { t_us: 0, requireLiveCompositor: true })).rejects.toThrow('live Sclip preview')
  })

  it('requests a passive current-frame capture for background sensing and refuses failed captures', async () => {
    const actor = freshActor()
    actor.mcpCall('add_color_layer', JSON.stringify({ track_id: aRollId(actor), color: { r: 0, g: 0, b: 0, a: 255 }, t_start_us: 0, t_end_us: 1000000 }))
    const executeJavaScript = vi.fn(async (code: string) => {
      expect(code).toContain(', true) : null')
      throw new Error('Background capture deferred to foreground work')
    })
    await expect(inspectTimelineFrame(actor.snapshot(), { t_us: 0, passive: true, requireLiveCompositor: true, getActiveWindow: () => ({ isDestroyed: () => false, webContents: { executeJavaScript } }) })).rejects.toThrow('deferred to foreground')
  })

  it('inspects current live playhead frame when t_us is omitted', async () => {
    const actor = freshActor()
    actor.mcpCall('add_color_layer', JSON.stringify({ track_id: aRollId(actor), color: { r: 20, g: 30, b: 40, a: 255 }, t_start_us: 0, t_end_us: 60_000_000 }))
    const project = actor.snapshot()
    const capture = { pngBase64: Buffer.from('png').toString('base64'), tUs: 15_000_000, width: 1920, height: 1080 }
    let executedCode = ''
    const win = { isDestroyed: () => false, webContents: { executeJavaScript: async (code: string) => {
      executedCode = code
      return code.includes('getPlayheadUs') ? 15_000_000 : capture
    } } }
    const result = await inspectTimelineFrame(project, { getActiveWindow: () => win, requireLiveCompositor: true })
    expect(executedCode).toContain('__weftcutPreview.captureFrameAt(15000000')
    expect(result.t_us).toBe(15_000_000)
    expect(result.source).toBe('live_compositor')
  })

  it('requests two distinct short exports through the production bridge, never a stale raw-source cache', async () => {
    const actor = freshActor()
    expect(actor.mcpCall('add_color_layer', JSON.stringify({ track_id: aRollId(actor), color: { r: 20, g: 30, b: 40, a: 255 }, t_start_us: 0, t_end_us: 2_000_000 })).ok).toBe(true)
    const project = actor.snapshot()
    const paths: string[] = []
    const win = { isDestroyed: () => false, webContents: { executeJavaScript: async (code: string) => {
      expect(code).toContain('__sclipExportRange')
      const request = JSON.parse(code.slice(code.indexOf('(') + 1, code.indexOf(') : Promise.reject'))) as { outputPath: string; projectId: string }
      expect(request.projectId).toBe(project.project_id)
      fs.writeFileSync(request.outputPath, Buffer.alloc(2048))
      paths.push(request.outputPath)
    } } }
    try {
      const first = await renderComposedTimelineRange(project, { start_us: 0, end_us: 1_000_000, getActiveWindow: () => win })
      const second = await renderComposedTimelineRange(project, { start_us: 0, end_us: 1_000_000, getActiveWindow: () => win })
      expect(first.cached).toBe(false)
      expect(second.cached).toBe(false)
      expect(paths).toEqual([first.path, second.path])
      expect(first.path).not.toBe(second.path)
    } finally {
      for (const output of paths) fs.rmSync(path.dirname(output), { recursive: true, force: true })
    }
  })
})
