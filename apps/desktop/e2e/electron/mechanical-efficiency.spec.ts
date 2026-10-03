/** Opt-in live-agent observation only. No production guidance/tool changes. */
import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync, spawn } from 'node:child_process'
import { launchApp, invokeCmd, summary, tmpDir } from './helpers/driver'
import { parseProject } from '../../src/main/state/serialize'
import { compileRoughCutTimeline } from '../../src/main/state/mutations/roughCut'
import { seededGen } from '../../src/main/state/ids'
import { validateRoughCutPlan, type RoughCutPlan } from '../../src/main/sclip/roughCutPlan'
import { initEval } from '../../src/renderer/eval/index'

function canonical(project: any): unknown {
  const comp = structuredClone(project.compositions[project.root_composition_id ?? project.root_id])
  const names = new Map<string, string>()
  comp.tracks.flatMap((t: any) => t.layers).forEach((l: any, i: number) => names.set(l.id, `layer-${i}`))
  comp.links.forEach((l: any, i: number) => names.set(l.id, `link-${i}`))
  delete comp.metadata
  const normalized = JSON.parse(JSON.stringify(comp, (_k, v) => typeof v === 'string' ? names.get(v) ?? v : v))
  normalized.links.forEach((l: any) => l.members.sort())
  return normalized
}

