import { creatorAgent } from './creatorMemory.test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createTsActorHost } from '../state/ts-actor-host'
import { CreatorStyleStore } from './creatorStyle'
import { assertForegroundHermesConfiguration, writeHermesProfile } from './hermesRuntime'

const cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).forEach(fn=>fn());vi.restoreAllMocks()})
function setup(store?: CreatorStyleStore) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creator-manual-')),memory=store ?? new CreatorStyleStore(dir)
  const files: Record<string,string>={}
  const host=createTsActorHost({send:()=>{},mcpNotify:()=>{},fileExists:()=>true,
    fs:{exists:p=>p in files,readFile:p=>files[p]!,writeFile:(p,s)=>{files[p]=s},mkdirp:()=>{},copyFile:(a,b)=>{files[b]=files[a]!},readdir:()=>[],rm:p=>{delete files[p]}},join:path.join,
    napi:{commitWorkspace:async()=>{},pushRecent:()=>{},setLastNewProjectParent:()=>{},enqueueJobsForMedia:async()=>{}},
    compute:{probeMedia:async()=> '{}',hashMediaSource:async()=> 'synthetic',parseSubtitles:async()=> '{}',synthesizeSpeechCompute:async()=> '{}'},
    enqueueWorkspaceCopy:async()=>{},readFile:p=>files[p]!,workspaceDir:()=>null,
    onProjectChange:(e,before)=>memory.observe(e,before)})
  host.start();cleanups.push(()=>{host.stop();fs.rmSync(dir,{recursive:true,force:true})})
  return {host,memory,dir,project:host.actor.snapshot().project_id}
}
function proposal(s:ReturnType<typeof setup>) {
  const made=s.host.mcpCall('add_text_layer',JSON.stringify({content:'Synthetic caption proposal',t_start_us:0,duration_us:2_000_000,font_size_px:76}))
  expect(made.ok).toBe(true)
  return Object.values(s.host.actor.snapshot().compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers)).find(l=>l.params.kind==='Text')!.id
}
const size=(s:ReturnType<typeof setup>,id:string,n:number)=>s.host.handleInvoke('update_layer_params',{layerId:id,patch:{kind:'Text',font_size_px:n}})

it('observes the real renderer IPC → host → User actor path without any Hermes conversation',async()=>{
  const s=setup(),id=proposal(s);expect(s.memory.view(s.project).evidence).toHaveLength(0)
  await size(s,id,54)
  const e=s.memory.view(s.project).evidence[0]!
  expect(e).toMatchObject({kind:'correction',authority:'ProjectActor',projectId:s.project})
  expect(e.data).toMatchObject({actor:{kind:'User'},relationship:'ai_proposal_correction',operationCount:1})
  const d=(e.data.deltas as any[])[0]
  expect(d.proposalOpId).toBeTruthy();expect(d.properties).toContain('params.font.size_px')
  expect(JSON.parse(d.before).params.font.size_px).toBe(76);expect(JSON.parse(d.after).params.font.size_px).toBe(54)
})

it('groups adjacent committed adjustments without time heuristics or extra preference confirmations',async()=>{
  const s=setup(),id=proposal(s)
  for(const n of [70,60,54]) await size(s,id,n)
  const v=s.memory.view(s.project),e=v.evidence[0]!,d=(e.data.deltas as any[])[0]
  expect(v.evidence).toHaveLength(1);expect(v.preferences).toHaveLength(0)
  expect(e.data.operationCount).toBe(3);expect(e.data.operationIds).toHaveLength(3)
  expect(e.data.relationship).toBe('ai_proposal_correction');expect(d.proposalOpId).toBeTruthy()
  expect(JSON.parse(d.before).params.font.size_px).toBe(76);expect(JSON.parse(d.after).params.font.size_px).toBe(54)
  expect(s.host.actor.historyView(100).ops.filter(o=>o.actor.kind==='User')).toHaveLength(4) // initial + three actual commits; history is untouched
})

it('captures independent manual edits, lane changes and layering without inventing AI rejection',async()=>{
  const s=setup()
  const id=await s.host.handleInvoke('add_text_layer',{content:'Manual caption',tStartUs:0,durationUs:2_000_000,fontSizePx:54}) as string
  const track=Object.values(s.host.actor.snapshot().compositions).flatMap(c=>c.tracks).find(t=>t.layers.some(l=>l.id===id))!.id
  expect(s.memory.view(s.project).evidence[0]).toMatchObject({kind:'manual_edit'})
  expect(s.memory.view(s.project).evidence[0]!.data.relationship).toBe('independent_manual_edit')
  const other=await s.host.handleInvoke('add_track',{}) as string
  await s.host.handleInvoke('move_layer',{layerId:id,newTrackId:other,newTStartUs:0})
  const delta=(s.memory.view(s.project).evidence.at(-1)!.data.deltas as any[])[0]
  expect(delta.properties).toContain('trackId');expect(delta.proposalOpId).toBeNull()
  expect(JSON.parse(delta.before).trackId).toBe(track)
})

