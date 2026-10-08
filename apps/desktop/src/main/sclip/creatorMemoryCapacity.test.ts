import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, expect, it, vi } from 'vitest'
import { CreatorStyleStore } from './creatorStyle'
import { creatorAgent } from './creatorMemory.test-utils'
import { createActor } from '../state/actor'
import { seededGen } from '../state/ids'
import { blankProject } from '../state/model'
const dirs:string[]=[]
afterEach(()=>{vi.restoreAllMocks();dirs.splice(0).forEach(d=>fs.rmSync(d,{recursive:true,force:true}))})
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'memory-capacity-'));dirs.push(dir);return {dir,store:new CreatorStyleStore(dir)}}
function actorFor(store:CreatorStyleStore,seed:number){
 const idGen=seededGen(seed), actor=createActor({initial:blankProject(idGen,'Synthetic stress'),idGen})
 actor.dispatchAs({kind:'Agent',client:'offline'},'add_caption_track',{cues:[{start_us:0,end_us:1_000_000,text:'Synthetic'}],comp_w:1920,comp_h:1080,label:null})
 const layer=Object.values(actor.snapshot().compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers))[0]!.id
 let before=actor.snapshot();actor.subscribe(e=>{try{store.observe(e,before)}finally{before=e.new_snapshot}})
 return {actor,layer,project:before.project_id}
}
it('10,000 actual commits across 100 projects remain editable and admit fresh evidence after saturation',()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('Inference forbidden'))
 const {store,dir}=setup(),start=performance.now(),samples:unknown[]=[]
 const other=store.user('other',{action:'create_creator',label:'Other'}).creators[1]!
 store.user('other',{action:'bind',creatorId:other.id});store.user('other',{action:'explicit',text:'Other creator instruction'})
 for(let p=0;p<100;p++){
  const {actor,layer}=actorFor(store,10000+p*100000)
  for(let i=0;i<100;i++)expect(actor.dispatch('update_layer_params',{layer,patch:i%2?{kind:'Text',content:`Synthetic ${i}`}:{kind:'Text',opacity:0.2+i/200}}).ok).toBe(true)
  if([0,9,49,99].includes(p))samples.push({projects:p+1,bytes:fs.statSync(store.file).size,elapsed_ms:performance.now()-start})
 }
 const v=new CreatorStyleStore(dir).view('next')
 expect(v.evidence).toHaveLength(600);expect(v.preferences).toHaveLength(0)
 expect(v.retention).toMatchObject({admittedObservations:10000,groupedOperations:0,evictedObservations:9400,evictedOperations:9400,compactedObservations:0})
 expect(v.evidence.at(-1)!.projectId).toBeTruthy()
 expect(store.view('other').preferences[0]!.hypothesis).toBe('Other creator instruction')
 store.user('next',{action:'explicit',text:'A new explicit instruction at capacity'})
 expect(store.context('future')).toContain('new explicit instruction')
 expect(fs.statSync(store.file).size).toBeLessThan(2_500_000);expect(fetch).not.toHaveBeenCalled()
 if(process.env.SCLIP_MEMORY_STRESS_METRICS)fs.writeFileSync(process.env.SCLIP_MEMORY_STRESS_METRICS,JSON.stringify({operations:10000,projects:100,retained:v.evidence.length,stats:v.retention,bytes:fs.statSync(store.file).size,runtime_ms:performance.now()-start,samples,inference_calls:0},null,2))
},1800000)
it('repeated adjustments are one observation and storage failure cannot undo a timeline commit',()=>{
 const {store}=setup(),{actor,layer,project}=actorFor(store,20000)
 for(let i=0;i<1000;i++)expect(actor.dispatch('update_layer_params',{layer,patch:{kind:'Text',font_size_px:30+i%80}}).ok).toBe(true)
 const v=store.view(project);expect(v.evidence).toHaveLength(1);expect(v.retention).toMatchObject({admittedObservations:1,groupedOperations:999})
 expect(actor.historyView(1000).len).toBe(200)
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
 vi.spyOn(fs,'renameSync').mockImplementation(()=>{throw Error('Simulated storage failure')})
 expect(actor.dispatch('update_layer_params',{layer,patch:{kind:'Text',opacity:0.99}}).ok).toBe(true)
 expect(store.view(project).captureWarning).toContain('storage failure');expect(warn).toHaveBeenCalled()
})
it('recurring evidence and counterexamples preserve bounded distinct factual provenance without certainty promotion',()=>{
 const {store}=setup();let id=''
 for(let i=0;i<100;i++){
  const project=`project-${i}`,v=store.reference(project,{relationship:'own_finished',intent:'persistent',observations:[{source_t_us:0,description:'A factual observation'}]})
  creatorAgent(store,project,{action:'hypothesis',...(id?{id}:{}),hypothesis:'A foreground-authored tentative interpretation',dimension:'editorial',evidence_ids:[v.evidence.at(-1)!.id]})
  id=store.view(project).preferences[0]!.id
 }
 const v=store.view('next'),p=v.preferences[0]!,c=v.capsules![0]!
 expect(p.support).toHaveLength(3);expect(c.observations).toBe(100);expect(c.projects).toHaveLength(100);expect(c.omittedSamples).toBe(97);expect(p.confidence).toBe('tentative')
 creatorAgent(store,'next',{action:'counterexample',id,evidence_ids:[v.evidence.at(-1)!.id]})
 expect(store.view('next').capsules!.find(c=>c.role==='counterexample')!.observations).toBe(1)
 for(let i=0;i<700;i++)store.reference(`project-${i%100}`,{relationship:'external_inspiration',intent:'persistent',observations:[]})
 const final=store.view('next')
 expect(final.retention!.compactedObservations).toBe(100)
 if(process.env.SCLIP_MEMORY_CAPSULE_METRICS)fs.writeFileSync(process.env.SCLIP_MEMORY_CAPSULE_METRICS,JSON.stringify({preferences:final.preferences.length,capsules:final.capsules!.map(c=>({role:c.role,observations:c.observations,operations:c.operations,projects:c.projects.length,samples:c.samples.length,omitted_samples:c.omittedSamples})),retention:final.retention,bytes:fs.statSync(store.file).size},null,2))
 expect(creatorAgent(store,'next',{action:'evidence',id:p.support[0]}).evidence[0]!.id).toBe(p.support[0])
},30000)
