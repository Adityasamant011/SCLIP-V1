import { test, expect } from '@playwright/test'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { launchApp, newProject, driveExport, tmpDir } from './helpers/driver'

const { PNG } = createRequire(import.meta.url)('pngjs')
const fixtureImage = new PNG({ width: 200, height: 100 })
for (let y = 0; y < 100; y++) for (let x = 0; x < 200; x++) {
  const offset = (y * 200 + x) * 4
  fixtureImage.data.set([x < 100 ? 220 : 30, y < 50 ? 160 : 50, 90, 255], offset)
}
const imageData = 'data:image/png;base64,' + PNG.sync.write(fixtureImage).toString('base64')
const content: Record<string, Record<string, unknown>> = {
  comparison: { title: 'Two ways to deliver a draft', left_label: 'Separate tasks', left_detail: 'Review each task independently', right_label: 'One workflow', right_detail: 'Review the complete sequence' },
  numbers: { title: 'Measured processing time', left_label: 'Before', left_value: 40, right_label: 'After', right_value: 10, unit: 'seconds' },
  process: { title: 'A clear review process', step_1: 'Inspect the source', step_2: 'Make the edit', step_3: 'Review the result' },
  timeline: { title: 'Three documented milestones', date_1: 'January', event_1: 'Research begins', date_2: 'April', event_2: 'First prototype', date_3: 'October', event_3: 'Creator testing' },
  'key-point': { title: 'The central idea', statement: 'A useful visual makes the explanation easier to understand.', attribution: 'Synthetic acceptance example' },
  annotation: { title: 'Inspect this supplied detail', image_data: imageData, point_x: 0.25, point_y: 0.5, callout: 'The highlighted part of the supplied image' },
}

