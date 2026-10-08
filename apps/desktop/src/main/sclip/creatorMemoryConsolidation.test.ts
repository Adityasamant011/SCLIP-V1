import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, expect, it, vi } from 'vitest'
import { CreatorStyleStore } from './creatorStyle'
import { creatorAgent } from './creatorMemory.test-utils'
import { recoverCreatorMemory } from './creatorMemoryRecovery'
const dirs:string[]=[]
afterEach(()=>{vi.restoreAllMocks();dirs.splice(0).forEach(d=>fs.rmSync(d,{recursive:true,force:true}))})
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'memory-consolidation-'));dirs.push(dir);return {dir,store:new CreatorStyleStore(dir)}}
function fact(store:CreatorStyleStore,project='one'){return store.reference(project,{relationship:'own_finished',intent:'persistent',observations:[{source_t_us:0,description:'Factual synthetic observation'}]}).evidence.at(-1)!.id}
function hypothesis(e:string,text:string){return {action:'hypothesis',hypothesis:text,dimension:'editorial',evidence_ids:[e]}}
function maintain(store:CreatorStyleStore,operations:unknown[],request_id='batch'){return creatorAgent(store,'one',{action:'maintenance',request_id,operations})}
it('100 exact inferred and explicit submissions reuse canonical families; no false confirmations',()=>{
 const {store}=setup(),e=fact(store)
 for(let i=0;i<100;i++){creatorAgent(store,'one',hypothesis(e,'Same exact tentative meaning'));store.user('one',{action:'explicit',text:'Same exact creator instruction'})}
 const v=store.view('one');expect(v.preferences).toHaveLength(2);expect(v.capsules!.find(c=>c.preferenceId===v.preferences[0]!.id)!.observations).toBe(1)
 expect(v.evidence.filter(e=>e.kind==='explicit_instruction')).toHaveLength(1)
})
it('atomically consolidates Hermes-selected meanings, explicitly preserves contradictions, and honors aliases on forget',()=>{
 const {store}=setup(),a=fact(store),b=fact(store)
 creatorAgent(store,'one',hypothesis(a,'Meaning A'));creatorAgent(store,'one',hypothesis(b,'Meaning B'))
 const [p,q]=store.view('one').preferences
 creatorAgent(store,'one',{action:'counterexample',id:q!.id,evidence_ids:[b]})
 const sources=[{id:p!.id,expected_version:1},{id:q!.id,expected_version:1}]
 const op={...hypothesis(a,'Hermes merged meaning'),action:'consolidate',source_preferences:sources,reason:'Foreground Hermes considers these related',counterexample_ids:[b]}
 expect(()=>maintain(store,[{...op,counterexample_ids:[]}])).toThrow('preserve')
 maintain(store,[op]);const v=store.view('one'),merged=v.preferences[0]!
 expect(v.preferences).toHaveLength(1);expect(merged.aliases).toEqual([p!.id,q!.id]);expect(merged.counterexamples).toContain(b)
 expect(v.capsules!.map(c=>c.role).sort()).toEqual(['counterexample','support'])
 store.user('one',{action:'remove',id:merged.id})
 expect(()=>creatorAgent(store,'one',hypothesis(fact(store),'Meaning A'))).toThrow('Controlled')
 expect(()=>creatorAgent(store,'one',{...hypothesis(fact(store),'New wording'),id:p!.id,expected_version:1})).toThrow('Unknown/forgotten')
})
it('invalid member and internal failure publish nothing; repeats are idempotent; stale and foreign sources reject',()=>{
 const {store}=setup(),e=fact(store),operations=[hypothesis(e,'First'),hypothesis('missing','Second')],before=fs.readFileSync(store.file,'utf8')
 expect(()=>maintain(store,operations)).toThrow('Unknown');expect(fs.readFileSync(store.file,'utf8')).toBe(before)
 const context=store.agent('one',{action:'context'}),args={action:'maintenance',creator_id:'local',expected_revision:context.revision,request_id:'safe',operations:[hypothesis(e,'First')]}
 store.agent('one',args);const committed=fs.readFileSync(store.file,'utf8');expect((store.agent('one',args) as any).replayed).toBe(true);expect(fs.readFileSync(store.file,'utf8')).toBe(committed)
 expect(()=>store.agent('one',{...args,creator_id:'other'})).toThrow('cross-creator')
 expect(()=>store.agent('one',{...args,request_id:'stale'})).toThrow('Stale')
 vi.spyOn(fs,'renameSync').mockImplementation(()=>{throw Error('Internal simulated failure')})
 expect(()=>maintain(store,[hypothesis(e,'Different')],'failure')).toThrow('simulated');expect(fs.readFileSync(store.file,'utf8')).toBe(committed)
})
it('300 meaning revisions keep only two prior inferred versions, bounded capsules/receipts, and no retrieval reinforcement',()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No model')),{store}=setup();let id=''
 for(let i=0;i<300;i++){
  const e=fact(store),p=store.view('one').preferences.find(p=>p.id===id)
  maintain(store,[{...hypothesis(e,`Foreground meaning ${i}`),...(p?{id:p.id,expected_version:p.version}:{})}],`revision-${i}`)
  id=store.view('one').preferences[0]!.id
 }
 const v=store.view('one');expect(v.preferences).toHaveLength(1);expect(v.preferences[0]!.history).toHaveLength(2);expect(v.capsules).toHaveLength(3)
 expect(JSON.parse(fs.readFileSync(store.file,'utf8')).maintenance).toHaveLength(32)
 const before=fs.readFileSync(store.file,'utf8');for(let i=0;i<100;i++)store.agent('one',{action:'context'})
 expect(fs.readFileSync(store.file,'utf8')).toBe(before);expect(fetch).not.toHaveBeenCalled()
},30000)
it('30 series remain distinct; mismatched scope cannot consolidate or attach support',()=>{
 const {store}=setup()
 for(let i=0;i<30;i++){
  store.user('one',{action:'bind',creatorId:'local',seriesId:`series-${i}`})
  creatorAgent(store,'one',{...hypothesis(fact(store),`A genuinely different series meaning ${i}`),scope:{kind:'series'}})
 }
 const v=store.view('one');expect(v.preferences).toHaveLength(30)
 expect(store.agent('one',{action:'context'}).preferences).toHaveLength(1)
 expect(()=>maintain(store,[{...hypothesis(fact(store),'Cross-series merge'),action:'consolidate',scope:{kind:'series'},source_preferences:[{id:v.preferences[0]!.id,expected_version:1}],reason:'Incorrect cross-series reuse'}])).toThrow('differently scoped')
})
it('compact retrieval retains a project candidate and reports exactly the packet IDs; omitted creator instructions remain retrievable',()=>{
 const {store}=setup()
 for(let i=0;i<8;i++)store.user('one',{action:'explicit',text:`Unrelated global preference ${i}`})
 const e=fact(store);creatorAgent(store,'one',{...hypothesis(e,'Relevant project-specific possibility'),scope:{kind:'project'}})
 const started=performance.now(),r=store.agent('one',{action:'context'}),payload=JSON.parse(r.context.split('\n').at(-1)!)
 expect(r.preferences.map(p=>p.id)).toEqual(payload.preferences.map((p:any)=>p.id))
 expect(payload.preferences.some((p:any)=>p.scope.kind==='project')).toBe(true)
 expect(r.omitted_creator_instructions).toBeGreaterThan(0)
 const page=creatorAgent(store,'one',{action:'preferences',cursor:0}) as any
 expect(page.preferences).toHaveLength(8);expect(page.next_cursor).toBe(8)
 expect((creatorAgent(store,'one',{action:'preferences',cursor:8}) as any).preferences).toHaveLength(1)
 expect(r.context.length).toBeLessThan(4200)
 if(process.env.SCLIP_MEMORY_CONTEXT_SAMPLE)fs.writeFileSync(process.env.SCLIP_MEMORY_CONTEXT_SAMPLE,JSON.stringify({context:r.context,tool_response:r,latency_ms:performance.now()-started,bytes:Buffer.byteLength(r.context)},null,2))
})
it('explicit recovery preserves latest approved knowledge, disabled/forgotten controls, and never initializes empty',()=>{
 const {store,dir}=setup(),p=store.user('one',{action:'explicit',text:'Durable approved text'}).preferences[0]!
 const old=fs.readFileSync(store.file,'utf8')
 store.user('one',{action:'disable',id:p.id});store.user('one',{action:'explicit',text:'Later approved instruction'})
 fs.writeFileSync(store.file,'{corrupt')
 expect(()=>new CreatorStyleStore(dir)).toThrow();expect(recoverCreatorMemory(dir).committed).toBe(false);expect(fs.readFileSync(store.file,'utf8')).toBe('{corrupt')
 recoverCreatorMemory(dir,true);let reopened=new CreatorStyleStore(dir)
 expect(reopened.view('one').preferences.find(x=>x.id===p.id)!.status).toBe('disabled');expect(reopened.context('one')).toContain('Later approved instruction')
 reopened.user('one',{action:'remove',id:p.id});fs.writeFileSync(reopened.file,old)
 expect(()=>new CreatorStyleStore(dir)).toThrow('rollback');recoverCreatorMemory(dir,true);reopened=new CreatorStyleStore(dir)
 expect(reopened.view('one').preferences.some(x=>x.id===p.id)).toBe(false)
 fs.rmSync(reopened.file);expect(()=>new CreatorStyleStore(dir)).toThrow('never initialize empty')
})
it('link cannot revise approved scope/conditions; an exception remains tied to the base meaning version',()=>{
 const {store}=setup(),base=store.user('one',{action:'explicit',text:'Creator base instruction'}).preferences[0]!,e=fact(store)
 expect(()=>maintain(store,[{action:'link',id:base.id,expected_version:1,evidence_ids:[e],scope:{kind:'project'}}])).toThrow('cannot revise')
 maintain(store,[{...hypothesis(e,'Hermes contextual exception'),action:'exception',exception_to:base.id,exception_version:1,applicability:'Only when the current brief explicitly requests it'}])
 expect(store.context('one')).toContain('Hermes contextual exception')
 store.user('one',{action:'revise',id:base.id,text:'New creator meaning'})
 expect(store.context('one')).not.toContain('Hermes contextual exception')
})
it('retired family facts cannot silently become unresolved evidence or resurrect a forgotten belief',()=>{
 const {store}=setup(),a=fact(store),b=fact(store)
 creatorAgent(store,'one',hypothesis(a,'Old meaning'));const old=store.view('one').preferences[0]!
 maintain(store,[{...hypothesis(b,'Revised canonical meaning'),action:'supersede',reason:'Foreground interpretation changed',source_preferences:[{id:old.id,expected_version:1}]}])
 const fresh=store.view('one').preferences[0]!
 store.user('one',{action:'remove',id:fresh.id})
 expect(()=>creatorAgent(store,'one',hypothesis(a,'A paraphrase from retired evidence'))).toThrow('Unknown')
 expect(store.agent('one',{action:'context'}).evidence).toHaveLength(0)
})
it('100 inferred families cannot block a new explicit instruction or another creator; fact admission continues',()=>{
 const {store}=setup(),e=fact(store)
 for(let i=0;i<100;i++)creatorAgent(store,'one',hypothesis(e,`Distinct inferred candidate ${i}`))
 const before=fs.readFileSync(store.file,'utf8')
 expect(()=>creatorAgent(store,'one',hypothesis(e,'Candidate over technical capacity'))).toThrow('budget full')
 expect(fs.readFileSync(store.file,'utf8')).toBe(before)
 store.user('one',{action:'explicit',text:'New creator-owned instruction at inferred capacity'})
 expect(store.context('one')).toContain('New creator-owned instruction')
 expect(fact(store)).toBeTruthy()
 const other=store.user('two',{action:'create_creator',label:'Another creator'}).creators[1]!
 store.user('two',{action:'bind',creatorId:other.id});creatorAgent(store,'two',hypothesis(fact(store,'two'),'Other creator candidate'))
 expect(store.view('two').preferences).toHaveLength(1)
},30000)
it('100 repeated foreground consolidations bound aliases and capsules, without touching generic memory',()=>{
 const {store,dir}=setup(),generic=path.join(dir,'USER.md');fs.writeFileSync(generic,'Historic generic memory is separate and preserved.')
 let e=fact(store);creatorAgent(store,'one',hypothesis(e,'Initial inferred meaning'))
 for(let i=0;i<100;i++){
  const p=store.view('one').preferences[0]!;e=fact(store)
  maintain(store,[{...hypothesis(e,`Foreground replacement ${i}`),action:'supersede',reason:'Hermes revised its interpretation',source_preferences:[{id:p.id,expected_version:p.version}]}],`replace-${i}`)
 }
 const v=store.view('one');expect(v.preferences).toHaveLength(1);expect(v.preferences[0]!.aliases).toHaveLength(8);expect(v.capsules).toHaveLength(1)
 store.user('one',{action:'remove',id:v.preferences[0]!.id})
 expect(fs.readFileSync(generic,'utf8')).toBe('Historic generic memory is separate and preserved.')
},30000)
