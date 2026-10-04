import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { launchApp, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'

// One opt-in review against the preserved Phase 3B edit; no first pass.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const profileRoot = path.join(os.homedir(), 'Library/Application Support/Sclip')
const python = '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
const electronBinary = createRequire(import.meta.url)('electron') as string
const passTimeoutMs = 1_200_000

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
  let outputLine = ''
  let reasoningDisplay = false
  const receive = (chunk: Buffer) => {
    const value = String(chunk)
    tail = `${tail}${value}`.slice(-32_000)
    outputLine += value
    let newline: number
    while ((newline = outputLine.indexOf('\n')) >= 0) {
      const line = outputLine.slice(0, newline + 1)
      outputLine = outputLine.slice(newline + 1)
      if (line.includes('┌─ Reasoning')) { reasoningDisplay = true; trace.write('[Reasoning display omitted]\n'); continue }
      if (reasoningDisplay) { if (line.includes('└─')) reasoningDisplay = false; continue }
      trace.write(line)
    }
  }
  child.stdout?.on('data', receive)
  child.stderr?.on('data', receive)
  const progress = setInterval(() => console.log('PHASE3_AGENT_PROGRESS', JSON.stringify({ elapsed_s: Math.round((Date.now() - started) / 1000), trace_bytes: trace.bytesWritten })), 60_000)
  let timedOut = false
  const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5_000).unref() }, passTimeoutMs)
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', value => resolve(value ?? 1))
  }).finally(async () => { clearInterval(progress); clearTimeout(deadline); if (!reasoningDisplay && outputLine) trace.write(outputLine); await new Promise<void>(resolve => trace.end(resolve)) })
  // Preserve only observable actions/results, excluding CLI thinking display.
  const safeTrace = fs.readFileSync(tracePath, 'utf8').replace(/┌─ Reasoning [^\n]*\n[\s\S]*?└─+┘/g, '[Reasoning display omitted]')
  fs.writeFileSync(tracePath, safeTrace)
  return {
    code, elapsedMs: Date.now() - started,
    messages: Number(tail.match(/Messages:\s*(\d+)/)?.[1] ?? 0),
    toolCallsReported: Number(tail.match(/\(\d+ user,\s*(\d+) tool calls?\)/)?.[1] ?? 0),
    providerFailed: /API failed after|APIConnectionError|No endpoints found/.test(tail), timedOut,
  }
}

