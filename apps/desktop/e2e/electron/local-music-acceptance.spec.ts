import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { launchApp, newProject, driveExport, invokeCmd, summary, tmpDir } from './helpers/driver'

// Explicit, local inference acceptance only. Ordinary conformance runs must not
// allocate this model or require the developer's HF account/optional weights.
test('Small generates, caches, imports and exports real local music @serial', async () => {
  test.skip(process.env.SCLIP_LOCAL_MUSIC_ACCEPTANCE !== '1', 'requires explicit local model acceptance opt-in')
  test.setTimeout(600_000)
  const root = process.env.SCLIP_GENERATION_MODELS_DIR
  expect(root).toBeTruthy()
  const output = process.env.SCLIP_MUSIC_ARTIFACT_DIR ?? tmpDir('sclip-music-artifacts-')
  mkdirSync(output, { recursive: true })
  const { app, page } = await launchApp({ env: { SCLIP_GENERATION_MODELS_DIR: root!, SCLIP_BACKGROUND_FEEDBACK: '0' } })
  let client: Client | undefined
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-local-music-'), name: 'Local music acceptance', canvas: { width: 320, height: 180, fpsNum: 30, fpsDen: 1 } })
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'local-music-acceptance', version: '1' }, { capabilities: {} })
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client!.callTool({ name, arguments: args }, undefined, { timeout: 330_000 })
      expect(result.isError, JSON.stringify(result).slice(0, 4000)).toBeFalsy()
      return (result.content as Array<{ text: string }>)[0].text
    }
    const status = JSON.parse(await call('get_local_generation_status'))
    expect(status.models.find((model: any) => model.kind === 'music').state).toBe('configured_unverified')
    const args = { prompt: 'Warm mellow instrumental, soft electronic drum loop with a gentle bass groove, no speech', seed: 42, duration_seconds: 8 }
    const started = Date.now()
    const generated = JSON.parse(await call('generate_music', args)), elapsedMs = Date.now() - started
    expect(generated.cached).toBe(false)
    expect(generated.model).toBe('stabilityai/stable-audio-open-small')
    expect(generated.provider_calls).toBe(0)
    copyFileSync(generated.file_path, path.join(output, 'small-candidate.wav'))
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', generated.file_path], { encoding: 'utf8' }))
    expect(probe.streams[0]).toMatchObject({ channels: 2, sample_rate: '44100', codec_name: 'pcm_s16le' })
    expect(Number(probe.streams[0].duration)).toBeCloseTo(8, 2)
    expect(JSON.parse(await call('generate_music', args)).cached).toBe(true)
    const mediaId = await call('import_media', { path: generated.file_path })
    const trackId = await invokeCmd<string>(page, 'add_track', {})
    await call('add_media_layer', { media_id: mediaId, track_id: trackId, t_start_us: 0 })
    await call('add_text_layer', { content: 'Local music test', t_start_us: 0, duration_us: 8_000_000, font_size_px: 24, x: 160, y: 90 })
    expect((await summary(page)).tracks.some(track => track.layers.some(layer => layer.params.kind === 'Audio'))).toBe(true)
    const video = path.join(tmpDir('sclip-music-export-'), 'mixed.mp4')
    const exported = await driveExport(page, { outputAbsPath: video, range: { startUs: 0, endUs: 8_000_000 } }, { hook: 'exportTimeline', timeout: 180_000 })
    expect(exported.done.ok, JSON.stringify(exported.done)).toBe(true)
    const decoded = execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 1024 * 1024 })
    let sum = 0
    for (let i = 0; i < decoded.length; i += 4) sum += decoded.readFloatLE(i) ** 2
    const rms = Math.sqrt(sum / (decoded.length / 4))
    expect(rms).toBeGreaterThan(0.0001)
    copyFileSync(video, path.join(output, 'small-mixed.mp4'))
    writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS', elapsed_ms: elapsedMs, generated, probe, exported_audio_rms: rms, cached_retry: true }, null, 2))
  } finally { await client?.close(); await app.close() }
})
