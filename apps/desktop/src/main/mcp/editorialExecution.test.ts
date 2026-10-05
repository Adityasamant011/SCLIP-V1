import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {startMcpHost} from './index'
import {startAutonomousReview} from '../sclip/autonomousReview'
import {createHash} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import Ajv from 'ajv'
import {registeredMcpTools,RENDERED_AUDIO_TOOL,TEMPORAL_WINDOW_TOOL,handleCallTool} from './server'
import {mcpDef} from '../state/mcp-commands'
import {freshActor,aRollId} from '../state/__tests__/pbt/harness'
import {RevisionLoopGuard} from '../sclip/revisionLoopGuard'
import {reviewState} from '../sclip/evidenceCoordinates'
import {toolDimensions,evidenceCoverage} from '../sclip/evidenceModalities'
vi.mock('electron',()=>({app:{isPackaged:true}}))
vi.mock('./auth',()=>({loadOrInitAuth:()=>({token:'synthetic-execution-token',port:0}),saveAuth:()=>{},rotateToken:(a:unknown)=>a}))
const backend={mcpCatalog:async()=>'{"tools":[],"resources":[]}'} as any
function fixture(){const actor=freshActor();actor.mcpCall('add_color_layer',JSON.stringify({track_id:aRollId(actor),color:{r:2,g:3,b:4,a:255},t_start_us:0,t_end_us:20000000}));return {actor,host:{actor,mcpCall:(n:string,a:string)=>actor.mcpCall(n,a)} as any}}
describe('Phase 4B MCP schemas and revision agency',()=>{
 it('registers tightening and read-only evidence tools with conforming schemas',async()=>{
  const names=(await registeredMcpTools(backend)).map(t=>t.name);expect(names).toEqual(expect.arrayContaining(['ripple_cut_range','inspect_rendered_audio','inspect_timeline_temporal_window']))
  const ajv=new Ajv({strict:false});for(const tool of [RENDERED_AUDIO_TOOL,TEMPORAL_WINDOW_TOOL,mcpDef('ripple_cut_range')]){
    const validate=ajv.compile(tool.inputSchema);expect(validate({start_us:0,end_us:1000000,...(tool.name==='ripple_cut_range'?{layer_ids:['synthetic-layer'],expected_state_version:'current'}:{})})).toBe(true)
    expect(validate({start_us:'source time',end_us:1000000})).toBe(false);expect(validate({start_us:0,end_us:1000000,creative_recommendation:'x'})).toBe(false)
  }
 })
 it('routes bad coordinates to rejection before any expensive evidence work',async()=>{const f=fixture(),compute=vi.fn();const r:any=await handleCallTool({...backend,mcpCallTool:compute},()=>f.host,'inspect_rendered_audio',{start_us:0,end_us:200000000});expect(r.isError).toBe(true);expect(compute).not.toHaveBeenCalled()})
 it('exposes clean critique as limited diagnostic scope, not editorial readiness',async()=>{const f=fixture(),r:any=await handleCallTool(backend,()=>f.host,'get_timeline_critique',{});const data=JSON.parse(r.content[0].text);expect(data.status).toBe('clean');expect(data.availability).toBe('not_generated');expect(data.scope).toContain('no editorial readiness verdict')})
 for(const choice of ['one','two'])it(`permits different Hermes-selected issues/repairs and requires fresh relevant modalities (${choice})`,()=>{
  const f=fixture(),g=new RevisionLoopGuard(true),before=reviewState(f.actor.snapshot()),id=f.actor.snapshot().compositions[f.actor.snapshot().root_id].tracks[0].layers[0].id
  const evidence=g.recordEvidence('inspect_rendered_audio','timeline',[0,10000000],before,['audio','speech'])
  const issue=g.recordIssue({description:`Hermes chooses observable concern ${choice}`,severity:'moderate',repairable:true,evidence_dimensions:['audio','speech'],evidence_receipt_ids:[evidence.id],layer_ids:[id]},before,20000000,new Map([[id,[0,20000000]]]))
  g.selectIssue(issue.issue.id,before);g.checkpointCreated();expect(g.beforeMutation(before)).toBeNull()
  const end=choice==='one'?15000000:18000000;expect(f.actor.mcpCall('trim_layer',JSON.stringify({layer_id:id,edge:'out',new_t_us:end})).ok).toBe(true)
  const after=reviewState(f.actor.snapshot());g.mutationCommitted(after);expect(g.status.verification_pending).toBe(true)
  expect(g.beforeInspection('inspect_rendered_audio',{start_us:0,end_us:end})).toBeNull()
  g.recordEvidence('inspect_rendered_audio','timeline',[0,end],before,['audio','speech']);expect(g.status.verification_pending).toBe(true)
  g.recordEvidence('inspect_timeline_temporal_window','timeline',[0,end],after,['visual']);expect(g.status.verification_pending).toBe(true)
  const data={observed_dimensions:['audio','speech'],signal:{duration_us:end},transcript:{status:'available'}}
  g.recordEvidence('inspect_rendered_audio','timeline',[0,end],after,toolDimensions('inspect_rendered_audio',data),undefined,evidenceCoverage('inspect_rendered_audio',data,[0,end]));expect(g.status.verification_pending).toBe(false)
  expect(g.finishIssue('resolved',after).outcomes[issue.issue.id]).toBe('resolved')
 })
 it('permits a justified no-repair decision and never demands a mutation',()=>{const f=fixture(),state=reviewState(f.actor.snapshot()),g=new RevisionLoopGuard(true);const r=g.recordEvidence('get_timeline_context','timeline',[0,20000000],state,['timeline']);expect(()=>g.concludeNoRepair('Hermes judges no justified change',r.id,state)).not.toThrow();expect(f.actor.snapshot()).toBe(f.actor.snapshot());expect(g.status.verification_pending).toBe(false)})
 it('executes range cutting over the real MCP review session and attaches fresh verification receipts',async()=>{
  const f=fixture(),host=await startMcpHost(backend,{getTsHost:()=>f.host}),clients:Client[]=[]
  try{
    const start=await startAutonomousReview(host.getInfo(),f.actor.snapshot().project_id)
    const client=new Client({name:'synthetic-execution',version:'1'},{});clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(start.url),{requestInit:{headers:{Authorization:`Bearer ${host.getInfo().bearer_token}`}}}))
    const call=(name:string,args:Record<string,unknown>={})=>client.callTool({name,arguments:args}) as Promise<any>
    const id=f.actor.snapshot().compositions[f.actor.snapshot().root_id].tracks[0].layers[0].id
    const context=await call('get_timeline_context'),receipt=context.content.map((c:any)=>{try{return JSON.parse(c.text)}catch{return {}}}).find((v:any)=>v.evidence_receipt).evidence_receipt
    const issue=await call('record_issue',{description:'Hermes chooses a localized change relative to synthetic brief',severity:'moderate',repairable:true,evidence_dimensions:['timeline'],evidence_receipt_ids:[receipt.id],layer_ids:[id]})
    const issueId=JSON.parse(issue.content[0].text).issue.id
    await call('revision_control',{action:'select_issue',issue_id:issueId});await call('checkpoint',{label:'Hermes-selected checkpoint'})
    const version=createHash('sha256').update(reviewState(f.actor.snapshot())).digest('hex')
    const result=await call('ripple_cut_range',{layer_ids:[id],start_us:2000000,end_us:4000000,expected_state_version:version})
    expect(result.isError).not.toBe(true);expect(JSON.parse(result.content[0].text).downstream_shift_us).toBe(-2000000)
    expect((await call('revision_control',{action:'finish_issue',status:'resolved'})).isError).toBe(true)
    await call('get_timeline_context',{start_us:0,end_us:18000000})
    expect((await call('revision_control',{action:'finish_issue',status:'resolved'})).isError).not.toBe(true)
  }finally{for(const c of clients)await c.close();await host.close()}
 })
 it('audio without recognition does not verify speech; shortened decoded ranges do not claim full coverage',()=>{const data={observed_dimensions:['audio'],signal:{duration_us:1000000}};expect(toolDimensions('inspect_rendered_audio',data)).toEqual(['audio']);expect(evidenceCoverage('inspect_rendered_audio',data,[4000000,6000000])).toEqual({audio:[[4000000,5000000]]})})
})
