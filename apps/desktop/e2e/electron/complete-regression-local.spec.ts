import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'

// Deterministic authored input; no editorial agent or provider inference.
test('recent tools operate through the built app and real MCP transport @serial', async () => {
  test.setTimeout(360_000)
  const out = path.resolve('../../.scratch/complete-editorial-regression/local-tool-health')
  fs.mkdirSync(out, { recursive: true })
  const userData = tmpDir('sclip-tool-health-')
  if (process.env.SCLIP_TEST_SPEECH_CONFIG) {
    const speech = JSON.parse(fs.readFileSync(process.env.SCLIP_TEST_SPEECH_CONFIG, 'utf8'))
    fs.writeFileSync(path.join(userData, 'speech_config.json'), JSON.stringify({ preferred_engine: 'whisper_cpp', local: { whisper_cpp: speech.local.whisper_cpp } }))
  }
  const { app, page } = await launchApp({ userDataDir: userData, env: {
    SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '0', SCLIP_ENABLE_EXTERNAL_BROLL: '0',
    OPENROUTER_API_KEY: '', OPENAI_API_KEY: '',
  } })
  let client: Client | undefined
  const outcomes: Record<string, unknown> = {}
  try {
    await newProject(page, { parentFolder: tmpDir('sclip-tool-health-project-'), name: 'synthetic-tool-health',
      canvas: { width: 640, height: 360, fpsNum: 30, fpsDen: 1 } })
    const mediaId = await invokeCmd<string>(page, 'import_media', {
      path: path.resolve('e2e/fixtures/media/test_1080p_30fps_audio.mp4'),
    })
    await waitForHook(page, 'waitMediaExportReady')
    await page.evaluate(id => (window as any).__weftcutTest.waitMediaExportReady({ mediaId: id, timeoutMs: 120_000 }), mediaId)
    const state = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'tool-health-audit', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))
    const catalog = (await client.listTools()).tools
    fs.writeFileSync(path.join(out, 'live-catalog.json'), JSON.stringify(catalog, null, 2))
    expect(new Set(catalog.map(t => t.name)).size).toBe(catalog.length)
    for (const name of ['ripple_cut_range', 'apply_repair_transaction', 'inspect_rendered_audio', 'inspect_timeline_temporal_window', 'get_editorial_evidence_packet', 'revision_control']) {
      expect(catalog.some(t => t.name === name), name).toBe(true)
    }
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client!.callTool({ name, arguments: args }, undefined, { timeout: 150_000 })
      expect(result.isError, `${name}: ${JSON.stringify(result.content)}`).not.toBe(true)
      const text = result.content.find(c => c.type === 'text')
      return text?.type === 'text' ? JSON.parse(text.text) : null
    }
    const added = await call('add_video_layer', { media_id: mediaId, track_id: state.tracks[0].id,
      src_in_us: 0, src_out_us: 6_000_000, t_start_us: 0, t_end_us: 6_000_000 })
    const videoId = added.video_layer_id
    expect(videoId).toBeTruthy()
    let packet = await call('get_editorial_evidence_packet')
    const originalVersion = packet.identity.state_version
    const receipt = await call('ripple_cut_range', { layer_ids: [videoId], start_us: 2_000_000,
      end_us: 3_000_000, expected_state_version: originalVersion })
    outcomes.ripple_cut_range = receipt
    const cut = await summary(page)
    expect(Math.max(...cut.tracks.flatMap(t => t.layers).map(l => l.t_end_us))).toBe(5_000_000)
    packet = await call('get_editorial_evidence_packet')
    const clip = cut.tracks.flatMap(t => t.layers).find(l => l.params.kind === 'VideoClip')!
    const transaction = await call('apply_repair_transaction', { reason: 'Synthetic explicit parameter writes',
      expected_state_version: packet.identity.state_version,
      operations: [{ kind: 'update_layer_params', layer_id: clip.id, patch: { kind: 'VideoClip', opacity: 0.8 } }] })
    outcomes.apply_repair_transaction = transaction
    const stale = await client.callTool({ name: 'ripple_cut_range', arguments: { layer_ids: [clip.id],
      start_us: 0, end_us: 1_000_000, expected_state_version: originalVersion } })
    expect(stale.isError).toBe(true)
    const invalid = await client.callTool({ name: 'inspect_rendered_audio', arguments: { start_us: 0, end_us: 200_000_000 } })
    expect(invalid.isError).toBe(true)
    const audio = await call('inspect_rendered_audio', { start_us: 0, end_us: 2_000_000 })
    outcomes.inspect_rendered_audio = audio
    expect(audio.coordinate_space).toBe('timeline')
    expect(audio.evidence_origin).toBe('CURRENT_TIMELINE')
    expect(audio.has_audio).toBe(true)
    expect(audio.signal.rms).toBeGreaterThan(0)
    const temporal = await call('inspect_timeline_temporal_window', { start_us: 0, end_us: 2_000_000,
      representative_samples: 2, question: 'Describe the visible shapes and text in each frame.' })
    outcomes.inspect_timeline_temporal_window = temporal
    expect(temporal.representative_samples.length).toBe(2)
    expect(temporal.coordinate_space).toBe('timeline')
    expect(await call('revision_control', { action: 'status' })).toBeTruthy()
    outcomes.result = 'PASS'
  } finally {
    fs.writeFileSync(path.join(out, 'outcomes.json'), JSON.stringify(outcomes, null, 2))
    await client?.close().catch(() => {})
    await app.close()
  }
})

