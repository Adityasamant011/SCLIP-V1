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

// One opt-in real-media holdout; no expected edit.
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

test('Phase 4B one free Apple media follow-up @serial', async () => {
  test.skip(process.env.SCLIP_PHASE4B_APPLE_FREE !== '1', 'One real holdout is opt-in')
  test.setTimeout(2_800_000)
  const resultDir=path.join(repoRoot,'apps/desktop/e2e/bench-results/phase4b-editorial-execution/apple-fold-dots-followup')
  expect(fs.existsSync(resultDir),'Never overwrite or repeat the holdout').toBe(false)
  const source='/Users/adityasamant/Downloads/Introducing the new iPhone Duo.mp4'
  const sourceHash='b394fb2ba01371d26400698cb71b0b77dff03f00d4adf29b4f0712d2d790d52d'
  expect(await sha256(source)).toBe(sourceHash)
  const prompt='Make a concise, engaging product demo from this footage that helps viewers understand the phone.'
  const preflight=JSON.parse(fs.readFileSync('/tmp/phase4b-apple-preflight.json','utf8'))
  expect(preflight.exists&&preflight.authenticated_catalog_access&&preflight.tools_supported).toBe(true)
  expect(preflight.model).toBe('dots-studio/dots-3-note-preview:free'); expect(Number(preflight.pricing.prompt)).toBe(0); expect(Number(preflight.pricing.completion)).toBe(0); expect(preflight.endpoints.length).toBeGreaterThan(0); for(const endpoint of preflight.endpoints){expect(Number(endpoint.pricing.prompt)).toBe(0);expect(Number(endpoint.pricing.completion)).toBe(0);expect(endpoint.supported_parameters).toContain('tools')}
  fs.mkdirSync(resultDir,{recursive:true});json(path.join(resultDir,'preflight.json'),preflight)
  fs.writeFileSync(path.join(resultDir,'prompt.txt'),prompt+'\n')
  const workspace=path.join(resultDir,'workspace'),projectDir=path.join(workspace,'edit');fs.mkdirSync(workspace)
  const userData=tmpDir('sclip-phase4b-free-smoke-');fs.mkdirSync(path.join(userData,'sclip-hermes'),{recursive:true,mode:0o700})
  for(const file of ['cloud_keys.json','model_settings.json','speech_config.json']){const original=path.join(profileRoot,file);if(fs.existsSync(original))fs.copyFileSync(original,path.join(userData,file))}
  fs.chmodSync(path.join(userData,'cloud_keys.json'),0o600)
  const config=parseYaml(fs.readFileSync(path.join(profileRoot,'sclip-hermes/config.yaml'),'utf8'))
  config.model={...config.model,default:'dots-studio/dots-3-note-preview:free'};config.fallback_model=[]; config.auxiliary={free_only:true,openrouter_model:'dots-studio/dots-3-note-preview:free'}; for(const task of ['compression','session_search','web_extract','vision','browser_vision','background_review']){config.auxiliary[task]={provider:'openrouter',model:'dots-studio/dots-3-note-preview:free',fallback_chain:[]}}; config.display={...config.display,show_reasoning:false}
  fs.writeFileSync(path.join(userData,'sclip-hermes/config.yaml'),stringifyYaml(config))
  const helperPath=path.join(tmpDir('sclip-product-launcher-'),'launcher.cjs')
  await build({entryPoints:[path.join(repoRoot,'apps/desktop/src/main/sclip/hermesBenchmarkLauncher.ts')],outfile:helperPath,bundle:true,platform:'node',format:'cjs',external:['electron'],logLevel:'silent'})
  const {app,page}=await launchApp({userDataDir:userData,realKeychain:true,env:{SCLIP_USER_DATA_DIR:userData,SCLIP_ENABLE_EXTERNAL_BROLL:'0',SCLIP_JEV_ENABLED:'0',OPENROUTER_API_KEY:'',
    SCLIP_REVIEW_EVIDENCE_DIR:path.join(resultDir,'review-decisions'),SCLIP_EVIDENCE_AUDIT_DIR:path.join(resultDir,'sampled-frames'),SCLIP_MCP_AUDIT_DIR:path.join(resultDir,'mutation-evidence')}})
  let sessionResult:unknown=null
  try{
    const profile=await invokeCmd<{provider:string;model:string}>(page,'sclip_get_hermes_config')
    expect(profile.provider).toBe('openrouter');expect(profile.model).toBe('dots-studio/dots-3-note-preview:free')
    // Neutral source-sized canvas; Hermes alone selects the story and edit.
    await newProject(page,{parentFolder:workspace,name:'edit',canvas:{width:1280,height:720,fpsNum:30,fpsDen:1}})
    const mediaId=await invokeCmd<string>(page,'import_media',{path:source})
    await waitForHook(page,'waitMediaExportReady')
    await page.evaluate(id=>(window as any).__weftcutTest.waitMediaExportReady({mediaId:id,timeoutMs:180000}),mediaId)
    await invokeCmd(page,'project_save');fs.copyFileSync(path.join(projectDir,'project.json'),path.join(resultDir,'initial-project.json'))
    const current=await summary(page) as {project_id:string}
    const mcp=await page.evaluate(()=>(window as any).api.mcp.getInfo()) as {url:string;bearer_token:string}
    json(path.join(resultDir,'configuration.json'),{model:profile.model,provider:profile.provider,source,source_sha256:sourceHash,prompt,max_turns:24,session_count:1,retries:0,external_broll:false,jev_enabled:false,architecture:'c77147a1',project:'NEW',media:'USER PROVIDED',prior_editorial_exposure:false,generalization_claim:'NONE',initial_state:'imported media, empty timeline',user_data_path:userData})
    sessionResult=await runHermes(helperPath,{userDataPath:userData,python,cwd:repoRoot,mcpUrl:mcp.url,mcpToken:mcp.bearer_token,projectId:current.project_id,transcriptsDir:path.join(projectDir,'Cache/transcripts'),mode:'edit',prompt,maxTurns:24,initialEvidencePath:path.join(resultDir,'initial-editorial-evidence.json')},path.join(resultDir,'hermes-trace.txt'))
    json(path.join(resultDir,'session-result.json'),sessionResult)
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
