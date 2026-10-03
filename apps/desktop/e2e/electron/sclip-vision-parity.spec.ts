import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchApp, newProject, invokeCmd, summary, tmpDir } from './helpers/driver'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const benchmarkDir = path.join(desktopRoot, 'e2e/bench-results/phase2f')
const savedProject = path.join(benchmarkDir, 'talking-head-educational-worker-fixed.project.json')
const exportedMp4 = path.join(benchmarkDir, 'talking-head-educational-worker-fixed.mp4')
const originalMedia = '/Users/adityasamant/Documents/1/3/Media/Raw Talking head tutorial video for editing practice.mp4'
const forensicDir = path.join(desktopRoot, 'e2e/bench-results/vision-parity')
const inspectionPng = path.join(forensicDir, 'inspection-frame.png')
const exportPng = path.join(forensicDir, 'export-frame.png')
const timestampUs = 8_000_000

test('built-app Qwen inspection frames match production export at five timeline points', async () => {
  test.skip(process.env.SCLIP_VISION_PARITY_REAL !== '1', 'Real-media forensic parity check is opt-in')
  test.setTimeout(240_000)
  expect(fs.existsSync(savedProject)).toBe(true)
  expect(fs.existsSync(exportedMp4)).toBe(true)
  expect(fs.existsSync(originalMedia)).toBe(true)
  fs.mkdirSync(forensicDir, { recursive: true })
  const projectDir = path.join(tmpDir('sclip-vision-parity-'), 'talking-head')
  fs.mkdirSync(projectDir)
  const project = JSON.parse(fs.readFileSync(savedProject, 'utf8')) as {
    project_id: string; root_id: string;
    media_pool: Record<string, { path_abs: string; path_rel: string; file_size: number }>
    compositions: Record<string, { duration_us: number; tracks: Array<{ layers: Array<{ id: string; t_start_us: number; t_end_us: number; params: { kind: string; src_in_us: number } }> }> }>
  }
  const mediaDir = path.join(projectDir, 'Media')
  fs.mkdirSync(mediaDir)
  for (const item of Object.values(project.media_pool)) {
    expect(fs.statSync(originalMedia).size).toBe(item.file_size)
    const linkedMedia = path.join(mediaDir, path.basename(item.path_rel))
    fs.symlinkSync(originalMedia, linkedMedia)
    item.path_abs = linkedMedia
  }
  fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(project))
  const { app, page } = await launchApp({ env: { SCLIP_VISION_FORENSIC_PNG: inspectionPng } })
  let client: Client | undefined
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-vision-bootstrap-'), name: 'bootstrap', canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 } })
    await invokeCmd(page, 'project_open', { path: projectDir })
    const state = await summary(page)
    expect(state.project_id).toBe(project.project_id)
    expect(state.root_id).toBe(project.root_id)
    expect(state.duration_us).toBe(project.compositions[project.root_id].duration_us)
    expect(state.tracks.flatMap((track) => track.layers.map((layer) => layer.id)).sort())
      .toEqual(project.compositions[project.root_id].tracks.flatMap((track) => track.layers.map((layer) => layer.id)).sort())
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__weftcutPreview?.captureFrameAt)), { timeout: 30_000 }).toBe(true)
    const previewReady = await page.evaluate(() => Boolean((window as any).__weftcutPreview?.captureFrameAt))
    console.log('VISION_PARITY_PREVIEW_BRIDGE', JSON.stringify({ previewReady }))
    const videoLayer = project.compositions[project.root_id].tracks.flatMap((track: any) => track.layers)
      .find((layer: any) => layer.params.kind === 'VideoClip' && layer.t_start_us <= timestampUs && timestampUs < layer.t_end_us)
    expect(videoLayer).toBeTruthy()
    const expectedSourceUs = videoLayer.params.src_in_us + timestampUs - videoLayer.t_start_us
    const seekStages = await page.evaluate(async ({ layerId, tUs, sourceUs }) => {
      const hook = (window as any).__weftcutTest
      hook.weftcutSeekUs(tUs)
      const immediate = await hook.capturePreviewFrame(layerId)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const nextFrame = await hook.capturePreviewFrame(layerId)
      const deadline = performance.now() + 8_000
      let ready = nextFrame
      while (performance.now() < deadline) {
        const probe = hook.activeClipProbe(layerId)
        if (probe?.spriteBound && probe.boundFramePtsUs !== null && probe.boundFramePtsUs >= sourceUs - 50_000) {
          ready = await hook.capturePreviewFrame(layerId)
          break
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      return { immediate, nextFrame, ready }
    }, { layerId: videoLayer.id, tUs: timestampUs, sourceUs: expectedSourceUs })
    for (const [stage, capture] of Object.entries(seekStages)) {
      fs.writeFileSync(path.join(forensicDir, `seek-${stage}.png`), Buffer.from(capture.pngBase64, 'base64'))
    }
    console.log('VISION_PARITY_SEEK_STAGES', JSON.stringify(Object.fromEntries(Object.entries(seekStages).map(([stage, capture]) => [stage, {
      positionUs: capture.positionUs,
      boundFramePtsUs: capture.clip?.boundFramePtsUs,
      spriteBound: capture.clip?.spriteBound,
      presentedCompositeCount: capture.presentedCompositeCount,
    }]))))
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
    client = new Client({ name: 'sclip-vision-parity', version: '1.0.0' }, { capabilities: {} })
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))
    const directInspection = await client.callTool({ name: 'inspect_timeline_frame', arguments: {
      t_us: timestampUs, composition_id: project.root_id,
    } }, undefined, { timeout: 30_000 })
    console.log('VISION_PARITY_LIVE_FRAME', JSON.stringify({ isError: directInspection.isError === true, error: directInspection.isError ? directInspection.content[0] : undefined }))
    const result = await client.callTool({ name: 'vision_inspect', arguments: {
      t_us: timestampUs,
      composition_id: project.root_id,
      question: 'Describe what is visible. Is the main speaker\'s face visible?',
    } }, undefined, { timeout: 120_000 })
    expect(result.isError).not.toBe(true)
    expect(fs.existsSync(inspectionPng)).toBe(true)
    const extracted = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', exportedMp4, '-ss', '8.000000', '-frames:v', '1', exportPng])
    expect(extracted.status, String(extracted.stderr)).toBe(0)
    const meta = JSON.parse(fs.readFileSync(`${inspectionPng}.json`, 'utf8'))
    const evidence = JSON.parse((result.content[0] as { text: string }).text) as { description: string; model: string }
    expect(evidence.model).toContain('Qwen3-VL-2B')
    expect(evidence.description.toLowerCase()).toMatch(/face[^.]*not visible/)
    expect(evidence.description.toLowerCase()).not.toMatch(/entirely black|empty canvas/)
    console.log('VISION_PARITY_FORENSIC', JSON.stringify({
      projectId: project.project_id,
      rootId: project.root_id,
      tUs: timestampUs,
      meta,
      model: evidence.model,
      description: evidence.description,
      inspectionPng,
      exportPng,
    }))
    const checkpoints = [8_000_000, 20_000_000, 1_000_000, 7_200_000, 35_000_000]
    for (const tUs of checkpoints) {
      if (tUs !== timestampUs) {
        let inspection
        try {
          inspection = await client.callTool({ name: 'vision_inspect', arguments: {
            t_us: tUs,
            composition_id: project.root_id,
            question: 'Describe what is visible. Is the main speaker\'s face visible?',
          } }, undefined, { timeout: 120_000 })
        } catch (error) {
          let rendererAlive = false
          try { rendererAlive = (await summary(page)).project_id === project.project_id } catch { /* app may have exited */ }
          console.log('VISION_PARITY_TRANSPORT_FAILURE', JSON.stringify({ tUs, rendererAlive, pageClosed: page.isClosed(), appExitCode: app.process()?.exitCode, error: String(error) }))
          throw error
        }
        expect(inspection.isError, JSON.stringify(inspection.content)).not.toBe(true)
      }
      const label = (tUs / 1_000_000).toFixed(1)
      const inspectedPath = path.join(forensicDir, `inspection-${label}s.png`)
      const exportedPath = path.join(forensicDir, `export-${label}s.png`)
      fs.copyFileSync(inspectionPng, inspectedPath)
      const frame = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', exportedMp4, '-ss', (tUs / 1_000_000).toFixed(6), '-frames:v', '1', exportedPath])
      expect(frame.status, String(frame.stderr)).toBe(0)
      const frameMeta = JSON.parse(fs.readFileSync(`${inspectionPng}.json`, 'utf8')) as { t_us: number; composition_id: string; source: string; width: number; height: number }
      expect(frameMeta).toMatchObject({ t_us: tUs, composition_id: project.root_id, source: 'live_compositor', width: 1080, height: 1920 })
      const similarity = spawnSync('ffmpeg', ['-hide_banner', '-i', inspectedPath, '-i', exportedPath, '-lavfi', 'ssim', '-f', 'null', '-'])
      expect(similarity.status, String(similarity.stderr)).toBe(0)
      const score = Number(String(similarity.stderr).match(/All:([0-9.]+)/)?.[1])
      console.log('VISION_PARITY_CHECKPOINT', JSON.stringify({ tUs, inspection: inspectedPath, export: exportedPath, ssim: score }))
      expect(score, `Wrong scene or stale frame at t_us=${tUs}`).toBeGreaterThan(0.75)
    }
    // A missing live bridge must fail rather than feed Qwen the reduced
    // headless fallback as if it represented the current composition.
    await page.evaluate(() => { delete (window as any).__weftcutPreview })
    const unavailable = await client.callTool({ name: 'vision_inspect', arguments: {
      t_us: timestampUs, composition_id: project.root_id, question: 'Describe what is visible.',
    } }, undefined, { timeout: 30_000 })
    expect(unavailable.isError).toBe(true)
    expect(JSON.stringify(unavailable.content)).toContain('requires the live Sclip preview')
    expect((await summary(page)).project_id).toBe(project.project_id)
  } finally {
    await client?.close().catch(() => {})
    await app.close()
  }
})
