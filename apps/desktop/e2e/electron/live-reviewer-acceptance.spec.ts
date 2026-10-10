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

// One explicitly authorized session. No retry, second session or operator edits after launch.
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

async function runHermes(helperPath: string, request: Record<string, unknown>, tracePath: string, configOnly = false): Promise<{ code: number; elapsedMs: number; messages: number; toolCallsReported: number; providerFailed: boolean; timedOut: boolean }> {
  const started = Date.now()
  const trace = fs.createWriteStream(tracePath, { flags: 'wx' })
  const child = spawn(electronBinary, [helperPath], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, SCLIP_ENABLE_EXTERNAL_BROLL: '0', SCLIP_4B3_CONFIG_ONLY: configOnly ? '1' : '', SCLIP_PHASE4B3_PAID_OPT_IN: '1', SCLIP_JEV_ENABLED:'0', SCLIP_BACKGROUND_JEV_AUTHORIZED:'0', SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0', PYTHONDONTWRITEBYTECODE: '1' } as NodeJS.ProcessEnv,
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

test('Phase 4B.3: one native-streaming Luna High session @serial', async () => {
  test.skip(process.env.SCLIP_PHASE4B3_PAID_OPT_IN !== '1', 'One real session is opt-in')
  test.setTimeout(2_800_000)
  const resultDir=path.resolve(process.env.SCLIP_LIVE_ACCEPTANCE_DIR ?? path.join(repoRoot,'.scratch/live-reviewer-4b3/normal-stream-session'))
  expect(fs.existsSync(resultDir),'Never overwrite or repeat the holdout').toBe(false)
  const source='/Users/adityasamant/Downloads/Raw Talking head tutorial video for editing practice.mp4'
  const sourceHash=await sha256(source)
  expect(sourceHash).toBe('43586606dedfcd16c4208860c8336d78e9f9c1de78b3d037170481a280fef857')
  const prompt='Please finish this draft as a clean, coherent video for its intended audience. Improve the editing where appropriate, preserve the speaker\'s meaning and natural delivery, and make sure the result looks and sounds good. Keep the project editable.'
  const preflight=JSON.parse(fs.readFileSync(path.join(repoRoot,'.scratch/live-reviewer-4b3/normal-preflight.json'),'utf8'))
  const model='openai/gpt-6-luna'
  expect(preflight.key.remaining).toBeGreaterThanOrEqual(0.20);expect(preflight.key.limit_reset).toBe(null)
  expect(preflight.models[0].id).toBe(model);expect(preflight.models[0].supported_parameters).toContain('tools')
  fs.mkdirSync(resultDir,{recursive:true});json(path.join(resultDir,'preflight.json'),preflight)
  fs.writeFileSync(path.join(resultDir,'prompt.txt'),prompt+'\n')
  const workspace=path.join(resultDir,'workspace'),projectDir=path.join(workspace,'edit');fs.mkdirSync(workspace)
  const userData=tmpDir('sclip-phase4b3-normal-');fs.mkdirSync(path.join(userData,'sclip-hermes'),{recursive:true,mode:0o700})
  for(const file of ['model_settings.json','speech_config.json']){const original=path.join(profileRoot,file);if(fs.existsSync(original))fs.copyFileSync(original,path.join(userData,file))}
  // The desktop/local tools have no cloud credentials. The normal Hermes
  // launcher receives the selected encrypted entry in its disposable profile.
  json(path.join(userData,'cloud_keys.json'),{})
  const launcherProfile=tmpDir('sclip-normal-launcher-');fs.mkdirSync(path.join(launcherProfile,'sclip-hermes'))
  const encrypted=JSON.parse(fs.readFileSync(path.join(profileRoot,'cloud_keys.json'),'utf8'))
  expect(encrypted.sclip_openrouter).toBeTruthy();json(path.join(launcherProfile,'cloud_keys.json'),{sclip_openrouter:encrypted.sclip_openrouter})
  fs.chmodSync(path.join(launcherProfile,'cloud_keys.json'),0o600)
  const config:any={model:{provider:'openrouter',default:model,base_url:'https://openrouter.ai/api/v1',max_tokens:4096},fallback_model:[],fallback_providers:[],provider_routing:{only:['openai'],order:['openai'],ignore:['openai/flex','openai/fast'],require_parameters:true,allow_fallbacks:false},memory:{memory_enabled:false},compression:{enabled:false},agent:{max_turns:16,api_max_retries:1,reasoning_effort:'high'},display:{show_reasoning:false},terminal:{cwd:repoRoot},auxiliary:{free_only:true,title_generation:{enabled:false},background_review:{enabled:false}}}
  fs.writeFileSync(path.join(userData,'sclip-hermes/config.yaml'),stringifyYaml(config))
  const adapter=path.join(userData,'hermes-adapter')
  fs.writeFileSync(adapter,'#!/bin/sh\nexec '+JSON.stringify(python)+' '+JSON.stringify(path.join(repoRoot,'apps/desktop/e2e/live-reviewer-acceptance/normal_hermes.py'))+' "$@"\n',{mode:0o700})
  const helperPath=path.join(tmpDir('sclip-product-launcher-'),'launcher.cjs')
  await build({entryPoints:[path.join(repoRoot,'apps/desktop/src/main/sclip/hermesBenchmarkLauncher.ts')],outfile:helperPath,bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'})
  const {app,page}=await launchApp({userDataDir:userData,realKeychain:true,env:{SCLIP_USER_DATA_DIR:userData,SCLIP_ENABLE_EXTERNAL_BROLL:'0',SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',OPENROUTER_API_KEY:'',OPENAI_API_KEY:'',
    SCLIP_REVIEW_EVIDENCE_DIR:path.join(resultDir,'review-decisions'),SCLIP_EVIDENCE_AUDIT_DIR:path.join(resultDir,'sampled-frames'),SCLIP_MCP_AUDIT_DIR:path.join(resultDir,'mutation-evidence')}})
  let sessionResult:unknown=null
  try{
    const profile=await invokeCmd<{provider:string;model:string}>(page,'sclip_get_hermes_config')
    expect(profile.provider).toBe('openrouter');expect(profile.model).toBe('openai/gpt-6-luna')
    // Copy the preserved fixture exactly; no new creative assembly by the operator.
    const baseline=path.join(repoRoot,'.scratch/live-reviewer-4b3/live-session')
    fs.cpSync(path.join(baseline,'workspace/edit'),projectDir,{recursive:true})
    fs.copyFileSync(path.join(baseline,'initial-project.json'),path.join(projectDir,'project.json'))
    const copied=JSON.parse(fs.readFileSync(path.join(projectDir,'project.json'),'utf8'))
    const oldRoot=path.join(baseline,'workspace/edit')
    for(const media of Object.values(copied.media_pool) as any[]){
      for(const key of ['path_abs','waveform_path','conform_path','thumbnails_dir']){
        if(typeof media[key]==='string'&&media[key].startsWith(oldRoot+path.sep))media[key]=projectDir+media[key].slice(oldRoot.length)
      }
    }
    json(path.join(projectDir,'project.json'),copied)
    await invokeCmd(page,'project_open',{path:projectDir})
    await waitForHook(page,'motifReopenProject')
    await page.evaluate(p=>(window as any).__weftcutTest.motifReopenProject({path:p}),projectDir)
    await waitForHook(page,'waitMediaExportReady')
    for(const mediaId of Object.keys(copied.media_pool)){
      await page.evaluate(id=>(window as any).__weftcutTest.waitMediaExportReady({mediaId:id,timeoutMs:180000}),mediaId)
    }
    const current=await summary(page) as any
    const mcp=await page.evaluate(()=>(window as any).api.mcp.getInfo()) as {url:string;bearer_token:string}
    await invokeCmd(page,'project_save');fs.copyFileSync(path.join(projectDir,'project.json'),path.join(resultDir,'initial-project.json'))
    fs.copyFileSync(path.join(baseline,'initial-draft.mp4'),path.join(resultDir,'initial-draft.mp4'))
    const baselineEvents=await invokeCmd<any[]>(page,'log_list');json(path.join(resultDir,'fixture-log.json'),baselineEvents)
    json(path.join(resultDir,'configuration.json'),{model:profile.model,provider:profile.provider,source,source_sha256:sourceHash,prompt,max_turns:16,session_count:1,retries:0,external_broll:false,jev_enabled:false,architecture:'3b7c2d59',reasoning:'high',authorized_new_spend:0.30,request_level_guard:false,primary_transport:'native streaming',provider_key_cap:preflight.key.limit,project:'NEW',media:'REGRESSION',prior_editorial_exposure:true,generalization_claim:'NONE',initial_state:'89.9s paired A/V draft, source 0–89.9s, undersized transform; fixture only',user_data_path:userData})
    // Startup regenerates the product profile. Apply isolated session configuration after startup,
    // preserving the normal generated prompt, MCP settings and capability guidance.
    const configPath=path.join(userData,'sclip-hermes/config.yaml')
    const generated=parseYaml(fs.readFileSync(configPath,'utf8')) as any
    const effective={...generated,...config,agent:{...generated.agent,...config.agent}}
    fs.writeFileSync(configPath,stringifyYaml(effective),{mode:0o600})
    fs.writeFileSync(path.join(launcherProfile,'sclip-hermes/config.yaml'),stringifyYaml(effective),{mode:0o600})
    const request={userDataPath:launcherProfile,python:adapter,cwd:repoRoot,mcpUrl:mcp.url,mcpToken:mcp.bearer_token,projectId:current.project_id,transcriptsDir:path.join(projectDir,'Cache/transcripts'),mode:'edit',prompt,maxTurns:16,initialEvidencePath:path.join(resultDir,'initial-editorial-evidence.json')}
    const configCheck=await runHermes(helperPath,request,path.join(resultDir,'configuration-check.txt'),true)
    expect(configCheck.code).toBe(0)
    expect(fs.readFileSync(path.join(resultDir,'configuration-check.txt'),'utf8')).toContain('PHASE4B3_CONFIG_ONLY_OK')
    sessionResult=await runHermes(helperPath,{userDataPath:launcherProfile,python:adapter,cwd:repoRoot,mcpUrl:mcp.url,mcpToken:mcp.bearer_token,projectId:current.project_id,transcriptsDir:path.join(projectDir,'Cache/transcripts'),mode:'edit',prompt,maxTurns:16,initialEvidencePath:path.join(resultDir,'initial-editorial-evidence.json')},path.join(resultDir,'hermes-trace.txt'))
    json(path.join(resultDir,'session-result.json'),sessionResult)
    const db=path.join(launcherProfile,'sclip-hermes/state.db')
    if(fs.existsSync(db)){
      const safeExport=`import sqlite3,json,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); c.row_factory=sqlite3.Row; sid=c.execute('select id from sessions order by started_at desc limit 1').fetchone(); rows=c.execute('select role,content,tool_calls,tool_name from messages where session_id=? order by timestamp,id',(sid[0],)).fetchall() if sid else []; allowed=['id','model','input_tokens','output_tokens','reasoning_tokens','api_call_count','actual_cost_usd','estimated_cost_usd','cost_status','cost_source']; columns={r[1] for r in c.execute('pragma table_info(sessions)')}; usage=dict(c.execute('select '+','.join(k for k in allowed if k in columns)+' from sessions where id=?',(sid[0],)).fetchone()) if sid else {}; print(json.dumps({'session_id':sid[0] if sid else None,'usage':usage,'messages':[dict(r) for r in rows]}))`
      const {execFileSync}=await import('node:child_process')
      const safe=String(execFileSync(python,['-c',safeExport,db])).replaceAll(mcp.bearer_token,'[REDACTED]').replace(/sk-or-v1-[A-Za-z0-9_-]+/g,'[REDACTED]')
      fs.writeFileSync(path.join(resultDir,'observable-session.json'),safe)
    }
    await invokeCmd(page,'project_save');fs.copyFileSync(path.join(projectDir,'project.json'),path.join(resultDir,'final-project.json'))
    const project=JSON.parse(fs.readFileSync(path.join(resultDir,'final-project.json'),'utf8'))
    const allEvents=await invokeCmd<any[]>(page,'log_list');const fixtureEventIds=new Set(baselineEvents.map(row=>row.id));const events=allEvents.filter(row=>row.category?.kind==='Mcp'&&!fixtureEventIds.has(row.id))
    json(path.join(resultDir,'mcp-events.json'),events)
    json(path.join(resultDir,'review-lifecycle-events.json'),events.filter(row=>row.message==='Review lifecycle'))
    json(path.join(resultDir,'coordinate-validation-events.json'),events.filter(row=>row.message==='Evidence coordinate validation'))
    json(path.join(resultDir,'history.json'),await invokeCmd(page,'project_history_view'))
    const metrics=timelineMetrics(project);json(path.join(resultDir,'metrics.json'),metrics)
    const duration=Number(metrics.duration_us)
    if(duration>0&&duration<=600000000){const outputPath=path.join(resultDir,'edit.mp4')
      await page.evaluate(request=>(window as any).__sclipExportRange(request),{projectId:current.project_id,outputPath,startUs:0,endUs:duration})
      json(path.join(resultDir,'render.json'),{status:'EXPORTED',outputPath,bytes:fs.statSync(outputPath).size})
    }else json(path.join(resultDir,'render.json'),{status:'SKIPPED',reason:'empty or exceeds practical ten-minute render ceiling',duration_us:duration})
  }finally{if(sessionResult)json(path.join(resultDir,'session-result.json'),sessionResult);await app.close()}
})
