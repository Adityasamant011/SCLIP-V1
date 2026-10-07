/** Explicit metadata/config check ONLY. Never starts a chat or modifies a key allowance. */
import {app} from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parse,stringify} from 'yaml';
import {loadAllKeys} from '../../src/main/keys';
import {resolveHermesProviderEnvironment} from '../../src/main/sclip/hermesSettings';
import {hermesBaseEnvironment} from '../../src/main/sclip/hermesSecrets';
// @ts-ignore test-only JavaScript configuration shared with manual acceptance runner
import {acceptanceConfig,cleanRoutingEnvironment,MODEL,BASE} from './config.mjs';
app.setName('Sclip');
app.setPath('userData',path.join(os.homedir(),'Library/Application Support/Sclip'));
app.whenReady().then(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-route-check-'));
 try {
  const keys=loadAllKeys();
  const providerEnv=resolveHermesProviderEnvironment({provider:'openrouter',model:MODEL,apiKeyTag:'sclip_openrouter'} as any,tag=>keys[tag],{});
  const key=providerEnv.OPENROUTER_API_KEY;
  if(!key)throw new Error('Missing authorized credential');
  // Exercise the same encrypted-store copy and app identity used by the prepared isolated launcher.
  fs.copyFileSync(path.join(app.getPath('userData'),'cloud_keys.json'),path.join(home,'cloud_keys.json'));
  fs.chmodSync(path.join(home,'cloud_keys.json'),0o600);
  app.setPath('userData',home);
  const isolatedKeys=loadAllKeys();
  const isolatedEnv=resolveHermesProviderEnvironment({provider:'openrouter',model:MODEL} as any,tag=>isolatedKeys[tag],{});
  if(isolatedEnv.OPENROUTER_API_KEY!==key)throw new Error('Isolated secure-store credential mismatch');
  const config=acceptanceConfig({},process.cwd());
  fs.writeFileSync(path.join(home,'config.yaml'),stringify(config),{mode:0o600});
  const env={...hermesBaseEnvironment(cleanRoutingEnvironment(process.env)),...providerEnv,HERMES_HOME:home,PYTHONDONTWRITEBYTECODE:'1'};
  const check=spawnSync('/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python',
    [path.join(process.cwd(),'apps/desktop/e2e/acceptance-routing/hermes_acceptance.py'),'--check'],
    {cwd:process.cwd(),env,encoding:'utf8',timeout:30000});
  // Never emit raw Python diagnostics: a dependency could include credential-bearing context.
  if(check.status!==0)throw new Error('Offline Hermes route validation failed');
  const resolved=JSON.parse(check.stdout.trim());
  const report:any={checked_at:new Date().toISOString(),runtime:resolved,inference_requests:0,allowance_modified:false};
  for(const endpoint of ['key','models','models/'+MODEL+'/endpoints']) {
   const res=await fetch(BASE+'/'+endpoint,{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});
   if(!res.ok)throw new Error('Metadata authentication/catalog check failed');
   const {data}:any=await res.json();
   if(endpoint==='key')report.key={limit:data.limit,usage:data.usage,remaining:data.limit_remaining};
   if(endpoint==='models')report.model=data.filter((m:any)=>m.id===MODEL).map((m:any)=>({id:m.id,pricing:m.pricing,supported_parameters:m.supported_parameters}));
   if(endpoint.endsWith('/endpoints'))report.endpoints=data.endpoints.filter((e:any)=>e.tag==='openai').map((e:any)=>({tag:e.tag,status:e.status,pricing:e.pricing,supported_parameters:e.supported_parameters}));
  }
  if(report.model.length!==1||!report.model[0].supported_parameters.includes('tools')||report.endpoints.length!==1)throw new Error('Pinned tool-capable route not available');
  fs.mkdirSync('.scratch/phase4b-final',{recursive:true});
  fs.writeFileSync('.scratch/phase4b-final/routing-readiness.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));app.exit(0);
 } catch {console.error('Safe routing preflight failed; no inference attempted and no credentials emitted');app.exit(1);}
 finally {fs.rmSync(home,{recursive:true,force:true});}
});
