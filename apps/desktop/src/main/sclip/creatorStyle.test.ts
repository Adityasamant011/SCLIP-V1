import { creatorAgent } from './creatorMemory.test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CreatorStyleStore } from './creatorStyle'
import { createActor } from '../state/actor'
import { seededGen } from '../state/ids'
import { blankProject } from '../state/model'
import { stageEditorialEvidence } from './autonomousReview'
const temporary: string[] = []
const setup = () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-learning-')); temporary.push(directory); return { directory, store: new CreatorStyleStore(directory) } }
afterEach(() => temporary.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })))
function correction(store: CreatorStyleStore, seed: number) {
  const idGen = seededGen(seed), actor = createActor({ initial: blankProject(idGen, 'synthetic'), idGen })
  let before = actor.snapshot()
  actor.subscribe(change => { store.observe(change, before); before = change.new_snapshot })
  expect(actor.dispatchAs({kind:'Agent', client:'synthetic'}, 'add_caption_track', { cues: [{start_us:0,end_us:1_000_000,text:'Synthetic words'}], comp_w:1920,comp_h:1080,label:'Captions' }).ok).toBe(true)
  expect(store.view(actor.snapshot().project_id).evidence).toHaveLength(seed === 100 ? 0 : 1)
  expect(actor.dispatch('restyle_captions', { patch: { font_size_px: 64 } }).ok).toBe(true)
  return actor
}
describe('Creator learning foundation and complete offline path', () => {
  it('persists explicit preferences across store/app reopen, project and actual staged Hermes context', () => {
    const {store,directory} = setup()
    store.user('one', {action:'explicit',text:'Avoid flashy transitions. Prefer direct edits.'})
    const reopened = new CreatorStyleStore(directory)
    const nextContext = reopened.context('two')
    expect(nextContext).toContain('Prefer direct edits')
    const staged = stageEditorialEvidence(directory, { identity:{state_version:'new-project'} }, nextContext)
    const bytes = fs.readFileSync(path.join(directory,'skills',staged.name,'SKILL.md'),'utf8')
    expect(bytes).toContain('CURRENT USER REQUEST takes priority')
    expect(bytes).toContain('Prefer direct edits')
    expect(reopened.view('two').preferences).toHaveLength(1)
    staged.cleanup()
  })
  it('isolates creator memory and native homes without copying generic memories', () => {
    const {store,directory} = setup()
    const a = store.user('one',{action:'explicit',text:'Energetic captions'})
    const b = store.user('one',{action:'create_creator',label:'Creator B'}).creators[1]!
    store.user('two',{action:'bind',creatorId:b.id})
    store.user('two',{action:'explicit',text:'Minimal text'})
    expect(store.context('two')).not.toContain('Energetic captions')
    expect(store.context('one')).not.toContain('Minimal text')
    expect(store.home(directory,'one')).not.toBe(store.home(directory,'two'))
    expect(() => creatorAgent(store,'two',{action:'hypothesis',hypothesis:'Something',dimension:'text',evidence_ids:[a.evidence[0]!.id]})).toThrow('cross-creator')
  })
  it('captures actual Agent → human correction provenance, persists it, and strengthens Hermes-authored hypotheses across projects', () => {
    const {store,directory} = setup()
    const actor = correction(store,100), projectId = actor.snapshot().project_id
    const first = store.view(projectId).evidence[0]!
    expect(first.authority).toBe('ProjectActor')
    expect((first.data.deltas as any[])[0].proposalOpId).toBeTruthy()
    expect(first.data.intention).toContain('unknown')
    creatorAgent(store,projectId,{action:'hypothesis',hypothesis:'Possibly prefers this caption treatment',dimension:'typography',evidence_ids:[first.id]})
    const preference = store.view(projectId).preferences[0]!
    expect(preference.status).toBe('candidate'); expect(preference.confidence).toBe('tentative')
    const reopened = new CreatorStyleStore(directory), secondActor = correction(reopened,1000)
    const second = reopened.view(secondActor.snapshot().project_id).evidence.at(-1)!
    creatorAgent(reopened,secondActor.snapshot().project_id,{action:'hypothesis',id:preference.id,hypothesis:preference.hypothesis,dimension:'typography',evidence_ids:[second.id]})
    expect(reopened.view('third').preferences[0]).toMatchObject({confidence:'tentative',status:'candidate',support:[first.id,second.id]})
    expect(reopened.context('third')).toContain(preference.hypothesis)
    expect(reopened.view('third').preferences[0]!.status).not.toBe('active')
  })
  it('retains unknown attribution for loaded edits and excludes load/save state from feedback', () => {
    const {store} = setup(), idGen = seededGen(5000), actor = createActor({initial:blankProject(idGen,'loaded'),idGen})
    actor.dispatch('add_caption_track',{cues:[{start_us:0,end_us:1_000_000,text:'Sample'}],comp_w:1920,comp_h:1080,label:null})
    let before = actor.snapshot(); actor.subscribe(c => {store.observe(c,before);before=c.new_snapshot})
    actor.replaceState(structuredClone(before))
    expect(store.view(before.project_id).evidence).toHaveLength(0)
    actor.dispatch('restyle_captions',{patch:{font_size_px:60}})
    expect((store.view(before.project_id).evidence[0]!.data.deltas as any[])[0].proposalOpId).toBeNull()
  })
  it('ambiguous undo is observable but never automatically a permanent preference; counterexamples dispute hypotheses', () => {
    const {store} = setup(), actor = correction(store,100), projectId = actor.snapshot().project_id
    actor.dispatch('undo',{})
    const undo = store.view(projectId).evidence.at(-1)!
    expect(undo.kind).toBe('undo'); expect(store.view(projectId).preferences).toHaveLength(0)
    creatorAgent(store,projectId,{action:'hypothesis',hypothesis:'Possibly experimental',dimension:'rhythm',evidence_ids:[undo.id]})
    const p = store.view(projectId).preferences[0]!
    expect(p).toMatchObject({confidence:'tentative',status:'candidate'})
    creatorAgent(store,projectId,{action:'counterexample',id:p.id,evidence_ids:[undo.id]})
    expect(store.view(projectId).preferences[0]).toMatchObject({status:'disputed',counterexamples:[undo.id]})
  })
  it('scopes series/project directions, keeps current brief priority and accepts different Hermes hypotheses/creative decisions', () => {
    const {store} = setup()
    store.user('one',{action:'bind',creatorId:'local',seriesId:'series-a'})
    store.user('one',{action:'explicit',text:'Generally restrained effects'})
    store.user('one',{action:'explicit',text:'Energetic style for this project',scope:{kind:'project'}})
    store.user('one',{action:'explicit',text:'Series opening convention',scope:{kind:'series'}})
    expect(store.context('one')).toContain('Energetic style for this project')
    expect(store.context('other')).not.toContain('Energetic style for this project')
    expect(store.context('other')).not.toContain('Series opening convention')
    expect(store.context('one')).toContain('CURRENT USER REQUEST takes priority')
    const id = store.view('one').evidence[0]!.id
    for (const hypothesis of ['Maybe restrained visuals', 'Maybe preserve emotional pauses']) creatorAgent(store,'one',{action:'hypothesis',hypothesis,dimension:'editorial',evidence_ids:[id]})
    expect(store.view('one').preferences.slice(-2).map(p=>p.hypothesis)).toEqual(['Maybe restrained visuals','Maybe preserve emotional pauses'])
    expect(store.context('one')).toContain('no repair is also valid')
  })
  it('reset/disable/revision invalidate recalled conversation epochs, preserve projects and allow inspection', () => {
    const {store,directory} = setup()
    const initialKey = store.sessionKey('one')
    const p = store.user('one',{action:'explicit',text:'Natural shots'}).preferences[0]!
    expect(store.sessionKey('one')).not.toBe(initialKey)
    store.user('one',{action:'revise',id:p.id,text:'Prefer stylized shots for this series'})
    expect(store.context('one')).not.toContain('"hypothesis":"Natural shots"')
    store.user('one',{action:'disable',id:p.id})
    expect(creatorAgent(store,'one',{action:'context'}).preferences).toHaveLength(0)
    store.user('one',{action:'enable',enabled:false})
    expect(store.context('one')).toBe(''); expect(creatorAgent(store,'one',{action:'context'}).evidence).toHaveLength(0)
    store.user('one',{action:'reset'})
    expect(new CreatorStyleStore(directory).view('one').evidence).toHaveLength(0)
  })
  it('reference intent/provenance and contradictory per-frame observations survive without inventing cuts or preferences', () => {
    const {store,directory} = setup()
    store.reference('one',{relationship:'own_finished',intent:'project',media_id:'synthetic',observations:[{source_t_us:0,description:'Title visible'},{source_t_us:1_000_000,description:'No title visible'}],unknown:'original edit history'})
    expect(store.context('other')).not.toContain('Title visible')
    expect(new CreatorStyleStore(directory).view('one').evidence[0]!.data.observations).toHaveLength(2)
    expect(store.view('one').preferences).toHaveLength(0)
    store.reference('one',{relationship:'external_inspiration',intent:'persistent',observations:{status:'unavailable'}})
    expect(store.context('other')).toContain('external_inspiration')
  })
  it('is bounded and refuses corrupt persistence or invalid writes without losing prior data', () => {
    const {store,directory} = setup()
    for (let n=0;n<20;n++) store.user('one',{action:'explicit',text:`Preference ${n}: ${'x'.repeat(920)}`})
    expect(store.context('two').length).toBeLessThan(12000)
    expect(() => store.user('one',{action:'explicit',text:'x'.repeat(1001)})).toThrow('Invalid')
    expect(new CreatorStyleStore(directory).view('one').preferences).toHaveLength(20)
    fs.writeFileSync(store.file,'{broken')
    expect(() => new CreatorStyleStore(directory)).toThrow()
    expect(fs.readFileSync(store.file,'utf8')).toBe('{broken')
  })
})

