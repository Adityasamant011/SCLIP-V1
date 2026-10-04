import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'

// Opt-in real-editor measurement. The case manifest was frozen before any
// Phase 3 autonomous output. This spec only orchestrates the production app,
// production MCP host, real Hermes launcher, and native export callback.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const artifactRoot = path.join(repoRoot, 'apps/desktop/e2e/bench-results/phase3-general')
const profileRoot = path.join(os.homedir(), 'Library/Application Support/Sclip')
const python = '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
const electronBinary = createRequire(import.meta.url)('electron') as string
const firstPassMaxTurns = 50
const reviewMaxTurns = 18
const passTimeoutMs = 2_400_000
const maxRenderDurationUs = 180_000_000

interface BenchmarkCase {
  id: string
  genre: string
  source: string
  source_sha256: string
  source_duration_seconds: number
  canvas: { width: number; height: number; fpsNum: number; fpsDen: number }
  prompt: string
}

const manifest = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'cases.json'), 'utf8')) as { cases: BenchmarkCase[] }
const lockedIds = ['talking-head', 'vlog', 'screen-recording', 'product-demo']
if (manifest.cases.map(row => row.id).join('|') !== lockedIds.join('|')) throw new Error('Phase 3 case identities changed')

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

function json(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function timelineMetrics(project: any, renderedFile?: string): Record<string, unknown> {
  const comp = project.compositions?.[project.root_id]
  const tracks = comp?.tracks ?? []
  const layers = tracks.flatMap((track: any) => track.layers ?? [])
  const kinds: Record<string, number> = {}
  const videoTrackIntervals: Array<{ track_id: string; gaps_us: number; overlaps_us: number }> = []
  for (const layer of layers) kinds[layer.params?.kind ?? 'unknown'] = (kinds[layer.params?.kind ?? 'unknown'] ?? 0) + 1
  for (const track of tracks) {
    const videos = (track.layers ?? []).filter((layer: any) => layer.params?.kind === 'VideoClip')
      .sort((a: any, b: any) => a.t_start_us - b.t_start_us)
    let gaps = 0
    let overlaps = 0
    for (let i = 1; i < videos.length; i++) {
      const delta = videos[i].t_start_us - videos[i - 1].t_end_us
      if (delta > 0) gaps += delta
      if (delta < 0) overlaps -= delta
    }
    if (videos.length) videoTrackIntervals.push({ track_id: track.id, gaps_us: gaps, overlaps_us: overlaps })
  }
  const media = Object.entries(project.media_pool ?? {}).map(([id, item]: [string, any]) => ({
    id, path: item.path_abs ?? null, exists: typeof item.path_abs === 'string' && fs.existsSync(item.path_abs),
  }))
  return {
    duration_us: Math.max(0, ...layers.map((layer: any) => Number(layer.t_end_us) || 0)),
    tracks: tracks.length, layers: layers.length, kinds, video_track_intervals: videoTrackIntervals,
    media, rendered_file: renderedFile ?? null,
  }
}

async function runHermes(helperPath: string, request: Record<string, unknown>, tracePath: string): Promise<{ code: number; elapsedMs: number; messages: number; toolCallsReported: number; providerFailed: boolean; timedOut: boolean }> {
  const started = Date.now()
  const trace = fs.createWriteStream(tracePath, { flags: 'wx' })
  const child = spawn(electronBinary, [helperPath], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, SCLIP_ENABLE_EXTERNAL_BROLL: '0' } as NodeJS.ProcessEnv,
  })
  child.stdin.end(JSON.stringify(request))
  let tail = ''
  const receive = (chunk: Buffer) => {
    const value = String(chunk)
    trace.write(value)
    tail = `${tail}${value}`.slice(-32_000)
  }
  child.stdout?.on('data', receive)
  child.stderr?.on('data', receive)
  const progress = setInterval(() => console.log('PHASE3_AGENT_PROGRESS', JSON.stringify({ elapsed_s: Math.round((Date.now() - started) / 1000), trace_bytes: trace.bytesWritten })), 60_000)
  let timedOut = false
  const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5_000).unref() }, passTimeoutMs)
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', value => resolve(value ?? 1))
  }).finally(() => { clearInterval(progress); clearTimeout(deadline); trace.end() })
  return {
    code, elapsedMs: Date.now() - started,
    messages: Number(tail.match(/Messages:\s*(\d+)/)?.[1] ?? 0),
    toolCallsReported: Number(tail.match(/\(\d+ user,\s*(\d+) tool calls?\)/)?.[1] ?? 0),
    providerFailed: /API failed after|APIConnectionError|No endpoints found/.test(tail), timedOut,
  }
}

