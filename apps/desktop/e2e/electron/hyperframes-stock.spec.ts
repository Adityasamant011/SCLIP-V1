import { test, expect } from '@playwright/test'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { launchApp, newProject, driveExport, tmpDir } from './helpers/driver'

test('HyperFrames graphic seeks backwards and animates in a decoded export; stock tools exposed @serial', async () => {
  test.setTimeout(180_000)
  const output = process.env.SCLIP_LAUNCH_MEDIA_ARTIFACT_DIR ?? tmpDir('sclip-hyperframes-artifacts-')
  mkdirSync(output, { recursive: true })
  const { app, page } = await launchApp({ env: { SCLIP_BACKGROUND_FEEDBACK: '0' } })
  let client: Client | undefined
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-hyperframes-project-'), name: 'Synthetic graphic', canvas: { width: 320, height: 180, fpsNum: 30, fpsDen: 1 } })
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'launch-media-test', version: '1' }, { capabilities: {} })
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const tools = await client.listTools()
    expect(tools.tools.map(t => t.name)).toContain('video_search_external_media')
    expect(tools.tools.map(t => t.name)).toContain('import_external_media')
    expect(tools.tools.map(t => t.name)).toContain('generate_music')
    const stock = await page.evaluate(() => (window as any).api.backend.invoke('stock_media_status'))
    expect(stock.providers.map((p: any) => p.provider)).toEqual(['pexels', 'pixabay'])
    expect(JSON.stringify(stock)).not.toContain('API_KEY')
    expect(tools.tools.map(t => t.name)).toContain('write_hyperframes_draft')
    const fixtureRoot = process.env.WEFTCUT_TEST_MEDIA ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/media')
    const importedImage = await client.callTool({ name: 'import_media', arguments: { path: path.join(fixtureRoot, 'test_chart_320x240.png') } })
    expect(importedImage.isError, JSON.stringify(importedImage)).toBeFalsy()
    const imageId = (importedImage.content as Array<{ text: string }>)[0].text
    const imageFrame = await client.readResource({ uri: `media://${imageId}/frame/0` })
    expect(imageFrame.contents.some(content => 'blob' in content && content.mimeType?.startsWith('image/'))).toBe(true)
    const draft = await client.callTool({ name: 'write_hyperframes_draft', arguments: {
      manifest: { name: 'Moving square', size: [320, 180], default_duration_s: 2, fonts: [], props_schema: {} },
      html: `<div data-composition-id="intro" data-width="320" data-height="180"><div id="square" style="position:absolute;left:0;top:60px;width:40px;height:40px;background:#ff0000"></div></div><script>
const tl=gsap.timeline({paused:true});tl.fromTo('#square',{x:0},{x:240,duration:2,ease:'none'});window.__timelines.intro=tl;
</script>`,
    } })
    expect(draft.isError, JSON.stringify(draft)).toBeFalsy()
    const id = (draft.content as Array<{ text: string }>)[0].text
    const capture = async (t: number) => {
      const result = await client!.callTool({ name: 'preview_motif_draft', arguments: { id, t_sec: t, width: 320, height: 180 } })
      expect(result.isError, JSON.stringify(result).slice(0, 500)).toBeFalsy()
      return (result.content as Array<{ data: string }>)[0].data
    }
    const first = await capture(0)
    const middle = await capture(1)
    const backward = await capture(0)
    expect(first).toBe(backward)
    expect(middle).not.toBe(first)
    writeFileSync(path.join(output, 'hyperframes-start.png'), Buffer.from(first, 'base64'))
    writeFileSync(path.join(output, 'hyperframes-middle.png'), Buffer.from(middle, 'base64'))
    const video = path.join(os.tmpdir(), `sclip-hyperframes-${Date.now()}.mp4`)
    const result = await driveExport(page, { motifId: id, outputAbsPath: video, durationUs: 2_000_000 }, { hook: 'exportMotifClip', timeout: 120_000 })
    expect(result.done.ok, JSON.stringify(result.done)).toBe(true)
    copyFileSync(video, path.join(output, 'hyperframes.mp4'))
    execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-f', 'null', '-'], { timeout: 30_000 })
    // Independently inspect encoded pixels rather than trusting the preview.
    const raw = (time: string) => execFileSync('ffmpeg', ['-v', 'error', '-ss', time, '-i', video, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { timeout: 30_000 })
    const a = raw('0'), b = raw('1')
    const pixel = (bytes: Buffer, x: number) => Array.from(bytes.subarray((80 * 320 + x) * 3, (80 * 320 + x) * 3 + 3))
    expect(pixel(a, 20)[0]).toBeGreaterThan(200)
    expect(pixel(b, 140)[0]).toBeGreaterThan(200)
    expect(pixel(b, 20)[0]).toBeLessThan(30)
    writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS', backwards_seek_identical: true, decoded_export: true, export_start_rgb: pixel(a,20), export_mid_rgb: pixel(b,140), hosted_inference: false }, null, 2))
  } finally { await client?.close(); await app.close() }
})
