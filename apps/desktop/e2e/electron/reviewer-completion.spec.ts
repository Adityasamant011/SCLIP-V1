import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'

// Fake editor choices, real actor/MCP/compositor/export. No model or perception inference.
test('ordinary completion delivers critique, commits a chosen repair and requires new composed pixels @serial',async()=>{
 test.setTimeout(180000)
 const out=path.resolve('../../.scratch/reviewer-feedback/electron'),profile=tmpDir('sclip-reviewer-profile-'),parent=tmpDir('sclip-reviewer-project-')
 fs.mkdirSync(out,{recursive:true})
 const {app,page}=await launchApp({userDataDir:profile,env:{SCLIP_USER_DATA_DIR:profile,SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',OPENROUTER_API_KEY:'',OPENAI_API_KEY:''}})
 let client:Client|undefined
 const trace:any[]=[]
 try{
  await newProject(page,{parentFolder:parent,name:'offline-feedback',canvas:{width:640,height:360,fpsNum:30,fpsDen:1}})
  const media=await invokeCmd<string>(page,'import_media',{path:path.resolve('e2e/fixtures/media/test_1080p_30fps_audio.mp4')})
  await waitForHook(page,'waitMediaExportReady')
  await page.evaluate(id=>(window as any).__weftcutTest.waitMediaExportReady({mediaId:id,timeoutMs:120000}),media)
  const info=await page.evaluate(()=>(window as any).api.mcp.getInfo())
  client=new Client({name:'offline-editor-choices',version:'1'},{});await client.connect(new StreamableHTTPClientTransport(new URL(info.url),{requestInit:{headers:{Authorization:`Bearer ${info.bearer_token}`}}}))
  const call=async(name:string,args:any={})=>{
   const r=await client!.callTool({name,arguments:args},undefined,{timeout:120000})
   expect(r.isError,JSON.stringify(r.content)).not.toBe(true)
   const texts=r.content.filter((c:any)=>c.type==='text').map((c:any)=>{try{return JSON.parse(c.text)}catch{return null}}).filter(Boolean)
   const data=texts[0],receipt=texts.find((c:any)=>c.evidence_receipt)?.evidence_receipt
   const img=r.content.find((c:any)=>c.type==='image') as any
   trace.push({name,args,result:data,evidence_receipt:receipt})
   return {data,receipt,image:img?.data}
  }
  await call('begin_agent_session',{reason:'Synthetic requested full-frame output'})
  const state=await summary(page)
  const added=await call('add_video_layer',{media_id:media,track_id:state.tracks[0].id,src_in_us:0,src_out_us:2000000,t_start_us:0,t_end_us:2000000})
  const id=added.data.video_layer_id
  await call('update_layer_params',{layer_id:id,patch:{kind:'VideoClip',x:320,y:180,scale_x:.1,scale_y:.1}})
  const pending=await call('end_agent_session')
  expect(pending.data.completion).toBe('review_required')
  expect(pending.data.background_review.issues.some((i:any)=>i.layer_id===id&&i.category==='visual_framing')).toBe(true)
  const before=await call('inspect_timeline_frame',{timeline_t_us:500000})
  fs.writeFileSync(path.join(out,'before.png'),Buffer.from(before.image,'base64'))
  const issue=await call('record_issue',{description:'Fake editor judges small image unsuitable for this synthetic request',severity:'moderate',repairable:true,evidence_dimensions:['visual'],evidence_receipt_ids:[before.receipt.id],layer_ids:[id]})
  await call('revision_control',{action:'select_issue',issue_id:issue.data.issue.id})
  await call('checkpoint',{label:'Fake editor pre-repair'})
  await call('apply_repair_transaction',{reason:'Fake editor explicitly selects transform',expected_state_version:before.receipt.state_version,operations:[{kind:'update_layer_params',layer_id:id,patch:{kind:'VideoClip',x:0,y:0,scale_x:.34,scale_y:.34}}]})
  const premature=await client.callTool({name:'revision_control',arguments:{action:'finish_issue',status:'resolved'}});expect(premature.isError).toBe(true)
  const after=await call('inspect_timeline_frame',{timeline_t_us:500000})
  fs.writeFileSync(path.join(out,'after.png'),Buffer.from(after.image,'base64'))
  expect(after.receipt.state_version).not.toBe(before.receipt.state_version)
  expect(after.image).not.toBe(before.image)
  const blackRatio=(encoded:string)=>{const png=PNG.sync.read(Buffer.from(encoded,'base64'));let black=0;for(let i=0;i<png.data.length;i+=4)if(png.data[i]<=3&&png.data[i+1]<=3&&png.data[i+2]<=3)black++;return black/(png.width*png.height)}
  expect(blackRatio(before.image)).toBeGreaterThan(.8)
  expect(blackRatio(after.image)).toBeLessThan(.15) // Generated chart only; not a production aesthetic rule.
  await call('revision_control',{action:'finish_issue',status:'resolved'})
  await call('revision_control',{action:'complete'})
  expect((await call('end_agent_session')).data.completion).toBe('reviewed')
  await invokeCmd(page,'project_save')
  fs.copyFileSync(path.join(parent,'offline-feedback/project.json'),path.join(out,'project.json'))
  const current=await summary(page),output=path.join(out,'edit.mp4')
  await page.evaluate(r=>(window as any).__sclipExportRange(r),{projectId:current.project_id,outputPath:output,startUs:0,endUs:2000000})
  expect(fs.existsSync(output)).toBe(true);expect(fs.statSync(output).size).toBeGreaterThan(1000)
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({result:'PASS',model_requests:0,paid_cost:0,output},null,2))
 }finally{fs.writeFileSync(path.join(out,'trace.json'),JSON.stringify(trace,null,2));await client?.close();await app.close()}
})
