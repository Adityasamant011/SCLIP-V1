/** Editorial baseline evaluation only. Runs the immutable frozen package;
 * imports authorized inputs, never selects ranges or makes creative mutations. */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {spawn,spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';import {parse,stringify} from 'yaml';
const caseFile=process.env.SCLIP_EDITORIAL_CASE_FILE;assert(caseFile,'Explicit frozen case JSON required');const evaluation=JSON.parse(fs.readFileSync(caseFile,'utf8'));
const output=path.resolve(process.env.SCLIP_EDITORIAL_OUTPUT);assert(process.env.SCLIP_EDITORIAL_OUTPUT,'Explicit durable output required');
assert(!fs.existsSync(output),'Use a new output directory; preserve failed attempts');fs.mkdirSync(output,{recursive:true});
const executable=process.env.SCLIP_CORE_PACKAGE_EXECUTABLE;assert(executable,'Explicit isolated package required');assert(!executable.startsWith('/Applications/'));
const frozenManifest=JSON.parse(fs.readFileSync(path.resolve('../../acceptance-artifacts/core-v1-20261014/baseline/package-manifest.json'),'utf8'));
for(const [file,pin] of Object.entries(frozenManifest.files))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(frozenManifest.package,file))).digest('hex'),pin.sha256,'Frozen package changed');
const hosted=!evaluation.qa_only&&!evaluation.sensing_probe,model='nvidia/nemotron-3.5-lightning:free';
const memoryScenario=false;
const extended=false;
const sensingOnly=process.env.SCLIP_CORE_SENSING_ONLY==='1';
const gapScenario=process.env.SCLIP_CORE_SCENARIO==='gap';
const offscreenScenario=process.env.SCLIP_CORE_SCENARIO==='offscreen';
const persistentProfile=process.env.SCLIP_EDITORIAL_PROFILE;assert(!persistentProfile||path.basename(persistentProfile).startsWith('sclip-ei-style-'));const profile=persistentProfile??fs.mkdtempSync(path.join(os.tmpdir(),'sclip-core-package-'));fs.mkdirSync(profile,{recursive:true});let app,client,proxy;let secret='',requests=0;
const json=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function pricing(){
 const response=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(20000)});assert(response.ok);
 const record=(await response.json()).data.find(item=>item.id===model);assert(record,'Authorized free route unavailable');
 for(const field of ['prompt','completion','request','image','input_audio','output_audio'])if(record.pricing[field]!==undefined)assert.equal(Number(record.pricing[field]),0,`Paid ${field} forbidden`);
 fs.appendFileSync(path.join(output,'provider-pricing.jsonl'),JSON.stringify({checked_at:new Date().toISOString(),id:record.id,pricing:record.pricing})+'\n');return record;
}
try {
 const local=JSON.parse(fs.readFileSync(path.join(os.homedir(),'Library/Application Support/Sclip/speech_config.json'),'utf8')).local.whisper_cpp;
 assert(fs.existsSync(local.model),'Existing authorized local speech model unavailable');
 fs.writeFileSync(path.join(profile,'speech_config.json'),JSON.stringify({preferred_engine:'whisper_cpp',local:{whisper_cpp:{...local,binary:path.resolve(path.dirname(executable),'../Resources/whisper/whisper-cli')}}}));
 if(evaluation.sensing_probe){const cache=path.join(profile,'data/cache');fs.mkdirSync(cache,{recursive:true});fs.writeFileSync(path.join(cache,'content-queue.json'),JSON.stringify(['sensevoice-runtime','sensevoice-model-int8','sensevoice-tokens']))}
 json('evaluation-case.json',evaluation);
 const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',PWD:profile,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',SCLIP_USER_DATA_DIR:profile,SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',SCLIP_ENABLE_EXTERNAL_BROLL:'0',SCLIP_HERMES_SOURCE:'/nonexistent/developer-checkout',SCLIP_HERMES_EXECUTABLE:'/nonexistent/developer-hermes'};
 for(const key of Object.keys(env))if(/API_KEY|API_TOKEN|OPENAI_BASE_URL|OPENROUTER_BASE_URL|PYTHONPATH|PYTHONHOME/.test(key))delete env[key];
 // A hardened packaged app need not expose Node's inspector. Use its normal
 // Chromium debugging interface; keep ownership of this exact child process.
 if(persistentProfile)fs.rmSync(path.join(profile,'DevToolsActivePort'),{force:true});
 const child=spawn(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0'],{env,cwd:profile,stdio:['ignore','pipe','pipe']});
 const processLog=fs.createWriteStream(path.join(output,'app-process.log'));child.stdout.pipe(processLog,{end:false});child.stderr.pipe(processLog,{end:false});
 app={close:async()=>{child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('close',resolve)),delay(5000)]);if(child.exitCode===null)child.kill('SIGKILL');processLog.end()}};
 let port;for(let i=0;i<120;i++){const file=path.join(profile,'DevToolsActivePort');if(fs.existsSync(file)){port=Number(fs.readFileSync(file,'utf8').split('\n')[0]);break;}assert(child.exitCode===null,'Packaged app exited before startup');await delay(500)}assert(port,'No packaged browser debugging endpoint');
 const browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const context=browser.contexts()[0];let page;
 for(let i=0;i<120;i++){page=context.pages().find(p=>p.url().startsWith('file:'));if(page)break;assert(child.exitCode===null,'Packaged app exited before window');await delay(500)}assert(page,'No packaged editor window');await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>!!window.api?.backend);
 const invoke=(command,args={})=>page.evaluate(([c,a])=>window.api.backend.invoke(c,a),[command,args]);
 const workspace=evaluation.resume_project??path.join(output,'editorial-'+evaluation.id);
 if(evaluation.resume_project)await invoke('project_open',{path:workspace});else await invoke('project_new_workspace',{parentFolder:output,name:'editorial-'+evaluation.id,width:evaluation.width,height:evaluation.height,fpsNum:30,fpsDen:1});
 await page.reload();await page.waitForLoadState('domcontentloaded');await page.locator('.startup-recent').getByText('editorial-'+evaluation.id,{exact:true}).click({timeout:30000});
 const state=await invoke('project_summary');const info=await page.evaluate(()=>window.api.mcp.getInfo());
 client=new Client({name:'core-package-acceptance',version:'1'},{});await client.connect(new StreamableHTTPClientTransport(new URL(info.url),{requestInit:{headers:{Authorization:'Bearer '+info.bearer_token}}}));
 const catalog=(await client.listTools()).tools;json('live-catalog.json',catalog);assert(catalog.some(item=>item.name==='creator_style_memory'));assert(catalog.some(item=>item.name==='revision_control'));
 const call=async(name,args={})=>{const value=await client.callTool({name,arguments:args},undefined,{timeout:150000});json(`tool-${name}-${Date.now()}.json`,value);assert(!value.isError,JSON.stringify(value.content));const text=value.content.find(item=>item.type==='text')?.text;if(text===undefined)return value.structuredContent??value;try{return JSON.parse(text)}catch{return text}};
 let uploaded;
 const initialSaved=JSON.parse(fs.readFileSync(path.join(workspace,'project.json'),'utf8'));
 const track=initialSaved.compositions[initialSaved.root_id].tracks[0].id;
 // Initial uploaded source only; the native creative agent authors the timeline.
 if(!evaluation.qa_only){
 assert(fs.existsSync(evaluation.source));uploaded=await invoke('import_media',{path:evaluation.source});json('uploaded-media.json',{media_id:uploaded,source:evaluation.source});
 const label=evaluation.creator_label??('Synthetic Editorial '+evaluation.id);let creators=await invoke('sclip_creator_style',{action:'view'});if(!creators.creators.some(c=>c.label===label))creators=await invoke('sclip_creator_style',{action:'create_creator',label});await invoke('sclip_creator_style',{action:'bind',creatorId:creators.creators.find(c=>c.label===label).id});json('creator-context-before.json',await invoke('sclip_creator_style',{action:'view'}));
 if(evaluation.style_fixture)await call('add_video_layer',{media_id:uploaded,track_id:track,src_in_us:0,src_out_us:2000000,t_start_us:0,t_end_us:2000000});
 }
 await invoke('project_save');const projectFile=path.join(workspace,'project.json');json('initial-project.json',JSON.parse(fs.readFileSync(projectFile)));
 json('runtime-status.json',await invoke('sclip_get_hermes_status'));
 if(!hosted)json('completion-classification.json',{native_verified:false,editorial_quality:'not_yet_assessed',scope:'Independent QA of preserved incomplete project; not a new native session'});
 if(hosted){
  await pricing();
  // Read/decrypt the existing key without modifying its real profile or logging it.
  const helper=path.join(profile,'read-key.cjs');fs.writeFileSync(helper,`const {app,safeStorage}=require('electron');app.setName('Sclip');app.whenReady().then(()=>{const p=JSON.parse(require('node:fs').readFileSync('/Users/adityasamant/Library/Application Support/Sclip/cloud_keys.json','utf8'));const v=p.sclip_openrouter??p.openrouter;if(!v)throw Error('No configured OpenRouter key');process.stdout.write('SCLIP_KEY:'+safeStorage.decryptString(Buffer.from(v,'base64'))+'\\n');app.quit()});`);
  secret=await new Promise((resolve,reject)=>{const p=spawn(path.resolve('../../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),[helper,`--user-data-dir=${path.join(profile,'key-helper')}`],{env,stdio:['ignore','pipe','pipe']});let out='';const timer=setTimeout(()=>{p.kill('SIGTERM');reject(Error('Read-only credential setup exceeded 60 seconds; no inference sent'))},60000);p.stdout.on('data',c=>out+=c);p.once('error',error=>{clearTimeout(timer);reject(error)});p.once('close',code=>{clearTimeout(timer);const key=out.match(/SCLIP_KEY:([^\n]+)/)?.[1];if(code===0&&key)resolve(key);else reject(Error('Read-only credential decryption unavailable'))})});
  proxy=http.createServer(async(req,res)=>{try{
   if(req.url==='/v1/models'){const record=await pricing();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:record.id,object:'model'}]}));return;}
   assert.equal(req.url,'/v1/chat/completions','Only primary chat inference allowed');assert.equal(req.method,'POST');
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);assert.equal(body.model,model);assert(requests<90,'Bounded native trial');await pricing();
   if(requests===0)json('native-tool-schemas.json',body.tools??[]);body.provider={allow_fallbacks:false,max_price:{prompt:0,completion:0}};if(body.stream)body.stream_options={...(body.stream_options??{}),include_usage:true};requests++;
   fs.appendFileSync(path.join(output,'provider-requests.jsonl'),JSON.stringify({request:requests,at:new Date().toISOString(),model,paid_fallback:false})+'\n');
   const upstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
   res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')??'application/json'});let usageBuffer='',usage;for await(const chunk of upstream.body){res.write(chunk);usageBuffer+=new TextDecoder().decode(chunk);const lines=usageBuffer.split('\n');usageBuffer=lines.pop()??'';for(const line of lines){try{const event=JSON.parse(line.startsWith('data:')?line.slice(5):line);if(event.usage)usage=event.usage}catch{}}}if(!usage){try{usage=JSON.parse(usageBuffer).usage}catch{}}fs.appendFileSync(path.join(output,'provider-usage.jsonl'),JSON.stringify({request:requests,status:upstream.status,usage:usage??null})+'\n');res.end();
  }catch(error){res.writeHead(503);res.end(JSON.stringify({error:{message:String(error)}}));}});
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  await invoke('sclip_set_hermes_config',{provider:'custom',model,customBaseUrl:`http://127.0.0.1:${proxy.address().port}/v1`,apiKey:'local-free-guard-only',maxIterations:60});
  const configFile=path.join(profile,'sclip-hermes/config.yaml');const config=parse(fs.readFileSync(configFile,'utf8'));config.terminal={...(config.terminal??{}),cwd:profile};config.fallback_model=[];config.fallback_providers=[];config.compression={enabled:false};config.auxiliary={title_generation:{enabled:false},background_review:{enabled:false},free_only:true};config.curator={consolidate:false};fs.writeFileSync(configFile,stringify(config));
  const session=await invoke('sclip_create_project_session',{projectId:state.project_id,name:'Editorial baseline '+evaluation.id});json('session.json',session);
  const sessionId=session.session?.id??session.id??session.activeSessionId;assert(sessionId,'Session ownership ID missing');
  await invoke('sclip_open_terminal',{projectId:state.project_id,sessionId,cols:110,rows:36});
  const prompt=evaluation.brief;
  fs.writeFileSync(path.join(output,'prompt.txt'),prompt);
  for(let i=0;i<90;i++){const snapshot=await invoke('sclip_open_terminal',{projectId:state.project_id,sessionId});if(snapshot.history.includes('Welcome to Hermes Agent!'))break;assert(i<89,'Native terminal startup exceeded 90 seconds');await delay(1000)}
  await delay(2000); // Welcome precedes native input readiness on some launches.
  await invoke('sclip_terminal_input',{projectId:state.project_id,sessionId,data:'\x1b[200~'+prompt+'\x1b[201~'});await delay(400);await invoke('sclip_terminal_input',{projectId:state.project_id,sessionId,data:'\r'});
  const started=Date.now();let disposition;
  while(Date.now()-started<1200000){
   await delay(3000);disposition=await invoke('sclip_get_review_disposition');json('review-disposition.json',disposition);
   const snapshot=await invoke('sclip_open_terminal',{projectId:state.project_id,sessionId});fs.writeFileSync(path.join(output,'native-observable-trace.txt'),snapshot.history.replace(/┌─ Reasoning[\s\S]*?└─[^\n]*/g,'[Reasoning omitted]'));
   if(disposition.status==='incomplete'||disposition.status==='failed'||disposition.status==='cancelled'||disposition.status==='completed'||disposition.lifecycle?.status==='completed'||JSON.stringify(disposition).includes('current_review_and_media_verified'))break;
   if((Date.now()-started)%30000<3100)console.log(JSON.stringify({stage:'native-review',requests,elapsed_s:Math.round((Date.now()-started)/1000),status:disposition.status}));
  }
  if(disposition.status==='running'){await invoke('sclip_terminal_input',{projectId:state.project_id,sessionId,data:'\x03'});await delay(3000);disposition=await invoke('sclip_get_review_disposition');json('deadline-interruption.json',{owned_session:sessionId,disposition})}
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
  json('completion-classification.json',{native_verified:JSON.stringify(disposition).includes('current_review_and_media_verified'),editorial_quality:'not_yet_assessed',independent_export_is_not_a_native_completion_repair:true});
 }
 if(evaluation.sensing_probe){
  await page.waitForFunction(()=>typeof window.__weftcutPreview?.captureFrameAt==='function');
  json('voices.json',await call('list_speech_voices'));json('sensevoice-before.json',await call('get_audio_understanding_status'));
  let ready;for(let i=0;i<180;i++){ready=await call('get_audio_understanding_status');if(ready.status==='ready')break;await delay(1000)}json('sensevoice-after.json',ready);
  if(evaluation.sensing_non_speech){
   for(const source of evaluation.acoustic_sources){const id=await invoke('import_media',{path:source.path});await call('add_media_layer',{media_id:id,track_id:track,t_start_us:0});json('acoustic-'+source.id+'.json',await call('inspect_rendered_audio',{start_us:0,end_us:5000000,include_understanding:true}));await call('undo');}
  } else {
  const beforeCancel=await invoke('project_history_view'),controller=new AbortController();
  const cancelled=client.callTool({name:'synthesize_speech',arguments:{text:'This is a disposable cancellation test of local speech generation.',voice:'alloy'}},undefined,{signal:controller.signal,timeout:150000}).then(x=>({returned:x}),e=>({error:String(e)}));await delay(1000);controller.abort();json('synthesis-abort.json',await cancelled);
  await delay(60000);assert.deepEqual(await invoke('project_history_view'),beforeCancel);json('late-write-check.json',{status:'PASS',wait_seconds:60});
  for(const [i,voice,text] of [[1,'alloy','A complete idea needs a clear beginning and ending.'],[2,'nova','An interview answer should keep its essential context.'],[3,'echo','Good captions should remain readable and faithful.']]){
   await call('synthesize_speech',{text,voice,t_start_us:0});await invoke('project_save');const current=JSON.parse(fs.readFileSync(projectFile));const speech=await call('inspect_rendered_audio',{start_us:0,end_us:Math.min(current.compositions[current.root_id].duration_us,10000000),include_understanding:true});json('speech-'+i+'.json',{voice,text,observation:speech});await call('undo');
  }
  const concurrency=await Promise.allSettled([call('synthesize_speech',{text:'Independent first voice.',voice:'alloy'}),call('synthesize_speech',{text:'Independent second voice.',voice:'nova'})]);json('concurrent-synthesis.json',concurrency);assert(concurrency.every(x=>x.status==='fulfilled'));
  }
  json('vision-multiple.json',await call('vision_inspect',{media_id:uploaded,source_t_us:1000000,question:'Describe physical subjects and visible text. Keep uncertainty explicit.'}));
 }
 if(evaluation.apply_saved_corrections){
  for(const correction of evaluation.apply_saved_corrections){await invoke('project_open',{path:correction.project_path});const saved=JSON.parse(fs.readFileSync(path.join(correction.project_path,'project.json')));const texts=saved.compositions[saved.root_id].tracks.flatMap(t=>t.layers).filter(l=>l.params.kind==='Text'&&l.params.content===correction.content);assert.equal(texts.length,1,'Need actual agent-created label for correction');const text=texts[0];await invoke('update_layer_params',{layerId:text.id,patch:{kind:'Text',font_size_px:correction.font_size_px}});await invoke('project_save');const corrected=JSON.parse(fs.readFileSync(path.join(correction.project_path,'project.json')));const actual=corrected.compositions[corrected.root_id].tracks.flatMap(t=>t.layers).find(l=>l.id===text.id);assert.equal(actual.params.font.size_px,correction.font_size_px,'User correction must physically change the real font');json('correction-'+correction.id+'.json',{before:text,after_project:JSON.parse(fs.readFileSync(path.join(correction.project_path,'project.json'))),authoritative_evidence:await invoke('sclip_creator_style',{action:'view'})});}
  await invoke('project_open',{path:path.dirname(projectFile)});
 }
 json('creator-context-after.json',await invoke('sclip_creator_style',{action:'view'}));
 await invoke('project_save');json('final-project.json',JSON.parse(fs.readFileSync(projectFile)));json('history.json',await invoke('project_history_view'));
 const savedBeforeReopen=JSON.parse(fs.readFileSync(projectFile));await invoke('project_open',{path:path.dirname(projectFile)});await invoke('project_save');const reopened=JSON.parse(fs.readFileSync(projectFile));assert.deepEqual(reopened.compositions,savedBeforeReopen.compositions);const sourceIdentity=pool=>Object.fromEntries(Object.entries(pool).map(([id,m])=>[id,{id:m.id,path_abs:m.path_abs,path_rel:m.path_rel,file_hash_blake3:m.file_hash_blake3,file_size:m.file_size,metadata:m.metadata}]));assert.deepEqual(sourceIdentity(reopened.media_pool),sourceIdentity(savedBeforeReopen.media_pool));json('save-reopen.json',{status:'PASS',same_compositions:true,same_source_identity:true,cache_bookkeeping_not_authored_content:true});
 const final=JSON.parse(fs.readFileSync(projectFile));const endUs=final.compositions[final.root_id].duration_us;
 if(endUs<=0){json('result.json',{status:'FAIL',reason:'No authored timeline output',requests,paid_calls:0});throw Error('No authored timeline output')}
 const nativeVerified=!evaluation.apply_saved_corrections&&JSON.parse(fs.readFileSync(path.join(output,'completion-classification.json'))).native_verified;const outputMedia=path.join(output,nativeVerified?'finished.mp4':'independent-qa-partial.mp4');
 await page.waitForFunction(()=>typeof window.__sclipExportRange==='function');await page.evaluate(r=>window.__sclipExportRange(r),{projectId:state.project_id,outputPath:outputMedia,startUs:0,endUs});
 const ffmpeg=path.resolve('resources/ffmpeg/mac/ffmpeg');const decode=spawnSync(ffmpeg,['-v','error','-i',outputMedia,'-f','null','-'],{encoding:'utf8'});json('decode.json',{status:decode.status,stderr:decode.stderr});assert.equal(decode.status,0);
 json('result.json',{status:nativeVerified?'TECHNICAL_COMPLETION':'INCOMPLETE_NATIVE_SESSION',editorial_quality:'not_yet_assessed',output:outputMedia,packaged:true,tools:catalog.length,hosted,requests,paid_calls:0,profile_isolated:true});
}catch(error){json('failure.json',{error:String(error),requests});throw error;}
finally{secret='';await client?.close().catch(()=>{});if(app)await app.close();if(proxy)await new Promise(resolve=>proxy.close(resolve));if(!persistentProfile)fs.rmSync(profile,{recursive:true,force:true});}