it('offline fake-Hermes learning path changes a subsequent edit, while an explicit brief can override it (simulation, not live behavioral proof)',()=>{
  const {store,directory}=setup(), first=correction(store,100), projectId=first.snapshot().project_id
  const evidenceId=store.view(projectId).evidence[0]!.id
  // This fake model supplies its own interpretation and value, outside production.
  creatorAgent(store,projectId,{action:'hypothesis',hypothesis:'Prefer caption size 64 when readable at this resolution',dimension:'typography',evidence_ids:[evidenceId]})
  store.user(projectId,{action:'approve',id:store.view(projectId).preferences[0]!.id})
  const reopened=new CreatorStyleStore(directory),idGen=seededGen(8000), second=createActor({initial:blankProject(idGen,'next'),idGen})
  const context=reopened.context(second.snapshot().project_id)
  const fakeModel = (brief:string) => brief.includes('large text') ? 96 : context.includes('caption size 64') ? 64 : 36
  expect(second.dispatchAs({kind:'Agent',client:'offline-fake'},'add_caption_track',{cues:[{start_us:0,end_us:1_000_000,text:'New source'}],comp_w:1920,comp_h:1080,label:null}).ok).toBe(true)
  expect(second.dispatchAs({kind:'Agent',client:'offline-fake'},'restyle_captions',{patch:{font_size_px:fakeModel('Natural edit')}}).ok).toBe(true)
  const textLayer=Object.values(second.snapshot().compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers)).find(l=>l.params.kind==='Text')!
  expect(textLayer.params.kind==='Text' && textLayer.params.font.size_px).toBe(64)
  expect(fakeModel('Use large text for this project')).toBe(96)
  expect(reopened.view(second.snapshot().project_id).evidence).toHaveLength(2) // correction + explicit user approval; AI output never reinforces taste
})

