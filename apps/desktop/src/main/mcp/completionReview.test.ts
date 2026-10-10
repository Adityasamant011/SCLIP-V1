import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createActor } from '../state/actor'
import { mediaItemTemplate } from '../state/mutations/media'
import { blankProject } from '../state/model'
import { uuidV7Gen } from '../state/ids'
import { AgentActivityService } from '../agent/activity'
import { BackgroundReviewer } from '../sclip/reviewer/backgroundReviewer'
import { startMcpHost } from './index'
import { stageEditorialEvidence } from '../sclip/autonomousReview'
import { reviewState } from '../sclip/evidenceCoordinates'
vi.mock('electron',()=>({app:{isPackaged:true}}))
vi.mock('./auth',()=>({loadOrInitAuth:()=>({token:'offline-token',port:0}),saveAuth:()=>{},rotateToken:(a:unknown)=>a}))
vi.mock('../sclip/visionRuntime',()=>({getVisionRuntime:()=>({analyze:async()=>({ok:true,description:'Synthetic rendered frame observation; inset is visible',confidence:'low'}),clearCache:()=>{}})}))
const hermesSource=process.env.SCLIP_OFFLINE_HERMES_SOURCE ?? path.join(os.homedir(),'SCLIP/hermes-agent-src')
const body=(r:any)=>JSON.parse(r.content[0].text)
const receipt=(r:any)=>r.content.filter((b:any)=>b.type==='text').map((b:any)=>{try{return JSON.parse(b.text).evidence_receipt}catch{return null}}).find(Boolean)
async function fixture() {
 const ids=uuidV7Gen(),initial=blankProject(ids,'offline-completion')
 const media=mediaItemTemplate('00000000-0000-0000-0000-000000000001','Video',5000000)
 media.metadata.video={width:320,height:180,fps:{num:30,den:1},codec:'h264',pixel_format:'yuv420p'} as any
 initial.media_pool[media.id]=media
 const actor=createActor({initial,idGen:ids,clock:()=> 'now'})
 const agent=new AgentActivityService(actor,()=>{});agent.start()
 const ts={actor,agent,mcpCall:(n:string,a:string)=>actor.mcpCall(n,a)} as any
 const backend={mcpCatalog:async()=>'{"tools":[],"resources":[]}',mcpCallTool:vi.fn(async()=>{throw new Error('Unexpected native tool in offline fixture')})} as any
 const provider=vi.fn(),reviewer=new BackgroundReviewer(ts,undefined,1,undefined,undefined,provider)
 const activeWindow={isDestroyed:()=>false,webContents:{executeJavaScript:async()=>({pngBase64:Buffer.from('offline frame').toString('base64'),tUs:500000})}} as any
 const host=await startMcpHost(backend,{getTsHost:()=>ts,getActiveWindow:()=>activeWindow,getReviewerSummary:()=>reviewer.getSummary()})
 const clients:Client[]=[]
 async function connect(){const c=new Client({name:'offline-Hermes-decision',version:'1'},{});await c.connect(new StreamableHTTPClientTransport(new URL(host.getInfo().url),{requestInit:{headers:{Authorization:`Bearer ${host.getInfo().bearer_token}`}}}));clients.push(c);return c}
 const client=await connect(),call=async(n:string,a:Record<string,unknown>={})=>client.callTool({name:n,arguments:a}) as Promise<any>
 async function assemble(){
   await call('begin_agent_session',{reason:'Synthetic user requests an authored output'})
   const id='00000000-0000-0000-0000-000000000001'
   // Supply real metadata via actor state; the chosen source is deliberately undersized.
   const track=actor.snapshot().compositions[actor.snapshot().root_id].tracks[0].id
   const r=await call('add_video_layer',{track_id:track,media_id:id,t_start_us:0,t_end_us:2000000,src_in_us:0,src_out_us:2000000})
   expect(r.isError).not.toBe(true)
   return actor.snapshot().compositions[actor.snapshot().root_id].tracks.flatMap(t=>t.layers).find(l=>l.params.kind==='VideoClip')!.id
 }
 return {actor,ts,provider,reviewer,host,call,connect,assemble,async close(){for(const c of clients)await c.close();reviewer.dispose();agent.stop();await host.close()}}
}
describe('Normal completion: critique -> Hermes choice -> actor -> fresh evidence',()=>{
 it('delivers current framing findings at completion, permits agent-selected repair, blocks premature resolution, then verifies and finishes once',async()=>{
  const f=await fixture()
  try{
   const id=await f.assemble(),pending=body(await f.call('end_agent_session'))
   expect(pending.completion).toBe('review_required')
   expect(pending.background_review.issues.some((i:any)=>i.layer_id===id&&i.category==='visual_framing')).toBe(true)
   expect(pending.background_review.state_version).toBe(pending.editorial_evidence_packet.identity.state_version)
   expect(f.ts.agent.snapshot().session).not.toBeNull()
   expect((await f.call('end_agent_session',{force:true})).isError).toBe(true)
   const seen=await f.call('vision_inspect',{timeline_t_us:500000,question:'Describe the actual current output'})
   const issue=body(await f.call('record_issue',{description:'Fake Hermes judges this inset unsuitable for the synthetic brief',severity:'moderate',repairable:true,evidence_dimensions:['visual'],evidence_receipt_ids:[receipt(seen).id],layer_ids:[id]}))
   expect(issue.accepted).toBe(true)
   await f.call('revision_control',{action:'select_issue',issue_id:issue.issue.id});await f.call('checkpoint',{label:'Before fake Hermes chosen repair'})
   const before=reviewState(f.actor.snapshot())
   // These values are chosen by the fake editor; production infrastructure generates none.
   const repair=await f.call('update_layer_params',{layer_id:id,patch:{kind:'VideoClip',scale_x:3,scale_y:3}})
   expect(repair.isError).not.toBe(true);expect(reviewState(f.actor.snapshot())).not.toBe(before)
   expect((await f.call('revision_control',{action:'finish_issue',status:'resolved'})).isError).toBe(true)
   expect((await f.call('get_timeline_critique')).isError).toBe(true) // structural cache is not visual verification
   const verified=await f.call('vision_inspect',{timeline_t_us:500000,question:'Describe the changed frame'})
   expect(receipt(verified).state_version).not.toBe(receipt(seen).state_version)
   expect((await f.call('revision_control',{action:'finish_issue',status:'resolved'})).isError).not.toBe(true)
   expect((await f.call('revision_control',{action:'complete'})).isError).not.toBe(true)
   expect(body(await f.call('end_agent_session')).completion).toBe('reviewed')
   expect(body(await f.call('end_agent_session')).completion).toBe('reviewed')
   expect(f.ts.agent.snapshot().sessions).toHaveLength(1)
   expect(f.provider).not.toHaveBeenCalled()
  }finally{await f.close()}
 })
 it('allows intentional no repair after actual rendered evidence and survives reconnect without resetting budgets',async()=>{
  const f=await fixture();try{
   await f.assemble();const pending=body(await f.call('end_agent_session'))
   expect((await f.call('revision_control',{action:'conclude_no_repair',evidence_id:pending.evidence_receipt.id,reason:'State alone is insufficient'})).isError).toBe(true)
   const seen=await f.call('vision_inspect',{timeline_t_us:500000,question:'Inspect intentional inset'})
   const second=await f.connect()
   const status:any=await second.callTool({name:'revision_control',arguments:{action:'status'}})
   expect(body(status).inspection_calls).toBe(1)
   const before=reviewState(f.actor.snapshot())
   expect((await f.call('revision_control',{action:'conclude_no_repair',evidence_id:receipt(seen).id,reason:'Fake Hermes judges intentional inset appropriate'})).isError).not.toBe(true)
   expect(body(await f.call('end_agent_session')).completion).toBe('reviewed')
   expect(reviewState(f.actor.snapshot())).toBe(before)
   const url=new URL(f.host.getInfo().url);url.pathname='/mcp/evidence'
   const restored=await fetch(url,{method:'POST',headers:{Authorization:'Bearer offline-token','Content-Type':'application/json'},body:JSON.stringify({project_id:f.actor.snapshot().project_id})})
   const context:any=await restored.json()
   expect(context.background_review.review_disposition.status).toBe('considered_in_completed_review')
   expect(context.background_review.review_disposition.decision.reason).toContain('intentional inset')
  }finally{await f.close()}
 })
 it('rejects stale diagnosis after manual change; reacquisition permits a current decision',async()=>{
  const f=await fixture();try{
   const id=await f.assemble();await f.call('end_agent_session')
   const seen=await f.call('vision_inspect',{timeline_t_us:500000,question:'Current frame'})
   f.actor.mcpCall('update_layer_params',JSON.stringify({layer_id:id,patch:{kind:'VideoClip',scale_x:2}}))
   expect((await f.call('record_issue',{description:'Old observation',severity:'moderate',repairable:true,evidence_dimensions:['visual'],evidence_receipt_ids:[receipt(seen).id],layer_ids:[id]})).isError).toBe(true)
   const fresh=await f.call('vision_inspect',{timeline_t_us:500000,question:'Reacquire'})
   expect((await f.call('revision_control',{action:'conclude_no_repair',evidence_id:receipt(fresh).id,reason:'Fresh frame supports no change'})).isError).not.toBe(true)
  }finally{await f.close()}
 })
 it('does not review empty or unchanged output; unavailable inspection is reported without success',async()=>{
  const f=await fixture();try{
   expect(body(await f.call('end_agent_session')).completion).toBeUndefined()
   await f.assemble();await f.call('end_agent_session')
   const result=body(await f.call('end_agent_session',{review_unavailable_reason:'Offline sense deliberately unavailable'}))
   expect(result.completion).toBe('unreviewed');expect(f.ts.agent.snapshot().session).toBeNull()
   expect((await f.call('begin_agent_session',{reason:'New deliberate work after interrupted review'})).isError).not.toBe(true)
   expect(body(await f.call('end_agent_session')).completion).toBeUndefined()
  }finally{await f.close()}
 })
 it('unused imports and metadata-only labels do not trigger review of unchanged authored output',async()=>{
  const f=await fixture();try{
   const id=await f.assemble();await f.call('end_agent_session')
   const frame=await f.call('vision_inspect',{timeline_t_us:500000,question:'Intentional inset'})
   await f.call('revision_control',{action:'conclude_no_repair',evidence_id:receipt(frame).id,reason:'Retain intentional framing'})
   await f.call('end_agent_session')
   await f.call('begin_agent_session',{reason:'Metadata maintenance only'})
   expect(f.actor.dispatch('add_media',{id:'00000000-0000-0000-0000-000000000002',kind:'Video',duration_us:1000000}).ok).toBe(true)
   expect((await f.call('update_layer',{layer_id:id,patch:{label:'Renamed without changing pixels'}})).isError).not.toBe(true)
   expect(body(await f.call('end_agent_session')).completion).toBeUndefined()
  }finally{await f.close()}
 })
 it.skipIf(!fs.existsSync(path.join(hermesSource,'.venv/bin/python')))('actual installed Hermes native loader and registered MCP handler receive current review data without any inference',async()=>{
  const f=await fixture(),home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-native-review-'))
  try{
   await f.assemble();const pending=body(await f.call('end_agent_session'))
   const staged=stageEditorialEvidence(home,{...pending.editorial_evidence_packet,background_review:pending.background_review})
   fs.cpSync(path.resolve('../../skills/weftcut'),path.join(home,'skills/weftcut'),{recursive:true})
   const source=hermesSource
   const code=`import os,json,socket
_original_connect=socket.create_connection
def local_only(address,*a,**kw):
 assert address[0] in ('127.0.0.1','localhost'), 'external network forbidden'
 return _original_connect(address,*a,**kw)
socket.create_connection=local_only
from agent.skill_commands import build_preloaded_skills_prompt
p,n,m=build_preloaded_skills_prompt(json.loads(os.environ['OFFLINE_SKILLS']))
assert not m and 'visual_framing' in p and 'review_required' in p, (n,m,p[:400])
from tools import mcp_tool
names=mcp_tool.register_mcp_servers({'weftcut':{'url':os.environ['OFFLINE_MCP_URL'],'headers':{'Authorization':'Bearer offline-token'},'trust_tier':'trusted'}})
assert 'mcp__weftcut__get_timeline_critique' in names, names
result=mcp_tool._make_tool_handler('weftcut','get_timeline_critique',20)({})
assert 'visual_framing' in result and 'state_version' in result, result
mcp_tool.shutdown_mcp_servers()
print(json.dumps({'native_skill_preload':'PASS','native_mcp_result':'PASS','model_requests':0}))`
   const result=await promisify(execFile)(path.join(source,'.venv/bin/python'),['-c',code],{cwd:source,env:{PATH:process.env.PATH,HERMES_HOME:home,OFFLINE_SKILLS:JSON.stringify(['weftcut',staged.name]),OFFLINE_MCP_URL:f.host.getInfo().url,PYTHONDONTWRITEBYTECODE:'1'},timeout:45000})
   expect(result.stdout).toContain('"native_mcp_result": "PASS"')
  }finally{fs.rmSync(home,{recursive:true,force:true});await f.close()}
 },60000)
})
