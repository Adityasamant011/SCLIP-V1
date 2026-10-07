import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { launchApp, newProject, invokeCmd, summary, tmpDir } from './helpers/driver'

test('configured local Whisper transcribes the actual rendered mix @serial', async () => {
  test.skip(!process.env.SCLIP_TEST_SPEECH_CONFIG || !process.env.SCLIP_TEST_SPEECH_WAV,
    'Explicit local-only profile and synthetic spoken WAV required; no downloads or cloud fallback')
  test.setTimeout(150_000)
  const userData = tmpDir('sclip-local-whisper-')
  const local = JSON.parse(fs.readFileSync(process.env.SCLIP_TEST_SPEECH_CONFIG!, 'utf8')).local.whisper_cpp
  expect(fs.existsSync(local.binary)).toBe(true)
  expect(fs.existsSync(local.model)).toBe(true)
  fs.writeFileSync(path.join(userData, 'speech_config.json'), JSON.stringify({ preferred_engine: 'whisper_cpp', local: { whisper_cpp: local } }))
  const { app, page } = await launchApp({ userDataDir: userData, env: {
    SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '0', OPENROUTER_API_KEY: '', OPENAI_API_KEY: '',
  } })
  let client: Client | undefined
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-whisper-project-'), name: 'synthetic-speech',
      canvas: { width: 640, height: 360, fpsNum: 30, fpsDen: 1 } })
    const media = await invokeCmd<string>(page, 'import_media', { path: process.env.SCLIP_TEST_SPEECH_WAV })
    const state = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'local-speech-readiness', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))
    const added = await client.callTool({ name: 'add_media_layer', arguments: { media_id: media, track_id: state.tracks[0].id, t_start_us: 0 } })
    expect(added.isError).not.toBe(true)
    const audio = await client.callTool({ name: 'inspect_rendered_audio', arguments: { start_us: 0, end_us: 4_000_000 } }, undefined, { timeout: 120_000 })
    expect(audio.isError, JSON.stringify(audio.content)).not.toBe(true)
    const data = JSON.parse((audio.content.find(c => c.type === 'text') as any).text)
    const out = path.resolve('e2e/bench-results/release-health-4b1')
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, 'whisper-readiness.json'), JSON.stringify(data, null, 2))
    expect(data.coordinate_space).toBe('timeline')
    expect(data.has_audio).toBe(true)
    expect(data.transcript.status).toBe('available')
    expect(data.transcript.segments.map((s: any) => s.text).join(' ').toLowerCase()).toContain('local speech')
  } finally {
    await client?.close().catch(() => {})
    await app.close()
  }
})
