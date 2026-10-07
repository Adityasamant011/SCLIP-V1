import { test, expect, _electron as electron } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'
import { createRequire } from 'node:module'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { retrievalMetrics } from '../../src/main/sclip/retrievalMetrics.testSupport'

function workerChildren(parentPid: number): number[] {
  return execFileSync('ps', ['-axo', 'pid,ppid,command'], { encoding: 'utf8' }).split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+/)
    return match && Number(match[2]) === parentPid && line.includes('vlm_worker.py') ? [Number(match[1])] : []
  })
}
function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

test('GLM Jev source readiness stays read-only and records all SDK usage', async () => {
  test.skip(process.env.SCLIP_GLM_JEV_READINESS !== '1', 'Explicit bounded paid source-only gate')
  await runSourceReadiness('glm-readiness', false)
})

test('launched Hermes preloads the current WeftCut Jev guidance without provider dispatch', async () => {
  test.skip(process.env.SCLIP_JEV_V1_SKILL_OFFLINE !== '1', 'Explicit provider-free runtime skill probe')
  await runSourceReadiness('jev-v1-skill-offline', true,
    'Identify useful source material without editing. This offline probe stops before provider dispatch.', true, undefined, true)
})

const freeDiscoveryPrompts = [
  "Find the strongest source material for a short about focus and mentorship. Don't edit yet.",
  'Understand this long source and identify the best coherent section for a 30–45 second short about choosing one path or mentor.',
  "Which parts of this source would make the strongest short around the speaker's lesson about focus? Inspect what you need and give me the story you would use.",
]
for (const [index, brief] of freeDiscoveryPrompts.entries()) {
  test(`free optional Jev source discovery ${index + 1}`, async () => {
    test.skip(process.env.SCLIP_FREE_JEV_DISCOVERY !== '1', 'Explicit free-model source-only validation')
    const suffix = process.env.SCLIP_FREE_JEV_TEST_SUFFIX ?? ''
    expect(suffix).toMatch(/^[a-zA-Z0-9-]*$/)
    await runSourceReadiness(`free-discovery-${index + 1}${suffix ? `-${suffix}` : ''}`, true,
      process.env.SCLIP_FREE_JEV_TEST_PROMPT ??
      `${brief} Give exact source ranges and explain the coherent story. This is source selection only: do not edit the timeline, run vision, create captions or export.`)
  })
}

const cohortBrief = 'Understand the source and identify a coherent 30–45 second story for a vertical short about focus and mentorship. Give the exact source range or ranges you would use and explain the setup, point and payoff. This is source selection only: do not edit the timeline, run vision, create captions or export. Stop when you have a defensible source choice.'

/** The recorded provider result is immutable input, not a new Jev inference. */
function recordedJevEvidence() {
  const file = path.resolve('e2e/bench-results/jev/shadow-retrieval-current.json')
  const bytes = fs.readFileSync(file)
  const fixture = JSON.parse(bytes.toString('utf8'))
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const cached = fs.readdirSync(path.join(sourceProject, 'Cache/transcripts'))
    .filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(sourceProject, 'Cache/transcripts', name), 'utf8')))
  const transcript = cached.find(item => item.source_hash === fixture.evidence?.coverage?.[0]?.source_hash)
  return { fixture, transcript, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function recordedJevPrompt(mediaId: string, includeEvidence: boolean): string {
  const { fixture } = recordedJevEvidence()
  const brief = `${fixture.request} Identify the exact source range or ranges you would use and explain the setup, point and payoff. This is source selection only: do not edit the timeline, run vision, create captions or export. Stop when you have a defensible source choice. Imported source media ID: ${mediaId}.`
  if (!includeEvidence) return brief
  // Preserve recorded passage values, order, original references and uncertainty.
  // The only added metadata is the transparent alias for this disposable import.
  const e = fixture.evidence
  const advisory = { coverage: e.coverage, retrieval: e.retrieval, uncertainty: e.uncertainty,
    passages: e.passages.map((p: any) => ({ id: p.id, media_id: p.media_id, start_us: p.start_us,
      end_us: p.end_us, text: p.text, preceding: p.preceding, following: p.following,
      reference: p.reference, context_reference: p.context_reference, judgments: p.judgments })) }
  return `${brief}\n\nPreviously recorded Jev transcript evidence for the exact creative question above follows. This is advisory, non-exhaustive semantic evidence, not a final story or proof of cut quality. It has not viewed the video. The captured reference media ID ${e.coverage[0].media_id} corresponds to the same cached source imported here as ${mediaId}; use the latter for original transcript inspection. You may inspect any source range, including passages not shortlisted, and make your own editorial choice. Do not treat Noul values as calibrated correctness probabilities.\n${JSON.stringify(advisory)}`
}

test('recorded Jev source fixture is authentic, matched and leaves omitted source accessible', async () => {
  test.skip(process.env.SCLIP_JEV_FORCED_VALUE_OFFLINE !== '1', 'Explicit provider-free preflight')
  test.setTimeout(180_000)
  const { fixture, transcript, sha256 } = recordedJevEvidence()
  expect(fixture.status).toBe('evaluated')
  expect(fixture.hermes_model_called).toBe(false)
  expect(fixture.evidence.cached).toBe(false)
  expect(fixture.request).toBe('Find the strongest self-contained section of this complete talking-head source for a useful, engaging 30–45 second vertical short for TikTok/Reels/Shorts. Preserve the speaker\'s actual message and personality.')
  expect(fixture.evidence.requests).toHaveLength(3)
  expect(fixture.request_measurements).toHaveLength(3)
  for (const [index, receipt] of fixture.evidence.requests.entries()) {
    expect(receipt.id).toMatch(/^gen-dec-/)
    expect(receipt.model).toBe('typesafe/jev-1.13-20260917')
    expect(receipt.usage.input_tokens).toBeGreaterThan(0)
    expect(receipt.usage.cost).toBeGreaterThan(0)
    expect(fixture.request_measurements[index].status).toBe(200)
  }
  expect(transcript?.segments).toHaveLength(140)
  expect(fixture.evidence.coverage[0].source_hash).toBe(transcript.source_hash)
  expect(fixture.evidence.coverage[0].cached_range).toEqual({ start_us: transcript.in_us, end_us: transcript.out_us })
  expect(fixture.evidence.retrieval).toMatchObject({ returned_count: 12, evaluated_count: 35, unreturned_count: 23 })
  expect(fixture.evidence.uncertainty).toContain('NOT probability-of-correctness')
  for (const passage of fixture.evidence.passages) {
    expect(passage.id).toMatch(/^p\d+_[0-9a-f]+$/)
    expect(passage.reference).toBe(`media://${passage.media_id}/transcript/${passage.start_us}/${passage.end_us}`)
    expect(transcript.segments.filter((segment: any) => segment.t_start_us >= passage.start_us && segment.t_end_us <= passage.end_us)
      .map((segment: any) => segment.text).join('\n')).toBe(passage.text)
  }
  expect(fixture.evidence.passages.some((passage: any) => passage.start_us <= 143_920_000 && passage.end_us >= 168_560_000)).toBe(false)
  expect(transcript.segments.some((segment: any) => segment.t_start_us === 143_920_000 && segment.text.includes('airport'))).toBe(true)
  expect(recordedJevPrompt('00000000-0000-0000-0000-000000000000', false)).not.toContain('Previously recorded Jev')
  expect(recordedJevPrompt('00000000-0000-0000-0000-000000000000', true)).toContain(JSON.stringify(fixture.evidence.passages[3].text))

  const userData = tmpDir('sclip-jev-forced-value-offline-')
  const { app, page } = await launchApp({ userDataDir: userData, env: {
    SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '0', OPENROUTER_API_KEY: '',
    SCLIP_HERMES_EXECUTABLE: path.join(userData, 'do-not-launch-hermes'),
  } })
  let client: Client | undefined
  try {
    const parent = tmpDir('sclip-jev-forced-value-source-'), name = 'offline-original-access'
    await invokeCmd(page, 'project_new_workspace', { parentFolder: parent, name, width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 })
    const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
    const mediaId = await invokeCmd<string>(page, 'import_media', { path: path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4') })
    fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(parent, name, 'Cache/transcripts'), { recursive: true })
    const before = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'sclip-jev-forced-value-offline', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))
    const tools = (await client.listTools()).tools
    expect(tools.some(tool => tool.name === 'evaluate_source_passages')).toBe(false)
    expect(tools.some(tool => tool.name === 'get_media_context')).toBe(true)
    const omitted = await client.callTool({ name: 'get_media_context', arguments: {
      media_id: mediaId, detail: 'segments', start_us: 143_920_000, end_us: 168_560_000,
    } })
    expect(omitted.isError).not.toBe(true)
    expect((omitted.content[0] as { text: string }).text).toContain('airport')
    expect(JSON.stringify((await summary(page)).tracks)).toBe(JSON.stringify(before.tracks))
    console.log('JEV_FORCED_VALUE_OFFLINE', JSON.stringify({ fixture_sha256: sha256,
      source_hash: transcript.source_hash, original_omitted_source_access: true, timeline_unchanged: true }))
  } finally { await client?.close(); await app.close() }
})

