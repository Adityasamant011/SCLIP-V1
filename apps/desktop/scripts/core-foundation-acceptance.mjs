/** Disposable packaged-core acceptance. Synthetic authored input; native Hermes
 * owns every subsequent edit/review. Hosted requests are guarded to one free route. */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';import {parse,stringify} from 'yaml';
const output=path.resolve(process.env.SCLIP_CORE_ACCEPTANCE_OUTPUT??'../../acceptance-artifacts/core-v1-20261014/packaged-valid-title');
assert(!fs.existsSync(output),'Use a new output directory; preserve failed attempts');fs.mkdirSync(output,{recursive:true});
const executable=process.env.SCLIP_CORE_PACKAGE_EXECUTABLE;assert(executable,'Explicit isolated package required');assert(!executable.startsWith('/Applications/'));
const hosted=process.env.SCLIP_CORE_FREE_ACCEPTANCE==='1',model='nvidia/nemotron-3.5-lightning:free';
const memoryScenario=['memory','memory-contract'].includes(process.env.SCLIP_CORE_SCENARIO);
const extended=process.env.SCLIP_CORE_EXTENDED==='1';
const sensingOnly=process.env.SCLIP_CORE_SENSING_ONLY==='1';
const gapScenario=process.env.SCLIP_CORE_SCENARIO==='gap';
const offscreenScenario=process.env.SCLIP_CORE_SCENARIO==='offscreen';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-core-package-'));let app,client,proxy;let secret='',requests=0;
const json=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function pricing(){
 const response=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(20000)});assert(response.ok);
 const record=(await response.json()).data.find(item=>item.id===model);assert(record,'Authorized free route unavailable');
 for(const field of ['prompt','completion','request','image','input_audio','output_audio'])if(record.pricing[field]!==undefined)assert.equal(Number(record.pricing[field]),0,`Paid ${field} forbidden`);
 fs.appendFileSync(path.join(output,'provider-pricing.jsonl'),JSON.stringify({checked_at:new Date().toISOString(),id:record.id,pricing:record.pricing})+'\n');return record;
}
try {
 if(extended){
  const local=JSON.parse(fs.readFileSync(path.join(os.homedir(),'Library/Application Support/Sclip/speech_config.json'),'utf8')).local.whisper_cpp;
  assert(fs.existsSync(local.model),'Existing authorized local speech model unavailable');
  fs.writeFileSync(path.join(profile,'speech_config.json'),JSON.stringify({preferred_engine:'whisper_cpp',local:{whisper_cpp:{...local,binary:path.resolve(path.dirname(executable),'../Resources/whisper/whisper-cli')}}}));
  if(sensingOnly){
   // Reproduce the supported persisted-queue recovery path. These are existing
   // immutable catalog IDs; the real ContentQueue downloads/verifies them.
   const cache=path.join(profile,'data/cache');fs.mkdirSync(cache,{recursive:true});fs.writeFileSync(path.join(cache,'content-queue.json'),JSON.stringify(['sensevoice-runtime','sensevoice-model-int8','sensevoice-tokens']));
  }
 }
 const env={...process.env,PWD:profile,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',SCLIP_USER_DATA_DIR:profile,SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',SCLIP_ENABLE_EXTERNAL_BROLL:'0',SCLIP_HERMES_SOURCE:'/nonexistent/developer-checkout',SCLIP_HERMES_EXECUTABLE:'/nonexistent/developer-hermes'};
 for(const key of Object.keys(env))if(/API_KEY|API_TOKEN|OPENAI_BASE_URL|OPENROUTER_BASE_URL|PYTHONPATH|PYTHONHOME/.test(key))delete env[key];
 // A hardened packaged app need not expose Node's inspector. Use its normal
 // Chromium debugging interface; keep ownership of this exact child process.
 const child=spawn(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0'],{env,cwd:profile,stdio:['ignore','pipe','pipe']});
 const processLog=fs.createWriteStream(path.join(output,'app-process.log'));child.stdout.pipe(processLog,{end:false});child.stderr.pipe(processLog,{end:false});
 app={close:async()=>{child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('close',resolve)),delay(5000)]);if(child.exitCode===null)child.kill('SIGKILL');processLog.end()}};
 let port;for(let i=0;i<120;i++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=Number(fs.readFileSync(file,'utf8').split('\n')[0]);break;}assert(child.exitCode===null,'Packaged app exited before startup');await delay(500)}assert(port,'No packaged browser debugging endpoint');
 const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const context=browser.contexts()[0];let page;
 for(let i=0;i<120;i++){page=context.pages().find(p=>p.url().startsWith('file:'));if(page)break;assert(child.exitCode===null,'Packaged app exited before window');await delay(500)}assert(page,'No packaged editor window');await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>!!window.api?.backend);
 const invoke=(command,args={})=>page.evaluate(([c,a])=>window.api.backend.invoke(c,a),[command,args]);
 await invoke('project_new_workspace',{parentFolder:output,name:'synthetic-valid-title',width:1920,height:1080,fpsNum:30,fpsDen:1});
 await page.reload();await page.waitForLoadState('domcontentloaded');await page.locator('.startup-recent').getByText('synthetic-valid-title',{exact:true}).click({timeout:30000});
 const state=await invoke('project_summary');const info=await page.evaluate(()=>window.api.mcp.getInfo());
 client=new Client({name:'core-package-acceptance',version:'1'},{});await client.connect(new StreamableHTTPClientTransport(new URL(info.url),{requestInit:{headers:{Authorization:'Bearer '+info.bearer_token}}}));
 const catalog=(await client.listTools()).tools;json('live-catalog.json',catalog);assert(catalog.some(item=>item.name==='creator_style_memory'));assert(catalog.some(item=>item.name==='revision_control'));
 const call=async(name,args={})=>{const value=await client.callTool({name,arguments:args},undefined,{timeout:150000});json(`tool-${name}-${Date.now()}.json`,value);assert(!value.isError,JSON.stringify(value.content));const text=value.content.find(item=>item.type==='text').text;try{return JSON.parse(text)}catch{return text}};
 const initialSaved=JSON.parse(fs.readFileSync(path.join(output,'synthetic-valid-title/project.json'),'utf8'));
 const track=initialSaved.compositions[initialSaved.root_id].tracks[0].id;
 // These are controlled acceptance inputs, not an editing pipeline.
 if(memoryScenario){
  let view=await invoke('sclip_creator_style',{action:'create_creator',label:'Synthetic Core Alpha'});await invoke('sclip_creator_style',{action:'bind',creatorId:view.creators.find(c=>c.label==='Synthetic Core Alpha').id});
  await invoke('sclip_creator_style',{action:'create_creator',label:'Synthetic Core Beta'});
 }
 let textLayer;
 if(gapScenario){
  const media=await invoke('import_media',{path:path.resolve('fixtures/media/tiny.mp4')});
  await call('add_video_layer',{media_id:media,track_id:track,src_in_us:0,src_out_us:2000000,t_start_us:0,t_end_us:2000000});
  await call('add_video_layer',{media_id:media,track_id:track,src_in_us:0,src_out_us:2000000,t_start_us:7000000,t_end_us:9000000});
 }else{
  await call('add_color_layer',{track_id:track,color:{r:32,g:64,b:96,a:255},t_start_us:0,t_end_us:3000000});
  textLayer=await call('add_text_layer',{content:'A simple title',t_start_us:0,duration_us:3000000,x:offscreenScenario?-500:960,y:540,font_size_px:memoryScenario?64:40,box_w:300,align:'Center'});
 }
 if(memoryScenario){
  // Real User dispatch, following a real Agent MCP write. No interpretation is
  // fixture-authored; only the authoritative correction is supplied.
  await invoke('update_layer_params',{layerId:textLayer,patch:{kind:'Text',font_size_px:28}});
  json('authoritative-correction.json',await invoke('sclip_creator_style',{action:'view'}));
 }
 await invoke('project_save');const projectFile=path.join(output,'synthetic-valid-title/project.json');json('initial-project.json',JSON.parse(fs.readFileSync(projectFile)));
 json('runtime-status.json',await invoke('sclip_get_hermes_status'));
 if(process.env.SCLIP_CORE_VERIFICATION_RESERVE==='1'){
  assert(!hosted,'Protocol fixture is distinct from native creative acceptance');
  const raw=async(name,args={})=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:150000});json(`protocol-${name}-${Date.now()}.json`,result);assert(!result.isError,JSON.stringify(result.content));return result};
  await page.waitForFunction(()=>typeof window.__weftcutPreview?.captureFrameAt==='function');
  await raw('revision_control',{action:'begin'});
  const observed=await raw('vision_inspect',{timeline_t_us:1500000,question:'Describe visible text and geometry for this synthetic protocol fixture.'});
  const receipt=observed.content.filter(c=>c.type==='text').map(c=>{try{return JSON.parse(c.text)}catch{return {}}}).find(c=>c.evidence_receipt)?.evidence_receipt;assert(receipt?.id);
  const issueResult=await raw('record_issue',{description:'Synthetic protocol control; not a certified editorial defect',severity:'moderate',repairable:true,evidence_receipt_ids:[receipt.id],evidence_dimensions:['visual','geometry'],affected_range_us:[0,3000000]});
  const issue=issueResult.content.filter(c=>c.type==='text').map(c=>{try{return JSON.parse(c.text)}catch{return {}}}).find(c=>c.issue)?.issue;assert(issue?.id);
  await raw('revision_control',{action:'select_issue',issue_id:issue.id});await raw('checkpoint',{label:'Synthetic verification budget fixture'});
  await raw('import_media',{path:path.resolve('fixtures/media/tiny.mp4')});
  await raw('get_timeline_context');await raw('get_editorial_evidence_packet');
  const before=await raw('revision_control',{action:'status'});assert(before.content.some(c=>c.type==='text'&&c.text.includes('"verification_pending":true')));
  await raw('vision_inspect',{timeline_t_us:1500000,question:'Describe the current rendered title and its geometry after the synthetic import.'});
  const after=await raw('revision_control',{action:'status'});assert(after.content.some(c=>c.type==='text'&&c.text.includes('"verification_pending":false')));
  json('verification-budget-runtime.json',{status:'PASS',required_rendered_inspection_reachable:true,host_creative_completion:false});
 }
 if(hosted){
  await pricing();
  // Read/decrypt the existing key without modifying its real profile or logging it.
  const helper=path.join(profile,'read-key.cjs');fs.writeFileSync(helper,`const {app,safeStorage}=require('electron');app.setName('Sclip');app.whenReady().then(()=>{const p=JSON.parse(require('node:fs').readFileSync('/Users/adityasamant/Library/Application Support/Sclip/cloud_keys.json','utf8'));const v=p.sclip_openrouter??p.openrouter;if(!v)throw Error('No configured OpenRouter key');process.stdout.write('SCLIP_KEY:'+safeStorage.decryptString(Buffer.from(v,'base64'))+'\\n');app.quit()});`);
  secret=await new Promise((resolve,reject)=>{const p=spawn(path.resolve('../../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),[helper,`--user-data-dir=${path.join(profile,'key-helper')}`],{env,stdio:['ignore','pipe','pipe']});let out='';const timer=setTimeout(()=>{p.kill('SIGTERM');reject(Error('Read-only credential setup exceeded 60 seconds; no inference sent'))},60000);p.stdout.on('data',c=>out+=c);p.once('error',error=>{clearTimeout(timer);reject(error)});p.once('close',code=>{clearTimeout(timer);const key=out.match(/SCLIP_KEY:([^\n]+)/)?.[1];if(code===0&&key)resolve(key);else reject(Error('Read-only credential decryption unavailable'))})});
  proxy=http.createServer(async(req,res)=>{try{
   if(req.url==='/v1/models'){const record=await pricing();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:record.id,object:'model'}]}));return;}
   assert.equal(req.url,'/v1/chat/completions','Only primary chat inference allowed');assert.equal(req.method,'POST');
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);assert.equal(body.model,model);assert(requests<45,'Bounded native trial');await pricing();
   body.provider={allow_fallbacks:false,max_price:{prompt:0,completion:0}};requests++;
   fs.appendFileSync(path.join(output,'provider-requests.jsonl'),JSON.stringify({request:requests,at:new Date().toISOString(),model,paid_fallback:false})+'\n');
   const upstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')??'application/json'});for await(const chunk of upstream.body)res.write(chunk);res.end();
  }catch(error){res.writeHead(503);res.end(JSON.stringify({error:{message:String(error)}}));}});
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  await invoke('sclip_set_hermes_config',{provider:'custom',model,customBaseUrl:`http://127.0.0.1:${proxy.address().port}/v1`,apiKey:'local-free-guard-only',maxIterations:30});
  const configFile=path.join(profile,'sclip-hermes/config.yaml');const config=parse(fs.readFileSync(configFile,'utf8'));config.terminal={...(config.terminal??{}),cwd:profile};config.fallback_model=[];config.fallback_providers=[];config.compression={enabled:false};config.auxiliary={title_generation:{enabled:false},background_review:{enabled:false},free_only:true};config.curator={consolidate:false};fs.writeFileSync(configFile,stringify(config));
  const session=await invoke('sclip_create_project_session',{projectId:state.project_id,name:'Synthetic packaged native review'});json('session.json',session);
  const sessionId=session.session?.id??session.id??session.activeSessionId;assert(sessionId,'Session ownership ID missing');
  await invoke('sclip_open_terminal',{projectId:state.project_id,sessionId,cols:110,rows:36});
  let prompt=process.env.SCLIP_CORE_SCENARIO==='memory-contract'?'This is a synthetic tool-contract test. Use the native memory tool to add the general communication note "Prefer concise written explanations" to target user with memory_domain general. Verify that a creator_style-domain add to generic memory is refused, using the synthetic content "Synthetic guard probe"; this probe is not a creator preference to learn. Discover the exact canonical creator_style_memory tool and read its context and the recorded authoritative User correction. You may abstain from interpreting a single correction. Preserve this title, inspect its current rendered result, and finish honestly.':memoryScenario?'Remember that I prefer concise written explanations in general memory. I manually corrected this synthetic title. Inspect the recorded correction evidence and decide whether a supported tentative creator-style interpretation exists, or abstain if evidence is insufficient. Any style interpretation belongs in canonical creator style memory. Keep the current title unchanged, inspect the actual result, and finish honestly.':'Review this draft, consider any current critique, repair a real problem if justified, and verify the updated result. Finish only with an honest account of what you checked.';
  if(gapScenario)prompt='Remove the five-second unintended gap between the two clips, preserve their content, inspect the updated result, and finish honestly.';
  if(offscreenScenario)prompt='Correct the off-screen title so it is readable in the frame. Preserve its text and duration, inspect the updated result, and finish honestly.';
  fs.writeFileSync(path.join(output,'prompt.txt'),prompt);
  for(let i=0;i<90;i++){const snapshot=await invoke('sclip_open_terminal',{projectId:state.project_id,sessionId});if(snapshot.history.includes('Welcome to Hermes Agent!'))break;assert(i<89,'Native terminal startup exceeded 90 seconds');await delay(1000)}
  await invoke('sclip_terminal_input',{projectId:state.project_id,sessionId,data:'\x1b[200~'+prompt+'\x1b[201~'});await delay(400);await invoke('sclip_terminal_input',{projectId:state.project_id,sessionId,data:'\r'});
  const started=Date.now();let disposition;
  while(Date.now()-started<600000){
   await delay(3000);disposition=await invoke('sclip_get_review_disposition');json('review-disposition.json',disposition);
   const snapshot=await invoke('sclip_open_terminal',{projectId:state.project_id,sessionId});fs.writeFileSync(path.join(output,'native-observable-trace.txt'),snapshot.history.replace(/┌─ Reasoning[\s\S]*?└─[^\n]*/g,'[Reasoning omitted]'));
   if(disposition.status==='incomplete'||disposition.status==='failed'||disposition.status==='cancelled'||disposition.status==='completed'||disposition.lifecycle?.status==='completed'||JSON.stringify(disposition).includes('current_review_and_media_verified'))break;
   if((Date.now()-started)%30000<3100)console.log(JSON.stringify({stage:'native-review',requests,elapsed_s:Math.round((Date.now()-started)/1000),status:disposition.status}));
  }
  json('native-outcome.json',{requests,disposition,elapsed_s:(Date.now()-started)/1000});
  await invoke('project_save');json('native-final-project.json',JSON.parse(fs.readFileSync(projectFile)));json('native-history.json',await invoke('project_history_view'));
  // Keep actual executed calls/results, not hidden reasoning or a model's
  // claims about its actions. Query only this synthetic creator-scoped store.
  const recorder=String.raw`import pathlib,sqlite3,json,sys
home,out,token=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),sys.argv[3]
records=[]
for db in [home/'state.db',*home.glob('creators/*/state.db')]:
 if not db.exists():continue
 c=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True)
 for role,content,calls,name,tid in c.execute('select role,content,tool_calls,tool_name,tool_call_id from messages order by id'):
  if role=='tool':records.append({'role':role,'tool':name,'tool_call_id':tid,'result':content})
  if calls:
   for call in json.loads(calls):
    name=call.get('function',{}).get('name','')
    if name:records.append({'role':role,'call':call})
 c.close()
out.write_text(json.dumps(records,indent=2).replace(token,'[REDACTED_MCP_TOKEN]'))
`;
  const recording=spawnSync(path.resolve(path.dirname(executable),'../Resources/hermes/python/bin/python3'),['-I','-B','-c',recorder,path.join(profile,'sclip-hermes'),path.join(output,'actual-native-tool-records.json'),info.bearer_token],{encoding:'utf8',timeout:20000});assert.equal(recording.status,0,'Native tool evidence recording failed');
  if(secret){const recordFile=path.join(output,'actual-native-tool-records.json');fs.writeFileSync(recordFile,fs.readFileSync(recordFile,'utf8').split(secret).join('[REDACTED_PROVIDER_KEY]'))}
  if(memoryScenario){
   json('canonical-memory-after.json',await invoke('sclip_creator_style',{action:'view'}));
   const copyNotes=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())copyNotes(file);else if(['USER.md','MEMORY.md'].includes(entry.name)){const target=path.join(output,'synthetic-general-memory',path.relative(path.join(profile,'sclip-hermes'),file));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target)}}};copyNotes(path.join(profile,'sclip-hermes'));
  }
  assert(JSON.stringify(disposition).includes('current_review_and_media_verified'),'Native completion remains unverified');
 }
 if(extended){
  const before=await invoke('project_history_view');const refused=await client.callTool({name:'add_media_layer',arguments:{media_id:'00000000-0000-0000-0000-000000000001',track_id:track,t_start_us:0,src_out_us:3000000}});json('placement-refusal.json',refused);assert(refused.isError);assert.deepEqual(await invoke('project_history_view'),before);
  json('voices.json',await call('list_speech_voices'));json('sensevoice-status.json',await call('get_audio_understanding_status'));
  json('visual-inspection.json',await call('vision_inspect',{timeline_t_us:1000000,question:'What visible text and background are present? State any uncertainty.'}));
  if(!sensingOnly){const controller=new AbortController();const startHistory=await invoke('project_history_view');
  const cancelled=client.callTool({name:'synthesize_speech',arguments:{text:'This is a synthetic cancellation test of local speech.',voice:'alloy'}},undefined,{signal:controller.signal,timeout:150000}).then(value=>({returned:value}),error=>({error:String(error)}));
  await delay(1000);controller.abort();const abortResult=await cancelled;json('synthesis-cancel.json',abortResult);assert(abortResult.error?.includes('Abort'));
  const waitStart=Date.now();for(let i=0;i<4;i++){await delay(15000);console.log(JSON.stringify({stage:'late-synthesis-write-check',wait_s:(Date.now()-waitStart)/1000}))}
  assert.deepEqual(await invoke('project_history_view'),startHistory,'Cancelled synthesis wrote late history');
  }
  if(sensingOnly){let ready;for(let i=0;i<180;i++){ready=await call('get_audio_understanding_status');if(ready.status==='ready')break;assert(i<179,'Pinned managed SenseVoice queue recovery exceeded 180 seconds');await delay(1000)}json('sensevoice-ready.json',ready)}
  await call('synthesize_speech',{text:'This is synthetic local speech for the Sclip core test.',voice:'alloy',t_start_us:0});
  const speech=await call('inspect_rendered_audio',{start_us:0,end_us:3000000,include_understanding:true});json('rendered-speech.json',speech);assert(speech.has_audio,'Expected actual speech in inspected timeline range');assert(speech.transcript.status!=='no_audio');
  if(sensingOnly)assert(speech.audio_understanding?.status==='available','Expected real local SenseVoice observation after setup');
  await invoke('project_save');const saved=JSON.parse(fs.readFileSync(projectFile));await invoke('project_open',{path:path.dirname(projectFile)});await invoke('project_save');const reopened=JSON.parse(fs.readFileSync(projectFile));assert.deepEqual(reopened.compositions,saved.compositions);assert.deepEqual(reopened.media_pool,saved.media_pool);json('save-reopen.json',{status:'PASS',project_id:reopened.project_id});
 }
 await invoke('project_save');json('final-project.json',JSON.parse(fs.readFileSync(projectFile)));json('history.json',await invoke('project_history_view'));
 const final=JSON.parse(fs.readFileSync(projectFile));const endUs=final.compositions[final.root_id].duration_us;
 if(hosted){
  const initial=JSON.parse(fs.readFileSync(path.join(output,'initial-project.json'))),initialLayers=initial.compositions[initial.root_id].tracks.flatMap(t=>t.layers),finalLayers=final.compositions[final.root_id].tracks.flatMap(t=>t.layers);
  if(gapScenario){
   const signature=layers=>layers.filter(l=>l.params.kind==='VideoClip').map(l=>[l.params.media,l.params.src_in_us,l.params.src_out_us]).sort();assert.deepEqual(signature(finalLayers),signature(initialLayers));assert.equal(endUs,4000000);assert.deepEqual(finalLayers.filter(l=>l.params.kind==='VideoClip').map(l=>l.t_start_us).sort((a,b)=>a-b),[0,2000000]);
  }else if(offscreenScenario){
   const original=initialLayers.find(l=>l.params.kind==='Text'),current=finalLayers.find(l=>l.id===original.id);assert(current);assert.equal(current.params.content,original.params.content);assert.equal(current.t_end_us-current.t_start_us,original.t_end_us-original.t_start_us);assert.equal(finalLayers.length,initialLayers.length);
  }else assert.deepEqual(final.compositions,initial.compositions,'Already-good authored title must be preserved');
 }
 await page.waitForFunction(()=>typeof window.__sclipExportRange==='function');await page.evaluate(r=>window.__sclipExportRange(r),{projectId:state.project_id,outputPath:path.join(output,'title.mp4'),startUs:0,endUs});
 const ffmpeg=path.resolve('resources/ffmpeg/mac/ffmpeg');const decode=spawnSync(ffmpeg,['-v','error','-i',path.join(output,'title.mp4'),'-f','null','-'],{encoding:'utf8'});json('decode.json',{status:decode.status,stderr:decode.stderr});assert.equal(decode.status,0);
 json('result.json',{status:'PASS',packaged:true,tools:catalog.length,hosted,requests,paid_calls:0,profile_isolated:true});
}catch(error){json('failure.json',{error:String(error),requests});throw error;}
finally{secret='';await client?.close().catch(()=>{});if(app)await app.close();if(proxy)await new Promise(resolve=>proxy.close(resolve));fs.rmSync(profile,{recursive:true,force:true});}
