import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'

test('Real-world talking-head video editing acceptance test with Hermes', async () => {
  test.setTimeout(3_600_000) // 60 minutes max budget

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
  const liveProfile = path.join(os.homedir(), 'Library/Application Support/Sclip')
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const source = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
  expect(fs.existsSync(source), 'Raw talking-head media exists').toBe(true)

  const python = '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
  expect(fs.existsSync(python), 'Hermes python venv exists').toBe(true)

  const runLabel = process.env.SCLIP_REAL_EDIT_LABEL ?? ''
  expect(runLabel).toMatch(/^[a-zA-Z0-9-]*$/)
  const outputDir = path.resolve(repoRoot, 'apps/desktop/e2e/bench-results/real-editing', runLabel)
  fs.mkdirSync(outputDir, { recursive: true })

  const usagePath = path.join(outputDir, 'real-talking-head.live-usage.jsonl')
  const tracePath = path.join(outputDir, 'real-talking-head.hermes-trace.txt')
  fs.writeFileSync(usagePath, '')
  fs.writeFileSync(tracePath, '')

  const userData = tmpDir('sclip-real-talking-head-profile-')
  fs.mkdirSync(path.join(userData, 'sclip-hermes'), { recursive: true })
  fs.copyFileSync(path.join(liveProfile, 'cloud_keys.json'), path.join(userData, 'cloud_keys.json'))
  fs.chmodSync(path.join(userData, 'cloud_keys.json'), 0o600)
  const hermesConfig = path.join(userData, 'sclip-hermes/config.yaml')
  fs.copyFileSync(path.join(liveProfile, 'sclip-hermes/config.yaml'), hermesConfig)
  fs.appendFileSync(hermesConfig, '\nagent:\n  api_max_retries: 8\n')

  // Launch Electron with isolated user data and real keychain
  const { app, page } = await launchApp({
    userDataDir: userData,
    realKeychain: true,
    env: {
      SCLIP_USER_DATA_DIR: userData,
      SCLIP_JEV_ENABLED: '0', // Jev V1 disabled by default in standard product state
      OPENROUTER_API_KEY: '',
    },
  })

  let client: Client | undefined
  try {
    const config = await invokeCmd<any>(page, 'sclip_get_hermes_config', {})
    expect(config.provider).toBe('openrouter')
    expect(config.model).toBe('nvidia/nemotron-3-ultra-550b-a55b:free')

    const parent = tmpDir('sclip-real-talking-head-workspace-')
    const projectName = 'real-talking-head-edit'
    const projectDir = path.join(parent, projectName)

    // Create fresh vertical short project (1080x1920 @ 30fps) and enter editor
    await newProject(page, {
      parentFolder: parent,
      name: projectName,
      canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 },
    })

    // Import real raw talking-head footage
    const importedMediaId = await invokeCmd<string>(page, 'import_media', { path: source })
    expect(importedMediaId).toBeTruthy()

    // Copy cached transcripts into project workspace Cache/transcripts
    fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(projectDir, 'Cache/transcripts'), { recursive: true })

    // Cached transcripts in place
    const initialSummary = await summary(page)
    const projectId = (initialSummary as any).project_id
    expect(projectId).toBeTruthy()

    // Connect MCP client to verify server state
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'sclip-real-acceptance', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))

    const catalog = (await client.listTools()).tools
    expect(catalog.some((t) => t.name === 'get_media_context')).toBe(true)
    expect(catalog.some((t) => t.name === 'apply_rough_cut_plan')).toBe(true)
    expect(catalog.some((t) => t.name === 'vision_inspect')).toBe(true)

    // Bundle launcher
    const helperPath = path.join(tmpDir('sclip-real-launcher-'), 'launcher.cjs')
    await build({
      entryPoints: [path.resolve(repoRoot, 'apps/desktop/src/main/sclip/hermesBenchmarkLauncher.ts')],
      outfile: helperPath,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      external: ['electron'],
      logLevel: 'silent',
    })

    const userBrief = `Here is my raw talking-head footage. Create a 30–45-second vertical short suitable for TikTok, Instagram Reels or YouTube Shorts.

Strict duration requirement: The final timeline MUST be between 30 and 45 seconds (target ~35-40 seconds). Keep your rough cut plan clip selections compact so that their total duration fits comfortably within 30-45 seconds.

Find the most interesting self-contained idea in the footage.

Choose a strong opening using only things the speaker actually says or does. Preserve the necessary context and build toward a clear payoff.

Make it feel like a video edited by a competent modern short-form editor, not a generic AI template.

Remove unnecessary pauses and repetitions where appropriate, while preserving natural speech and personality.

Use accurate captions, reframing, supporting visuals or other effects ONLY when they improve clarity, attention or storytelling.

Avoid random zooms, irrelevant B-roll, fake hooks, awkward jump cuts and excessive effects.

Inspect your work and correct problems that you can actually identify.

Do not claim the result is good just because the timeline is valid.

Your goal is one genuinely watchable, coherent short.

Imported source media ID: ${importedMediaId}.`

    const maxTurns = 45
    const started = Date.now()
    const electronBinary = createRequire(import.meta.url)('electron') as string

    console.log('STARTING_HERMES_REAL_EDIT_SESSION', JSON.stringify({ model: config.model, maxTurns, mediaId: importedMediaId }))

    const agent = await new Promise<{ code: number; output: string }>((resolve, reject) => {
      const child = spawn(electronBinary, [helperPath], {
        cwd: repoRoot,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: undefined,
          OPENROUTER_API_KEY: undefined,
          SCLIP_READINESS_GUARD: '1',
          SCLIP_READINESS_USAGE_FILE: usagePath,
          SCLIP_READINESS_MODEL: config.model,
          PYTHONPATH: [
            path.resolve(repoRoot, 'apps/desktop/e2e/electron/helpers/readiness_guard'),
            process.env.PYTHONPATH,
          ].filter(Boolean).join(path.delimiter),
        },
      })

      let output = ''
      const receive = (chunk: Buffer) => {
        const text = String(chunk)
        output += text
        fs.appendFileSync(tracePath, text)
      }
      child.stdout.on('data', receive)
      child.stderr.on('data', receive)

      const deadline = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('Real Hermes edit session timed out'))
      }, 2_400_000)

      child.once('error', (error) => {
        clearTimeout(deadline)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(deadline)
        resolve({ code: code ?? 1, output })
      })

      child.stdin.end(
        JSON.stringify({
          userDataPath: userData,
          python,
          cwd: repoRoot,
          mcpUrl: info.url,
          mcpToken: info.bearer_token,
          projectId,
          prompt: userBrief,
          maxTurns,
          toolsets: 'terminal,file,web,skills,todo,memory,clarify,delegation,weftcut',
          transcriptsDir: path.join(projectDir, 'Cache/transcripts'),
        }),
      )
    })

    console.log('HERMES_REAL_EDIT_FINISHED', JSON.stringify({ code: agent.code, wallLatencyMs: Date.now() - started }))

    // Save project
    await invokeCmd(page, 'project_save')
    const finalProjectJsonPath = path.join(outputDir, 'real-talking-head.project.json')
    fs.copyFileSync(path.join(projectDir, 'project.json'), finalProjectJsonPath)

    const finalSummary = await summary(page)
    const durationUs = finalSummary.duration_us
    console.log('TIMELINE_AFTER_EDIT', JSON.stringify({
      durationUs,
      durationS: durationUs / 1e6,
      tracks: finalSummary.tracks.length,
      layers: finalSummary.tracks.reduce((acc: number, t: any) => acc + t.layers.length, 0),
    }))

    // Export the finished video using Sclip native export callback
    const videoPath = path.join(outputDir, 'real-talking-head.mp4')
    // Do not spend a full render on an incomplete or out-of-brief timeline.
    // The project and trace are saved above for diagnosis either way.
    if (agent.code === 0 && durationUs >= 30_000_000 && durationUs <= 55_000_000) {
      console.log('STARTING_EXPORT', JSON.stringify({ outputPath: videoPath, durationUs }))
      await page.evaluate(
        (request) => (window as any).__sclipExportRange(request),
        {
          projectId,
          outputPath: videoPath,
          startUs: 0,
          endUs: durationUs,
        },
      )
      expect(fs.existsSync(videoPath), 'Exported video exists').toBe(true)
      const stat = fs.statSync(videoPath)
      expect(stat.size, 'Exported video has non-trivial size').toBeGreaterThan(100_000)
      console.log('EXPORT_COMPLETE', JSON.stringify({ videoPath, bytes: stat.size }))
    }

    // Collect usage and db evidence
    const usage = fs.existsSync(usagePath)
      ? fs.readFileSync(usagePath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
      : []

    const dbEvidence = JSON.parse(
      execFileSync(
        python,
        [path.resolve(repoRoot, 'apps/desktop/e2e/electron/helpers/readiness_guard/evidence.py'), path.join(userData, 'sclip-hermes/state.db')],
        { encoding: 'utf8' },
      ),
    )

    const outcome = {
      recorded_at: new Date().toISOString(),
      profile: { provider: config.provider, model: config.model },
      prompt: userBrief,
      max_turns: maxTurns,
      wall_latency_ms: Date.now() - started,
      exit_code: agent.code,
      jev_enabled: false,
      initial_summary: initialSummary,
      final_summary: finalSummary,
      exported_video: fs.existsSync(videoPath) ? { path: videoPath, bytes: fs.statSync(videoPath).size } : null,
      usage_receipts: usage,
      ...dbEvidence,
      trace: tracePath,
    }

    fs.writeFileSync(path.join(outputDir, 'real-talking-head.outcome.json'), JSON.stringify(outcome, null, 2))
    console.log('ACCEPTANCE_TEST_OUTCOME_SAVED', JSON.stringify({
      requests: usage.length,
      traceBytes: fs.statSync(tracePath).size,
      hasVideo: !!outcome.exported_video,
    }))
    // Preserve artifacts first, then fail honestly: a guard-stopped provider run
    // or an unfinished timeline is not an acceptance pass just because the app
    // stayed alive and the harness wrote an outcome file.
    expect(agent.code, 'Hermes must finish without a provider/usage guard stop').toBe(0)
    expect(durationUs, 'Hermes must leave a 30–45 second editable timeline').toBeGreaterThanOrEqual(30_000_000)
    expect(durationUs, 'Hermes must leave a 30–45 second editable timeline').toBeLessThanOrEqual(45_000_000)
    expect(outcome.exported_video, 'The completed timeline must export through Sclip').not.toBeNull()
  } finally {
    await client?.close().catch(() => {})
    await app.close()
  }
})
