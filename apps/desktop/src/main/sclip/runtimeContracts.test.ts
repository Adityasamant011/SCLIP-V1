import { it,expect,vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RuntimeScheduler,runtimeScope } from './runtimeScheduler'
import { RuntimeTrace } from './runtimeTrace'
import { EvidenceStore } from './evidenceStore'
import { mergeRuntimeContract } from './runtimeContract'
import { blankProject } from '../state/model'
import { seededGen } from '../state/ids'
import { mediaItemTemplate,imageOverlayParams } from '../state/mutations/media'
import { AssetJobs } from './assetJobs'

const deferred=<T>()=>{let resolve!:(x:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
it('serializes model work, overlaps independent resources and retains an active lease until the worker settles',async()=>{
 const s=new RuntimeScheduler(),first=deferred<void>(),started:string[]=[]
 const a=s.run('vision',['local_model'],async()=>{started.push('vision');await first.promise})
 const b=s.run('image',['local_model'],async()=>{started.push('image')})
 const c=s.run('search',['network'],async()=>{started.push('search')})
 await c;expect(started).toEqual(['vision','search']);expect(s.snapshot().queued).toHaveLength(1)
 first.resolve();await Promise.all([a,b]);expect(started).toEqual(['vision','search','image'])
})
it('preempts optional background work but waits for physical settlement before foreground admission',async()=>{
 const s=new RuntimeScheduler(),physical=deferred<void>(),started:string[]=[]
 let signal:AbortSignal|undefined
 const bg=s.run('observer',['local_model'],async sig=>{signal=sig;await physical.promise},{priority:0}).catch(e=>e)
 const fg=s.run('foreground',['local_model'],async()=>{started.push('foreground')})
 expect(signal?.aborted).toBe(true);expect(started).toEqual([])
 physical.resolve();await Promise.all([bg,fg]);expect(started).toEqual(['foreground'])
})
it('coalesces equivalent preparation while one caller cancellation does not cancel another owner of that work',async()=>{
 const s=new RuntimeScheduler(),physical=deferred<number>(),a=new AbortController(),b=new AbortController(),work=vi.fn(async()=>physical.promise)
 const one=s.run('source',[],work,{signal:a.signal,coalesce_key:'same',turn_id:'turn'}).catch(e=>e)
 const two=s.run('source',[],work,{signal:b.signal,coalesce_key:'same',turn_id:'turn'})
 a.abort();physical.resolve(7);expect(await two).toBe(7);await one;expect(work).toHaveBeenCalledOnce()
})
it('shutdown cancels queued ownership and prevents workers restarting',async()=>{
 const s=new RuntimeScheduler(),physical=deferred<void>()
 const a=s.run('active',['local_model'],async()=>physical.promise).catch(e=>e)
 const b=s.run('queued',['local_model'],async()=>{throw Error('must not run')}).catch(e=>e)
 s.close();physical.resolve();await Promise.all([a,b]);await expect(s.run('new',[],async()=>{})).rejects.toThrow('shutting down')
})
it('reuses only unchanged range dependencies and invalidates actual source and canvas changes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-evidence-deps-'))
 try {
  const gen=seededGen(),p=blankProject(gen,'fixture'),c=p.compositions[p.root_id],media=mediaItemTemplate(gen(),'Image',null,false)
  media.path_abs=path.join(dir,'image');fs.writeFileSync(media.path_abs,'synthetic bytes');p.media_pool[media.id]=media;c.duration_us=4e6
  c.tracks[0].layers=[{id:gen(),label:null,enabled:true,locked:false,metadata:{},effects:[],t_start_us:0,t_end_us:2e6,params:imageOverlayParams(media.id)}]
  const store=new EvidenceStore(),result={frame_observations:[{timeline_t_us:1e6,inference_ok:true}]}
  runtimeScope.run({opening:'one'},()=>{
   store.put(p,0,2e6,'visual',{model:'fixture'},result)
   const hit=store.get<any>(p,0,2e6,'visual',{model:'fixture'});expect(hit.evidence_reuse.validated_against_current_dependencies).toBe(true)
   c.tracks.push({...structuredClone(c.tracks[0]),id:gen(),layers:[]});expect(store.get(p,0,2e6,'visual',{model:'fixture'})).toBeDefined()
   c.background={r:1,g:2,b:3,a:255};expect(store.get(p,0,2e6,'visual',{model:'fixture'})).toBeUndefined()
  })
  runtimeScope.run({opening:'another'},()=>expect(store.get(p,0,2e6,'visual',{model:'fixture'})).toBeUndefined())
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
it('bounds local diagnostic metadata and never serializes prompts or credentials',()=>{
 const trace=new RuntimeTrace(undefined,2)
 trace.record('test',{turn_id:'turn',duration_ms:2,...({prompt:'private',authorization:'secret'} as object)})
 expect(JSON.stringify(trace.snapshot())).not.toMatch(/private|secret/)
 trace.record('two',{});trace.record('three',{});expect(trace.snapshot().retained_events).toBe(2)
})
it('updates its own prompt block idempotently while preserving the creator system instructions',()=>{
 const one=mergeRuntimeContract('A deliberate creator instruction')
 expect(mergeRuntimeContract(one)).toBe(one);expect(one).toContain('A deliberate creator instruction')
})
it('binds prepared asset results to the accepted native turn and cancels owned work on lease expiry',async()=>{
 const jobs=new AssetJobs(),expired=new AbortController(),physical=deferred<number>()
 const acquire=()=>Object.assign(()=>expired.signal.throwIfAborted(),{signal:expired.signal,release:vi.fn()})
 await runtimeScope.run({opening:'one',session_id:'session',turn_id:'turn'},async()=>{
  const j=jobs.submit('generate_image',acquire,async()=>physical.promise)
  expect(jobs.pending('one')).toBe(true)
  expired.abort();physical.resolve(3)
  const result=await jobs.read(j.id,'await',100);expect(result.state).toBe('cancelled');expect(result.result).toBeUndefined()
  await runtimeScope.run({opening:'one',session_id:'session',turn_id:'next'},async()=>{await expect(jobs.read(j.id,'status')).rejects.toThrow('expired')})
 })
})

it('keeps resumable review acquisition owned and incomplete until its actual work settles',async()=>{
 const jobs=new AssetJobs(['inspect_audio_visual_alignment']),physical=deferred<number>(),ctrl=new AbortController()
 const acquire=()=>Object.assign(()=>ctrl.signal.throwIfAborted(),{signal:ctrl.signal,release:vi.fn()})
 await runtimeScope.run({opening:'p',session_id:'s',turn_id:'t'},async()=>{
  const job=jobs.submit('inspect_audio_visual_alignment',acquire,async()=>physical.promise)
  expect((await jobs.read(job.id,'status')).state).toBe('running');expect(jobs.pending('p')).toBe(true)
  physical.resolve(42);const result=await jobs.read(job.id,'await',100)
  expect(result.state).toBe('completed');expect(result.result).toBe(42);expect(result.completion_evidence).toBe(false)
 })
})

it('native text envelopes preserve receipts once and classify the primary error independently of review boilerplate',async()=>{
 const {runtimeRequest}=await import('./runtimeRequest')
 const r:any=await runtimeRequest('synthetic',{}, {},undefined,async()=>({isError:true,content:[{type:'text',text:'decoder timed out'},{type:'text',text:'review status inspection budget'}]}))
 expect(r.isError).toBe(true);expect(r.structuredContent.contract).toBe('sclip.tool.v2');expect(r.structuredContent.ok).toBe(false)
 expect(r.structuredContent.error.at(-1).execution_failure.category).toBe('provider_or_worker')
 const pixels:any=await runtimeRequest('pixels',{}, {},undefined,async()=>({content:[{type:'image',data:'AQ==',mimeType:'image/png'}]}))
 expect(pixels.structuredContent).toBeUndefined();expect(pixels.content[0].type).toBe('image')
})
