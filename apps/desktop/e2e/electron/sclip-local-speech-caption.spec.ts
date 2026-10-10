import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchApp, newProject, invokeCmd, summary, tmpDir } from './helpers/driver'

test('local Whisper speech becomes editable captions in a real export', async () => {
  test.setTimeout(240_000)
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
  const liveProfile = path.join(os.homedir(), 'Library/Application Support/Sclip')
  const speech = JSON.parse(fs.readFileSync(path.join(liveProfile, 'speech_config.json'), 'utf8')) as {
    local?: { whisper_cpp?: { binary?: string; model?: string } }
  }
  const binary = speech.local?.whisper_cpp?.binary
  const model = speech.local?.whisper_cpp?.model
  test.skip(!binary || !model || !fs.existsSync(binary) || !fs.existsSync(model), 'Local Whisper binary/model is unavailable')
  const source = process.env.SCLIP_TEST_SPEECH_SOURCE ?? path.join(os.homedir(), 'Documents/1/Mega test/Media/Raw Talking head tutorial video for editing practice.mp4')
  expect(fs.existsSync(source)).toBe(true)

  const userDataDir = tmpDir('sclip-local-speech-profile-')
  fs.writeFileSync(path.join(userDataDir, 'speech_config.json'), JSON.stringify({preferred_engine:'whisper_cpp',local:{whisper_cpp:{binary,model}}}))
  const { app, page } = await launchApp({ userDataDir, env: { SCLIP_USER_DATA_DIR: userDataDir, SCLIP_JEV_ENABLED: '0' } })
  let client: Client | undefined
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-local-speech-workspace-'), name: 'local-speech',
      canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 } })
    const mediaId = await invokeCmd<string>(page, 'import_media', { path: source })
    const project = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'sclip-local-speech-acceptance', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args })
      if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`)
      return result
    }
    const placed = await call('add_video_layer', { media_id: mediaId, track_id: project.tracks[0]!.id,
      src_in_us: 0, src_out_us: 10_000_000, t_start_us: 0, t_end_us: 10_000_000 })
    const raw = placed.content.find(item => item.type === 'text')!.text.trim()
    const value = raw.startsWith('{') ? JSON.parse(raw) : raw
    const layerId = typeof value === 'string' ? value : value.video_layer_id
    expect(layerId).toBeTruthy()

    await call('transcribe_clip', { layer_id: layerId, backend: 'whisper_cpp' })
    const context = await call('get_media_context', { media_id: mediaId, detail: 'segments', start_us: 0, end_us: 10_000_000 })
    const contextText = context.content.find(item => item.type === 'text')!.text
    expect(contextText.toLowerCase()).toContain('reason')
    const captions = await call('apply_transcripts', { layer_id: layerId })
    const captionResult = JSON.parse(captions.content.find(item => item.type === 'text')!.text)
    expect(captionResult.caption_count).toBeGreaterThan(0)
    await invokeCmd(page, 'project_save')
    const saved = await summary(page)
    expect(saved.tracks.flatMap(track => track.layers).some(layer => layer.params.kind === 'Text')).toBe(true)
    const output = process.env.SCLIP_TEST_SPEECH_OUTPUT ?? path.join(repoRoot, '.scratch/sclip-v1-completion/local-speech-captions.mp4')
    fs.mkdirSync(path.dirname(output), { recursive: true })
    await page.evaluate(request => (window as any).__sclipExportRange(request), {
      projectId: project.project_id, outputPath: output, startUs: 0, endUs: 10_000_000,
      resolutionHeight: 1920, fps: 30,
    })
    expect(fs.statSync(output).size).toBeGreaterThan(100_000)
  } finally {
    await client?.close().catch(() => {})
    await app.close()
  }
})
