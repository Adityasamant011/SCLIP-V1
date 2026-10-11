import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'
// Real engine/actor/compositor, synthetic footage and explicit test choices. Zero inference.
test('QA respects mix gates, preserves authored text problems, never opens Export UI @serial',async()=>{
 test.setTimeout(180000)
 const profile=tmpDir('sclip-inspection-profile-'),parent=tmpDir('sclip-inspection-project-'),out=path.resolve('../../.scratch/inspection-reliability')
 fs.mkdirSync(out,{recursive:true})
 const {app,page}=await launchApp({userDataDir:profile,env:{SCLIP_USER_DATA_DIR:profile,SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',OPENROUTER_API_KEY:'',OPENAI_API_KEY:''}})
 let client:Client|undefined;const trace:any[]=[]
 try{
  await newProject(page,{parentFolder:parent,name:'synthetic-inspection',canvas:{width:640,height:360,fpsNum:30,fpsDen:1}})
  const media=await invokeCmd<string>(page,'import_media',{path:path.resolve('e2e/fixtures/media/test_1080p_30fps_audio.mp4')})
  await waitForHook(page,'waitMediaExportReady');await page.evaluate(id=>(window as any).__weftcutTest.waitMediaExportReady({mediaId:id,timeoutMs:120000}),media)
  const info=await page.evaluate(()=>(window as any).api.mcp.getInfo())
  client=new Client({name:'offline-inspection-regression',version:'1'},{});await client.connect(new StreamableHTTPClientTransport(new URL(info.url),{requestInit:{headers:{Authorization:`Bearer ${info.bearer_token}`}}}))
  const call=async(name:string,args:any={})=>{const r=await client!.callTool({name,arguments:args},undefined,{timeout:120000});expect(r.isError,JSON.stringify(r.content)).not.toBe(true);const data=(r.content as any[]).filter(c=>c.type==='text').map(c=>{try{return JSON.parse(c.text)}catch{return c.text}})[0];trace.push({name,args,data});return {r,data}}
  const state=await summary(page)
  await call('add_video_layer',{media_id:media,track_id:state.tracks[0].id,src_in_us:0,src_out_us:2000000,t_start_us:0,t_end_us:2000000})
  await invokeCmd(page,'update_role_flags',{role:'dialogue',patch:{muted:true}})
  const muted=await call('inspect_rendered_audio',{start_us:0,end_us:1000000});expect(muted.data.status).toBe('no_audible_material');expect(muted.data.audibility.selected_count).toBe(0);expect(muted.data.observed_dimensions).toEqual([])
  expect(await page.evaluate(()=>(window as any).__weftcutExportState)).toBeNull()
  const silentVideo=await call('render_timeline_range',{start_us:0,end_us:1000000});expect(silentVideo.data.has_audio).toBe(false);expect(fs.statSync(silentVideo.data.path).size).toBeGreaterThan(1024);fs.copyFileSync(silentVideo.data.path,path.join(out,'silent-qa.mp4'))
  expect(await page.evaluate(()=>(window as any).__weftcutExportState)).toBeNull()
  await invokeCmd(page,'update_role_flags',{role:'dialogue',patch:{muted:false}})
  const audible=await call('inspect_rendered_audio',{start_us:0,end_us:1000000});expect(audible.data.has_audio).toBe(true);expect(audible.data.signal.peak).toBeGreaterThan(0);expect(audible.data.state_version).not.toBe(muted.data.state_version)
  expect(await page.evaluate(()=>(window as any).__weftcutExportState)).toBeNull()
  const ids:string[]=[]
  for(let i=0;i<2;i++) {const t=await call('add_text_layer',{content:'Synthetic overlapping text',t_start_us:0,duration_us:2000000,x:10,y:50,font_family:'__unavailable_test_font__',font_size_px:28,box_w:300});ids.push(t.data);await call('update_layer_params',{layer_id:t.data,patch:{kind:'Text',box_h:100,anchor_x:.5,anchor_y:.5}})}
  const projectBefore=await summary(page)
  const frame=await call('inspect_timeline_frame',{timeline_t_us:500000});expect(frame.data.source).toBe('live_compositor')
  const facts=frame.data.composed_frame_facts;expect(facts.text_intersections.length).toBeGreaterThan(0);expect(facts.layer_bounds.find((l:any)=>l.layer_id===ids[0]).outside_canvas_edges).toContain('left')
  const images=(frame.r.content as any[]).filter(c=>c.type==='image');expect(images.length).toBeGreaterThan(1);fs.writeFileSync(path.join(out,'frame.png'),Buffer.from(images[0].data,'base64'));fs.writeFileSync(path.join(out,'text-crop.png'),Buffer.from(images[1].data,'base64'))
  const critique=await call('get_timeline_critique');expect(critique.data.issues.some((i:any)=>i.id.startsWith('text_collision_'))).toBe(true);expect(critique.data.issues.some((i:any)=>i.id.startsWith('text_font_unavailable_'))).toBe(true);expect(critique.data.readiness).toBe('not_certified')
  const render=await call('render_timeline_range',{start_us:0,end_us:2000000});expect(fs.existsSync(render.data.path)).toBe(true);fs.copyFileSync(render.data.path,path.join(out,'qa.mp4'))
  expect(await page.evaluate(()=>(window as any).__weftcutExportState)).toBeNull()
  const projectAfter=await summary(page);expect(projectAfter.compositions).toEqual(projectBefore.compositions);expect(projectAfter.audio_roles).toEqual(projectBefore.audio_roles) // no automatic mute, relocation, synchronization or creative repairs
  // Actual pixels must use the bundled face even when the authored font is absent.
  // Updating both test layers to that explicit face should change no pixels.
  for(const id of ids) await call('update_layer_params',{layer_id:id,patch:{kind:'Text',font_family:'Liberation Sans'}})
  const explicitFont=await call('inspect_timeline_frame',{timeline_t_us:500000})
  expect((explicitFont.r.content as any[]).find(c=>c.type==='image').data).toBe(images[0].data)
  await page.screenshot({path:path.join(out,'ui.png')})
 }finally{fs.writeFileSync(path.join(out,'trace.json'),JSON.stringify(trace,null,2));await client?.close();await app.close()}
})
