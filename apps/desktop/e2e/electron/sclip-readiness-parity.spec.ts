import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { PNG } from 'pngjs'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchApp, newProject, importAndPlaceMedia, invokeCmd, summary, tmpDir } from './helpers/driver'

const fixtureDir = process.env.WEFTCUT_TEST_MEDIA || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/media')
const fixture = (name: string) => path.join(fixtureDir, name)

function frameFromMp4(file: string, tSeconds: number): PNG {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(tSeconds), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 16 * 1024 * 1024 })
  if (r.status !== 0 || !r.stdout.length) throw new Error(`Could not decode exported frame: ${String(r.stderr)}`)
  return PNG.sync.read(r.stdout)
}

function meanRgbDifference(a: PNG, b: PNG): number {
  expect([a.width, a.height]).toEqual([b.width, b.height])
  let sum = 0
  for (let i = 0; i < a.data.length; i += 4) {
    sum += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!)
  }
  return sum / (a.width * a.height * 3)
}

function audioRms(file: string): number {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 4 * 1024 * 1024 })
  if (r.status !== 0 || !r.stdout.length) throw new Error(`Could not decode mixed audio: ${String(r.stderr)}`)
  let sum = 0
  const samples = Math.floor(r.stdout.length / 4)
  for (let i = 0; i < samples; i++) sum += r.stdout.readFloatLE(i * 4) ** 2
  return Math.sqrt(sum / samples)
}