async function savePass(page: Awaited<ReturnType<typeof launchApp>>['page'], projectDir: string, passDir: string) {
  fs.mkdirSync(passDir, { recursive: false })
  await invokeCmd(page, 'project_save')
  fs.copyFileSync(path.join(projectDir, 'project.json'), path.join(passDir, 'project.json'))
  const project = JSON.parse(fs.readFileSync(path.join(passDir, 'project.json'), 'utf8'))
  const beforeRender = timelineMetrics(project)
  json(path.join(passDir, 'metrics.json'), beforeRender)
  const durationUs = Number(beforeRender.duration_us)
  let render: Record<string, unknown> = { status: 'SKIPPED', reason: 'empty or longer than practical 180-second render ceiling' }
  if (durationUs > 0 && durationUs <= maxRenderDurationUs) {
    const outputPath = path.join(passDir, 'edit.mp4')
    try {
      const current = await summary(page) as typeof beforeRender & { project_id: string }
      await page.evaluate((request) => (window as any).__sclipExportRange(request), {
        projectId: current.project_id, outputPath, startUs: 0, endUs: durationUs,
      })
      if (!fs.existsSync(outputPath)) throw new Error('export returned without output file')
      render = { status: 'EXPORTED', path: outputPath, bytes: fs.statSync(outputPath).size }
    } catch (error) {
      render = { status: 'FAILED', error: error instanceof Error ? error.message : String(error) }
    }
  }
  json(path.join(passDir, 'render.json'), render)
  return { metrics: beforeRender, render }
}

