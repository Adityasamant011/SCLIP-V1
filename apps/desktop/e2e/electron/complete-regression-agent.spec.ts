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
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'

// One opt-in exposed-media regression session; no expected edit.
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
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, SCLIP_ENABLE_EXTERNAL_BROLL: '0', SCLIP_REGRESSION_CONFIG_ONLY: configOnly ? '1' : '', PYTHONDONTWRITEBYTECODE: '1' } as NodeJS.ProcessEnv,
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

test('Complete editorial regression: one free session @serial', async () => {
  test.skip(process.env.SCLIP_COMPLETE_REGRESSION_FREE !== '1', 'One real session is opt-in')
  test.setTimeout(2_800_000)
  const resultDir=path.join(repoRoot,'.scratch/complete-editorial-regression/live-session')
  expect(fs.existsSync(resultDir),'Never overwrite or repeat the holdout').toBe(false)
  const source='/Users/adityasamant/Downloads/Raw Talking head tutorial video for editing practice.mp4'
  const sourceHash=await sha256(source)
  const prompt='Edit this footage into a coherent, engaging video for its intended audience. Select the strongest material, preserve important context and natural delivery, remove unnecessary repetition, use appropriate visual and audio treatments where justified, and review the actual result before finishing. Keep the project editable.'
  const preflight=JSON.parse(fs.readFileSync(path.join(repoRoot,'.scratch/complete-editorial-regression/preflight.json'),'utf8'))
  expect(Date.now()-Date.parse(preflight.checked_at)).toBeLessThan(900000)
  const model='nvidia/nemotron-3.5-lightning:free'
  const catalogModel=preflight.models.find((m:any)=>m.id===model)
  expect(catalogModel.supported_parameters).toContain('tools')
  expect(Number(catalogModel.pricing.prompt)).toBe(0);expect(Number(catalogModel.pricing.completion)).toBe(0)
  expect(preflight.endpoints[model]).toHaveLength(1)
  for(const e of preflight.endpoints[model]){expect(e.tag).toBe('nvidia/nvfp4');expect(e.status).toBe(0);expect(Number(e.pricing.prompt)).toBe(0);expect(Number(e.pricing.completion)).toBe(0);expect(e.supported_parameters).toContain('tools')}
  fs.mkdirSync(resultDir,{recursive:true});json(path.join(resultDir,'preflight.json'),preflight)
  fs.writeFileSync(path.join(resultDir,'prompt.txt'),prompt+'\n')
  const workspace=path.join(resultDir,'workspace'),projectDir=path.join(workspace,'edit');fs.mkdirSync(workspace)
  const userData=tmpDir('sclip-phase4b-free-smoke-');fs.mkdirSync(path.join(userData,'sclip-hermes'),{recursive:true,mode:0o700})
  for(const file of ['cloud_keys.json','model_settings.json','speech_config.json']){const original=path.join(profileRoot,file);if(fs.existsSync(original))fs.copyFileSync(original,path.join(userData,file))}
  fs.chmodSync(path.join(userData,'cloud_keys.json'),0o600)
  const config:any={model:{provider:'openrouter',default:model,base_url:'https://openrouter.ai/api/v1',max_tokens:4096},fallback_model:[],fallback_providers:[],provider_routing:{only:['nvidia/nvfp4'],order:['nvidia/nvfp4'],require_parameters:true},memory:{memory_enabled:false},compression:{enabled:false},agent:{max_turns:16,api_max_retries:1},display:{show_reasoning:false},terminal:{cwd:repoRoot},auxiliary:{free_only:true,title_generation:{enabled:false},background_review:{enabled:false}}}
  fs.writeFileSync(path.join(userData,'sclip-hermes/config.yaml'),stringifyYaml(config))
  const adapter=path.join(userData,'hermes-adapter')
  fs.writeFileSync(adapter,'#!/bin/sh\nexec '+JSON.stringify(python)+' '+JSON.stringify(path.join(repoRoot,'apps/desktop/e2e/editorial-regression/free-hermes.py'))+' "$@"\n',{mode:0o700})
  const helperPath=path.join(tmpDir('sclip-product-launcher-'),'launcher.cjs')
  await build({entryPoints:[path.join(repoRoot,'apps/desktop/src/main/sclip/hermesBenchmarkLauncher.ts')],outfile:helperPath,bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'})
  const {app,page}=await launchApp({userDataDir:userData,realKeychain:true,env:{SCLIP_USER_DATA_DIR:userData,SCLIP_ENABLE_EXTERNAL_BROLL:'0',SCLIP_JEV_ENABLED:'0',OPENROUTER_API_KEY:'',
    SCLIP_REVIEW_EVIDENCE_DIR:path.join(resultDir,'review-decisions'),SCLIP_EVIDENCE_AUDIT_DIR:path.join(resultDir,'sampled-frames'),SCLIP_MCP_AUDIT_DIR:path.join(resultDir,'mutation-evidence')}})
  let sessionResult:unknown=null
  try{
    const profile=await invokeCmd<{provider:string;model:string}>(page,'sclip_get_hermes_config')
    expect(profile.provider).toBe('openrouter');expect(profile.model).toBe('nvidia/nemotron-3.5-lightning:free')
    // Neutral source-sized canvas; Hermes alone selects the story and edit.
    await newProject(page,{parentFolder:workspace,name:'edit',canvas:{width:1920,height:1080,fpsNum:30,fpsDen:1}})
    const mediaId=await invokeCmd<string>(page,'import_media',{path:source})
    await waitForHook(page,'waitMediaExportReady')
    await page.evaluate(id=>(window as any).__weftcutTest.waitMediaExportReady({mediaId:id,timeoutMs:180000}),mediaId)
    await invokeCmd(page,'project_save');fs.copyFileSync(path.join(projectDir,'project.json'),path.join(resultDir,'initial-project.json'))
    const current=await summary(page) as {project_id:string}
    const mcp=await page.evaluate(()=>(window as any).api.mcp.getInfo()) as {url:string;bearer_token:string}
    json(path.join(resultDir,'configuration.json'),{model:profile.model,provider:profile.provider,source,source_sha256:sourceHash,prompt,max_turns:16,session_count:1,retries:0,external_broll:false,jev_enabled:false,architecture:'0d32aba3',project:'NEW',media:'REGRESSION',prior_editorial_exposure:true,generalization_claim:'NONE',initial_state:'imported media, empty timeline',user_data_path:userData})
    // Startup regenerates the product profile. Apply isolated cost controls after startup,
    // preserving the normal generated prompt, MCP settings and capability guidance.
    const configPath=path.join(userData,'sclip-hermes/config.yaml')
    const generated=parseYaml(fs.readFileSync(configPath,'utf8')) as any
    const effective={...generated,...config,agent:{...generated.agent,...config.agent}}
    fs.writeFileSync(configPath,stringifyYaml(effective),{mode:0o600})
    const request={userDataPath:userData,python:adapter,cwd:repoRoot,mcpUrl:mcp.url,mcpToken:mcp.bearer_token,projectId:current.project_id,transcriptsDir:path.join(projectDir,'Cache/transcripts'),mode:'edit',prompt,maxTurns:16,initialEvidencePath:path.join(resultDir,'initial-editorial-evidence.json')}
    const configCheck=await runHermes(helperPath,request,path.join(resultDir,'configuration-check.txt'),true)
    expect(configCheck.code).toBe(0)
    expect(fs.readFileSync(path.join(resultDir,'configuration-check.txt'),'utf8')).toContain('REGRESSION_CONFIG_ONLY_OK')
    sessionResult=await runHermes(helperPath,{userDataPath:userData,python:adapter,cwd:repoRoot,mcpUrl:mcp.url,mcpToken:mcp.bearer_token,projectId:current.project_id,transcriptsDir:path.join(projectDir,'Cache/transcripts'),mode:'edit',prompt,maxTurns:16,initialEvidencePath:path.join(resultDir,'initial-editorial-evidence.json')},path.join(resultDir,'hermes-trace.txt'))
    json(path.join(resultDir,'session-result.json'),sessionResult)
    const db=path.join(userData,'sclip-hermes/state.db')
    if(fs.existsSync(db)){
      const safeExport=`import sqlite3,json,sys; c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); sid=c.execute('select id from sessions order by started_at desc limit 1').fetchone(); rows=c.execute('select role,content,tool_calls,tool_name from messages where session_id=? order by timestamp,id',(sid[0],)).fetchall() if sid else []; print(json.dumps({'session_id':sid[0] if sid else None,'messages':[dict(zip(['role','content','tool_calls','tool_name'],r)) for r in rows]}))`
      const {execFileSync}=await import('node:child_process')
      const safe=String(execFileSync(python,['-c',safeExport,db])).replaceAll(mcp.bearer_token,'[REDACTED]').replace(/sk-or-v1-[A-Za-z0-9_-]+/g,'[REDACTED]')
      fs.writeFileSync(path.join(resultDir,'observable-session.json'),safe)
    }
    await invokeCmd(page,'project_save');fs.copyFileSync(path.join(projectDir,'project.json'),path.join(resultDir,'final-project.json'))
    const project=JSON.parse(fs.readFileSync(path.join(resultDir,'final-project.json'),'utf8'))
    const events=(await invokeCmd<any[]>(page,'log_list')).filter(row=>row.category?.kind==='Mcp')
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