test('Sclip MCP inspection and range export use the production composition', async ({}, testInfo) => {
  test.setTimeout(300_000)
  const source = fixture('test_1080p_30fps_6s.mp4')
  const music = fixture('test_tones_10s.wav')
  test.skip(!existsSync(source) || !existsSync(music), 'fixture media is not available')
  const { app, page } = await launchApp()
  let client: Client | undefined
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-parity-'), name: 'readiness-parity', canvas: { width: 640, height: 360, fpsNum: 30, fpsDen: 1 } })
    const video = await importAndPlaceMedia(page, { mediaAbsPath: source })
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
    client = new Client({ name: 'sclip-readiness-parity', version: '1.0.0' }, { capabilities: {} })
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const names = (await client.listTools()).tools.map(t => t.name)
    for (const name of ['add_media_layer', 'add_text_layer', 'restyle_captions', 'inspect_timeline_frame', 'render_timeline_range']) expect(names).toContain(name)
    expect(names).not.toContain('export_timeline')
    expect((await client.callTool({ name: 'export_timeline', arguments: {} })).isError).toBe(true)
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args })
      if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`)
      return result
    }

    // Every edit below goes through the existing ProjectActor or its existing
    // compute hybrid. The inspection/export calls are read-only.
    const s0 = await summary(page)
    const videoTrack = s0.tracks.find(t => t.layers.some(l => l.id === video.layerId))!.id
    await call('update_layer_params', { layer_id: video.layerId, patch: { kind: 'VideoClip', scale_x: 1.1, scale_y: 1.1 } })
    const split = await call('split_layer', { layer_id: video.layerId, at_t_us: 3_000_000 })
    const splitIds = JSON.parse((split.content[0] as { text: string }).text) as { left: string; right: string }
    const transition = await call('add_transition', { from_layer_id: splitIds.left, to_layer_id: splitIds.right, kind: 'Crossfade', duration_us: 500_000 })
    const transitionId = (transition.content[0] as { text: string }).text
    const effect = await call('add_effect', { layer_id: video.layerId, kind: 'brightness' })
    const effectId = (effect.content[0] as { text: string }).text
    await call('update_effect', { layer_id: video.layerId, effect_id: effectId, patch: { params: { amount: { mode: 'Static', value: 20 } } } })

    const imageId = await invokeCmd<string>(page, 'import_media', { path: fixture('test_chart_320x240.png') })
    const imageTrack = await invokeCmd<string>(page, 'add_track', {})
    const overlay = await call('add_video_layer', { track_id: imageTrack, media_id: imageId, t_start_us: 1_000_000, t_end_us: 2_000_000, src_in_us: 0, src_out_us: 1_000_000 })
    const overlayId = (overlay.content[0] as { text: string }).text
    const title = await call('add_text_layer', { content: 'SCLIP READY', t_start_us: 0, duration_us: 3_000_000, font_size_px: 42, font_weight: 700, x: 320, y: 80, fill_color: { r: 255, g: 255, b: 255, a: 255 }, outline_width: 2, outline_color: { r: 0, g: 0, b: 0, a: 255 }, align: 'Center', box_w: 550 })
    expect((title.content[0] as { text: string }).text.length).toBeGreaterThan(0)
    await call('apply_subtitles', { body: '1\n00:00:00,500 --> 00:00:02,000\nA caption from Sclip\n', format: 'srt' })
    await call('restyle_captions', { font_size_px: 32, outline_width: 2 })
    const motif = await call('add_motif', { motif_id: 'countdown', t_start_us: 500_000, t_end_us: 2_000_000 })
    const motifId = (motif.content[0] as { text: string }).text
    const audioId = await invokeCmd<string>(page, 'import_media', { path: music })
    const audioTrack = await invokeCmd<string>(page, 'add_track', {})
    await call('add_media_layer', { media_id: audioId, track_id: audioTrack, t_start_us: 0 })
    const state = await summary(page)
    expect(state.tracks.some(t => t.layers.some(l => l.params.kind === 'Audio'))).toBe(true)
    expect(state.tracks.some(t => t.layers.some(l => l.params.kind === 'Text'))).toBe(true)
    expect(state.tracks.some(t => t.layers.some(l => l.params.kind === 'ImageOverlay'))).toBe(true)
    expect(state.tracks.some(t => t.layers.some(l => l.params.kind === 'VideoClip'))).toBe(true)
    expect(state.tracks.some(t => t.layers.some(l => l.params.kind === 'Motif'))).toBe(true)
    expect(videoTrack).toBeTruthy()

    const inspect = await call('inspect_timeline_frame', { t_us: 1_000_000 })
    const image = inspect.content.find(c => c.type === 'image') as { data: string } | undefined
    const metadata = inspect.content.find(c => c.type === 'text') as { text: string } | undefined
    expect(image).toBeDefined()
    expect(JSON.parse(metadata!.text).source).toBe('live_compositor')
    const inspectedFrame = PNG.sync.read(Buffer.from(image!.data, 'base64'))
    const range = await call('render_timeline_range', { start_us: 0, end_us: 3_000_000 })
    const rangeResult = JSON.parse((range.content[0] as { text: string }).text) as { path: string; cached: boolean; has_audio: boolean }
    expect(rangeResult.cached).toBe(false)
    expect(rangeResult.has_audio).toBe(true)
    expect(existsSync(rangeResult.path)).toBe(true)
    const exportResult = { path: testInfo.outputPath('production-export.mp4') }
    await page.evaluate(request => (window as any).__sclipExportRange(request), {
      projectId: state.project_id, outputPath: exportResult.path, startUs: 0, endUs: 3_000_000, resolutionHeight: 360, fps: 30,
    })
    expect(existsSync(exportResult.path)).toBe(true)
    const rangeFrame = frameFromMp4(rangeResult.path, 1)
    const finalFrame = frameFromMp4(exportResult.path, 1)
    const finalAudioRms = audioRms(exportResult.path)
    const rangeAudioRms = audioRms(rangeResult.path)
    expect(finalAudioRms).toBeGreaterThan(0.002)
    expect(Math.abs(finalAudioRms - rangeAudioRms)).toBeLessThan(0.002)
    writeFileSync(testInfo.outputPath('inspect.png'), PNG.sync.write(inspectedFrame))
    writeFileSync(testInfo.outputPath('range.png'), PNG.sync.write(rangeFrame))
    writeFileSync(testInfo.outputPath('final.png'), PNG.sync.write(finalFrame))
    console.log('SCLIP_PARITY', JSON.stringify({ rangeVsFinal: meanRgbDifference(rangeFrame, finalFrame), inspectVsFinal: meanRgbDifference(inspectedFrame, finalFrame), rangeAudioRms, finalAudioRms }))
    expect(meanRgbDifference(rangeFrame, finalFrame)).toBeLessThan(12)
    expect(meanRgbDifference(inspectedFrame, finalFrame)).toBeLessThan(35)

    const transitionInspection = await call('inspect_timeline_frame', { t_us: 2_800_000 })
    const transitionImage = transitionInspection.content.find(c => c.type === 'image') as { data: string }
    const transitionFrame = PNG.sync.read(Buffer.from(transitionImage.data, 'base64'))
    expect(meanRgbDifference(transitionFrame, frameFromMp4(exportResult.path, 2.8))).toBeLessThan(35)
    const titleInspection = await call('inspect_timeline_frame', { t_us: 200_000 })
    const titleImage = titleInspection.content.find(c => c.type === 'image') as { data: string }
    const titleFrame = PNG.sync.read(Buffer.from(titleImage.data, 'base64'))
    writeFileSync(testInfo.outputPath('title.png'), PNG.sync.write(titleFrame))
    expect(meanRgbDifference(titleFrame, frameFromMp4(exportResult.path, 0.2))).toBeLessThan(35)

    // A content mutation must never return the previous range artifact.
    const textLayer = state.tracks.flatMap(t => t.layers).find(l => l.params.kind === 'Text' && l.id === (title.content[0] as { text: string }).text)
    if (!textLayer) throw new Error('Native title missing from summary')
    await call('update_layer_params', { layer_id: textLayer.id, patch: { kind: 'Text', content: 'NEW TITLE FOR CACHE CHECK' } })
    await call('set_layers_enabled', { layer_ids: [overlayId], enabled: false })
    const changedRange = await call('render_timeline_range', { start_us: 0, end_us: 3_000_000 })
    const changedResult = JSON.parse((changedRange.content[0] as { text: string }).text) as { path: string; cached: boolean }
    expect(changedResult.cached).toBe(false)
    expect(changedResult.path).not.toBe(rangeResult.path)
    expect(meanRgbDifference(frameFromMp4(changedResult.path, 1), rangeFrame)).toBeGreaterThan(1)

    const inspectPng = async (tUs: number) => {
      const r = await call('inspect_timeline_frame', { t_us: tUs })
      return PNG.sync.read(Buffer.from((r.content.find(c => c.type === 'image') as { data: string }).data, 'base64'))
    }
    const captionIds = state.tracks.filter(t => String(t.role).toLowerCase() === 'caption').flatMap(t => t.layers.map(l => l.id))
    expect(captionIds.length).toBeGreaterThan(0)
    const withCaption = await inspectPng(1_000_000)
    await call('set_layers_enabled', { layer_ids: captionIds, enabled: false })
    expect(meanRgbDifference(withCaption, await inspectPng(1_000_000))).toBeGreaterThan(0.5)
    const withMotif = await inspectPng(1_000_000)
    await call('set_layers_enabled', { layer_ids: [motifId], enabled: false })
    expect(meanRgbDifference(withMotif, await inspectPng(1_000_000))).toBeGreaterThan(1)
    const withEffect = await inspectPng(2_200_000)
    await call('update_effect', { layer_id: video.layerId, effect_id: effectId, patch: { enabled: false } })
    expect(meanRgbDifference(withEffect, await inspectPng(2_200_000))).toBeGreaterThan(0.5)
    const withTransition = await inspectPng(2_800_000)
    await call('remove_transition', { transition_id: transitionId })
    expect(meanRgbDifference(withTransition, await inspectPng(2_800_000))).toBeGreaterThan(0.5)
  } finally {
    await client?.close().catch(() => {})
    await app.close()
  }
})

test('Hermes discovers WeftCut beside its normal tools with the Sclip profile', async () => {
  test.setTimeout(120_000)
  const source = process.env.SCLIP_HERMES_SOURCE
  test.skip(!source || !existsSync(path.join(source, '.venv/bin/python')), 'SCLIP_HERMES_SOURCE is required for real Hermes discovery')
  const { app, page } = await launchApp({ env: { SCLIP_HERMES_SOURCE: source! } })
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-hermes-discovery-'), name: 'discovery', canvas: { width: 640, height: 360, fpsNum: 30, fpsDen: 1 } })
    const userData = await app.evaluate(({ app }) => app.getPath('userData')) as string
    const hermesHome = path.join(userData, 'sclip-hermes')
    await expect.poll(() => existsSync(path.join(hermesHome, 'config.yaml'))).toBe(true)
    const profile = readFileSync(path.join(hermesHome, 'config.yaml'), 'utf8')
    expect(profile).toContain('tool_search: true')
    expect(profile).not.toContain('disabled_toolsets')
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
    const code = `