test('synthetic import, plan, render, grounded repair, verification and reopen @serial', async () => {
  test.setTimeout(180_000)
  const out=path.resolve('../../.scratch/complete-editorial-regression/workflow')
  fs.mkdirSync(out,{recursive:true})
  const parent=tmpDir('sclip-regression-workflow-')
  const {app,page}=await launchApp({env:{SCLIP_JEV_ENABLED:'0',SCLIP_ENABLE_EXTERNAL_BROLL:'0',OPENROUTER_API_KEY:'',OPENAI_API_KEY:''}})
  let client:Client|undefined
  const receipts:any[]=[]
  try {
    await newProject(page,{parentFolder:parent,name:'synthetic',canvas:{width:640,height:360,fpsNum:30,fpsDen:1}})
    const media=await invokeCmd<string>(page,'import_media',{path:path.resolve('e2e/fixtures/media/test_1080p_30fps_audio.mp4')})
    await waitForHook(page,'waitMediaExportReady')
    await page.evaluate(id=>(window as any).__weftcutTest.waitMediaExportReady({mediaId:id,timeoutMs:120000}),media)
    const info=await page.evaluate(()=>(window as any).api.mcp.getInfo())
    client=new Client({name:'offline-workflow',version:'1'},{});
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url),{requestInit:{headers:{Authorization:`Bearer ${info.bearer_token}`}}}))
    const call=async(name:string,args:any={})=>{
      const r=await client!.callTool({name,arguments:args},undefined,{timeout:120000});expect(r.isError,JSON.stringify(r.content)).not.toBe(true)
      const raw=r.content.find(c=>c.type==='text');const text=raw?.type==='text'?raw.text:'';let data:any;try{data=JSON.parse(text)}catch{data=text}
      for(const c of r.content.slice(1)){if(c.type==='text'){try{const extra=JSON.parse(c.text);if(extra.evidence_receipt&&typeof data==='object')data.evidence_receipt=extra.evidence_receipt}catch{}}}
      receipts.push({name,args,result:data});return data
    }
    await call('get_source_understanding',{media_id:media,detail:'cached'})
    const plan={version:1,brief:{goal:'Synthetic codec fixture',audience:'Test harness',target_duration_us:3000000,tone:['neutral']},source_summary:'Generated moving chart and tone',editorial_thesis:'Exercise explicit authored ranges',sections:[{id:'test',purpose:'Codec fixture',clips:[{media_id:media,source_start_us:0,source_end_us:3000000,action:'keep',reason:'Synthetic authored range'}]}],removed_ranges:[],uncertainties:[]}
    expect((await call('validate_rough_cut_plan',{plan})).valid).toBe(true)
    await call('apply_rough_cut_plan',{plan})
    const textId=await call('add_text_layer',{content:'WRONG',t_start_us:0,duration_us:3000000,font_size_px:30})
    await call('render_timeline_range',{start_us:0,end_us:3000000})
    // Explicit review lifecycle. This fixture authors the diagnosis; it is not model quality evidence.
    await call('revision_control',{action:'begin'})
    const packet=await call('get_editorial_evidence_packet')
    const issue=await call('record_issue',{description:'Synthetic brief requires CORRECT; current saved caption is WRONG',severity:'moderate',repairable:true,evidence_dimensions:['text'],evidence_receipt_ids:[packet.evidence_receipt.id],layer_ids:[textId]})
    expect(issue.accepted).toBe(true)
    await call('revision_control',{action:'select_issue',issue_id:issue.issue.id})
    await call('checkpoint',{label:'Synthetic caption repair'})
    await call('apply_repair_transaction',{reason:'Explicit fixture caption correction',expected_state_version:packet.identity.state_version,operations:[{kind:'update_layer_params',layer_id:textId,patch:{kind:'Text',content:'CORRECT'}}]})
    const early=await client.callTool({name:'revision_control',arguments:{action:'finish_issue',status:'resolved'}})
    expect(early.isError).toBe(true)
    await call('get_editorial_evidence_packet')
    await call('revision_control',{action:'finish_issue',status:'resolved'})
    await call('revision_control',{action:'complete'})
    await invokeCmd(page,'project_save')
    const saved=JSON.parse(fs.readFileSync(path.join(parent,'synthetic/project.json'),'utf8'))
    fs.writeFileSync(path.join(out,'project.json'),JSON.stringify(saved,null,2))
    const before=await summary(page)
    const output=path.join(out,'edit.mp4')
    await page.evaluate(r=>(window as any).__sclipExportRange(r),{projectId:before.project_id,outputPath:output,startUs:0,endUs:3000000})
    const diagnostic=await page.evaluate(()=>({state:(window as any).__weftcutExportState}))
    fs.writeFileSync(path.join(out,'export-diagnostic.json'),JSON.stringify(diagnostic,null,2))
    fs.writeFileSync(path.join(out,'logs.json'),JSON.stringify(await invokeCmd(page,'log_list'),null,2))
    expect(fs.existsSync(output),JSON.stringify(diagnostic)).toBe(true)
    expect(fs.statSync(output).size).toBeGreaterThan(1000)
    await client.close();client=undefined
    await invokeCmd(page,'project_open',{path:path.join(parent,'synthetic')})
    const after=await summary(page)
    expect(after.tracks.flatMap(t=>t.layers).find(l=>l.id===textId)?.params).toMatchObject({kind:'Text',content:'CORRECT'})
    expect(after.tracks.flatMap(t=>t.layers).map(l=>l.id)).toEqual(before.tracks.flatMap(t=>t.layers).map(l=>l.id))
    fs.writeFileSync(path.join(out,'reopened.json'),JSON.stringify(after,null,2))
  } finally {fs.writeFileSync(path.join(out,'receipts.json'),JSON.stringify(receipts,null,2));await client?.close();await app.close()}
})