test('Phase 3D.1 one bounded GLM acceptance @serial', async ({}) => {
  test.skip(process.env.SCLIP_PHASE3D1_GLM_ACCEPTANCE !== '1', 'One real review is opt-in')
  test.setTimeout(2_000_000)
  const sourceRoot = path.join(repoRoot, 'apps/desktop/e2e/bench-results/phase3b-opening-review/talking-head')
  const resultDir = path.join(sourceRoot, 'phase3d1-glm-acceptance')
  expect(fs.existsSync(resultDir), 'Never overwrite or repeat the live review').toBe(false)
  const startingFile = path.join(sourceRoot, 'first-pass/project.json')
  const originalHash = await sha256(startingFile)
  expect(originalHash).toBe('e85010a0bb363698ddb73049307723f9c104ef2ee30c0f64e76ea7bb18c38da7')
  fs.mkdirSync(resultDir)
  fs.copyFileSync(startingFile, path.join(resultDir, 'starting-project.json'))
  const projectDir = path.join(resultDir, 'workspace')
  fs.mkdirSync(projectDir)
  fs.copyFileSync(startingFile, path.join(projectDir, 'project.json'))
  fs.cpSync(path.join(sourceRoot, 'workspace/edit/Media'), path.join(projectDir, 'Media'), { recursive: true })
  fs.cpSync(path.join(sourceRoot, 'workspace/edit/Cache'), path.join(projectDir, 'Cache'), { recursive: true })
  const userData = tmpDir('sclip-review-only-')
  fs.mkdirSync(path.join(userData, 'sclip-hermes'), { recursive: true, mode: 0o700 })
  for (const file of ['cloud_keys.json', 'model_settings.json', 'speech_config.json']) {
    if (fs.existsSync(path.join(profileRoot, file))) fs.copyFileSync(path.join(profileRoot, file), path.join(userData, file))
  }
  fs.chmodSync(path.join(userData, 'cloud_keys.json'), 0o600)
  fs.copyFileSync(path.join(profileRoot, 'sclip-hermes/config.yaml'), path.join(userData, 'sclip-hermes/config.yaml'))
  const configPath = path.join(userData, 'sclip-hermes/config.yaml')
  const config = parseYaml(fs.readFileSync(configPath, 'utf8'))
  config.model = { ...config.model, default: 'z-ai/glm-5.3-flash' }
  config.display = { ...config.display, show_reasoning: false } // Output privacy, not model reasoning quality.
  fs.writeFileSync(configPath, stringifyYaml(config))
  const helperPath = path.join(tmpDir('sclip-review-launcher-'), 'launcher.cjs')
  await build({ entryPoints: [path.join(repoRoot, 'apps/desktop/src/main/sclip/hermesBenchmarkLauncher.ts')], outfile: helperPath,
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
  const prompt = 'Review this edit as the autonomous editor. Inspect the current timeline and result, identify the highest-impact verified issue that prevents it from being ready, repair it if appropriate, and verify the result.'
  fs.writeFileSync(path.join(resultDir, 'prompt.txt'), prompt + '\n')
  const { app, page } = await launchApp({ userDataDir: userData, realKeychain: true,
    env: { SCLIP_USER_DATA_DIR: userData, SCLIP_ENABLE_EXTERNAL_BROLL: '0', SCLIP_JEV_ENABLED: '0', OPENROUTER_API_KEY: '',
      SCLIP_REVIEW_EVIDENCE_DIR: path.join(resultDir, 'review-decisions'), SCLIP_EVIDENCE_AUDIT_DIR: path.join(resultDir, 'sampled-frames'), SCLIP_MCP_AUDIT_DIR: path.join(resultDir, 'mutation-evidence') } })
  try {
    await invokeCmd(page, 'project_open', { path: projectDir })
    await waitForHook(page, 'motifReopenProject')
    await page.evaluate((projectPath) => (window as any).__weftcutTest.motifReopenProject({ path: projectPath }), projectDir)
    await waitForHook(page, 'waitMediaExportReady')
    const project = JSON.parse(fs.readFileSync(startingFile, 'utf8'))
    for (const mediaId of Object.keys(project.media_pool)) {
      await page.evaluate((id) => (window as any).__weftcutTest.waitMediaExportReady({ mediaId: id, timeoutMs: 180_000 }), mediaId)
    }
    const profile = await invokeCmd<{ provider: string; model: string }>(page, 'sclip_get_hermes_config')
    expect(profile.provider).toBe('openrouter')
    expect(profile.model).toBe('z-ai/glm-5.3-flash')
    const current = await summary(page) as { project_id: string }
    const mcp = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
    await invokeCmd(page, 'project_save')
    fs.copyFileSync(path.join(projectDir, 'project.json'), path.join(resultDir, 'loaded-project.json'))
    const beforeLogs = await invokeCmd<any[]>(page, 'log_list')
    json(path.join(resultDir, 'configuration.json'), { provider: profile.provider, model: profile.model,
      max_turns: 16, session_retries: 0, original_hash: originalHash, external_broll: false,
      source_media: 'existing workspace media copied without import', transcripts: 'existing copied cache', prompt })
    const result = await runHermes(helperPath, { userDataPath: userData, python, cwd: repoRoot,
      mcpUrl: mcp.url, mcpToken: mcp.bearer_token, projectId: current.project_id, initialEvidencePath:path.join(resultDir,'initial-editorial-evidence.json'),
      transcriptsDir: path.join(projectDir, 'Cache/transcripts'), mode: 'review', prompt, maxTurns: 16 }, path.join(resultDir, 'hermes-trace.txt'))
    await invokeCmd(page, 'project_save')
    fs.copyFileSync(path.join(projectDir, 'project.json'), path.join(resultDir, 'reviewed-project.json'))
    const loaded = JSON.parse(fs.readFileSync(path.join(resultDir, 'loaded-project.json'), 'utf8'))
    const after = JSON.parse(fs.readFileSync(path.join(resultDir, 'reviewed-project.json'), 'utf8'))
    const seen = new Set(beforeLogs.map(row => row.id))
    const events = (await invokeCmd<any[]>(page, 'log_list')).filter(row => row.category?.kind === 'Mcp' && !seen.has(row.id))
    json(path.join(resultDir, 'mcp-events.json'), events)
    json(path.join(resultDir, 'review-lifecycle-events.json'), events.filter(row => row.message === 'Review lifecycle' || row.message === 'Autonomous review initialized'))
    json(path.join(resultDir, 'coordinate-validation-events.json'), events.filter(row => row.message === 'Evidence coordinate validation'))
    json(path.join(resultDir, 'history.json'), await invokeCmd(page, 'project_history_view'))
    const loadedHash = await sha256(path.join(resultDir, 'loaded-project.json'))
    const afterHash = await sha256(path.join(resultDir, 'reviewed-project.json'))
    const completed = events.filter(row => row.op_state?.state !== 'Started' && row.source?.kind === 'Agent' && typeof row.details?.tool === 'string')
    const audits = fs.existsSync(path.join(resultDir, 'mutation-evidence')) ? fs.readdirSync(path.join(resultDir, 'mutation-evidence')) : []
    const inspections = new Set(['get_editorial_evidence_packet', 'inspect_timeline_range_visuals', 'get_timeline_context', 'get_media_context', 'calculate_video_fit', 'get_param_track', 'get_source_observations', 'vision_inspect', 'inspect_frames', 'render_timeline_range', 'get_timeline_critique', 'critique_rough_cut'])
    json(path.join(resultDir, 'metrics.json'), { ...result, starting_sha256: originalHash, loaded_sha256: loadedHash,
      reviewed_sha256: afterHash, timeline_unchanged: JSON.stringify(loaded.compositions) === JSON.stringify(after.compositions),
      original_unchanged: (await sha256(startingFile)) === originalHash,
      mcp_calls: completed.filter(row => typeof row.details?.tool === 'string' && !row.details.tool.includes('/')).length,
      inspection_calls: completed.filter(row => inspections.has(row.details?.tool)).length,
      mutation_operations: audits.length, provider_requests: null, provider_requests_note: 'not exposed by CLI summary',
      timeline: timelineMetrics(after), preliminary_status: result.providerFailed ? 'BLOCKED — PROVIDER' : 'REQUIRES_INDEPENDENT_ASSESSMENT' })
    if (JSON.stringify(loaded.compositions) !== JSON.stringify(after.compositions)) {
      const outputPath = path.join(resultDir, 'edit.mp4')
      await page.evaluate((request) => (window as any).__sclipExportRange(request), {
        projectId: current.project_id, outputPath, startUs: 0, endUs: Number(timelineMetrics(after).duration_us),
      })
      json(path.join(resultDir, 'render.json'), { status: 'EXPORTED', outputPath, bytes: fs.statSync(outputPath).size })
    }
    expect(await sha256(startingFile)).toBe(originalHash)
  } finally {
    await app.close()
  }
})