it('retains two independent projects and retrieves supported tentative history in a third after restart',async()=>{
  const a=setup(),id=proposal(a);await size(a,id,54)
  const first=a.memory.view(a.project).evidence[0]!
  creatorAgent(a.memory,a.project,{action:'hypothesis',hypothesis:'Possibly prefers smaller captions when readable',dimension:'caption',evidence_ids:[first.id]})
  const pref=a.memory.view(a.project).preferences[0]!
  const b=setup(new CreatorStyleStore(a.dir)),bid=proposal(b);await size(b,bid,55)
  const second=b.memory.view(b.project).evidence.at(-1)!
  creatorAgent(b.memory,b.project,{action:'hypothesis',id:pref.id,hypothesis:pref.hypothesis,dimension:'caption',evidence_ids:[second.id]})
  const reopened=new CreatorStyleStore(a.dir)
  expect(reopened.view('third').preferences[0]).toMatchObject({confidence:'tentative',status:'candidate',support:[first.id,second.id]})
  expect(reopened.context('third')).toContain('Possibly prefers smaller captions')
})

it('undo/redo breaks adjustment grouping and never approves an experimental preference',async()=>{
  const s=setup(),id=proposal(s);await size(s,id,54)
  await s.host.handleInvoke('project_undo',{});await s.host.handleInvoke('project_redo',{})
  await size(s,id,53)
  const v=s.memory.view(s.project)
  expect(v.evidence.some(e=>e.kind==='undo')).toBe(true);expect(v.preferences).toHaveLength(0)
  expect(v.evidence.filter(e=>e.kind!=='undo')).toHaveLength(2)
})

it('never groups across referenced evidence, a different property, creator, or intervening AI state',async()=>{
  const s=setup(),id=proposal(s);await size(s,id,54)
  const e=s.memory.view(s.project).evidence[0]!
  creatorAgent(s.memory,s.project,{action:'hypothesis',hypothesis:'Maybe smaller text',dimension:'text',evidence_ids:[e.id]})
  await size(s,id,53)
  expect(s.memory.view(s.project).evidence).toHaveLength(2)
  expect(JSON.parse((s.memory.view(s.project).evidence[0]!.data.deltas as any[])[0].after).params.font.size_px).toBe(54)
})

it('bounds 1,000 committed adjustments locally with zero model requests and unchanged undo semantics',async()=>{
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw Error('Cloud access forbidden')})
  const s=setup(),id=proposal(s),start=performance.now()
  const samples: Array<{adjustments:number;context:string;storage_bytes:number}> = []
  for(let n=0;n<1000;n++) {
    await size(s,id,30+n%80)
    if([10,100,1000].includes(n+1)) samples.push({adjustments:n+1,context:s.memory.context('next'),storage_bytes:fs.statSync(s.memory.file).size})
  }
  const view=s.memory.view(s.project),context=s.memory.context('next'),elapsed=performance.now()-start
  expect(fetch).not.toHaveBeenCalled();expect(view.evidence).toHaveLength(1)
  expect(view.evidence[0]!.data.operationCount).toBe(1000);expect(view.evidence[0]!.data.operationIds).toHaveLength(8)
  expect(view.preferences).toHaveLength(0);expect(context.length).toBeLessThan(4500)
  expect(fs.statSync(s.memory.file).size).toBeLessThan(20_000)
  expect(s.host.actor.historyView(1000).len).toBe(200)
  const metrics={committed_adjustments:1000,model_requests:fetch.mock.calls.length,observation_records:view.evidence.length,context_characters:context.length,storage_bytes:fs.statSync(s.memory.file).size,runtime_ms:elapsed,samples}
  if(process.env.SCLIP_CREATOR_METRICS_PATH) fs.writeFileSync(process.env.SCLIP_CREATOR_METRICS_PATH,JSON.stringify(metrics,null,2))
})

it('fails closed on explicit or malformed automatic model-review settings without changing them',()=>{
  const s=setup();writeHermesProfile(s.dir,0)
  expect(()=>assertForegroundHermesConfiguration(s.dir)).not.toThrow()
  fs.writeFileSync(path.join(s.dir,'config.yaml'),'auxiliary:\n  background_review:\n    enabled: true\n')
  expect(()=>assertForegroundHermesConfiguration(s.dir)).toThrow('must be disabled')
  expect(fs.readFileSync(path.join(s.dir,'config.yaml'),'utf8')).toContain('enabled: true')
})
