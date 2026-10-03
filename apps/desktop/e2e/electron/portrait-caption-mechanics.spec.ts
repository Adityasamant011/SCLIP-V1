import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchApp, newProject, invokeCmd, summary, tmpDir } from './helpers/driver'

test('portrait video and ordinary captions render through the production exporter', async () => {
  test.setTimeout(180_000)
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const source = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
  expect(fs.existsSync(source)).toBe(true)
  const output = path.join(repoRoot, '.scratch/sclip-v1-completion/portrait-caption-mechanics.mp4')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const userData = tmpDir('sclip-portrait-captions-profile-')
  const { app, page } = await launchApp({ userDataDir: userData, env: { SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '0' } })
  let client: Client | null = null
  try {
    const parentFolder = tmpDir('sclip-portrait-captions-workspace-')
    await newProject(page, { parentFolder, name: 'portrait-captions', canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 } })
    const mediaId = await invokeCmd<string>(page, 'import_media', { path: source })
    const project = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'portrait-caption-mechanics', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))

    const placed = await client.callTool({ name: 'add_video_layer', arguments: {
      media_id: mediaId, track_id: project.tracks[0]!.id,
      src_in_us: 180_000_000, src_out_us: 186_000_000,
      t_start_us: 0, t_end_us: 6_000_000,
    } })
    expect(placed.isError).not.toBe(true)
    const raw = placed.content.find((content) => content.type === 'text')!.text.trim()
    const placement = raw.startsWith('{') ? JSON.parse(raw) : raw
    const layerId = typeof placement === 'string' ? placement : placement.video_layer_id
    const fit = await client.callTool({ name: 'calculate_video_fit', arguments: { layer_id: layerId, mode: 'cover' } })
    expect(fit.isError).not.toBe(true)
    const patch = JSON.parse(fit.content.find((content) => content.type === 'text')!.text).patch
    const applied = await client.callTool({ name: 'update_layer_params', arguments: { layer_id: layerId, patch } })
    expect(applied.isError).not.toBe(true)

    // Geometry-only diagnostic. These words are deliberately not presented as
    // the source transcription or as evidence of editorial caption quality.
    const body = `1\n00:00:00,000 --> 00:00:02,000\nA short caption\n\n2\n00:00:02,000 --> 00:00:04,000\nA longer caption that should wrap without leaving the portrait canvas\n\n3\n00:00:04,000 --> 00:00:06,000\nFinal line near the end\n`
    const captions = await client.callTool({ name: 'apply_subtitles', arguments: { body, format: 'srt', t_end_us: 6_000_000 } })
    expect(captions.isError).not.toBe(true)
    await invokeCmd(page, 'project_save')
    await page.evaluate((request) => (window as any).__sclipExportRange(request), {
      projectId: project.project_id, outputPath: output, startUs: 0, endUs: 6_000_000, resolutionHeight: 1920, fps: 30,
    })
    expect(fs.statSync(output).size).toBeGreaterThan(100_000)
    await invokeCmd(page, 'project_open', { path: path.join(parentFolder, 'portrait-captions') })
    const reopened = await summary(page)
    expect(reopened.tracks.flatMap((track: any) => track.layers).filter((layer: any) => layer.params?.kind === 'Text')).toHaveLength(3)
  } finally {
    await client?.close()
    await app.close()
  }
})