test.describe('Phase 3 general editing quality @serial', () => {
  test.describe.configure({ mode: 'serial' })
  let helperPath: string

  test.beforeAll(async () => {
    test.skip(process.env.SCLIP_PHASE3_RUN !== '1', 'Real-provider Phase 3 benchmark is opt-in')
    expect(fs.existsSync(python)).toBe(true)
    helperPath = path.join(tmpDir('sclip-phase3-launcher-'), 'launcher.cjs')
    await build({ entryPoints: [path.join(repoRoot, 'apps/desktop/src/main/sclip/hermesBenchmarkLauncher.ts')], outfile: helperPath,
      bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
  })

  for (const entry of manifest.cases) {
    test(entry.id, async ({}, testInfo) => {
      test.skip(process.env.SCLIP_PHASE3_CASE && process.env.SCLIP_PHASE3_CASE !== entry.id, 'Another locked case selected')
      test.setTimeout(6_000_000)
      const caseDir = path.join(artifactRoot, entry.id)
      const workspaceParent = path.join(caseDir, 'workspace')
      const projectDir = path.join(workspaceParent, 'edit')
      const firstDir = path.join(caseDir, 'first-pass')
      const reviewedDir = path.join(caseDir, 'reviewed-pass')
      expect(fs.existsSync(projectDir), 'Never overwrite or cherry-pick an earlier case run').toBe(false)
      expect(fs.existsSync(firstDir)).toBe(false)
      expect(fs.existsSync(reviewedDir)).toBe(false)
      expect(await sha256(entry.source), 'Source changed since locked manifest').toBe(entry.source_sha256)
      expect(fs.readFileSync(path.join(caseDir, 'prompt.txt'), 'utf8').trim()).toBe(entry.prompt)
      fs.mkdirSync(workspaceParent, { recursive: true })

      const userData = tmpDir(`sclip-phase3-${entry.id}-`)
      fs.mkdirSync(path.join(userData, 'sclip-hermes'), { recursive: true, mode: 0o700 })
      for (const file of ['cloud_keys.json', 'model_settings.json', 'speech_config.json']) {
        const source = path.join(profileRoot, file)
        if (fs.existsSync(source)) fs.copyFileSync(source, path.join(userData, file))
      }
      fs.chmodSync(path.join(userData, 'cloud_keys.json'), 0o600)
      fs.copyFileSync(path.join(profileRoot, 'sclip-hermes/config.yaml'), path.join(userData, 'sclip-hermes/config.yaml'))
      json(path.join(caseDir, 'run-configuration.json'), {
        recorded_at: new Date().toISOString(), source_sha256: entry.source_sha256, prompt_sha256: createHash('sha256').update(entry.prompt).digest('hex'),
        canvas: entry.canvas, first_pass_max_turns: firstPassMaxTurns, review_max_turns: reviewMaxTurns,
        pass_timeout_ms: passTimeoutMs, max_render_duration_us: maxRenderDurationUs,
        profile_source: profileRoot, credential_transfer: 'encrypted blob copied into isolated userData',
        creator_style_profile_copied: false, external_broll_enabled: false, retries: 0,
      })

      const { app, page } = await launchApp({ userDataDir: userData, realKeychain: true,
        env: { SCLIP_USER_DATA_DIR: userData, SCLIP_ENABLE_EXTERNAL_BROLL: '0', SCLIP_JEV_ENABLED: '0', OPENROUTER_API_KEY: '' } })
      let firstResult: Record<string, unknown> | null = null
      let reviewResult: Record<string, unknown> | null = null
      let failure: string | null = null
      try {
        const connection = await invokeCmd<{ ok: boolean; message: string }>(page, 'sclip_test_hermes_connection')
        expect(connection.ok, connection.message).toBe(true)
        const profile = await invokeCmd<{ provider: string; model: string }>(page, 'sclip_get_hermes_config')
        await newProject(page, { parentFolder: workspaceParent, name: 'edit', canvas: entry.canvas })
        const mediaId = await invokeCmd<string>(page, 'import_media', { path: entry.source })
        await waitForHook(page, 'waitMediaExportReady')
        await page.evaluate((id) => (window as any).__weftcutTest.waitMediaExportReady({ mediaId: id, timeoutMs: 180_000 }), mediaId)
        await invokeCmd(page, 'project_save')
        fs.copyFileSync(path.join(projectDir, 'project.json'), path.join(caseDir, 'initial-project.json'))
        const initial = await summary(page) as typeof entry & { project_id: string }
        const mcp = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
        json(path.join(caseDir, 'session-environment.json'), { provider: profile.provider, model: profile.model,
          project_id: initial.project_id, media_id: mediaId, mcp_endpoint: 'local authenticated HTTP', mcp_token_recorded: false })

        const common = { userDataPath: userData, python, cwd: repoRoot, mcpUrl: mcp.url, mcpToken: mcp.bearer_token,
          projectId: initial.project_id, transcriptsDir: path.join(projectDir, 'Cache/transcripts') }
        const firstTrace = path.join(caseDir, 'first-pass.hermes-trace.txt')
        const firstRun = await runHermes(helperPath, { ...common, prompt: entry.prompt, maxTurns: firstPassMaxTurns }, firstTrace)
        const firstSaved = await savePass(page, projectDir, firstDir)
        firstResult = { ...firstRun, ...firstSaved, trace: firstTrace }
        json(path.join(caseDir, 'first-pass-result.json'), firstResult)

        if (firstRun.providerFailed || firstRun.timedOut || firstRun.code !== 0) throw new Error('First-pass Hermes run did not complete; first-pass evidence preserved')
        const reviewPrompt = `Review the edit you just made for this original request: ${entry.prompt}\nInspect the actual timeline and composed result. Fix only verified important problems. Use at most two focused repair rounds, reinspect after each repair, and stop with an honest final assessment. Keep the project editable. Do not use external media or export; the benchmark will preserve and render the result.`
        fs.writeFileSync(path.join(caseDir, 'review-prompt.txt'), `${reviewPrompt}\n`)
        const reviewTrace = path.join(caseDir, 'reviewed-pass.hermes-trace.txt')
        const reviewRun = await runHermes(helperPath, { ...common, prompt: reviewPrompt, maxTurns: reviewMaxTurns }, reviewTrace)
        const reviewedSaved = await savePass(page, projectDir, reviewedDir)
        reviewResult = { ...reviewRun, ...reviewedSaved, trace: reviewTrace }
        json(path.join(caseDir, 'reviewed-pass-result.json'), reviewResult)
        expect(reviewRun.providerFailed).toBe(false)
        expect(reviewRun.timedOut).toBe(false)
        expect(reviewRun.code).toBe(0)
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        json(path.join(caseDir, 'run-status.json'), { case_id: entry.id, finished_at: new Date().toISOString(),
          first_pass_recorded: firstResult !== null, reviewed_pass_recorded: reviewResult !== null,
          failure, playwright_status: failure ? 'failed' : testInfo.status })
        await app.close()
      }
    })
  }
})
