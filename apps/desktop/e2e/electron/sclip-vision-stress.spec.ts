import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchApp, newProject, invokeCmd, summary, tmpDir } from './helpers/driver'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const savedProject = path.join(desktopRoot, 'e2e/bench-results/phase2f/talking-head-educational-worker-fixed.project.json')
const originalMedia = '/Users/adityasamant/Documents/1/3/Media/Raw Talking head tutorial video for editing practice.mp4'
const timestampsUs = [1_000_000, 7_200_000, 8_000_000, 20_000_000, 35_000_000]

function sidecarPid(parentPid: number | undefined): number | null {
  if (!parentPid) return null
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
  for (const line of ps.stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+.*vlm_worker\.py/)
    if (match && Number(match[2]) === parentPid) return Number(match[1])
  }
  return null
}

async function sidecarHealth(pid: number | null): Promise<{ pid: number | null; http: string; modelLoaded: boolean | null }> {
  if (!pid) return { pid: null, http: 'not-running', modelLoaded: null }
  const sockets = spawnSync('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' })
  const port = sockets.stdout.match(/127\.0\.0\.1:(\d+)\s*\(LISTEN\)/)?.[1]
  if (!port) return { pid, http: 'no-listener', modelLoaded: null }
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3_000) })
    const health = await response.json() as { model_loaded?: boolean }
    return { pid, http: String(response.status), modelLoaded: health.model_loaded ?? null }
  } catch (error) {
    return { pid, http: `error:${String(error)}`, modelLoaded: null }
  }
}

test('sequential built-app vision_inspect MCP reliability', async ({}) => {
  test.skip(process.env.SCLIP_VISION_STRESS_REAL !== '1', 'Real local-Qwen stress test is opt-in')
  test.setTimeout(600_000)
  const count = Number(process.env.SCLIP_VISION_STRESS_CALLS ?? '10')
  expect([10, 20]).toContain(count)
  expect(fs.existsSync(savedProject)).toBe(true)
  expect(fs.existsSync(originalMedia)).toBe(true)

  const projectDir = path.join(tmpDir('sclip-vision-stress-'), 'talking-head')
  fs.mkdirSync(projectDir)
  const project = JSON.parse(fs.readFileSync(savedProject, 'utf8')) as {
    project_id: string; root_id: string
    media_pool: Record<string, { path_abs: string; path_rel: string; file_size: number }>
  }
  const mediaDir = path.join(projectDir, 'Media')
  fs.mkdirSync(mediaDir)
  for (const item of Object.values(project.media_pool)) {
    expect(fs.statSync(originalMedia).size).toBe(item.file_size)
    const linked = path.join(mediaDir, path.basename(item.path_rel))
    fs.symlinkSync(originalMedia, linked)
    item.path_abs = linked
  }
  fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(project))

  const { app, page } = await launchApp()
  const proc = app.process()
  let mainOutput = ''
  let exit: { code: number | null; signal: string | null } | null = null
  proc?.stdout?.on('data', (chunk: Buffer) => { mainOutput += chunk.toString(); mainOutput = mainOutput.slice(-50_000) })
  proc?.stderr?.on('data', (chunk: Buffer) => { mainOutput += chunk.toString(); mainOutput = mainOutput.slice(-50_000) })
  proc?.on('exit', (code, signal) => { exit = { code, signal } })
  let client: Client | undefined
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-vision-stress-bootstrap-'), name: 'bootstrap', canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 } })
    await invokeCmd(page, 'project_open', { path: projectDir })
    expect((await summary(page)).project_id).toBe(project.project_id)
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__weftcutPreview?.captureFrameAt)), { timeout: 30_000 }).toBe(true)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
    const transport = new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    })
    client = new Client({ name: 'sclip-vision-stress', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)
    let successes = 0
    for (let index = 0; index < count; index++) {
      const tUs = timestampsUs[index % timestampsUs.length]!
      const started = performance.now()
      let error: string | null = null
      let evidence: { model?: string; description?: string; latency_ms?: number } | null = null
      try {
        const response = await client.callTool({ name: 'vision_inspect', arguments: {
          t_us: tUs, composition_id: project.root_id,
          question: 'Describe what is visible. Is the main speaker\'s face visible?',
        } }, undefined, { timeout: 120_000 })
        if (response.isError) error = JSON.stringify(response.content)
        else {
          evidence = JSON.parse((response.content[0] as { text: string }).text)
          successes++
        }
      } catch (caught) {
        error = caught instanceof Error ? `${caught.message}\n${caught.stack ?? ''}` : String(caught)
      }
      const pid = sidecarPid(proc?.pid)
      const sidecar = await sidecarHealth(pid)
      let rendererAlive = false
      try { rendererAlive = (await summary(page)).project_id === project.project_id } catch { /* renderer unavailable */ }
      let mcpHttp = 'unreachable'
      try { mcpHttp = String((await fetch(new URL('/', info.url), { signal: AbortSignal.timeout(3_000) })).status) } catch { /* server unavailable */ }
      console.log('VISION_STRESS_REQUEST', JSON.stringify({
        number: index + 1, tUs, success: !error, elapsedMs: Math.round(performance.now() - started),
        mcpSessionId: transport.sessionId ?? null, mcpHttp, sidecar,
        electronAlive: proc?.exitCode === null, rendererAlive, model: evidence?.model ?? null,
        inferenceLatencyMs: evidence?.latency_ms ?? null, description: evidence?.description?.slice(0, 180) ?? null,
        error,
      }))
      if (error) {
        console.log('VISION_STRESS_MAIN_LOG', mainOutput.split('\n').filter((line) => /mcp|vision|error|exception|exit/i.test(line)).slice(-25).join('\n'))
      }
    }
    console.log('VISION_STRESS_TOTAL', JSON.stringify({ successes, count, exit }))
    const followup = await client.callTool({ name: 'get_timeline_context', arguments: { composition_id: project.root_id } }, undefined, { timeout: 30_000 })
    console.log('VISION_STRESS_MCP_FOLLOWUP', JSON.stringify({ isError: followup.isError === true, contentTypes: followup.content.map((item) => item.type) }))
    expect(followup.isError).not.toBe(true)
    expect(successes).toBe(count)
    expect(exit).toBeNull()
    expect((await summary(page)).project_id).toBe(project.project_id)
    expect((await sidecarHealth(sidecarPid(proc?.pid))).modelLoaded).toBe(true)
  } finally {
    await client?.close().catch(() => {})
    await app.close().catch(() => {})
  }
})