import json, os
from tools.mcp_tool import discover_mcp_tools
from model_tools import get_tool_definitions, handle_function_call
registered = set(discover_mcp_tools())
raw = get_tool_definitions(quiet_mode=True, skip_tool_search_assembly=True)
shown = get_tool_definitions(quiet_mode=True)
raw_names = {d['function']['name'] for d in raw}
shown_names = {d['function']['name'] for d in shown}
queries = ['trim video', 'add captions', 'add transition', 'move clip', 'inspect timeline']
searches = {}
for q in queries:
    result = json.loads(handle_function_call('tool_search', {'query': q}, enabled_toolsets=None, disabled_toolsets=None))
    searches[q] = [m['name'] for m in result.get('matches', [])]
name = 'mcp__weftcut__get_timeline_context'
description = json.loads(handle_function_call('tool_describe', {'name': name}, enabled_toolsets=None, disabled_toolsets=None))
called = handle_function_call('tool_call', {'name': name, 'arguments': {}}, enabled_toolsets=None, disabled_toolsets=None)
normal_read = handle_function_call('read_file', {'path': os.path.join(os.environ['HERMES_HOME'], 'config.yaml')}, enabled_toolsets=None, disabled_toolsets=None)
print('SCLIP_HERMES_PROBE=' + json.dumps({
    'registered_weftcut': len([n for n in registered if n.startswith('mcp__weftcut__')]),
    'raw_weftcut': len([n for n in raw_names if n.startswith('mcp__weftcut__')]),
    'shown_bridge': sorted(shown_names & {'tool_search', 'tool_describe', 'tool_call'}),
    'normal': sorted(raw_names & {'terminal', 'process', 'read_file', 'write_file', 'patch', 'search_files', 'web_search', 'web_extract', 'browser_navigate', 'skills_list', 'memory', 'delegate_task', 'vision_analyze', 'execute_code'}),
    'searches': searches,
    'described': description.get('name'),
    'tool_call_ok': 'error' not in called.lower() and 'composition' in called.lower(),
    'normal_read_ok': 'tool_search: true' in normal_read,
}))
`
    const python = spawnSync(path.join(source!, '.venv/bin/python'), ['-c', code], {
      cwd: source, timeout: 75_000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, HERMES_HOME: hermesHome, SCLIP_MCP_URL: info.url, SCLIP_MCP_TOKEN: info.bearer_token },
    })
    if (python.status !== 0) throw new Error(`Hermes discovery probe failed (exit ${python.status}; signal ${python.signal ?? 'none'})`)
    const marker = python.stdout.split('\n').find(line => line.startsWith('SCLIP_HERMES_PROBE='))
    if (!marker) throw new Error('Hermes discovery probe produced no structured result')
    const probe = JSON.parse(marker.slice('SCLIP_HERMES_PROBE='.length)) as {
      registered_weftcut: number; raw_weftcut: number; shown_bridge: string[]; normal: string[];
      searches: Record<string, string[]>; described: string; tool_call_ok: boolean; normal_read_ok: boolean
    }
    console.log('SCLIP_HERMES_PROBE', JSON.stringify(probe))
    expect(probe.registered_weftcut).toBeGreaterThan(50)
    expect(probe.raw_weftcut).toBeGreaterThan(50)
    expect(probe.shown_bridge).toEqual(['tool_call', 'tool_describe', 'tool_search'])
    for (const matches of Object.values(probe.searches)) expect(matches.some(n => n.startsWith('mcp__weftcut__'))).toBe(true)
    expect(probe.described).toBe('mcp__weftcut__get_timeline_context')
    expect(probe.tool_call_ok).toBe(true)
    expect(probe.normal_read_ok).toBe(true)
    for (const core of ['terminal', 'read_file', 'skills_list', 'memory', 'delegate_task']) expect(probe.normal).toContain(core)
  } finally {
    await app.close()
  }
})
