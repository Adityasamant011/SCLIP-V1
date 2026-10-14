import {it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {parse} from 'yaml'
import {stageHermesEditorToolContracts,HERMES_EDITOR_TOOL_CONTRACT_PLUGIN,GENERAL_MEMORY_CONTRACT,creatorMemoryProvenanceIds} from './hermesEditorToolContracts'
import {CreatorStyleStore} from './creatorStyle'
import {spawnSync} from 'node:child_process'

it('stages an idempotent native memory jurisdiction contract without changing inference or memory files',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-tool-contract-'))
 try {
  fs.writeFileSync(path.join(home,'config.yaml'),'plugins:\n  enabled: [custom-local]\n  disabled: [custom-disabled]\nmodel:\n  default: preserved-model\n')
  fs.mkdirSync(path.join(home,'memories'));fs.writeFileSync(path.join(home,'memories','MEMORY.md'),'Existing creator-owned bytes')
  expect(stageHermesEditorToolContracts(home)).toBe(true);expect(stageHermesEditorToolContracts(home)).toBe(true)
  const c=parse(fs.readFileSync(path.join(home,'config.yaml'),'utf8'))
  expect(c.plugins.enabled).toEqual(['custom-local','sclip-editor-tool-contracts']);expect(c.plugins.disabled).toEqual(['custom-disabled']);expect(c.model.default).toBe('preserved-model')
  expect(fs.readFileSync(path.join(home,'memories','MEMORY.md'),'utf8')).toBe('Existing creator-owned bytes')
  expect(fs.readFileSync(path.join(home,'plugins','sclip-editor-tool-contracts','__init__.py'),'utf8')).toBe(HERMES_EDITOR_TOOL_CONTRACT_PLUGIN)
  expect(HERMES_EDITOR_TOOL_CONTRACT_PLUGIN).not.toContain('register_tool');expect(HERMES_EDITOR_TOOL_CONTRACT_PLUGIN).not.toContain('write_text')
  expect(GENERAL_MEMORY_CONTRACT).toContain('or no learning');expect(GENERAL_MEMORY_CONTRACT).toContain('canonical mcp__weftcut__creator_style_memory')
  expect(GENERAL_MEMORY_CONTRACT).toContain('YOU classify the purpose')
  expect(HERMES_EDITOR_TOOL_CONTRACT_PLUGIN).toContain('memory_domain')
 } finally {fs.rmSync(home,{recursive:true,force:true})}
})
it('preserves an explicit tool-contract plugin opt-out',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-tool-contract-disabled-'))
 try {fs.writeFileSync(path.join(home,'config.yaml'),'plugins:\n  disabled: [sclip-editor-tool-contracts]\n');expect(stageHermesEditorToolContracts(home)).toBe(false);expect(fs.existsSync(path.join(home,'plugins'))).toBe(false);expect(parse(fs.readFileSync(path.join(home,'config.yaml'),'utf8')).plugins.enabled).toBeUndefined()}
 finally {fs.rmSync(home,{recursive:true,force:true})}
})
it('extracts only bounded canonical identifiers without interpreting statements',()=>{
 const id='00000000-0000-0000-0000-000000000001'
 const context='Untrusted creator evidence\n'+JSON.stringify({preferences:[{id,hypothesis:'Arbitrary meaning'}],recent_evidence:[{id},{id:'not an identifier'}]})
 expect(creatorMemoryProvenanceIds(context)).toEqual([id]);expect(creatorMemoryProvenanceIds('')).toEqual([]);expect(creatorMemoryProvenanceIds('unavailable')).toEqual([])
})
it('extracts provenance from the actual canonical context producer',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-provenance-context-'))
 try {
  const store=new CreatorStyleStore(home)
  const view=store.user('fixture-project',{action:'explicit',text:'A fixture creator statement'})
  expect(creatorMemoryProvenanceIds(store.context('fixture-project')).sort()).toEqual([view.preferences[0]!.id,view.evidence[0]!.id].sort())
 } finally {fs.rmSync(home,{recursive:true,force:true})}
})