it('disabled/forgotten evidence cannot silently reinstate a preference, including through deeper retrieval',()=>{
 const {store}=setup(), v=store.user('one',{action:'explicit',text:'A distinctive preference to forget'}),p=v.preferences[0]!,e=v.evidence[0]!
 store.user('one',{action:'disable',id:p.id})
 expect(store.context('other')).not.toContain('distinctive')
 expect(()=>creatorAgent(store,'other',{action:'evidence',id:e.id})).toThrow('Unknown')
 store.user('one',{action:'approve',id:p.id});expect(store.context('other')).toContain('distinctive')
 store.user('one',{action:'remove',id:p.id});expect(store.context('other')).not.toContain('distinctive')
 expect(()=>creatorAgent(store,'other',{action:'hypothesis',hypothesis:'Restore forgotten taste',dimension:'editorial',evidence_ids:[e.id]})).toThrow()
})

it('records video/audio source changes as facts, preserves intentional offsets, and leaves undo/history intact',()=>{
 const {store}=setup(),idGen=seededGen(12000),actor=createActor({initial:blankProject(idGen,'synthetic-av'),idGen})
 const media=idGen();actor.dispatch('add_media',{id:media,kind:'Video',duration_us:100_000_000,with_audio:true})
 const track=actor.snapshot().compositions[actor.snapshot().root_id].tracks[0]!.id
 const audioTrack=actor.dispatch('add_track',{label:'Audio'});if(!audioTrack.ok)throw Error('fixture')
 let before=actor.snapshot();actor.subscribe(c=>{store.observe(c,before);before=c.new_snapshot})
 const v=actor.dispatchAs({kind:'Agent',client:'fake'},'add_layer',{kind:'video',media,track,src_in_us:10_000_000,src_out_us:20_000_000,t_start_us:0,t_end_us:10_000_000})
 const a=actor.dispatchAs({kind:'Agent',client:'fake'},'add_layer',{kind:'audio',media,track:audioTrack.value,src_in_us:10_000_000,src_out_us:20_000_000,t_start_us:0,t_end_us:10_000_000})
 if(!v.ok||!a.ok)throw Error('fixture')
 const baseline=actor.snapshot(), historyLength=actor.historyView(100).len
 expect(actor.dispatch('update_layer_params',{layer:v.value,patch:{kind:'VideoClip',src_in_us:9_000_000}}).ok).toBe(true)
 const evidence=store.view(actor.snapshot().project_id).evidence.at(-1)!
 const delta=(evidence.data.deltas as any[])[0]
 expect(delta.proposalOpId).toBeTruthy();expect(JSON.parse(delta.after).params.src_in_us).toBe(9_000_000)
 const audio=Object.values(actor.snapshot().compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers)).find(l=>l.id===a.value)!
 expect(audio.params.kind==='Audio' && audio.params.src_in_us).toBe(10_000_000)
 expect(actor.historyView(100).len).toBe(historyLength+1)
 actor.dispatch('undo',{});expect(actor.snapshot()).toEqual(baseline)
 expect(store.view(actor.snapshot().project_id).preferences).toHaveLength(0)
})

