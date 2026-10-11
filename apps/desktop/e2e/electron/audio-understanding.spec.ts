import {test,expect} from '@playwright/test'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {launchApp,newProject,summary,tmpDir} from './helpers/driver'
// Opt-in local acceptance: no auto-download and no cloud/provider inference.
test('actual rendered mix through local SenseVoice CPU @serial',async()=>{
 test.skip(process.env.SCLIP_LOCAL_AUDIO_ACCEPTANCE!=='1','Requires installed local model; explicitly opt in')
 test.setTimeout(180000)
 const profile=tmpDir('sclip-sense-profile-'),parent=tmpDir('sclip-sense-project-'),out=path.resolve('../../.scratch/audio-understanding')
 const normal=path.join(os.homedir(),'Library/Application Support/Sclip'),settings=JSON.parse(fs.readFileSync(path.join(normal,'app_settings.json'),'utf8'))
 fs.writeFileSync(path.join(profile,'app_settings.json'),JSON.stringify({data_root:settings.data_root||path.join(normal,'data')}))
 const localSpeech=JSON.parse(fs.readFileSync(path.join(normal,'speech_config.json'),'utf8'))
 fs.writeFileSync(path.join(profile,'speech_config.json'),JSON.stringify({local:localSpeech.local,preferred_engine:'whisper_cpp'}))
 const {app,page}=await launchApp({userDataDir:profile,env:{SCLIP_USER_DATA_DIR:profile,SCLIP_JEV_ENABLED:'0',SCLIP_FAILURE_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',OPENROUTER_API_KEY:'',OPENAI_API_KEY:''}})
 let client:Client|undefined
 try {
  await newProject(page,{parentFolder:parent,name:'synthetic-audio-sense',canvas:{width:640,height:360,fpsNum:30,fpsDen:1}})
  const info=await page.evaluate(()=>(window as any).api.mcp.getInfo())
  client=new Client({name:'audio-sense-offline',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(info.url),{requestInit:{headers:{Authorization:`Bearer ${info.bearer_token}`}}}))
  const trace:any[]=[],call=async(name:string,args:any={})=>{const r=await client!.callTool({name,arguments:args},undefined,{timeout:120000}) as any;expect(r.isError,JSON.stringify(r.content)).not.toBe(true);const data=JSON.parse(r.content[0].text);for(const block of r.content.slice(1)){if(block.type==='text'){try{Object.assign(data,JSON.parse(block.text))}catch{}}}trace.push({name,args,result:data});return data}
  const tools=(await client.listTools()).tools;expect(tools.find(t=>t.name==='inspect_rendered_audio')!.inputSchema.properties).toHaveProperty('include_understanding')
  expect((await call('get_audio_understanding_status')).status).toBe('ready')
  const initial=await summary(page),text='A clear explanation begins with a simple idea. We can show the details, compare the choices, and let the viewer understand what happens next. This synthetic narration checks local speech generation and placement.'
  const speech=await call('synthesize_speech',{text,voice:'am_michael',engine:'kokoro',target_track_id:initial.tracks.at(-1)!.id,t_start_us:0});expect(speech.placed).toBe(true)
  await call('revision_control',{action:'begin'});
  const before=(await call('get_editorial_evidence_packet')).identity.state_version,start=Date.now()
  const result=await call('inspect_rendered_audio',{start_us:0,end_us:14000000,include_understanding:true})
  expect(result.audio_understanding.status).toBe('available');expect(result.audio_understanding.windows).toHaveLength(2);expect(result.audio_understanding.windows[0].event).toBe('Speech');expect(result.audio_understanding.windows[0].timeline_range_us).toEqual([0,10000000]);expect(result.audio_understanding.provider_calls).toBe(0);expect(result.audio_understanding.windows.map((w:any)=>w.transcript).join(' ')).toMatch(/clear|explanation/i)
  expect(result.coordinate_space).toBe('timeline');expect(result.delivery_assessment.status).toBe('not_assessed');expect(result.transcript.status).toBe('available');expect(result.evidence_receipt).toBeDefined()
  const elapsed=Date.now()-start
  const again=await call('inspect_rendered_audio',{start_us:0,end_us:14000000,include_understanding:true});expect(again.audio_understanding.cached).toBe(true);expect((await call('get_editorial_evidence_packet')).identity.state_version).toBe(before)
  fs.writeFileSync(path.join(out,'electron-trace.json'),JSON.stringify(trace,null,2));fs.writeFileSync(path.join(out,'electron-result.json'),JSON.stringify({status:'PASS',elapsed_ms:elapsed,model_latency_ms:result.audio_understanding.latency_ms,windows:result.audio_understanding.windows,whisper:result.transcript.status,unchanged_project:true,paid_cost:0},null,2))
 }finally{await client?.close();await app.close()}
})