test('recorded Jev evidence versus direct source-only selection', async () => {
  test.skip(process.env.SCLIP_JEV_FORCED_VALUE_PAIR !== '1', 'Explicit single matched free-model pair')
  test.setTimeout(3_000_000)
  const reportDir = path.resolve('e2e/bench-results/jev')
  const measurementLabel = process.env.SCLIP_JEV_MEASUREMENT_LABEL ?? ''
  expect(measurementLabel).toMatch(/^[a-z0-9-]*$/)
  const labels = measurementLabel
    ? [`forced-value-${measurementLabel}-direct`, `forced-value-${measurementLabel}-jev-evidence`]
    : ['forced-value-direct', 'forced-value-jev-evidence']
  expect(labels.every(label => !fs.existsSync(path.join(reportDir, `${label}.outcome.json`))), 'Never overwrite measured sessions').toBe(true)
  const { fixture, transcript } = recordedJevEvidence()
  expect(fixture.status).toBe('evaluated')
  expect(transcript?.segments).toHaveLength(140)
  await runSourceReadiness(labels[0], true, mediaId => recordedJevPrompt(mediaId, false), false)
  await runSourceReadiness(labels[1], true, mediaId => recordedJevPrompt(mediaId, true), false)
})

const cohortConditions = [
  { label: 'pair-1-direct', enabled: false, guidance: 'Use normal compact transcript evidence as your initial source-discovery aid.' },
  { label: 'pair-1-jev', enabled: true, guidance: 'Use the semantic passage-evaluation tool as your initial source-discovery aid. Inspect original surrounding evidence when useful; you choose the story.' },
  { label: 'pair-2-direct', enabled: false, guidance: 'Use normal compact transcript evidence as your initial source-discovery aid.' },
  { label: 'pair-2-jev', enabled: true, guidance: 'Use the semantic passage-evaluation tool as your initial source-discovery aid. Inspect original surrounding evidence when useful; you choose the story.' },
  { label: 'autonomous-1', enabled: true, guidance: '' },
  { label: 'autonomous-2', enabled: true, guidance: '' },
] as const
for (const condition of cohortConditions) {
  test(`Jev source-quality cohort ${condition.label}`, async () => {
    test.skip(process.env.SCLIP_JEV_QUALITY_COHORT !== '1', 'Explicit bounded free-model source-only cohort')
    const reportDir = path.resolve('e2e/bench-results/jev')
    const prior = cohortConditions.flatMap(item => {
      const file = path.join(reportDir, `source-quality-${item.label}.outcome.json`)
      if (!fs.existsSync(file)) return []
      const result = JSON.parse(fs.readFileSync(file, 'utf8'))
      return [result.jev_measurements?.cumulative_cost]
    })
    expect(prior.every(cost => typeof cost === 'number' && Number.isFinite(cost)), 'Stop when Jev cost cannot be monitored').toBe(true)
    const remaining = 0.02 - prior.reduce((sum: number, cost: number) => sum + cost, 0)
    expect(remaining, 'Cohort Jev spend ceiling reached').toBeGreaterThan(0.002)
    expect(fs.existsSync(path.join(reportDir, `source-quality-${condition.label}.outcome.json`)), 'Never overwrite a measured session').toBe(false)
    await runSourceReadiness(`source-quality-${condition.label}`, true,
      `${cohortBrief}${condition.guidance ? ` ${condition.guidance}` : ''}`, condition.enabled, remaining)
  })
}

