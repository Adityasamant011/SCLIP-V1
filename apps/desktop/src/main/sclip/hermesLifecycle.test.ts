import {it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {stageHermesLifecycle,validTurnEvent,HERMES_LIFECYCLE_PLUGIN} from './hermesLifecycle'
import {parse} from 'yaml'
import {spawnSync} from 'node:child_process'
it('stages hooks only and preserves explicit plugins and inference settings',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-hook-config-'))
 try{fs.writeFileSync(path.join(home,'config.yaml'),'plugins:\n  enabled: [custom-local]\n  disabled: [custom-disabled]\ncompression:\n  enabled: false\nauxiliary:\n  title_generation:\n    enabled: true\n')
 expect(stageHermesLifecycle(home)).toBe(true);expect(stageHermesLifecycle(home)).toBe(true)
 const c=parse(fs.readFileSync(path.join(home,'config.yaml'),'utf8'));expect(c.plugins.enabled).toEqual(['custom-local','sclip-completion']);expect(c.plugins.disabled).toEqual(['custom-disabled']);expect(c.compression.enabled).toBe(false);expect(c.auxiliary.title_generation.enabled).toBe(true)
 expect(HERMES_LIFECYCLE_PLUGIN).toContain('ctx.register_hook("on_session_end"');expect(HERMES_LIFECYCLE_PLUGIN).not.toContain('register_tool');expect(HERMES_LIFECYCLE_PLUGIN).toContain('ProxyHandler({})')
 }finally{fs.rmSync(home,{recursive:true,force:true})}
})
it('honors explicit observer opt-out; never enables unrelated plugins',()=>{const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-hook-disabled-'));try{fs.writeFileSync(path.join(home,'config.yaml'),'plugins:\n  disabled: [sclip-completion]\n');expect(stageHermesLifecycle(home)).toBe(false);expect(parse(fs.readFileSync(path.join(home,'config.yaml'),'utf8')).plugins.enabled).toBeUndefined()}finally{fs.rmSync(home,{recursive:true,force:true})}})
it('refuses malformed/oversized lifecycle metadata and preserves unknown background status',()=>{expect(validTurnEvent({kind:'end',turn_id:'turn',completed:true,background_jobs_pending:null})).toBe(true);expect(validTurnEvent({kind:'end',turn_id:'turn',completed:'yes'})).toBe(false);expect(validTurnEvent({kind:'start',turn_id:'turn',user_message:'x'.repeat(65537)})).toBe(false);expect(validTurnEvent({kind:'end',turn_id:''})).toBe(false)})
it('native pre-LLM hook returns fresh host context and the exact accepted short reaction, without constructing a model',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-native-turn-context-'))
 try{
  fs.writeFileSync(path.join(home,'plugin.py'),HERMES_LIFECYCLE_PLUGIN)
  const script=String.raw`
import os,sys,json,importlib.util,urllib.request
os.environ.update(SCLIP_LIFECYCLE_URL='http://127.0.0.1:1234/mcp/terminal/test',SCLIP_LIFECYCLE_TOKEN='synthetic',SCLIP_MCP_TOKEN='synthetic')
requests=[]
class Response:
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def read(self,n): return json.dumps({'accepted':True,'context':'Fresh manual correction from the host'}).encode()
class Opener:
    def open(self,request,timeout):
        requests.append(json.loads(request.data))
        return Response()
urllib.request.build_opener=lambda *a:Opener()
spec=importlib.util.spec_from_file_location('native_learning_hook',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
assert module._start(turn_id='accepted',user_message='no')=={'context':'Fresh manual correction from the host'}
assert requests[-1]['user_message']=='no'
assert module._start(turn_id='child',parent_session_id='parent',user_message='Assistant fork') is None
assert len(requests)==1
print('native accepted prompt and fresh context PASS')
`
  const result=spawnSync('/usr/bin/python3',['-I','-B','-c',script,path.join(home,'plugin.py')],{encoding:'utf8',timeout:10000})
  expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('fresh context PASS')
 }finally{fs.rmSync(home,{recursive:true,force:true})}
})
