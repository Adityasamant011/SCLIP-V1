import fs from 'node:fs'
import path from 'node:path'
import {parse,stringify} from 'yaml'
import type {HermesTurnEvent} from './completionCheckpoint.js'
export interface HermesLifecycleLease {
  url:string; token:string
  start(event:HermesTurnEvent):void
  finish(event:HermesTurnEvent,allowContinuation:boolean,cancelled:boolean):Promise<any>
  cancel?():void
  interrupt(reason:string,cancelled?:boolean):void
  close():void
}
export function validTurnEvent(value:unknown):value is HermesTurnEvent {
  const e=value as HermesTurnEvent
  return !!e && (e.kind==='start'||e.kind==='end') && typeof e.turn_id==='string' && e.turn_id.length>0 && e.turn_id.length<=160 &&
    (e.user_message===undefined||typeof e.user_message==='string'&&e.user_message.length<=65536) &&
    (e.turn_exit_reason===undefined||typeof e.turn_exit_reason==='string'&&e.turn_exit_reason.length<=240) &&
    (e.background_jobs_pending===undefined||e.background_jobs_pending===null||typeof e.background_jobs_pending==='boolean') &&
    ['completed','failed','interrupted'].every(k=>(e as any)[k]===undefined||typeof (e as any)[k]==='boolean')
}
// Existing native Hermes plugin hooks only. No provider API, tools, agent loop,
// review decisions, transcript storage or project mutations are introduced.
export const HERMES_LIFECYCLE_PLUGIN = `import os,json,urllib.request,urllib.parse
_started=set()
_tasks=set()
def _send(payload):
    url=os.environ.get("SCLIP_LIFECYCLE_URL","")
    token=os.environ.get("SCLIP_LIFECYCLE_TOKEN","")
    if not url or not token: return
    parsed=urllib.parse.urlparse(url)
    if parsed.scheme!="http" or parsed.hostname!="127.0.0.1": return
    request=urllib.request.Request(url,data=json.dumps(payload).encode(),method="POST",headers={"Content-Type":"application/json","Authorization":"Bearer "+os.environ.get("SCLIP_MCP_TOKEN",""),"X-Sclip-Lifecycle":token})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request,timeout=10) as response: response.read(4096)
    except Exception:
        print("Sclip completion observer unavailable; output remains unverified.",flush=True)
def _start(**kwargs):
    turn=str(kwargs.get("turn_id") or "")
    if not turn or kwargs.get("parent_session_id"): return
    _started.add(turn)
    task=str(kwargs.get("task_id") or "")
    if task: _tasks.add(task)
    _send({"kind":"start","turn_id":turn,"user_message":str(kwargs.get("user_message") or "")[:65536]})
def _end(**kwargs):
    turn=str(kwargs.get("turn_id") or "")
    if turn not in _started: return
    pending=None
    try:
        from tools.process_registry import process_registry
        task=str(kwargs.get("task_id") or "")
        if task:
            _tasks.add(task)
            active={t for t in _tasks if process_registry.has_active_processes(t)}
            _tasks.intersection_update(active)
            pending=bool(active)
    except Exception: pass
    _send({"kind":"end","turn_id":turn,"completed":kwargs.get("completed") is True,"failed":kwargs.get("failed") is True,"interrupted":kwargs.get("interrupted") is True,"turn_exit_reason":str(kwargs.get("turn_exit_reason") or "")[:240],"background_jobs_pending":pending})
    _started.discard(turn)
def register(ctx):
    ctx.register_hook("pre_llm_call",_start)
    ctx.register_hook("on_session_end",_end)
`
export function stageHermesLifecycle(home:string) {
  const target=path.join(home,'plugins','sclip-completion')
  fs.mkdirSync(target,{recursive:true,mode:0o700})
  fs.writeFileSync(path.join(target,'plugin.yaml'),'name: sclip-completion\nversion: 1.0.0\ndescription: Native task lifecycle observer for Sclip\nhooks:\n  - pre_llm_call\n  - on_session_end\n',{mode:0o600})
  fs.writeFileSync(path.join(target,'__init__.py'),HERMES_LIFECYCLE_PLUGIN,{mode:0o600})
  const file=path.join(home,'config.yaml'),config=parse(fs.readFileSync(file,'utf8'))??{}
  const plugins=config.plugins??{}
  // Explicit opt-out is respected. Missing events leave completion unverified.
  if(Array.isArray(plugins.disabled)&&plugins.disabled.includes('sclip-completion'))return false
  plugins.enabled=[...new Set([...(Array.isArray(plugins.enabled)?plugins.enabled:[]),'sclip-completion'])]
  config.plugins=plugins
  fs.writeFileSync(`${file}.lifecycle.tmp`,stringify(config),{mode:0o600});fs.renameSync(`${file}.lifecycle.tmp`,file)
  return true
}