async function runSourceReadiness(label: string, free: boolean, sourcePrompt?: string | ((mediaId: string) => string),
  jevEnabled = true, jevCostCap?: number, stopBeforeProvider = false): Promise<void> {
  test.setTimeout(1_500_000)
  const liveProfile = path.join(os.homedir(), 'Library/Application Support/Sclip')
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const source = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
  const python = '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
  const userData = tmpDir('sclip-glm-jev-readiness-profile-')
  fs.mkdirSync(path.join(userData, 'sclip-hermes'), { recursive: true })
  fs.copyFileSync(path.join(liveProfile, 'cloud_keys.json'), path.join(userData, 'cloud_keys.json'))
  fs.chmodSync(path.join(userData, 'cloud_keys.json'), 0o600)
  fs.copyFileSync(path.join(liveProfile, 'sclip-hermes/config.yaml'), path.join(userData, 'sclip-hermes/config.yaml'))
  const reportDir = path.resolve('e2e/bench-results/jev')
  fs.mkdirSync(reportDir, { recursive: true })
  const usagePath = path.join(reportDir, `${label}.live-usage.jsonl`)
  const tracePath = path.join(reportDir, `${label}.hermes-trace.txt`)
  fs.writeFileSync(usagePath, '')
  fs.writeFileSync(tracePath, '')
  const { app, page } = await launchApp({ userDataDir: userData, realKeychain: true,
    env: { SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: jevEnabled ? '1' : '0', SCLIP_JEV_MEASURE: '1',
      SCLIP_JEV_COST_CAP_USD: jevCostCap === undefined ? undefined : String(jevCostCap),
      OPENROUTER_API_KEY: '', SCLIP_HERMES_EXECUTABLE: path.join(userData, 'do-not-launch-gateway') } })
  let client: Client | undefined
  try {
    const config = await invokeCmd<any>(page, 'sclip_get_hermes_config', {})
    expect(config.provider).toBe('openrouter')
    if (free) expect(config.model, 'Only the currently selected free Nemotron; paid fallback forbidden').toBe('nvidia/nemotron-3-ultra-550b-a55b:free')
    else expect(config.model, 'No model substitution or profile update').toBe('z-ai/glm-5.2')
    expect(config.configuredKeys.openrouter).toBe(true)
    const parent = tmpDir('sclip-glm-jev-readiness-source-'), name = 'source-readiness'
    await invokeCmd(page, 'project_new_workspace', { parentFolder: parent, name,
      width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 })
    const importedMediaId = await invokeCmd<string>(page, 'import_media', { path: source })
    fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(parent, name, 'Cache/transcripts'), { recursive: true })
    const before = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'sclip-glm-jev-readiness', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const catalog = (await client.listTools()).tools
    expect(catalog.some(t => t.name === 'evaluate_source_passages')).toBe(jevEnabled)
    expect(catalog.some(t => t.name === 'get_media_context')).toBe(true)
    let originalAccessPreflight = false
    if (label.startsWith('forced-value-')) {
      expect(jevEnabled, 'The matched pair replays evidence; it never requests fresh Jev inference').toBe(false)
      const omitted = await client.callTool({ name: 'get_media_context', arguments: {
        media_id: importedMediaId, detail: 'segments', start_us: 143_920_000, end_us: 168_560_000,
      } })
      expect(omitted.isError).not.toBe(true)
      originalAccessPreflight = (omitted.content[0] as { text: string }).text.includes('airport')
      expect(originalAccessPreflight).toBe(true)
    }
    const helperPath = path.join(tmpDir('sclip-glm-readiness-launcher-'), 'launcher.cjs')
    await build({ entryPoints: [path.resolve('src/main/sclip/hermesBenchmarkLauncher.ts')], outfile: helperPath,
      bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
    const prompt = typeof sourcePrompt === 'function' ? sourcePrompt(importedMediaId) : sourcePrompt ?? "Understand the source material and identify the strongest coherent material for a polished 30–45 second vertical short about the speaker's useful lesson around focus / mentorship. Do not edit yet. Tell me what source material you would use, with exact source ranges and why the setup, point and payoff fit together. Choose your own evidence and tools. This is source understanding only: do not mutate the timeline, run vision, create captions or export. Stop when you have identified a defensible source story."
    const maxTurns = process.env.SCLIP_FREE_JEV_TEST_MAX_TURNS
      ? Number(process.env.SCLIP_FREE_JEV_TEST_MAX_TURNS) : free ? 16 : 12
    expect(maxTurns).toBeGreaterThan(0)
    expect(maxTurns).toBeLessThan(17)
    const started = Date.now()
    const electronBinary = createRequire(import.meta.url)('electron') as string
    const agent = await new Promise<{ code: number; output: string }>((resolve, reject) => {
      const child = spawn(electronBinary, [helperPath], { cwd: path.resolve('../..'),
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, OPENROUTER_API_KEY: undefined,
          SCLIP_READINESS_GUARD: '1', SCLIP_READINESS_USAGE_FILE: usagePath,
          // Deliberate route mismatch makes the SDK-boundary guard halt before
          // any network dispatch, after capturing the actual model prompt.
          SCLIP_READINESS_MODEL: stopBeforeProvider ? '__offline_skill_probe__' : config.model,
          SCLIP_READINESS_PROTOCOL_FILE: stopBeforeProvider || process.env.SCLIP_PROTOCOL_CAPTURE === '1'
            ? path.join(reportDir, `${label}.protocol.json`) : undefined,
          SCLIP_TEST_ONLY_SKILL_VARIANT: process.env.SCLIP_TEST_ONLY_SKILL_VARIANT,
          PYTHONPATH: [path.resolve('e2e/electron/helpers/readiness_guard'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) } })
      let output = ''
      const receive = (chunk: Buffer) => { const text = String(chunk); output += text; fs.appendFileSync(tracePath, text) }
      child.stdout.on('data', receive); child.stderr.on('data', receive)
      const deadline = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Source readiness timed out')) }, 1_380_000)
      child.once('error', error => { clearTimeout(deadline); reject(error) })
      child.once('close', code => { clearTimeout(deadline); resolve({ code: code ?? 1, output }) })
      child.stdin.end(JSON.stringify({ userDataPath: userData, python,
        cwd: path.resolve('../..'), mcpUrl: info.url, mcpToken: info.bearer_token,
        projectId: (before as any).project_id, prompt, maxTurns,
        toolsets: 'terminal,file,web,skills,todo,memory,clarify,weftcut',
        transcriptsDir: path.join(parent, name, 'Cache/transcripts') }))
    })
    const after = await summary(page)
    const normalTool = await client.callTool({ name: 'get_timeline_context', arguments: {} })
    const usage = fs.readFileSync(usagePath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    const measurements = await app.evaluate(() => (globalThis as any).__sclipJevMeasurements)
    const dbEvidence = JSON.parse(execFileSync(python, [path.resolve('e2e/electron/helpers/readiness_guard/evidence.py'),
      path.join(userData, 'sclip-hermes/state.db')], { encoding: 'utf8' }))
    const report = { recorded_at: new Date().toISOString(), profile: { provider: config.provider, model: config.model },
      prompt, max_turns: maxTurns, wall_latency_ms: Date.now() - started, exit_code: agent.code,
      jev_enabled: jevEnabled, jev_cost_cap_usd: jevCostCap ?? null,
      source_evaluator_description: catalog.find(t => t.name === 'evaluate_source_passages')?.description,
      original_access_preflight: originalAccessPreflight,
      cost_guard_active: agent.output.includes('SCLIP_READINESS_COST_GUARD_ACTIVE'), usage_receipts: usage,
      jev_measurements: measurements, ...dbEvidence, trace: tracePath,
      timeline_unchanged: JSON.stringify(after.tracks) === JSON.stringify(before.tracks),
      mcp_usable_after: !normalTool.isError, user_profile_modified: false, final_export: false }
    fs.writeFileSync(path.join(reportDir, `${label}.outcome.json`), JSON.stringify(report, null, 2))
    console.log('SOURCE_READINESS_RESULT', JSON.stringify({ label, model: config.model, code: agent.code, calls: usage.length,
      cost: usage.at(-1)?.guard_cumulative_usd, jevCost: measurements.cumulative_cost,
      wallLatencyMs: report.wall_latency_ms, unchanged: report.timeline_unchanged, trace: tracePath }))
    expect(report.cost_guard_active).toBe(true)
    expect(measurements.cost_available, 'Stop if Jev provider cost is unobservable').toBe(true)
    expect(measurements.cumulative_cost).toBeLessThanOrEqual(jevCostCap ?? .04)
    expect(report.timeline_unchanged).toBe(true)
    expect(report.mcp_usable_after).toBe(true)
    if (stopBeforeProvider) {
      const protocolPath = path.join(reportDir, `${label}.protocol.json`)
      expect(fs.existsSync(protocolPath), 'The real Hermes SDK-bound request must include the preloaded skill').toBe(true)
      const protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf8'))
      const guidance = protocol.guidance.map((line: { text: string }) => line.text).join('\n')
      expect(guidance).toContain('Optional Jev semantic discovery')
      expect(guidance).toContain('evaluate_source_passages')
      expect(guidance).toContain('tool_search')
      expect(guidance).toContain('get_media_context')
      expect(usage.some(row => row.stop_reason === 'unexpected_model_route')).toBe(true)
      expect(agent.code).toBe(86)
      return
    }
    expect(agent.code, 'Cost-stop/incomplete runs retained for honest evaluation').toBe(0)
  } finally { await client?.close(); await app.close() }
}

test('built app minimum authenticated Jev provider gate', async () => {
  test.skip(process.env.SCLIP_JEV_PROVIDER_GATE !== '1', 'Explicit paid provider gate only')
  test.setTimeout(process.env.SCLIP_JEV_SHADOW === '1' ? 300_000 : 180_000)
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const source = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
  expect(fs.existsSync(source), 'Existing talking-head source required').toBe(true)
  const userData = tmpDir('sclip-jev-provider-profile-')
  const liveProfile = path.join(os.homedir(), 'Library/Application Support/Sclip')
  fs.copyFileSync(path.join(liveProfile, 'cloud_keys.json'), path.join(userData, 'cloud_keys.json'))
  fs.chmodSync(path.join(userData, 'cloud_keys.json'), 0o600)
  // Preserve the selected main profile in the disposable copy; never change it.
  const configFile = path.join(liveProfile, 'sclip-hermes/config.yaml')
  if (fs.existsSync(configFile)) {
    fs.mkdirSync(path.join(userData, 'sclip-hermes'), { recursive: true })
    fs.copyFileSync(configFile, path.join(userData, 'sclip-hermes/config.yaml'))
  }
  const { app, page } = await launchApp({ userDataDir: userData, realKeychain: true,
    env: { SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '1', OPENROUTER_API_KEY: '',
      SCLIP_JEV_MEASURE: '1',
      // Existing explicit launch override fails BEFORE child spawn. This is a
      // disposable test environment, not a production runtime/model change.
      SCLIP_HERMES_EXECUTABLE: path.join(userData, 'do-not-launch-hermes') } })
  let client: Client | undefined
  try {
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(userData)
    const config = await invokeCmd<any>(page, 'sclip_get_hermes_config', {})
    expect(config.configuredKeys.openrouter, 'Production secure-storage credential resolves').toBe(true)
    const parent = tmpDir('sclip-jev-provider-source-'), name = 'provider-gate'
    await invokeCmd(page, 'project_new_workspace', { parentFolder: parent, name,
      width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 })
    const media = await invokeCmd<string>(page, 'import_media', { path: source })
    fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(parent, name, 'Cache/transcripts'), { recursive: true })
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'sclip-jev-provider-gate', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const before = await summary(page)
    const started = Date.now()
    // One tiny overlapping cached passage; the existing production evaluator
    // submits its normal three evidence questions in ONE Decisions request.
    const result = await client.callTool({ name: 'evaluate_source_passages', arguments: {
      media_ids: [media], request: 'Does this passage introduce what the speaker will explain?',
      start_us: 0, end_us: 1_000_000, limit: 1,
    } }, undefined, { timeout: 45_000 })
    const latency = Date.now() - started
    const text = (result.content[0] as { text: string })?.text ?? ''
    const evidence = result.isError ? null : JSON.parse(text)
    // Only the production client's sanitized, whitelisted provider error is
    // retained. Never log arbitrary exception/provider text or response bodies.
    const providerError = result.isError ? text.match(/Jev provider HTTP \d{3}(?: \((?:credit\/key spending limit|endpoint permission denied|provider data-policy restriction)\))?; no model fallback occurred\./)?.[0] ?? 'Provider gate failed; details withheld.' : null
    const unchanged = JSON.stringify((await summary(page)).tracks) === JSON.stringify(before.tracks)
    const normalTool = await client.callTool({ name: 'get_timeline_context', arguments: {} })
    await invokeCmd(page, 'project_save')
    const receipts = fs.existsSync(path.join(parent, name, 'Logs')) ? fs.readdirSync(path.join(parent, name, 'Logs'))
      .filter(file => file.endsWith('.jsonl')).flatMap(file => fs.readFileSync(path.join(parent, name, 'Logs', file), 'utf8').split('\n').flatMap(line => {
        try { const row = JSON.parse(line); return row.message === 'Jev inference usage' ? [row.details] : [] } catch { return [] }
      })) : []
    const measurements = await app.evaluate(() => (globalThis as any).__sclipJevMeasurements)
    const report = { recorded_at: new Date().toISOString(), status: result.isError ? 'blocked' : 'accepted',
      provider: 'openrouter', endpoint: 'https://openrouter.ai/api/alpha/decisions', model: 'typesafe/jev-1.13',
      credential_resolved: true, credential_source: 'production secure storage; no environment key',
      main_profile: { provider: config.provider, model: config.model }, main_profile_modified: false,
      request_count: receipts.length || evidence?.requests?.length || null, latency_ms: latency,
      schema_accepted: evidence?.status === 'evaluated', candidate_count: evidence?.candidate_count ?? null,
      requests: evidence?.requests ?? [], receipts, measurements, error: providerError, fallback: false,
      timeline_unchanged: unchanged, mcp_usable_after: !normalTool.isError,
      hermes_called: false, qwen_called: false, final_export: false }
    const reportDir = path.resolve('e2e/bench-results/jev')
    fs.mkdirSync(reportDir, { recursive: true })
    fs.writeFileSync(path.join(reportDir, 'provider-gate-current.json'), JSON.stringify(report, null, 2))
    console.log('JEV_PROVIDER_GATE', JSON.stringify(report))
    expect(unchanged).toBe(true)
    expect(normalTool.isError).not.toBe(true)
    if (result.isError) { expect(providerError).toMatch(/^Jev provider HTTP/); return }
    expect(evidence.status).toBe('evaluated')
    expect(evidence.candidate_count).toBe(1)
    expect(evidence.requests).toHaveLength(1)
    expect(evidence.requests[0].model).toMatch(/^typesafe\/jev-1\.13(?:-\d{8})?$/)
    if (process.env.SCLIP_JEV_SHADOW === '1') {
      expect(measurements.cumulative_cost).toBeLessThan(.04)
      const transcriptResource = await client.readResource({ uri: `media://${media}/transcript` })
      const transcript = JSON.parse((transcriptResource.contents[0] as { text: string }).text)
      // Actual historical source-selection wording; no winning timestamp or
      // narrative answer is supplied to Jev. This is evidence retrieval only.
      const request = "Find the strongest self-contained section of this complete talking-head source for a useful, engaging 30–45 second vertical short for TikTok/Reels/Shorts. Preserve the speaker's actual message and personality."
      const shadowStarted = Date.now()
      const shadowResult = await client.callTool({ name: 'evaluate_source_passages', arguments: {
        media_ids: [media], request, limit: 12,
      } }, undefined, { timeout: 210_000 })
      const shadowMeasurements = await app.evaluate(() => (globalThis as any).__sclipJevMeasurements)
      const shadowText = (shadowResult.content[0] as { text: string })?.text ?? ''
      const ranking = shadowResult.isError ? null : JSON.parse(shadowText)
      const unchangedAfter = JSON.stringify((await summary(page)).tracks) === JSON.stringify(before.tracks)
      const normalAfter = await client.callTool({ name: 'get_timeline_context', arguments: {} })
      const winners = [{ media_id: media, start_us: 155_360_000, end_us: 225_280_000 }]
      const output = { recorded_at: new Date().toISOString(), status: shadowResult.isError ? 'failed' : 'evaluated',
        request, ground_truth_evaluation_only: winners,
        label_basis: 'Historical full-context GLM selected narrative; unfinished edit, not a proven quality winner.',
        transcript_segments: transcript.segments.length,
        source_duration_us: transcript.source_duration_us ?? null,
        full_segment_payload_bytes: Buffer.byteLength(JSON.stringify(transcript.segments.map(({ text, t_start_us, t_end_us }: any) => ({ text, t_start_us, t_end_us })))),
        full_text_bytes: Buffer.byteLength(transcript.segments.map((segment: any) => segment.text).join('\n')),
        latency_ms: Date.now() - shadowStarted, evidence: ranking,
        strict_window_metrics: ranking ? [3, 5, 8, 12].map(k => retrievalMetrics(ranking.passages, winners, k)) : [],
        request_measurements: shadowMeasurements.requests.slice(measurements.requests.length),
        cumulative_cost_including_gate: shadowMeasurements.cost_available ? shadowMeasurements.cumulative_cost : null,
        budget_stopped: shadowMeasurements.budget_stopped,
        error: shadowResult.isError ? shadowText.match(/Jev provider HTTP \d{3}[^\n]*/)?.[0] ?? 'Shadow evaluation failed; details withheld.' : null,
        timeline_unchanged: unchangedAfter, mcp_usable_after: !normalAfter.isError,
        hermes_started: false, hermes_model_called: false, qwen_called: false, final_export: false }
      fs.writeFileSync(path.join(reportDir, 'shadow-retrieval-current.json'), JSON.stringify(output, null, 2))
      console.log('JEV_SHADOW_RESULT', JSON.stringify({ status: output.status, segments: output.transcript_segments,
        candidates: ranking?.candidate_count, requests: output.request_measurements,
        cumulativeCost: output.cumulative_cost_including_gate, unchanged: unchangedAfter }))
      expect(unchangedAfter).toBe(true)
      expect(normalAfter.isError).not.toBe(true)
      expect(shadowResult.isError, 'Shadow runtime must return a valid production result').not.toBe(true)
      expect(ranking.status).toBe('evaluated')
      expect(shadowMeasurements.budget_stopped).toBe(false)
      expect(shadowMeasurements.cumulative_cost).toBeLessThan(.05)
    }
  } finally { await client?.close(); await app.close() }
})

test('production terminal adapter preserves real PTY typing, resize and snapshot without a model call', async () => {
  const root = tmpDir('sclip-terminal-regression-')
  const modulePath = path.join(root, 'terminal.cjs')
  const require = createRequire(import.meta.url)
  await build({ entryPoints: [path.resolve('src/main/sclip/hermesTerminalRuntime.ts')], outfile: modulePath,
    bundle: true, platform: 'node', format: 'cjs', alias: { 'node-pty': require.resolve('node-pty') }, external: [require.resolve('node-pty')] })
  const fixture = path.join(root, 'fake-hermes')
  fs.copyFileSync(path.resolve('e2e/electron/helpers/fakeHermesTerminal.py'), fixture)
  fs.chmodSync(fixture, 0o700)
  const { app, page } = await launchApp()
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-terminal-project-'), name: 'synthetic-terminal', canvas: { width: 640, height: 360, fpsNum: 30, fpsDen: 1 } })
    const projectId = (await summary(page)).project_id
    const mcp = await page.evaluate(() => (window as any).api.mcp.getInfo())
    await app.evaluate(async (_electron, options) => {
      // Playwright's main-process evaluation has no dynamic-import callback.
      const { HermesTerminalRuntime } = (process as any).getBuiltinModule('module').createRequire(options.modulePath)(options.modulePath)
      const events: string[] = []
      const runtime = new HermesTerminalRuntime({ isPackaged: false, resourcesPath: '', userDataPath: options.root,
        executableOverride: options.fixture, getMcpInfo: () => options.mcp,
        getProviderEnvironment: () => ({ OPENROUTER_API_KEY: 'synthetic-provider-secret' }), assertSession: async () => {},
        onOutput: (event: { data: string }) => events.push(event.data), onExit: () => {},
      })
      ;(globalThis as any).__terminalFixture = { runtime, events, projectId: options.projectId }
      await runtime.ensure(options.projectId, 'synthetic-session', 80, 24)
    }, { modulePath, root, fixture, mcp, projectId })
    const output = () => app.evaluate(() => (globalThis as any).__terminalFixture.events.join('') as string)
    await expect.poll(output).toContain('"ready": true')
    expect(await output()).toContain('"background": "#0b0d12"')
    expect(await output()).not.toContain('synthetic-provider-secret')
    await app.evaluate(async () => {
      const runtime = (globalThis as any).__terminalFixture.runtime
      await runtime.resize((globalThis as any).__terminalFixture.projectId, 'synthetic-session', 100, 40)
      await runtime.input((globalThis as any).__terminalFixture.projectId, 'synthetic-session', 'hello你好\x1b[200~paste\x1b[201~\n')
    })
    await expect.poll(output).toContain('hello你好')
    await expect.poll(output).toContain('"cols": 100, "rows": 40')
    const snapshot = await app.evaluate(() => (globalThis as any).__terminalFixture.runtime.ensure((globalThis as any).__terminalFixture.projectId, 'synthetic-session'))
    expect(snapshot.history).toContain('hello你好')
    expect(snapshot.history).not.toContain('synthetic-provider-secret')
    await invokeCmd(page, 'project_new_workspace', { parentFolder: tmpDir('sclip-post-terminal-'), name: 'post-terminal', width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 })
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    const client = new Client({ name: 'post-terminal', version: '1' }, {})
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
      expect((await client.callTool({ name: 'get_timeline_context', arguments: {} })).isError).not.toBe(true)
    } finally { await client.close() }
  } finally {
    await app.evaluate(() => (globalThis as any).__terminalFixture?.runtime.stopAll()).catch(() => {})
    await app.close()
  }
})

