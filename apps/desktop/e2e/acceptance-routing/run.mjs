import {_electron as electron} from '@playwright/test';import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';import {parse,stringify} from 'yaml';import assert from 'node:assert/strict';
import {superviseSession} from './session-supervisor.mjs';
// Poffertjes is retired as holdout; existing output guard forbids repeating it.
import {acceptanceConfig,cleanRoutingEnvironment} from './config.mjs';
assert.equal(process.env.SCLIP_PAID_HOLDOUT_OPT_IN,'1','Paid holdout requires separate explicit authorization; this task is checks only');
const ready=JSON.parse(fs.readFileSync('.scratch/phase4b-final/routing-readiness.json'));
assert(Date.now()-Date.parse(ready.checked_at)<15*60*1000,'Recheck metadata before a future authorized run');
assert(ready.key.limit<=0.5&&ready.key.remaining>=0.4,'Provider budget must be sufficient and bounded to $0.50');
const repo=process.cwd(),source='/Users/adityasamant/Downloads/Man United 0-1 Man City _ Highlights as 10-man Blues win Manchester derby through Haaland.mp4';
const prompt='Make a concise, engaging match highlights video from this footage.';
const out=path.join(repo,'apps/desktop/e2e/bench-results/phase4b-final-manchester-holdout');
assert(!fs.existsSync(out),'Never overwrite or repeat this acceptance');fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-final-4b-')),home=path.join(profile,'sclip-hermes');fs.mkdirSync(home);
const realProfile='/Users/adityasamant/Library/Application Support/Sclip';
for(const file of ['model_settings.json','speech_config.json','cloud_keys.json']){const p=path.join(realProfile,file);if(fs.existsSync(p)){fs.copyFileSync(p,path.join(profile,file));fs.chmodSync(path.join(profile,file),0o600);}}
const json=(file,data)=>fs.writeFileSync(path.join(out,file),JSON.stringify(data,null,2));
const hash=createHash('sha256');for await(const chunk of fs.createReadStream(source))hash.update(chunk);
json('configuration.json',{project:'NEW',source,source_sha256:hash.digest('hex'),prior_editorial_exposure:'NO RECORD FOUND; user-selected new source',prompt,model:'openai/gpt-5.6-luna-pro',code:'35ecf236',creator_style_memory:false,paid_ceiling:0.5,budget_guard:'existing OpenRouter key limit; no proxy',max_turns:24,paid_fallback:false,session_count:1,retries:0,external_broll:false});
fs.copyFileSync('.scratch/phase4b-final/routing-readiness.json',path.join(out,'preflight.json'));fs.writeFileSync(path.join(out,'prompt.txt'),prompt+'\n');
let app,client,agent,paidStarted=false;
try{
 const config=acceptanceConfig({},repo);
 fs.writeFileSync(path.join(home,'config.yaml'),stringify(config),{mode:0o600});
 const pythonShim=path.join(profile,'hermes-python');
 fs.writeFileSync(pythonShim,'#!/bin/sh\nexec "/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python" "'+path.join(repo,'apps/desktop/e2e/acceptance-routing/hermes_acceptance.py')+'" "$@"\n',{mode:0o700});
 app=await electron.launch({executablePath:'/Applications/Sclip.app/Contents/MacOS/Sclip',args:[`--user-data-dir=${profile}`],env:{...cleanRoutingEnvironment(process.env),SCLIP_USER_DATA_DIR:profile,SCLIP_ENABLE_EXTERNAL_BROLL:'0',SCLIP_JEV_ENABLED:'0',WEFTCUT_SUPPRESS_ELEVATION_NOTICE:'1'}});
 const page=await app.firstWindow({timeout:60000});await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>!!window.api?.backend);
 const invoke=(command,args={})=>page.evaluate(([c,a])=>window.api.backend.invoke(c,a),[command,args]);
 await invoke('project_new_workspace',{parentFolder:out,name:'workspace',width:1920,height:1080,fpsNum:30,fpsDen:1});
 await page.reload();await page.waitForLoadState('domcontentloaded');await page.locator('.startup-recent').getByText('workspace',{exact:true}).click({timeout:30000});
 await page.waitForFunction(()=>typeof window.__sclipExportRange==='function',{timeout:30000});
 const media=await invoke('import_media',{path:source});await invoke('project_save');
 const projectFile=path.join(out,'workspace/project.json');fs.copyFileSync(projectFile,path.join(out,'initial-project.json'));
 const state=await invoke('project_summary');const info=await page.evaluate(()=>window.api.mcp.getInfo());
 client=new Client({name:'final-phase4b-controller',version:'1'},{});await client.connect(new StreamableHTTPClientTransport(new URL(info.url),{requestInit:{headers:{Authorization:'Bearer '+info.bearer_token}}}));
 const catalog=(await client.listTools()).tools;for(const name of ['ripple_cut_range','inspect_rendered_audio','inspect_timeline_temporal_window','apply_repair_transaction'])assert(catalog.some(t=>t.name===name));json('live-catalog.json',catalog);
 // Startup rewrites the normal Sclip profile; restore only acceptance safety controls.
 const generated=parse(fs.readFileSync(path.join(home,'config.yaml'),'utf8'));fs.writeFileSync(path.join(home,'config.yaml'),stringify(acceptanceConfig(generated,repo)),{mode:0o600});
 const launchRequest={userDataPath:profile,python:pythonShim,cwd:repo,mcpUrl:info.url,mcpToken:info.bearer_token,projectId:state.project_id,transcriptsDir:path.join(out,'workspace/Cache/transcripts'),mode:'edit',prompt,maxTurns:24,initialEvidencePath:path.join(out,'initial-editorial-evidence.json')};
 agent=spawn(path.join(repo,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),[path.join(repo,'.scratch/phase4b-final/launcher.cjs')],{cwd:repo,env:{...cleanRoutingEnvironment(process.env),SCLIP_PAID_HOLDOUT_OPT_IN:'1',SCLIP_ENABLE_EXTERNAL_BROLL:'0',SCLIP_JEV_ENABLED:'0',HERMES_MAX_TOKENS:'8192',SCLIP_REVIEW_EVIDENCE_DIR:path.join(out,'review-evidence')}});
 const started=Date.now(),trace=fs.createWriteStream(path.join(out,'hermes-observable-trace.txt'));let pending='',thinking=false;
 const receive=c=>{pending+=String(c);let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i+1);pending=pending.slice(i+1);if(line.includes('┌─ Reasoning')){thinking=true;continue;}if(thinking){if(line.includes('└─'))thinking=false;continue;}trace.write(line);}};
 agent.stdout.on('data',receive);agent.stderr.on('data',receive);
 const lifecycle=fs.createWriteStream(path.join(out,'session-lifecycle.jsonl'));
 const supervisor=superviseSession(agent,{deadlineMs:1200000,onEvent:e=>lifecycle.write(JSON.stringify(e)+'\n')});
 agent.stdin.end(JSON.stringify(launchRequest));paidStarted=true;
 const progress=setInterval(()=>console.log(JSON.stringify({status:'running',...supervisor.status(),provider_requests:'recorded in observable Hermes trace; no proxy'})),30000);
 const result=await supervisor.done.finally(()=>{clearInterval(progress);if(!thinking&&pending)trace.write(pending);trace.end();lifecycle.end();});
 const code=result.code;
 json('session-result.json',{...result,runtime_s:(Date.now()-started)/1000,one_session:true,paid_started:paidStarted});
 await invoke('project_save');fs.copyFileSync(projectFile,path.join(out,'final-project.json'));
 const events=await invoke('log_list');json('mcp-events.json',events.filter(e=>e.category?.kind==='Mcp'));json('history.json',await invoke('project_history_view'));
 const final=JSON.parse(fs.readFileSync(projectFile));const root=final.compositions[final.root_id];const layers=root.tracks.flatMap(t=>t.layers);const duration=Math.max(0,...layers.map(l=>l.t_end_us));json('metrics.json',{duration_us:duration,layers:layers.length,kinds:layers.reduce((a,l)=>(a[l.params.kind]=(a[l.params.kind]||0)+1,a),{})});
 if(duration>0&&duration<=600000000){await page.evaluate(r=>window.__sclipExportRange(r),{projectId:state.project_id,outputPath:path.join(out,'edit.mp4'),startUs:0,endUs:duration});json('render.json',{status:'EXPORTED',bytes:fs.statSync(path.join(out,'edit.mp4')).size});}
 else json('render.json',{status:'SKIPPED',duration_us:duration});
 console.log(JSON.stringify({status:'FINISHED',code,duration_s:duration/1000000,out}));
}catch(e){json('failure.json',{message:String(e),paid_started:paidStarted});throw e;}
finally{await client?.close().catch(()=>{});if(app)await app.close();if(agent&&agent.exitCode===null)agent.kill('SIGTERM');fs.rmSync(profile,{recursive:true,force:true});}