// Exercise the pinned Hermes execution middleware, including its native memory
// fast path. A registry-only test misses the historical bypass.
it.runIf(fs.existsSync(path.resolve('resources/hermes/arm64/python/bin/python3')))('enforces memory jurisdiction before the real native fast path while preserving general writes',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-native-memory-contract-'))
 try {
  fs.writeFileSync(path.join(home,'contract.py'),HERMES_EDITOR_TOOL_CONTRACT_PLUGIN)
  const script=String.raw`
import sys,os,json,importlib.util
from types import SimpleNamespace
sys.path.insert(0,sys.argv[1])
import model_tools
from tools.memory_tool import memory_tool,MemoryStore
from hermes_cli.plugins import PluginContext,PluginManifest,get_plugin_manager
from agent.tool_executor import _run_agent_tool_execution_middleware
from agent.tool_guardrails import ToolCallGuardrailController
spec=importlib.util.spec_from_file_location('sclip_contract',sys.argv[2])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.register(PluginContext(PluginManifest(name='sclip-editor-tool-contracts'),get_plugin_manager()))
store=MemoryStore();store.load_from_disk()
calls=[]
def fast(args):
    calls.append(args)
    # Exact native executor memory argument shape: no memory_domain or new_text.
    return memory_tool(action=args.get('action'),target=args.get('target','memory'),content=args.get('content'),old_text=args.get('old_text'),operations=args.get('operations'),store=store)
def execute(args):
    agent=SimpleNamespace(session_id='synthetic-contract',quiet_mode=True,tool_progress_callback=None,tool_start_callback=None,_touch_activity=lambda *a:None,_tool_guardrails=ToolCallGuardrailController())
    return _run_agent_tool_execution_middleware(agent,function_name='memory',function_args=args,effective_task_id='',tool_call_id='synthetic',execute=fast)
for args in [
    {'action':'add','target':'user','content':'Synthetic caption interpretation'},
    {'action':'add','target':'user','content':'Synthetic caption interpretation','memory_domain':'creator_style'},
    {'action':'add','content':'Rejected empty-batch bypass','operations':[]},
    {'operations':[{'action':'add','content':'Blocked atomic write'}]},
    {'action':'add','content':'Canonical 00000000-0000-0000-0000-000000000001','memory_domain':'general'}
]:
    result=execute(args)
    assert result.blocked and not calls,(args,result)
assert not os.path.exists(os.path.join(os.environ['HERMES_HOME'],'memories','USER.md'))
result=execute({'action':'add','target':'user','content':'Use concise explanations','memory_domain':'general'})
assert not result.blocked and json.loads(result.result)['success'],result
result=execute({'action':'replace','target':'user','old_text':'Use concise explanations','new_text':'Use clear explanations','memory_domain':'general'})
assert not result.blocked and json.loads(result.result)['success'],result
assert calls[-1]['content']=='Use clear explanations'
assert store.user_entries==['Use clear explanations'],store.user_entries
result=execute({'action':'remove','target':'user','old_text':'Use clear explanations'})
assert not result.blocked and json.loads(result.result)['success'],result
assert store.user_entries==[]
print(json.dumps({'blocked_before_dispatch':5,'general_add_replace_remove':'PASS','native_alias':'PASS'}))
`
  const result=spawnSync(path.resolve('resources/hermes/arm64/python/bin/python3'),['-I','-B','-c',script,path.resolve('resources/hermes/arm64/app'),path.join(home,'contract.py')],{encoding:'utf8',timeout:60000,env:{...process.env,HERMES_HOME:home,SCLIP_ACTIVE_PROJECT_ID:'synthetic-project',SCLIP_CREATOR_PROVENANCE_IDS:JSON.stringify(['00000000-0000-0000-0000-000000000001'])}})
  expect(result.status,result.stderr+'\n'+result.stdout).toBe(0)
  expect(result.stdout).toContain('"blocked_before_dispatch": 5')
 } finally {fs.rmSync(home,{recursive:true,force:true})}
},65000)
