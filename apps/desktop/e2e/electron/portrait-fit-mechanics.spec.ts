import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchApp, newProject, invokeCmd, summary, tmpDir } from './helpers/driver'

test('portrait cover arithmetic reaches the real compositor and export', async () => {
  test.setTimeout(180_000)
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const source = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
  expect(fs.existsSync(source)).toBe(true)
  const output = path.join(repoRoot, '.scratch/sclip-v1-completion/portrait-fit-center.mp4')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const userData = tmpDir('sclip-portrait-fit-profile-')
  const { app, page } = await launchApp({ userDataDir: userData, env: { SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '0' } })
  let client: Client | null = null
  try {
    const parentFolder = tmpDir('sclip-portrait-fit-workspace-')
    await newProject(page, { parentFolder, name: 'portrait-fit', canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 } })
    const mediaId = await invokeCmd<string>(page, 'import_media', { path: source })
    const project = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'portrait-fit-mechanics', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const placed = await client.callTool({ name: 'add_video_layer', arguments: {
      media_id: mediaId, track_id: project.tracks[0]!.id,
      src_in_us: 180_000_000, src_out_us: 183_000_000,
      t_start_us: 0, t_end_us: 3_000_000,
    } })
    expect(placed.isError).not.toBe(true)
    const placement = placed.content.find((content) => content.type === 'text')!
    const raw = placement.text.trim().startsWith('{') ? JSON.parse(placement.text) : placement.text.trim()
    const layerId = typeof raw === 'string' ? raw : raw.video_layer_id
    expect(layerId).toBeTruthy()
    const fit = await client.callTool({ name: 'calculate_video_fit', arguments: { layer_id: layerId, mode: 'cover' } })
    expect(fit.isError).not.toBe(true)
    const fitResult = JSON.parse(fit.content.find((content) => content.type === 'text')!.text)
    expect(fitResult.patch.scale_x).toBeGreaterThan(2)
    const applied = await client.callTool({ name: 'update_layer_params', arguments: { layer_id: layerId, patch: fitResult.patch } })
    expect(applied.isError).not.toBe(true)
    await invokeCmd(page, 'project_save')
    await page.evaluate((request) => (window as any).__sclipExportRange(request), {
      projectId: project.project_id, outputPath: output, startUs: 0, endUs: 3_000_000, resolutionHeight: 1920, fps: 30,
    })
    expect(fs.statSync(output).size).toBeGreaterThan(100_000)
    await invokeCmd(page, 'project_open', { path: path.join(parentFolder, 'portrait-fit') })
    const reopened = await summary(page)
    const reopenedLayer = reopened.tracks.flatMap((track: any) => track.layers).find((layer: any) => layer.id === layerId)
    expect(reopenedLayer?.params?.scale_x?.value).toBe(fitResult.patch.scale_x)
  } finally {
    await client?.close()
    await app.close()
  }
})