test('built app real xterm suppresses historical queries, not typing or live replies', async () => {
  const bundle = await build({ stdin: { contents: `export { Terminal } from '@xterm/xterm'; export { suppressHistoricalQueries } from './src/renderer/agent/terminalReplay';`, resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'iife', globalName: 'ReplayTest', write: false })
  const { app, page } = await launchApp()
  try {
    await page.evaluate(code => { (0, eval)(code) }, bundle.outputFiles[0]!.text)
    const evidence = await page.evaluate(async () => {
      const { Terminal, suppressHistoricalQueries } = (window as any).ReplayTest
      const terminal = new Terminal({ theme: { background: '#0b0d12' }, cols: 80, rows: 24 })
      const node = document.createElement('div'); document.body.appendChild(node); terminal.open(node)
      const sent: string[] = []
      terminal.onData((data: string) => sent.push(data))
      const write = (data: string) => new Promise<void>(resolve => terminal.write(data, resolve))
      const replay = suppressHistoricalQueries(terminal)
      // Fragmented history, including setters that must still parse normally.
      await write('\x1b]11;'); await write('?\x07\x1b[0'); await write('c\x1b]0;history title\x07')
      replay.dispose()
      const replayResponses = [...sent]
      const typed = 'hello你好\x1b[200~paste\x1b[201~'
      terminal.input(typed, true)
      const typing = [...sent]
      await write('\x1b]11;?\x07\x1b[c')
      const liveResponses = sent.slice(typing.length)
      terminal.dispose(); node.remove()
      return { replayResponses, typing, typed, liveResponses }
    })
    expect(evidence.replayResponses).toEqual([])
    expect(evidence.typing).toEqual([evidence.typed])
    expect(evidence.liveResponses.some(s => s.includes(']11;rgb:'))).toBe(true)
    expect(evidence.liveResponses.some(s => s.includes('[?'))).toBe(true)
  } finally { await app.close() }
})

test('built app compact source, factual vision and optional authenticated Jev stay read-only', async () => {
  test.setTimeout(240_000)
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const source = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
  test.skip(!fs.existsSync(source), 'Existing local talking-head fixture required')
  const userData = tmpDir('sclip-jev-profile-')
  if (process.env.SCLIP_JEV_REAL === '1') {
    // Encrypted OS-backed blob only, in isolated userData, never plaintext or
    // project/config/output. The built app uses its normal production resolver.
    fs.copyFileSync(path.join(os.homedir(), 'Library/Application Support/Sclip/cloud_keys.json'), path.join(userData, 'cloud_keys.json'))
    fs.chmodSync(path.join(userData, 'cloud_keys.json'), 0o600)
  }
  const { app, page } = await launchApp({ userDataDir: userData, env: { SCLIP_USER_DATA_DIR: userData,
    ...(process.env.SCLIP_JEV_REAL === '1' ? {} : { OPENROUTER_API_KEY: '' }),
  }, realKeychain: process.env.SCLIP_JEV_REAL === '1' })
  let client: Client | undefined
  let ownedWorkers: number[] = []
  try {
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(userData)
    if (process.env.SCLIP_JEV_REAL === '1') {
      const config = await invokeCmd<{ configuredKeys: { openrouter: boolean } }>(page, 'sclip_get_hermes_config', {})
      console.log('JEV_SECURE_PROFILE', JSON.stringify({ appName: await app.evaluate(({ app }) => app.getName()), openrouterConfigured: config.configuredKeys.openrouter }))
      expect(config.configuredKeys.openrouter, 'existing encrypted OpenRouter credential resolves in isolated production profile').toBe(true)
    }
    const parent = tmpDir('sclip-jev-source-'), name = 'source-evidence'
    await newProject(page, { parentFolder: parent, name, canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 } })
    const media = await invokeCmd<string>(page, 'import_media', { path: source })
    fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(parent, name, 'Cache/transcripts'), { recursive: true })
    const track = await invokeCmd<string>(page, 'add_track', {})
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
    client = new Client({ name: 'sclip-jev-reliability', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args }, undefined, { timeout: 90_000 })
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true)
      if (!result.content.length) return null
      const text = (result.content[0] as { text: string }).text
      // Legacy ID-returning operations use plain UUID text, not JSON.
      if (/^[\da-f-]{36}$/i.test(text)) return text
      return JSON.parse(text)
    }
    const placed = await call('add_video_layer', { media_id: media, track_id: track, src_in_us: 0, src_out_us: 7_500_000, t_start_us: 0, t_end_us: 7_500_000 })
    await waitForHook(page, 'waitMediaExportReady')
    await page.evaluate(id => (window as any).__weftcutTest.waitMediaExportReady({ mediaId: id, timeoutMs: 180_000 }), media)
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__weftcutPreview?.captureFrameAt)), { timeout: 30_000 }).toBe(true)
    const before = await summary(page)
    const original = await call('get_media_context', { media_id: media, start_us: 60_000_000, end_us: 120_000_000, detail: 'range' })
    const compact = await call('get_media_context', { media_id: media, start_us: 60_000_000, end_us: 120_000_000, detail: 'segments' })
    expect(compact.transcript.status).toBe('available')
    expect(compact.transcript.segments).toEqual(original.transcript.segments.map(({ text, t_start_us, t_end_us }: any) => ({ text, t_start_us, t_end_us })))
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(original).length)
    const vision = await call('vision_inspect', { t_us: 1_000_000, question: 'Describe what is visible. Is the speaker visible and how much of the frame is black?' })
    ownedWorkers = workerChildren(await app.evaluate(() => process.pid))
    expect(ownedWorkers).toHaveLength(1)
    expect(vision.model).toMatch(/Qwen/)
    expect(vision.confidence).toBeNull()
    expect(vision.composed_frame_facts.t_us).toBe(1_000_000)
    expect(vision.composed_frame_facts.canvas).toEqual({ width: 1080, height: 1920 })
    expect(vision.composed_frame_facts.pixel_facts.near_black_fraction).toBeGreaterThan(.4)
    const observations: any[] = []
    if (process.env.SCLIP_JEV_REAL !== '1') {
      const enabled = (await client.listTools()).tools.some(t => t.name === 'evaluate_source_passages')
      expect(enabled).toBe(process.env.SCLIP_JEV_ENABLED === '1')
      const unavailable = await client.callTool({ name: 'evaluate_source_passages', arguments: { media_ids: [media], request: 'Find useful evidence' } })
      expect(unavailable.isError).toBe(true)
      expect(JSON.stringify(unavailable.content)).toMatch(enabled ? /credential|API key is not configured/i : /disabled/i)
      expect((await summary(page)).tracks).toEqual(before.tracks)
    }
    const reportDir = path.resolve('e2e/bench-results/jev')
    fs.mkdirSync(reportDir, { recursive: true })
    const historicFrame = path.join(os.homedir(), 'Library/Application Support/Sclip/sclip-hermes/cache/images/img_acabad8a6fdd.png')
    const historicCropVision = fs.existsSync(historicFrame) ? await call('vision_inspect', {
      image_path: historicFrame,
      question: 'Describe the main speaker framing. Is the entire head inside the frame, or is any part cut off? Explain what is actually visible.',
    }) : null
    const localReport = { original_chars: JSON.stringify(original).length, compact_chars: JSON.stringify(compact).length, vision, historic_crop_vision: historicCropVision, timeline_unchanged: true }
    fs.writeFileSync(path.join(reportDir, 'built-app-evidence.json'), JSON.stringify({ ...localReport, jev: [], jev_status: 'not_run' }, null, 2))
    if (process.env.SCLIP_JEV_REAL === '1') {
      for (const request of [
        'Find the explanation of the puzzle analogy for building a business and the setup needed to understand it.',
        'Find the airport story about choosing one mentor, putting on blinders and following their process, including its necessary setup.',
        'Find a passage explaining how to cure diabetes. If the source does not cover this, passages are not relevant.',
      ]) {
        let evidence: any
        try { evidence = await call('evaluate_source_passages', { media_ids: [media], request, limit: 12 }) }
        catch (error) {
          fs.writeFileSync(path.join(reportDir, 'built-app-evidence.json'), JSON.stringify({ ...localReport, jev: observations, jev_status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : 'Jev failed' }, null, 2))
          fs.writeFileSync(path.join(reportDir, 'provider-blocked.json'), JSON.stringify({ status: 'blocked', error: error instanceof Error ? error.message.slice(0, 500) : 'Jev failed', model: 'typesafe/jev-1.13', fallback: false }, null, 2))
          throw error
        }
        expect(evidence.status).toBe('evaluated')
        expect(evidence.requests.every((r: any) => /^typesafe\/jev-1\.13/.test(r.model))).toBe(true)
        const winners = request.includes('puzzle') ? [{ media_id: media, start_us: 70_560_000, end_us: 116_960_000 }]
          : request.includes('airport') ? [{ media_id: media, start_us: 155_360_000, end_us: 225_280_000 }] : []
        const shadow = winners.length ? [3, 6, 12].map(k => retrievalMetrics(evidence.passages, winners, k)) : []
        observations.push({ request, ...evidence, shadow_metrics: shadow,
          label_basis: request.includes('airport') ? 'Actual 52-call full-context GLM selected intervals within this narrative; unfinished edit, not a quality winner.' : request.includes('puzzle') ? 'Previously selected full-context rough-cut plan section; not a new quality judgment.' : 'Unsupported-premise negative control; human relevance labeling required.',
          retrieval_quality_validated: false, human_relevance_and_context_review_required: true })
      }
      const cached = await call('evaluate_source_passages', { media_ids: [media], request: observations[0].request, limit: 12 })
      expect(cached.cached).toBe(true)
      expect(cached.provider_cost_this_call).toBe(0)
    }
    expect((await summary(page)).tracks).toEqual(before.tracks)
    const report = { ...localReport, jev: observations, jev_status: process.env.SCLIP_JEV_REAL === '1' ? 'evaluated' : 'not_run' }
    fs.writeFileSync(path.join(reportDir, 'built-app-evidence.json'), JSON.stringify(report, null, 2))
    console.log('JEV_BUILT_EVIDENCE', JSON.stringify({ originalChars: report.original_chars, compactChars: report.compact_chars, qwen: vision.model, requests: observations.flatMap(e => e.requests), unchanged: true }))
    await call('get_timeline_context', {})
    const checkpoint = await call('checkpoint', { label: 'Local evidence regression' })
    expect(JSON.stringify(await call('list_checkpoints', {}))).toContain('Local evidence regression')
    await call('update_layer', { layer_id: typeof placed === 'string' ? placed : placed.video_layer_id, patch: { label: 'Local history verification' } })
    const edited = (await summary(page)).tracks
    await call('undo', {})
    expect((await summary(page)).tracks).toEqual(before.tracks)
    await call('redo', {})
    expect((await summary(page)).tracks).toEqual(edited)
    await call('restore_checkpoint', { checkpoint_id: checkpoint })
    expect((await summary(page)).tracks).toEqual(before.tracks)
    await call('undo', {})
    expect((await summary(page)).tracks).toEqual(edited)
    await invokeCmd(page, 'project_save')
    await invokeCmd(page, 'project_open', { path: path.join(parent, name) })
    expect((await summary(page)).tracks).toEqual(edited)
    // Workspace open deliberately resets runtime undo/checkpoint history.
    // Do not confuse project persistence with legacy .vproj history claims.
    expect(await call('list_checkpoints', {})).toEqual([])
    await call('get_timeline_context', {})
  } finally {
    await client?.close(); await app.close()
    await expect.poll(() => ownedWorkers.some(processAlive)).toBe(false)
  }
})

