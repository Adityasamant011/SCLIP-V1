import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchApp, newProject, summary, tmpDir } from './helpers/driver'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(here, '../..')
const blindExport = path.join(desktopRoot, 'e2e/bench-results/phase2f/talking-head-educational.mp4')
const worker = path.join(desktopRoot, 'src/vision/sidecar/vlm_worker.py')
const question = "Is the main speaker's face visible and appropriately framed? Describe what is actually visible."

async function connect(page: import('@playwright/test').Page): Promise<Client> {
  const info = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
  const client = new Client({ name: 'sclip-built-vision-test', version: '1.0.0' }, { capabilities: {} })
  await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
    requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
  }))
  return client
}

test.describe('built-app local vision worker', () => {
  test.describe.configure({ mode: 'serial' })
  let badFrame: string

  test.beforeAll(() => {
    test.skip(process.env.SCLIP_VISION_REAL !== '1', 'Real local-Qwen packaging test is opt-in')
    expect(fs.existsSync(blindExport)).toBe(true)
    badFrame = path.join(tmpDir('sclip-vision-bad-crop-'), 'blind-12s.png')
    const extracted = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '12', '-i', blindExport, '-frames:v', '1', badFrame])
    expect(extracted.status, String(extracted.stderr)).toBe(0)
  })

  test('built app invokes local Qwen on the blind 2.667 crop', async () => {
    test.setTimeout(180_000)
    const { app, page } = await launchApp()
    let client: Client | undefined
    try {
      await newProject(page, { parentFolder: tmpDir('sclip-vision-built-'), name: 'vision-built', canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 } })
      client = await connect(page)
      const result = await client.callTool({ name: 'vision_inspect', arguments: { image_path: badFrame, question } }, undefined, { timeout: 120_000 })
      expect(result.isError).not.toBe(true)
      const evidence = JSON.parse((result.content[0] as { text: string }).text) as { description: string; model: string }
      expect(evidence.model).toContain('Qwen3-VL-2B')
      expect(evidence.description.toLowerCase()).toMatch(/face.{0,30}(not visible|missing|off.screen|absent|cannot see|not shown)|no (visible )?face|only.{0,80}(hand|microphone)/)
      console.log('BUILT_VISION_PREFLIGHT', JSON.stringify({ worker, model: evidence.model, description: evidence.description }))
    } finally {
      await client?.close().catch(() => {})
      await app.close()
    }
  })

  test('missing worker returns an error and leaves app/timeline alive', async () => {
    test.setTimeout(120_000)
    const temporarilyMissing = `${worker}.temporarily-missing-e2e`
    expect(fs.existsSync(worker)).toBe(true)
    expect(fs.existsSync(temporarilyMissing)).toBe(false)
    fs.renameSync(worker, temporarilyMissing)
    let app: Awaited<ReturnType<typeof launchApp>>['app'] | undefined
    let client: Client | undefined
    try {
      const launched = await launchApp()
      app = launched.app
      const { page } = launched
      await newProject(page, { parentFolder: tmpDir('sclip-vision-missing-'), name: 'vision-missing', canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 } })
      client = await connect(page)
      const result = await client.callTool({ name: 'vision_inspect', arguments: { image_path: badFrame, question } })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result.content)).toContain('Vision worker not found')
      expect(JSON.stringify(result.content)).toContain(worker)
      const timeline = await client.callTool({ name: 'get_timeline_context', arguments: {} })
      expect(timeline.isError).not.toBe(true)
      expect((await summary(page)).project_id).toBeTruthy()
      console.log('BUILT_VISION_MISSING_WORKER', JSON.stringify({ worker, clearError: true, rendererAlive: true, timelineAlive: true }))
    } finally {
      await client?.close().catch(() => {})
      await app?.close().catch(() => {})
      fs.renameSync(temporarilyMissing, worker)
    }
  })
})