it('rejects agent overwrites of creator-authored instructions and keeps original provenance',()=>{
 const {store}=setup(),view=store.user('one',{action:'explicit',text:'Keep natural pauses'})
 const p=view.preferences[0]!,e=view.evidence[0]!
 expect(()=>creatorAgent(store,'one',{action:'hypothesis',id:p.id,hypothesis:'Remove all pauses',dimension:'rhythm',evidence_ids:[e.id]})).toThrow('Do not overwrite')
 expect(store.view('one').preferences[0]!.hypothesis).toBe('Keep natural pauses')
})

it('project opt-out excludes capture and retrieval without clearing other projects, and survives series rebinding',()=>{
 const {store}=setup(),actor=correction(store,100),id=actor.snapshot().project_id
 store.user(id,{action:'explicit',text:'A creator-wide preference'})
 const count=store.view(id).evidence.length
 store.user(id,{action:'project_enable',enabled:false})
 actor.dispatch('restyle_captions',{patch:{font_size_px:70}})
 expect(store.view(id).evidence).toHaveLength(count);expect(store.context(id)).toBe('')
 store.user(id,{action:'bind',creatorId:'local',seriesId:'new-series'})
 expect(store.context(id)).toBe('');expect(store.context('another')).toContain('creator-wide preference')
})

it('project-only explicit instructions do not leak through raw evidence or deeper retrieval',()=>{
 const {store}=setup(),v=store.user('one',{action:'explicit',text:'Use celebratory titles only today',scope:{kind:'project'}})
 expect(store.context('other')).not.toContain('celebratory')
 expect(creatorAgent(store,'other',{action:'context'}).evidence).toHaveLength(0)
 expect(()=>creatorAgent(store,'other',{action:'evidence',id:v.evidence[0]!.id})).toThrow('Unknown')
 expect(store.context('one')).toContain('celebratory')
})

it('a counterexample cannot give Hermes permission to overwrite a creator-approved preference',()=>{
 const {store}=setup(),actor=correction(store,100),project=actor.snapshot().project_id,e=store.view(project).evidence[0]!
 creatorAgent(store,project,{action:'hypothesis',hypothesis:'Preserve natural pauses',dimension:'rhythm',evidence_ids:[e.id]})
 const id=store.view(project).preferences[0]!.id
 store.user(project,{action:'approve',id})
 creatorAgent(store,project,{action:'counterexample',id,evidence_ids:[e.id]})
 expect(()=>creatorAgent(store,project,{action:'hypothesis',id,hypothesis:'Remove all pauses',dimension:'rhythm',evidence_ids:[e.id]})).toThrow('Do not overwrite')
 expect(store.view(project).preferences[0]).toMatchObject({hypothesis:'Preserve natural pauses',status:'disputed'})
})