for (const kind of ['bulk', 'caption'] as const) {
  test(`free Hermes mechanical efficiency: ${kind}`, async () => {
    test.skip(process.env.SCLIP_MECHANICAL_GATE !== '1', 'Explicit free-model mechanical gate')
    test.setTimeout(1_200_000)
    // Real source and user-selected intervals are runtime inputs, not fixtures.
    const ranges: [number, number][] = JSON.parse(process.env.SCLIP_MECHANICAL_RANGES ?? '[]')
    expect(ranges.length).toBeGreaterThan(0)
    expect(ranges.length).toBeLessThanOrEqual(9)
    for (const [start, end] of ranges) expect(start < end).toBe(true)
    await initEval()
    const live = path.join(os.homedir(), 'Library/Application Support/Sclip')
    const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
    const source = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
    const python = '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
    const userData = tmpDir('sclip-mechanical-profile-')
    fs.mkdirSync(path.join(userData, 'sclip-hermes'), { recursive: true })
    fs.copyFileSync(path.join(live, 'cloud_keys.json'), path.join(userData, 'cloud_keys.json'))
    fs.chmodSync(path.join(userData, 'cloud_keys.json'), 0o600)
    fs.copyFileSync(path.join(live, 'sclip-hermes/config.yaml'), path.join(userData, 'sclip-hermes/config.yaml'))
    const reportDir = path.resolve('e2e/bench-results/mechanical')
    fs.mkdirSync(reportDir, { recursive: true })
    const suffix = process.env.SCLIP_MECHANICAL_LABEL ?? ''
    const offline = kind === 'bulk' && process.env.SCLIP_MECHANICAL_OFFLINE === '1'
    expect(suffix).toMatch(/^[a-zA-Z0-9-]*$/)
    const label = suffix ? `${kind}-${suffix}` : kind
    const usagePath = path.join(reportDir, `${label}.live-usage.jsonl`)
    const tracePath = path.join(reportDir, `${label}.hermes-trace.txt`)
    fs.writeFileSync(usagePath, '')
    fs.writeFileSync(tracePath, '')
    const { app, page } = await launchApp({ userDataDir: userData, realKeychain: true,
      env: { SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '0', OPENROUTER_API_KEY: '',
        SCLIP_HERMES_EXECUTABLE: path.join(userData, 'do-not-launch-gateway') } })
    let client: Client | undefined
    try {
      const config = await invokeCmd<any>(page, 'sclip_get_hermes_config', {})
      expect(config.provider).toBe('openrouter')
      expect(config.model, 'No profile update or fallback').toBe('nvidia/nemotron-3-ultra-550b-a55b:free')
      expect(config.configuredKeys.openrouter).toBe(true)
      const parent = tmpDir('sclip-mechanical-project-'), name = `mechanical-${kind}`
      const workspace = path.join(parent, name)
      await invokeCmd(page, 'project_new_workspace', { parentFolder: parent, name,
        width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 })
      const mediaId = await invokeCmd<string>(page, 'import_media', { path: source })
      fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(workspace, 'Cache/transcripts'), { recursive: true })
      const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
      client = new Client({ name: 'sclip-mechanical-observer', version: '1' }, {})
      await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
        requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } } }))
      const catalog = (await client.listTools()).tools
      expect(catalog.some(t => t.name === 'apply_rough_cut_plan')).toBe(true)
      if (suffix) {
        const schema = catalog.find(t => t.name === 'apply_rough_cut_plan')!.inputSchema as any
        expect(schema.properties.plan.properties.brief.required).toContain('target_duration_us')
        expect(schema.properties.plan.properties.sections.items.properties.clips.items.required).toContain('source_start_us')
        fs.writeFileSync(path.join(reportDir, `${label}.catalog.json`), JSON.stringify(
          catalog.filter(t => ['apply_rough_cut_plan', 'validate_rough_cut_plan'].includes(t.name)), null, 2))
      }
      expect(catalog.some(t => t.name === 'evaluate_source_passages')).toBe(false)
      let clipId: string | undefined
      if (kind === 'caption') {
        const state = await summary(page)
        const placed = await client.callTool({ name: 'add_video_layer', arguments: {
          media_id: mediaId, track_id: state.tracks[0].id,
          src_in_us: ranges[0][0], src_out_us: ranges[0][1], t_start_us: 0,
          t_end_us: ranges[0][1] - ranges[0][0] } })
        expect(placed.isError).not.toBe(true)
        clipId = (await summary(page)).tracks.flatMap(t => t.layers).find(l => l.params.kind === 'VideoClip')!.id
      }
      await invokeCmd(page, 'project_save')
      const readProject = () => JSON.parse(fs.readFileSync(path.join(workspace, 'project.json'), 'utf8'))
      const before = readProject()
      const duration = ranges.reduce((sum, [a, b]) => sum + b - a, 0)
      const plan: RoughCutPlan = { version: 1,
        brief: { goal: 'Execute user-decided ranges', audience: 'User', target_duration_us: duration, tone: ['unchanged'] },
        source_summary: 'Existing source', editorial_thesis: 'Already decided by user',
        sections: [{ id: 'decided', purpose: 'Ordered assembly', clips: ranges.map(([a, b]) => ({
          media_id: mediaId, source_start_us: a, source_end_us: b, action: 'keep', reason: 'User-decided range' })) }],
        removed_ranges: [], estimated_duration_us: duration, uncertainties: [] }
      const expected = parseProject(structuredClone(before))
      // Offline oracle invokes the SAME deterministic production mechanics;
      // neither it nor its result is exposed to Hermes.
      if (kind === 'bulk') compileRoughCutTimeline(expected, seededGen(), plan)
      const prompt = kind === 'bulk'
        ? `The source ranges and their order are already decided. Use the imported talking-head media ${mediaId}. Place these source ranges into the timeline in this exact order as the rough cut using the existing editor tools as efficiently as appropriate: ${ranges.map(([a, b]) => `${(a / 1e6).toFixed(3)}–${(b / 1e6).toFixed(3)} seconds`).join('; ')}. Do not reconsider the story or source selection. Do not add captions, effects, reframing, vision, Jev or export. Stop after checking the placement.`
        : `For the existing short VideoClip ${clipId}, create native editable captions from its cached transcript. Then set only the first newly-created caption's font size to 48 pixels, leaving the other captions alone. This is a small mechanical task, not a caption-quality exercise. Stop after checking those changes. Do not select source material, run vision or Jev, add other edits, or export.`
      const diagnosticPrompt = offline
        ? `This is only a JSON argument-construction test. Use tool_describe to load the REAL complete schema of mcp__weftcut__apply_rough_cut_plan. Do NOT invoke an editing tool or mutate the timeline. Output ONLY a JSON object of arguments you would pass for these already-decided ranges in order, using media ID ${mediaId}: ${ranges.map(([a, b]) => `${a}–${b} microseconds`).join('; ')}. No commentary or code fences.`
        : `${process.env.SCLIP_MECHANICAL_TEST_PREFIX ?? ''}${prompt}`
      const helper = path.join(tmpDir('sclip-mechanical-launcher-'), 'launcher.cjs')
      await build({ entryPoints: [path.resolve('src/main/sclip/hermesBenchmarkLauncher.ts')], outfile: helper,
        bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
      const started = Date.now()
      const agent = await new Promise<{ code: number; output: string }>((resolve, reject) => {
        const child = spawn(createRequire(import.meta.url)('electron'), [helper], { cwd: path.resolve('../..'),
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, OPENROUTER_API_KEY: undefined,
            SCLIP_READINESS_GUARD: '1', SCLIP_READINESS_USAGE_FILE: usagePath, SCLIP_READINESS_MODEL: config.model,
            SCLIP_READINESS_PROTOCOL_FILE: process.env.SCLIP_PROTOCOL_CAPTURE === '1'
              ? path.join(reportDir, `${label}.protocol.json`) : undefined,
            SCLIP_TEST_ONLY_SKILL_VARIANT: process.env.SCLIP_TEST_ONLY_SKILL_VARIANT,
            SCLIP_TEST_ONLY_DEFERRED_GUARD: process.env.SCLIP_TEST_ONLY_DEFERRED_GUARD,
            SCLIP_TEST_ONLY_REQUIRE_DESCRIBE: process.env.SCLIP_TEST_ONLY_REQUIRE_DESCRIBE,
            PYTHONPATH: [path.resolve('e2e/electron/helpers/readiness_guard'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) } })
        let output = ''
        const receive = (chunk: Buffer) => { output += String(chunk); fs.appendFileSync(tracePath, String(chunk)) }
        child.stdout.on('data', receive); child.stderr.on('data', receive)
        const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Mechanical test timed out')) }, 1_080_000)
        child.once('error', e => { clearTimeout(timer); reject(e) })
        child.once('close', code => { clearTimeout(timer); resolve({ code: code ?? 1, output }) })
        child.stdin.end(JSON.stringify({ userDataPath: userData, python, cwd: path.resolve('../..'),
          mcpUrl: info.url, mcpToken: info.bearer_token, projectId: before.project_id,
          prompt: diagnosticPrompt, maxTurns: offline ? 4 : 16, transcriptsDir: path.join(workspace, 'Cache/transcripts'),
          toolsets: 'terminal,file,web,skills,todo,memory,clarify,weftcut' }))
      })
      await invokeCmd(page, 'project_save')
      const after = readProject()
      const evidence = JSON.parse(execFileSync(python, [path.resolve('e2e/electron/helpers/readiness_guard/evidence.py'),
        path.join(userData, 'sclip-hermes/state.db')], { encoding: 'utf8' }))
      if (offline) {
        const candidate = JSON.parse(execFileSync(python, [path.resolve('e2e/electron/helpers/readiness_guard/offline_arguments.py'),
          path.join(userData, 'sclip-hermes/state.db')], { encoding: 'utf8' }))
        const validation = validateRoughCutPlan(candidate.arguments?.plan, readProject().media_pool)
        const after = readProject()
        const report = { kind: 'offline_args', profile: { provider: config.provider, model: config.model },
          prompt: diagnosticPrompt, exit_code: agent.code, latency_ms: Date.now() - started,
          usage_receipts: fs.readFileSync(usagePath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)),
          ...evidence, candidate, validation,
          timeline_unchanged: JSON.stringify(canonical(after)) === JSON.stringify(canonical(before)), trace: tracePath }
        fs.writeFileSync(path.join(reportDir, `${label}.outcome.json`), JSON.stringify(report, null, 2))
        console.log('OFFLINE_ARGUMENT_RESULT', JSON.stringify({ valid: validation.valid,
          described: evidence.tool_calls.some((c: any) => c.name === 'tool_describe'),
          unchanged: report.timeline_unchanged, code: agent.code }))
        expect(report.timeline_unchanged).toBe(true)
        expect(validation.valid).toBe(true)
        return
      }
      fs.copyFileSync(path.join(workspace, 'project.json'), path.join(reportDir, `${label}.project.json`))
      const normal = await client.callTool({ name: 'get_timeline_context', arguments: {} })
      const verification: Record<string, unknown> = { mcp_usable: !normal.isError }
      if (kind === 'bulk') {
        verification.matches_expected_canonical = JSON.stringify(canonical(after)) === JSON.stringify(canonical(expected))
        const comp = after.compositions[after.root_id]
        verification.duration_us = comp.duration_us
        verification.ranges = comp.tracks.flatMap((t: any) => t.layers).filter((l: any) => l.params.kind === 'VideoClip')
          .sort((a: any, b: any) => a.t_start_us - b.t_start_us).map((l: any) => ({ id: l.id,
            source: [l.params.src_in_us, l.params.src_out_us], timeline: [l.t_start_us, l.t_end_us] }))
        verification.linked_av = comp.links.length === ranges.length && comp.links.every((link: any) => {
          const members = comp.tracks.flatMap((t: any) => t.layers).filter((l: any) => link.members.includes(l.id))
          return members.length === 2 && new Set(members.map((l: any) => l.params.kind)).size === 2 &&
            members[0].t_start_us === members[1].t_start_us && members[0].t_end_us === members[1].t_end_us &&
            members[0].params.src_in_us === members[1].params.src_in_us && members[0].params.src_out_us === members[1].params.src_out_us
        })
        // Post-run regression checks only; no intervention during Hermes.
        await client.callTool({ name: 'unlock_history', arguments: {} })
        await invokeCmd(page, 'project_undo')
        await invokeCmd(page, 'project_save')
        const undone = readProject()
        verification.one_undo_restores_before = JSON.stringify(canonical(undone)) === JSON.stringify(canonical(before))
        verification.after_one_undo_canonical = canonical(undone)
        await invokeCmd(page, 'project_redo')
        await invokeCmd(page, 'project_save')
        verification.redo_restores_after = JSON.stringify(canonical(readProject())) === JSON.stringify(canonical(after))
      }
      await invokeCmd(page, 'project_open', { path: workspace })
      await invokeCmd(page, 'project_save')
      verification.save_reopen_equivalent = JSON.stringify(canonical(readProject())) === JSON.stringify(canonical(after))
      const report = { recorded_at: new Date().toISOString(), kind, profile: { provider: config.provider, model: config.model },
        prompt: diagnosticPrompt, max_turns: 16, exit_code: agent.code, latency_ms: Date.now() - started,
        usage_receipts: fs.readFileSync(usagePath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)),
        ...evidence, verification, trace: tracePath, before_canonical: canonical(before), after_canonical: canonical(after),
        expected_canonical: kind === 'bulk' ? canonical(expected) : null,
        production_changes_during_session: false, contract_changed_before_session: Boolean(suffix),
        jev_enabled: false, vision_called: false, export: false }
      fs.writeFileSync(path.join(reportDir, `${label}.outcome.json`), JSON.stringify(report, null, 2))
      console.log('MECHANICAL_GATE_RESULT', JSON.stringify({ kind, profile: report.profile,
        calls: report.usage_receipts.length, code: agent.code, verification, trace: tracePath }))
      expect(report.usage_receipts.every((r: any) => r.model === config.model)).toBe(true)
      expect(agent.output).toContain('SCLIP_READINESS_COST_GUARD_ACTIVE')
      expect(verification.mcp_usable).toBe(true)
      expect(agent.code).toBe(0)
    } finally { await client?.close(); await app.close() }
  })
}
