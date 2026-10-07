import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'

// Deterministic authored input; no editorial agent or provider inference.
test('recent tools operate through the built app and real MCP transport @serial', async () => {
  test.setTimeout(360_000)
  const out = path.resolve('e2e/bench-results/tool-health-2026-10-07')
  fs.mkdirSync(out, { recursive: true })
  const userData = tmpDir('sclip-tool-health-')
  if (process.env.SCLIP_TEST_SPEECH_CONFIG) {
    const speech = JSON.parse(fs.readFileSync(process.env.SCLIP_TEST_SPEECH_CONFIG, 'utf8'))
    fs.writeFileSync(path.join(userData, 'speech_config.json'), JSON.stringify({ preferred_engine: 'whisper_cpp', local: { whisper_cpp: speech.local.whisper_cpp } }))
  }
  const { app, page } = await launchApp({ userDataDir: userData, env: {
    SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '0', SCLIP_ENABLE_EXTERNAL_BROLL: '0',
    OPENROUTER_API_KEY: '', OPENAI_API_KEY: '',
  } })
  let client: Client | undefined
  const outcomes: Record<string, unknown> = {}
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-tool-health-project-'), name: 'synthetic-tool-health',
      canvas: { width: 640, height: 360, fpsNum: 30, fpsDen: 1 } })
    const mediaId = await invokeCmd<string>(page, 'import_media', {
      path: path.resolve('e2e/fixtures/media/test_1080p_30fps_audio.mp4'),
    })
    await waitForHook(page, 'waitMediaExportReady')
    await page.evaluate(id => (window as any).__weftcutTest.waitMediaExportReady({ mediaId: id, timeoutMs: 120_000 }), mediaId)
    const state = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'tool-health-audit', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))
    const catalog = (await client.listTools()).tools
    fs.writeFileSync(path.join(out, 'live-catalog.json'), JSON.stringify(catalog, null, 2))
    expect(new Set(catalog.map(t => t.name)).size).toBe(catalog.length)
    for (const name of ['ripple_cut_range', 'apply_repair_transaction', 'inspect_rendered_audio', 'inspect_timeline_temporal_window', 'get_editorial_evidence_packet', 'revision_control']) {
      expect(catalog.some(t => t.name === name), name).toBe(true)
    }
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client!.callTool({ name, arguments: args }, undefined, { timeout: 150_000 })
      expect(result.isError, `${name}: ${JSON.stringify(result.content)}`).not.toBe(true)
      const text = result.content.find(c => c.type === 'text')
      return text?.type === 'text' ? JSON.parse(text.text) : null
    }
    const added = await call('add_video_layer', { media_id: mediaId, track_id: state.tracks[0].id,
      src_in_us: 0, src_out_us: 6_000_000, t_start_us: 0, t_end_us: 6_000_000 })
    const videoId = added.video_layer_id
    expect(videoId).toBeTruthy()
    let packet = await call('get_editorial_evidence_packet')
    const originalVersion = packet.identity.state_version
    const receipt = await call('ripple_cut_range', { layer_ids: [videoId], start_us: 2_000_000,
      end_us: 3_000_000, expected_state_version: originalVersion })
    outcomes.ripple_cut_range = receipt
    const cut = await summary(page)
    expect(Math.max(...cut.tracks.flatMap(t => t.layers).map(l => l.t_end_us))).toBe(5_000_000)
    packet = await call('get_editorial_evidence_packet')
    const clip = cut.tracks.flatMap(t => t.layers).find(l => l.params.kind === 'VideoClip')!
    const transaction = await call('apply_repair_transaction', { reason: 'Synthetic explicit parameter writes',
      expected_state_version: packet.identity.state_version,
      operations: [{ kind: 'update_layer_params', layer_id: clip.id, patch: { kind: 'VideoClip', opacity: 0.8 } }] })
    outcomes.apply_repair_transaction = transaction
    const stale = await client.callTool({ name: 'ripple_cut_range', arguments: { layer_ids: [clip.id],
      start_us: 0, end_us: 1_000_000, expected_state_version: originalVersion } })
    expect(stale.isError).toBe(true)
    const invalid = await client.callTool({ name: 'inspect_rendered_audio', arguments: { start_us: 0, end_us: 200_000_000 } })
    expect(invalid.isError).toBe(true)
    const audio = await call('inspect_rendered_audio', { start_us: 0, end_us: 2_000_000 })
    outcomes.inspect_rendered_audio = audio
    expect(audio.coordinate_space).toBe('timeline')
    expect(audio.evidence_origin).toBe('CURRENT_TIMELINE')
    expect(audio.has_audio).toBe(true)
    expect(audio.signal.rms).toBeGreaterThan(0)
    const temporal = await call('inspect_timeline_temporal_window', { start_us: 0, end_us: 2_000_000,
      representative_samples: 2, question: 'Describe the visible shapes and text in each frame.' })
    outcomes.inspect_timeline_temporal_window = temporal
    expect(temporal.representative_samples.length).toBe(2)
    expect(temporal.coordinate_space).toBe('timeline')
    expect(await call('revision_control', { action: 'status' })).toBeTruthy()
    outcomes.result = 'PASS'
  } finally {
    fs.writeFileSync(path.join(out, 'outcomes.json'), JSON.stringify(outcomes, null, 2))
    await client?.close().catch(() => {})
    await app.close()
  }
})
