import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'
import type { Project } from '../../src/main/state/model'

// Three fixed, opt-in REAL video benchmarks. This is only test orchestration:
// Hermes edits through the live Sclip MCP host; the app's compositor exports.
const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
const sourceMedia = path.join(sourceProject, 'Media')
const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bench-results/phase2f')
const userDataPath = path.join(os.homedir(), 'Library/Application Support/Sclip')
const python = '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
const electronBinary = createRequire(import.meta.url)('electron') as string
const finalTalkingHead = process.env.SCLIP_PHASE2F_FINAL_TALKING_HEAD === '1'
const foundation = process.env.SCLIP_PHASE2F_FOUNDATION
// Comparison changes evidence availability, never Hermes's creative order.
const comparisonArm = process.env.SCLIP_JEV_COMPARISON_ARM

// launchApp deliberately uses empty userData. Carry only the existing local
// speech runtime paths into that isolated app through its normal Settings IPC;
// Hermes credentials and the user's other settings remain outside the fixture.
async function prepareLocalSpeech(page: Awaited<ReturnType<typeof launchApp>>['page']): Promise<void> {
  const saved = JSON.parse(fs.readFileSync(path.join(userDataPath, 'speech_config.json'), 'utf8')) as {
    local?: { whisper_cpp?: { binary?: string; model?: string } }
  }
  const binary = saved.local?.whisper_cpp?.binary
  const model = saved.local?.whisper_cpp?.model
  expect(binary && fs.existsSync(binary), 'configured local Whisper binary').toBeTruthy()
  expect(model && fs.existsSync(model), 'configured local Whisper model').toBeTruthy()
  // The current resolver selects only the active model profile. A legacy
  // speech_config entry alone is deliberately not enough (ADR 0064).
  await invokeCmd(page, 'models_use', { id: 'whisper-base', name: 'Phase 2F local Whisper', local: { binary, model } })
  let active = false
  for (let attempt = 0; attempt < 120; attempt++) {
    const view = await invokeCmd<{ active: { speech: string | null }; operations: Array<{ family: string; phase: string; error?: string }> }>(page, 'models_list')
    const error = view.operations.find(op => op.family === 'speech' && op.phase === 'error')
    if (error) throw new Error(`Local speech model activation failed: ${error.error ?? 'unknown error'}`)
    if (view.active.speech) { active = true; break }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  expect(active, 'an active local speech model in the isolated app').toBe(true)
  const state = await invokeCmd<{ backends: Array<{ backend: string; availability: string; selected: boolean }> }>(page, 'settings_get_speech_backends')
  const whisper = state.backends.find(row => row.backend === 'whisper_cpp')
  console.log('PHASE2F_SPEECH_READY', JSON.stringify({ availability: whisper?.availability, selected: whisper?.selected }))
  expect(whisper?.availability).toBe('available')
  expect(whisper?.selected).toBe(true)
}
const finalTalkingHeadPrompt = `Create a polished 1080x1920 educational short for TikTok/Reels/Shorts from this existing talking-head rough cut. Make it useful, direct, modern, and visually intentional. Preserve the speaker's message and personality. Keep effects and graphics restrained; add captions, reframing, punch-ins, B-roll, or text only when they genuinely help. Do not use outside media.

You are the creative editor. Your main model is text-only, and cloud vision is disabled. Ground every claim about the composed picture in Sclip's LOCAL vision_inspect tool; do not infer visual success from transform numbers or tool success. Choose your own action order. Keep the whole brief and important unfinished issues in view, rather than spending the entire session on one cosmetic detail. Periodically reconsider what matters most. If a risky edit is clearly worse on inspection, use the existing checkpoint/undo tools or revise it rather than leaving a known-bad state. Make an overall final assessment before stopping.

Inspect representative composed frames at the opening, early section, both sides of the major cut, middle, and near ending. Ask neutral questions that permit either a good or bad result: Is the face/head visible and appropriately framed? Are gestures or important objects cut off? Is there unintended black canvas? After every meaningful framing or graphic change, inspect the changed composed frame again. For caption QA ask whether ALL visible text is inside the canvas with reasonable margins, and identify any clipping only if present. Use Sclip's native caption/subtitle path rather than dozens of hand-built dialogue text layers. Check caption coverage through the end, not just the opening.

Choose edits yourself using ordinary existing WeftCut tools. No fixed crop numbers, hard-coded zoom schedule, random B-roll, or effects for their own sake. If tool arguments are rejected, read the normal validation error and correct them rather than repeating malformed calls. Avoid repeated identical vision calls. Before stopping, review the composed timeline using local vision at representative points; if a real issue remains, allow yourself ONE targeted correction cycle and verify it. Save the project and stop. Do NOT call export_timeline or perform any final export; the benchmark will export once after you finish.`

const cases = [
  {
    id: 'talking-head-educational',
    file: 'Raw Talking head tutorial video for editing practice.mp4',
    brief: 'Make a 39-second 9:16 Reel for beginner entrepreneurs explaining the puzzle analogy: useful, direct, readable modern captions, and minimal effects.',
    clips: [{ inUs: 0, outUs: 7_500_000 }, { inUs: 70_400_000, outUs: 101_300_000 }],
  },
  {
    id: 'commentary',
    file: '18 Psychology Tricks to Get Viewers Addicted to Your Videos.mp4',
    brief: 'Make a 26-second 9:16 Shorts commentary clip about the viewer pain point in storytelling: clear, sharp, restrained emphasis, and no effect spam.',
    clips: [{ inUs: 62_900_000, outUs: 89_200_000 }],
  },
  {
    id: 'product-ugc',
    file: 'Fun Family Morning, Garden Update & New FS Tracksuits.mp4',
    brief: 'Make a 76-second 9:16 product Reel showing the three Future Self tracksuit colors: warm, clear, product-led, with captions and cutaways only where helpful. A previous Motif bake failed for this source, so use native captions/text instead of Motifs in this recovery run.',
    clips: [{ inUs: 755_000_000, outUs: 831_000_000 }],
  },
] as const

async function runHermes(helperPath: string, request: Record<string, unknown>, tracePath?: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(electronBinary, [helperPath], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } as NodeJS.ProcessEnv,
    })
    let output = ''
    if (tracePath) fs.writeFileSync(tracePath, '')
    const started = Date.now()
    const progress = setInterval(() => {
      console.log('PHASE2F_AGENT_PROGRESS', JSON.stringify({ elapsedS: Math.round((Date.now() - started) / 1000), traceBytes: output.length,
        visionMentions: (output.match(/mcp__weftcut__vision_inspect/g) ?? []).length }))
    }, 60_000)
    let force: ReturnType<typeof setTimeout> | undefined
    const deadline = setTimeout(() => {
      child.kill('SIGTERM')
      force = setTimeout(() => child.kill('SIGKILL'), 5_000)
      clearInterval(progress)
      reject(new Error('Hermes Phase 2F run timed out'))
    }, 2_400_000)
    child.stdout?.on('data', (chunk) => { output += String(chunk); if (tracePath) fs.appendFileSync(tracePath, String(chunk)) })
    child.stderr?.on('data', (chunk) => { output += String(chunk); if (tracePath) fs.appendFileSync(tracePath, String(chunk)) })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(deadline)
      clearInterval(progress)
      if (force) clearTimeout(force)
      resolve({ code: code ?? 1, output })
    })
    child.stdin?.end(JSON.stringify(request))
  })
}