test('packaged macOS app runs the revised local worker without paid inference', async () => {
  test.skip(process.env.SCLIP_JEV_PACKAGED !== '1', 'Local packaged-app verification is opt-in')
  test.setTimeout(150_000)
  const bundle = path.resolve('release/mac-arm64/WeftCut.app')
  const worker = path.join(bundle, 'Contents/Resources/vision/sidecar/vlm_worker.py')
  expect(fs.readFileSync(worker)).toEqual(fs.readFileSync(path.resolve('src/vision/sidecar/vlm_worker.py')))
  const frame = path.join(os.homedir(), 'Library/Application Support/Sclip/sclip-hermes/cache/images/img_acabad8a6fdd.png')
  expect(fs.existsSync(frame)).toBe(true)
  const userData = tmpDir('sclip-jev-packaged-')
  const app = await electron.launch({
    executablePath: path.join(bundle, 'Contents/MacOS/WeftCut'),
    args: [`--user-data-dir=${userData}`],
    env: { ...process.env, SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '0', WEFTCUT_SUPPRESS_ELEVATION_NOTICE: '1' } as Record<string, string>,
  })
  let client: Client | undefined
  let ownedWorkers: number[] = []
  try {
    const page = await app.firstWindow({ timeout: 60_000 })
    await page.waitForLoadState('domcontentloaded')
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    await invokeCmd(page, 'project_new_workspace', { parentFolder: tmpDir('sclip-jev-packaged-project-'), name: 'packaged-evidence', width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 })
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
    client = new Client({ name: 'sclip-jev-packaged-check', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), { requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
    const result = await client.callTool({ name: 'vision_inspect', arguments: { image_path: frame, question: 'Describe what is visible, including any parts of the speaker outside the image.' } }, undefined, { timeout: 90_000 })
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true)
    const evidence = JSON.parse((result.content[0] as { text: string }).text)
    expect(evidence.model).toContain('Qwen3-VL-2B')
    expect(evidence.confidence).toBeNull()
    ownedWorkers = workerChildren(await app.evaluate(() => process.pid))
    expect(ownedWorkers).toHaveLength(1)
    expect((await client.callTool({ name: 'get_timeline_context', arguments: {} })).isError).not.toBe(true)
    expect(await page.locator('body').isVisible()).toBe(true)
    const reportDir = path.resolve('e2e/bench-results/jev')
    fs.mkdirSync(reportDir, { recursive: true })
    fs.writeFileSync(path.join(reportDir, 'packaged-app-evidence.json'), JSON.stringify({ packaged: true, worker, worker_matches_source: true, local_qwen: evidence, mcp_after_vision: 'PASS', renderer_alive: true, paid_calls: 0 }, null, 2))
  } finally {
    await client?.close(); await app.close()
    await expect.poll(() => ownedWorkers.some(processAlive)).toBe(false)
  }
})