test('editorial recipes render, change props, seek backwards and export real animated frames @serial', async () => {
  test.setTimeout(600_000)
  const output = process.env.SCLIP_HYPERFRAMES_ARTIFACT_DIR ?? tmpDir('sclip-recipe-artifacts-')
  mkdirSync(output, { recursive: true })
  const temporaryExports = tmpDir('sclip-recipe-exports-')
  const projectParent = tmpDir('sclip-recipes-')
  const { app, page } = await launchApp({ env: { SCLIP_BACKGROUND_FEEDBACK: '0', SCLIP_JEV_ENABLED: '0' } })
  let client: Client | undefined
  const proof: unknown[] = []
  try {
    await newProject(page, { parentFolder: projectParent, name: 'Editorial recipe proof', canvas: { width: 640, height: 360, fpsNum: 30, fpsDen: 1 } })
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'recipe-acceptance', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args }, undefined, { timeout: 90_000 })
      expect(result.isError, JSON.stringify(result).slice(0, 900)).toBeFalsy()
      return result
    }
    const text = (r: any) => r.content.find((c: any) => c.type === 'text').text
    const before = await client.readResource({ uri: 'project://current' })
    const catalog = JSON.parse(text(await call('get_hyperframes_recipe', {})))
    expect(catalog.recipes).toHaveLength(6)
    expect(await client.readResource({ uri: 'project://current' })).toEqual(before)
    for (const { id: recipe } of catalog.recipes) for (const aspect of ['landscape', 'portrait', 'square']) {
      const source = JSON.parse(text(await call('get_hyperframes_recipe', { recipe, aspect, ...(aspect === 'landscape' ? { width: 640, height: 360 } : {}), duration_s: 3 })))
      writeFileSync(path.join(output, `${recipe}-${aspect}.json`), JSON.stringify(source, null, 2))
      const shortcut = aspect === 'landscape'
      const id = text(await call('write_hyperframes_draft', shortcut ? { recipe, props: content[recipe], width: 640, height: 360, duration_s: 3 } : { manifest: source.manifest, html: source.html }))
      const defaultProps = shortcut ? {} : content[recipe]
      const capture = async (t: number, props = defaultProps) => {
        const r = await call('preview_motif_draft', { id, t_sec: t, props })
        return (r.content.find(c => c.type === 'image') as any).data as string
      }
      const entrance = await capture(0.1), read = await capture(2.5), exit = await capture(2.9)
      const pixels = PNG.sync.read(Buffer.from(read, 'base64'))
      expect([pixels.width, pixels.height]).toEqual(source.manifest.size)
      // Omitted color overrides must resolve to manifest defaults, just as export does.
      expect(Array.from(pixels.data.subarray(0, 4))).toEqual([21, 43, 42, 255])
      expect(entrance).not.toBe(read)
      expect(exit).not.toBe(read)
      expect(await capture(0.1)).toBe(entrance)
      expect(await capture(2.5, { ...content[recipe], title: 'A changed editable heading', accent: '#FFCC88', motion: 'reduced', surface: 'transparent' })).not.toBe(read)
      for (const [name, data] of [['entrance', entrance], ['read', read], ['exit', exit]]) writeFileSync(path.join(output, `${recipe}-${aspect}-${name}.png`), Buffer.from(data, 'base64'))
      if (aspect === 'landscape') {
        let markerPoint: { x: number; y: number } | null = null
        if (recipe === 'process') {
          await capture(0.4)
          markerPoint = await app.evaluate(async ({ BrowserWindow }) => {
            const host = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('motif://'))!
            return host.webContents.executeJavaScript("(()=>{const p=document.getElementById('process-marker'),r=document.getElementById('content').getBoundingClientRect();return {x:Math.round(r.x+Number(p.getAttribute('cx'))),y:Math.round(r.y+Number(p.getAttribute('cy')))}})()")
          })
        }
        const video = path.join(temporaryExports, `${recipe}.mp4`)
        const exported = await driveExport(page, { motifId: id, outputAbsPath: video, durationUs: 3_000_000, props: defaultProps }, { hook: 'exportMotifClip', timeout: 120_000 })
        expect(exported.done.ok, JSON.stringify(exported.done)).toBe(true)
        execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-f', 'null', '-'], { timeout: 30_000 })
        const frame = (t: string) => execFileSync('ffmpeg', ['-v', 'error', '-ss', t, '-i', video, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { timeout: 30_000, maxBuffer: 8_000_000 })
        expect(frame('0.1').equals(frame('1.5'))).toBe(false)
        if (markerPoint) {
          const offset = (markerPoint.y * 640 + markerPoint.x) * 3 + 1
          // At this point the marker has travelled away; independently inspect encoded pixels.
          expect(frame('0.4')[offset] - frame('2.5')[offset]).toBeGreaterThan(40)
        }
        copyFileSync(video, path.join(output, `${recipe}.mp4`))
        await call('undo', {}) // remove only the test hook's placed graphic before the next export
        // This disposable project now has no placed assets. Keep decoded proofs,
        // discard only its regenerable bake cache between unrelated recipes.
        rmSync(path.join(projectParent, 'Editorial recipe proof', 'Cache'), { recursive: true, force: true })
      }
      proof.push({ recipe, aspect, status: 'PASS', recipe_shortcut: shortcut, actual_preview: true, changed_props: true, backward_seek_identical: true, decoded_export: aspect === 'landscape', encoded_marker_moved: recipe === 'process' && aspect === 'landscape' })
      writeFileSync(path.join(output, 'result.json'), JSON.stringify(proof, null, 2))
    }
    // Rejected readiness must fail the capture, never silently export an incomplete asset.
    const bad = text(await call('write_hyperframes_draft', { manifest: { name: 'Readiness failure', size: [1280, 720], default_duration_s: 3, props_schema: {} }, html: '<div data-composition-id="bad"></div><script>window.__timelines.bad=gsap.timeline({paused:true}).to({}, {duration:3});window.__sclipReady=Promise.reject(new Error("Embedded asset unavailable"));</script>' }))
    const rejected = await client.callTool({ name: 'preview_motif_draft', arguments: { id: bad, t_sec: 1, props: {} } })
    expect(rejected.isError).toBe(true)
    expect(JSON.stringify(rejected)).toContain('Embedded asset unavailable')
    writeFileSync(path.join(output, 'readiness-error.json'), JSON.stringify(rejected, null, 2))
  } finally { await client?.close(); await app.close() }
})
