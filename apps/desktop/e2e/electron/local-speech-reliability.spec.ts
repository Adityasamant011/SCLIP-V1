import {test,expect} from '@playwright/test'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import path from 'node:path'
import {launchApp,newProject,summary,tmpDir} from './helpers/driver'
// Actual installed local Kokoro; no cloud calls, no creative model/agent.
test('local speech catalog, preview and atomic placement @serial',async()=>{
 test.setTimeout(180000)
 const profile=tmpDir('sclip-speech-profile-'),parent=tmpDir('sclip-speech-project-'),out=path.resolve('../../.scratch/session99-analysis/local-speech-e2e')
 fs.mkdirSync(out,{recursive:true})
 const {app,page}=await launchApp({userDataDir:profile,env:{SCLIP_USER_DATA_DIR:profile,SCLIP_JEV_ENABLED:'0',SCLIP_FAILURE_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',OPENROUTER_API_KEY:'',OPENAI_API_KEY:''}})
 let client:Client|undefined
 try {
  await newProject(page,{parentFolder:parent,name:'synthetic-speech',canvas:{width:640,height:360,fpsNum:30,fpsDen:1}})
  const info=await page.evaluate(()=>(window as any).api.mcp.getInfo())
  client=new Client({name:'local-speech-offline',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(info.url),{requestInit:{headers:{Authorization:`Bearer ${info.bearer_token}`}}}))
  const trace:any[]=[],call=async(name:string,args:any={})=>{const r=await client!.callTool({name,arguments:args},undefined,{timeout:120000}) as any;let data:any;try{data=JSON.parse(r.content[0].text)}catch{data=r.content[0].text};trace.push({name,args,result:data,isError:r.isError});return {r,data}}
  const catalog=await call('list_speech_voices');expect(catalog.r.isError).not.toBe(true);expect(catalog.data.status).toBe('available');expect(catalog.data.voices).toContain('am_michael');expect(catalog.data.aliases.nova).toBe('af_nicole')
  const initial=await summary(page),text='A clear explanation begins with a simple idea. We can show the details, compare the choices, and let the viewer understand what happens next. This synthetic narration checks local speech generation and placement.'
  const preview=await call('synthesize_speech',{text,voice:'am_michael',engine:'kokoro',preview_only:true})
  expect(preview.r.isError,JSON.stringify(preview.r.content)).not.toBe(true);expect(preview.data.placed).toBe(false);expect(preview.data.synthesis.engine).toBe('kokoro-tts');expect(preview.data.synthesis.resolved_voice).toBe('am_michael')
  expect((await summary(page)).media.length).toBe(initial.media.length)
  fs.copyFileSync(preview.data.file_path,path.join(out,'michael-local-sample.mp3'))
  const track=initial.tracks.at(-1)!.id,placed=await call('synthesize_speech',{text,voice:'am_michael',engine:'kokoro',target_track_id:track,t_start_us:0})
  expect(placed.r.isError,JSON.stringify(placed.r.content)).not.toBe(true);expect(placed.data.cached).toBe(true);expect(placed.data.placed).toBe(true)
  const before=(await call('get_editorial_evidence_packet')).data.identity.state_version
  const failed=await call('synthesize_speech',{text,voice:'am_michael',engine:'kokoro',target_track_id:track,t_start_us:0})
  expect(failed.r.isError).toBe(true);expect(failed.r.content[0].text).toContain('SPEECH_PLACEMENT_REJECTED')
  expect((await call('get_editorial_evidence_packet')).data.identity.state_version).toBe(before)
  const unknown=await call('synthesize_speech',{text,voice:'not_a_voice',engine:'kokoro',preview_only:true})
  expect(unknown.r.isError).toBe(true);expect(unknown.r.content[0].text).toContain('Unknown Kokoro voice')
  fs.writeFileSync(path.join(out,'trace.json'),JSON.stringify(trace,null,2))
 } finally {await client?.close();await app.close()}
})