test.describe('Sclip Phase 2F finished-short-form MVP', () => {
  test.describe.configure({ mode: 'serial' })
  let helperDir: string
  let helperPath: string

  test.beforeAll(async () => {
    test.skip(process.env.SCLIP_PHASE2F_REAL !== '1', 'Real-provider MVP benchmark is opt-in')
    if (comparisonArm) {
      expect(['baseline', 'compact', 'jev']).toContain(comparisonArm)
      expect(['source', 'self-management'], 'Matched comparison reuses an existing bounded task').toContain(foundation)
      expect(finalTalkingHead, 'No full benchmark/export in this comparison').toBe(false)
    }
    expect(fs.existsSync(python)).toBe(true)
    fs.mkdirSync(outputDir, { recursive: true })
    helperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-phase2f-launcher-'))
    helperPath = path.join(helperDir, 'launcher.cjs')
    await build({
      entryPoints: [path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/main/sclip/hermesBenchmarkLauncher.ts')],
      outfile: helperPath, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent',
    })
  })

  test.afterAll(() => {
    if (helperDir) fs.rmSync(helperDir, { recursive: true, force: true })
  })

  for (const benchmark of cases) {
    test(benchmark.id, async () => {
      test.skip((finalTalkingHead || foundation) && benchmark.id !== 'talking-head-educational', 'Talking-head-only run')
      test.setTimeout(3_600_000)
      const source = path.join(sourceMedia, benchmark.file)
      expect(fs.existsSync(source)).toBe(true)
      const workspaceParent = finalTalkingHead
        ? fs.mkdtempSync(path.join(outputDir, 'talking-head-final-vision-workspace-'))
        : tmpDir(`sclip-phase2f-${benchmark.id}-`)
      const projectName = finalTalkingHead ? 'talking-head-final-vision' : benchmark.id
      const projectDir = path.join(workspaceParent, projectName)
      const agentUserData = comparisonArm ? tmpDir('sclip-jev-matched-profile-') : userDataPath
      if (comparisonArm) {
        fs.mkdirSync(path.join(agentUserData, 'sclip-hermes'), { recursive: true })
        fs.copyFileSync(path.join(userDataPath, 'cloud_keys.json'), path.join(agentUserData, 'cloud_keys.json'))
        fs.chmodSync(path.join(agentUserData, 'cloud_keys.json'), 0o600)
        // Existing non-secret model profile only. No new settings store or
        // provider override; the production path rebuilds its normal profile.
        fs.copyFileSync(path.join(userDataPath, 'sclip-hermes/config.yaml'), path.join(agentUserData, 'sclip-hermes/config.yaml'))
      }
      const { app, page } = await launchApp(comparisonArm ? {
        userDataDir: agentUserData, realKeychain: true,
        env: { SCLIP_USER_DATA_DIR: agentUserData, SCLIP_COMPACT_SOURCE: comparisonArm === 'baseline' ? '0' : '1', SCLIP_JEV_ENABLED: comparisonArm === 'jev' ? '1' : '0' },
      } : {})
      let client: Client | undefined
      try {
        await newProject(page, {
          parentFolder: workspaceParent, name: projectName,
          canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 },
        })
        if (finalTalkingHead || foundation) await prepareLocalSpeech(page)
        const mediaId = await invokeCmd<string>(page, 'import_media', { path: source })
        const trackId = await invokeCmd<string>(page, 'add_track', {})
        const info = await page.evaluate(() => (window as any).api.mcp.getInfo()) as { url: string; bearer_token: string }
        client = new Client({ name: 'sclip-phase2f-benchmark', version: '1.0.0' }, { capabilities: {} })
        await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
          requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
        }))
        const call = async (name: string, args: Record<string, unknown>) => {
          const result = await client!.callTool({ name, arguments: args })
          if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`)
          return result
        }
        let startUs = 0
        const clips = foundation === 'long-source' ? [{ inUs: 0, outUs: 575_700_000 }] : benchmark.clips
        for (const clip of clips) {
          const durationUs = clip.outUs - clip.inUs
          await call('add_video_layer', {
            media_id: mediaId, track_id: trackId,
            src_in_us: clip.inUs, src_out_us: clip.outUs,
            t_start_us: startUs, t_end_us: startUs + durationUs,
          })
          startUs += durationUs
        }
        await waitForHook(page, 'waitMediaExportReady')
        await page.evaluate((id) => (window as any).__weftcutTest.waitMediaExportReady({ mediaId: id, timeoutMs: 180_000 }), mediaId)
        const before = await summary(page)
        const projectId = (before as typeof before & { project_id: string }).project_id
        expect(projectId).toBeTruthy()

        if (foundation) {
          expect(['source', 'completion', 'skill', 'self-management', 'long-source']).toContain(foundation)
          if (comparisonArm) fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(projectDir, 'Cache/transcripts'), { recursive: true })
          if (foundation === 'long-source') {
            // Reuse the already-generated cache in an isolated workspace; no
            // second store, provider credential copy, or new transcription path.
            fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(projectDir, 'Cache/transcripts'), { recursive: true })
            const names = (await client.listTools()).tools.map(t => t.name)
            expect(names).not.toContain('export_timeline')
            expect(names).toContain('vision_inspect')
            expect((await client.callTool({ name: 'export_timeline', arguments: {} })).isError).toBe(true)
            const ranges = []
            for (const start of [0, 180_000_000, 420_000_000]) {
              const result = await call('get_media_context', { media_id: mediaId, start_us: start, end_us: start + 60_000_000 })
              const body = JSON.parse((result.content[0] as { text: string }).text)
              expect(body.transcript.status).toBe('available')
              expect(body.transcript.segments.length).toBeGreaterThan(0)
              expect(body.transcript.segments.every((s: any) => s.text && s.t_end_us > start && s.t_start_us < start + 60_000_000)).toBe(true)
              expect(body.transcript.segments.some((s: any) => s.words.length > 0)).toBe(true)
              expect(JSON.stringify(result).length).toBeLessThan(50_000)
              ranges.push(body)
            }
            fs.writeFileSync(path.join(outputDir, 'long-source-range-evidence.json'), JSON.stringify(ranges, null, 2))
            const transcription = await call('transcribe_clip', { layer_id: before.tracks.flatMap(t => t.layers).find(l => l.params.kind === 'VideoClip')!.id, backend: 'whisper_cpp' })
            expect(JSON.parse((transcription.content[0] as { text: string }).text).response).toBe('cached_transcript_summary')
            const vision = await call('vision_inspect', { t_us: 1_000_000, question: 'Describe what is visible. Is a person visible in this frame?' })
            expect(JSON.parse((vision.content[0] as { text: string }).text).model).toMatch(/Qwen/)
          }
          // Import workers may finish derivative-path writebacks during a
          // read-only session. Keep every authored project field, including
          // source identity and decode-route kind; omit only cache paths.
          const readAuthoredState = async () => {
            const resource = await client!.readResource({ uri: 'project://current' })
            const project = JSON.parse((resource.contents[0] as { text: string }).text) as Project
            const media_pool = Object.fromEntries(Object.entries(project.media_pool).map(([id, media]) => {
              const { conform_path, waveform_path, thumbnails_dir, decode_route, ...source } = media
              const { quick_proxy, full_proxy, ...route } = decode_route as typeof decode_route & { quick_proxy?: string | null; full_proxy?: string | null }
              return [id, { ...source, decode_route: route }]
            }))
            return { ...project, media_pool }
          }
          const stateBeforeAgent = foundation === 'long-source' ? await readAuthoredState() : null
          const historyBeforeAgent = foundation === 'long-source'
            ? (await client.readResource({ uri: 'project://history' })).contents : null
          const foundationPrompt = foundation === 'long-source'
            ? `Understand this source well enough to identify three different candidate 30–45 second sections. Use transcript evidence from different parts of the source. Do not edit.`
            : foundation === 'source'
            ? `Do not edit this project. Use the existing Sclip MCP transcript/source-context tools on the imported talking-head footage. Explain what the speaker actually discusses, the main useful points, and approximately where in source time those points are spoken. Ground the answer in real transcript text and timestamps, not the visible sign or guesses. Do not use cloud vision or export.`
            : foundation === 'skill'
              ? `This is a short Sclip editing assessment, not a full edit. Identify the current project and explain what evidence you would need to decide whether the talking-head cut is ready. Do not mutate or export. Tell me which Sclip editing skill you actually loaded and one piece of its session guidance.`
              : foundation === 'self-management'
                ? `Understand this talking-head source and its current short cut. Decide whether one small improvement is warranted, make it only if useful, and leave the project in a defensible state. Use visual evidence for any claims about the composed picture. Your interaction budget is finite; manage it for the overall request rather than repeatedly tuning one detail. You choose the order and may skip any editing category. End with an overall assessment of what is complete and what remains. Do not export or produce a finished video.`
                : `This is a bounded editing-assessment exercise, not a final export. The project has several possible concerns: understanding the spoken message, overall structure, vertical presentation, and optional readable captions. Decide for yourself which evidence and edits are most useful; you may skip or reorder any of them. Keep the overall goal and unresolved issues in view. If you try a risky visual change, use existing checkpoint/undo as you judge appropriate and inspect the composed result with local vision; do not knowingly leave a clearly worse state. Stop after an overall assessment of what was improved and what remains. Do not export.`
          const outputStem = `talking-head-foundation-${foundation}${comparisonArm ? `-${comparisonArm}` : ''}`
          const tracePath = path.join(outputDir, `${outputStem}.hermes-trace.txt`)
          const initialState = comparisonArm ? await readAuthoredState() : null
          const tools = comparisonArm ? (await client.listTools()).tools : []
          if (comparisonArm) {
            const context = tools.find(tool => tool.name === 'get_media_context')!
            expect((context.inputSchema.properties as any).detail.enum.includes('segments')).toBe(comparisonArm !== 'baseline')
            expect(tools.some(tool => tool.name === 'evaluate_source_passages')).toBe(comparisonArm === 'jev')
            fs.writeFileSync(path.join(outputDir, `${outputStem}.initial.project.json`), JSON.stringify(initialState, null, 2))
            fs.writeFileSync(path.join(outputDir, `${outputStem}.manifest.json`), JSON.stringify({
              arm: comparisonArm, task: foundationPrompt, task_sha256: createHash('sha256').update(foundationPrompt).digest('hex'),
              turn_budget: foundation === 'source' ? 12 : 16, resolved_main_profile: await invokeCmd(page, 'sclip_get_hermes_config'),
              source_file_sha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
              skill_sha256: createHash('sha256').update(fs.readFileSync(path.join(agentUserData, 'sclip-hermes/skills/weftcut/SKILL.md'))).digest('hex'),
              tools, jev_model: 'typesafe/jev-1.13', cloud_vision_enabled: false,
              final_export: false, production_profile_modified: false,
            }, null, 2))
          }
          const agentStartedAt = Date.now()
          const agent = await runHermes(helperPath, {
            userDataPath: agentUserData, python,
            cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
            mcpUrl: info.url, mcpToken: info.bearer_token, projectId,
            prompt: foundationPrompt, maxTurns: foundation === 'long-source' ? undefined : foundation === 'source' ? 12 : foundation === 'skill' ? 5 : foundation === 'self-management' ? 16 : 22,
            toolsets: foundation === 'long-source' ? undefined : 'terminal,file,web,skills,todo,memory,clarify,delegation,weftcut',
            transcriptsDir: path.join(sourceProject, 'Cache/transcripts'),
          }, tracePath)
          console.log('PHASE2F_FOUNDATION', JSON.stringify({ kind: foundation, exitCode: agent.code, tracePath,
            messageCount: Number(agent.output.match(/Messages:\s*(\d+)/)?.[1] ?? 0) }))
          // Retain failed/incomplete comparison outcomes before assertions.
          if (comparisonArm) {
            await invokeCmd(page, 'project_save')
            fs.copyFileSync(path.join(projectDir, 'project.json'), path.join(outputDir, `${outputStem}.project.json`))
            const logs = fs.existsSync(path.join(projectDir, 'Logs')) ? fs.readdirSync(path.join(projectDir, 'Logs'))
              .filter(name => name.endsWith('.jsonl')).flatMap(name => fs.readFileSync(path.join(projectDir, 'Logs', name), 'utf8').trim().split('\n').flatMap(line => {
                try { const row = JSON.parse(line); return row.message === 'Jev inference usage' ? [row.details] : [] } catch { return [] }
              })) : []
            // SQLite numeric receipts only; no raw messages, config or keys.
            const usage = fs.existsSync(path.join(agentUserData, 'sclip-hermes/state.db')) ? JSON.parse(execFileSync(python, ['-c',
              `import json,sqlite3,sys
db=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
db.row_factory=sqlite3.Row
rows=db.execute('SELECT session_id,model,billing_provider,task,api_call_count,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,estimated_cost_usd,actual_cost_usd,cost_status,cost_source FROM session_model_usage').fetchall()
print(json.dumps([dict(row) for row in rows]))
db.close()`, path.join(agentUserData, 'sclip-hermes/state.db')], { encoding: 'utf8' })) : null
            fs.writeFileSync(path.join(outputDir, `${outputStem}.outcome.json`), JSON.stringify({
              arm: comparisonArm, exit_code: agent.code, turn_budget_exhausted: /Iteration budget (?:reached|exhausted)/.test(agent.output),
              initial: initialState, final: await readAuthoredState(), jev_receipts: logs, hermes_usage: usage,
              trace: tracePath, wall_latency_ms: Date.now() - agentStartedAt,
              billed_cost: null, cost_note: 'Use provider/session usage records; unavailable is not zero. Audit source reads/refetches and chosen passages from the redacted trace. No prose-based completion score.',
            }, null, 2))
          }
          expect(agent.code).toBe(0)
          if (foundation === 'long-source') {
            expect(agent.output).toContain('"model":"z-ai/glm-5.2"')
            expect(agent.output).toContain('"maxTurns":60')
            expect(agent.output).not.toMatch(/persisted-output|cache\/spillover|preparing read_file|preparing terminal/)
            expect(agent.output).toContain('get_media_context')
            const stateAfterAgent = await readAuthoredState()
            const historyAfterAgent = (await client.readResource({ uri: 'project://history' })).contents
            fs.writeFileSync(path.join(outputDir, 'long-source-no-edit-evidence.json'), JSON.stringify({
              before: stateBeforeAgent, after: stateAfterAgent,
              historyBefore: historyBeforeAgent, historyAfter: historyAfterAgent,
            }, null, 2))
            expect(stateAfterAgent).toEqual(stateBeforeAgent)
            expect(historyAfterAgent).toEqual(historyBeforeAgent)
          }
          if (foundation === 'source') {
            if (comparisonArm) expect(await readAuthoredState()).toEqual(initialState)
            expect(agent.output).not.toMatch(/Tool 'transcribe_clip' error/)
            expect(agent.output).toMatch(/puzzle/i)
          } else {
            // A clean subprocess exit is not completion: Hermes can exit 0
            // after exhausting its iteration budget and only summarize work
            // it did not finish.
            expect(agent.output).not.toMatch(/Iteration budget (?:reached|exhausted)/)
            if (foundation === 'skill') expect(agent.output).toMatch(/preparing skill_view|skill\s+weftcut/i)
          }
          await invokeCmd(page, 'project_save')
          fs.copyFileSync(path.join(projectDir, 'project.json'), path.join(outputDir, `${outputStem}.project.json`))
          return
        }

        if (finalTalkingHead) {
          await invokeCmd(page, 'project_save')
          fs.copyFileSync(path.join(projectDir, 'project.json'), path.join(outputDir, 'talking-head-educational-final-vision.initial.project.json'))
        }
        const prompt = finalTalkingHead ? finalTalkingHeadPrompt : benchmark.id === 'talking-head-educational'
          ? `Create a polished 9:16 educational short for Reels/TikTok/Shorts. Useful, direct, modern; preserve the speaker's message and personality. Use captions and visual polish where helpful, avoiding cheesy effects and unnecessary edits. This is an existing rough cut. You are the creative editor. Use Sclip's local vision_inspect tool for actual composed-frame evidence; your main model is text-only. First inspect the current composition with vision_inspect at representative opening, post-cut, middle and near-end timestamps, then decide what needs work. Ask neutral questions that allow both good and bad findings: "Describe the current framing of the main speaker. Is the speaker's face visible and appropriately framed? If yes, explain why. If no, explain what is wrong." After every meaningful framing change, call vision_inspect on the changed composed frame and revise if the evidence warrants it. For text, ask: "Is all visible caption/text fully inside the canvas with reasonable margins, or is any portion clipped by an edge? If fully visible, say that explicitly. If clipped, identify where." Use Sclip's best existing caption/subtitle path instead of dozens of manual text layers. Keep cuts clean, framing intentional, captions readable, audio balanced, and edits restrained. If a tool call fails validation, read its schema and correct the arguments rather than repeating the same failed call. Use only imported project media and built-in Sclip assets; do not fetch outside media. Save/review the final state, then stop without exporting. The benchmark will perform one production export. Do not use any cloud vision tool. Do not assume a transform worked without visual inspection.`
          : `Phase 2F finished-short-form edit. Brief: ${benchmark.brief} The timeline is an already-good rough cut; preserve its message and make only evidence-based polishing decisions. Use the existing Sclip tools as the creative editor. Inspect the actual composed video, add captions/reframing/emphasis/B-roll/text/music only when they genuinely improve it, and reinspect after meaningful changes. The 9:16 picture must fill the canvas with an intentional crop or layout, not a mostly empty black field; text must be visibly well-framed. Use existing position/scale tools if needed. If you choose spoken captions, use Sclip's native caption tools; Motifs are for concise graphics, not long dialogue captions. Use only imported project media and built-in Sclip assets; do not fetch outside media. Review the whole result, then stop without exporting; this benchmark exports the final project once through Sclip's production path. No hard-coded effect cadence or style recipe.`
        const agent = await runHermes(helperPath, {
          userDataPath, python,
          cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
          mcpUrl: info.url, mcpToken: info.bearer_token, projectId,
          prompt, maxTurns: finalTalkingHead ? 38 : benchmark.id === 'talking-head-educational' ? 30 : 45,
          toolsets: finalTalkingHead ? 'terminal,file,web,skills,todo,memory,clarify,delegation,weftcut' : benchmark.id === 'talking-head-educational' ? 'web,skills,todo,memory,clarify,weftcut' : undefined,
          transcriptsDir: path.join(sourceProject, 'Cache/transcripts'),
        }, finalTalkingHead ? path.join(outputDir, 'talking-head-educational-final-vision.hermes-trace.txt') : undefined)
        console.log('PHASE2F_AGENT', JSON.stringify({ benchmark: benchmark.id, exitCode: agent.code,
          providerFailure: /API failed after|Rate limited after|No endpoints found/.test(agent.output),
          messageCount: Number(agent.output.match(/Messages:\s*(\d+)/)?.[1] ?? 0),
          attemptedExport: agent.output.includes('mcp__weftcut__export_timeline'),
        }))

        // Keep the project even when Hermes judgment is weak; the human review
        // must examine the REAL production export, not its self-assessment.
        await invokeCmd(page, 'project_save')
        const outputName = finalTalkingHead ? 'talking-head-educational-final-vision' : benchmark.id === 'talking-head-educational' ? `${benchmark.id}-worker-fixed` : benchmark.id
        fs.copyFileSync(path.join(projectDir, 'project.json'), path.join(outputDir, `${outputName}.project.json`))
        const videoPath = path.join(outputDir, `${outputName}.mp4`)
        const finalSummary = await summary(page)
        const durationUs = finalSummary.duration_us
        try {
          // Test-owned final export: the same internal production callback as
          // the user UI, never an agent-visible MCP action.
          await page.evaluate(request => (window as any).__sclipExportRange(request), {
            projectId, outputPath: videoPath, startUs: 0, endUs: durationUs,
          })
        } catch (error) {
          const exportState = await page.evaluate(() => (window as any).__weftcutExportState).catch(() => null)
          console.log('PHASE2F_EXPORT_STATE', JSON.stringify({ benchmark: benchmark.id, state: exportState }))
          throw error
        }
        expect(fs.statSync(videoPath).size).toBeGreaterThan(100_000)
        console.log('PHASE2F_EXPORT', JSON.stringify({ benchmark: benchmark.id, path: videoPath, durationUs, bytes: fs.statSync(videoPath).size }))
      } finally {
        await client?.close().catch(() => {})
        await app.close()
      }
    })
  }
})
