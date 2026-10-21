import { afterEach, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import { createActor } from '../state/actor'
import { blankProject } from '../state/model'
import { seededGen } from '../state/ids'
import { CreatorStyleStore } from './creatorStyle'
import { creatorAgent } from './creatorMemory.test-utils'

const dirs: string[]=[]
afterEach(()=>dirs.splice(0).forEach(d=>fs.rmSync(d,{recursive:true,force:true})))
function setup() {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creator-pattern-'));dirs.push(directory)
  const store=new CreatorStyleStore(directory)
  function project(seed:number) {
    const ids=seededGen(seed),actor=createActor({initial:blankProject(ids,'Synthetic creator project'),idGen:ids})
    let before=actor.snapshot()
    actor.subscribe(change=>{try{store.observe(change,before)}finally{before=change.new_snapshot}})
    return actor
  }
  return {store,project,directory}
}

it('captures native prompts/reactions, actual AI changes and manual corrections as linked facts without inventing taste',()=>{
  const {store,project}=setup(),actor=project(1),id=actor.snapshot().project_id
  store.observePrompt(actor.snapshot(),'session','first','Keep the opening readable without covering the picture.')
  const prompt=store.view(id).evidence[0]!
  expect(actor.dispatchAs({kind:'Agent',client:'test'},'add_caption_track',{cues:[{start_us:0,end_us:2_000_000,text:'Synthetic caption'}],comp_w:1920,comp_h:1080,label:null}).ok).toBe(true)
  const layer=Object.values(actor.snapshot().compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers))[0]!
  expect(actor.dispatchAs({kind:'User'},'update_layer_params',{layer:layer.id,patch:{kind:'Text',font_size_px:32}}).ok).toBe(true)
  const correction=store.view(id).evidence.at(-1)!
  expect(correction.kind).toBe('correction')
  expect((correction.data.deltas as any[])[0]).toMatchObject({proposalPromptId:prompt.id,properties:expect.arrayContaining(['params.font.size_px'])})
  expect(actor.dispatch('update_layer_params',{layer:layer.id,patch:{kind:'Text',font_size_px:30}}).ok).toBe(true)
  expect((store.view(id).evidence.at(-1)!.data.deltas as any[])[0].proposalPromptId).toBe(prompt.id)
  store.observePrompt(actor.snapshot(),'session','reaction','The caption still competes with the subject; give the picture more space.')
  const reaction=store.view(id).evidence.at(-1)!
  expect(reaction.data.precedingAgentOperations).toEqual(expect.arrayContaining([expect.objectContaining({promptEvidenceId:prompt.id,before:expect.any(String),after:expect.any(String)})]))
  const details=store.agent(id,{action:'evidence',id:prompt.id}) as any
  expect(details.related_agent_changes[0].promptEvidenceId).toBe(prompt.id)
  expect(store.view(id).preferences).toHaveLength(0)
  const beforeRevision=store.view(id).revision
  store.observePrompt(actor.snapshot(),'session','reaction','Same native turn replay must not become another observation')
  store.observePrompt(actor.snapshot(),'session','generated','[Sclip creator learning] Generated host feedback')
  store.observePrompt(actor.snapshot(),'session','completion','[Sclip completion checkpoint] Generated feedback')
  expect(store.view(id).revision).toBe(beforeRevision)
})

it('labels an observation value as the creator correction rather than reversing it into an AI proposal',()=>{
  const {store,project}=setup(),actor=project(10000),p=actor.snapshot().project_id
  store.observePrompt(actor.snapshot(),'one','brief','Let the picture lead while keeping captions readable.')
  expect(actor.dispatchAs({kind:'Agent',client:'synthetic'},'add_caption_track',{cues:[{start_us:0,end_us:2_000_000,text:'Synthetic caption'}],comp_w:1920,comp_h:1080,label:null}).ok).toBe(true)
  expect(actor.dispatchAs({kind:'Agent',client:'synthetic'},'restyle_captions',{patch:{font_size_px:78}}).ok).toBe(true)
  expect(actor.dispatch('restyle_captions',{patch:{font_size_px:42}}).ok).toBe(true)
  const page=creatorAgent(store,p,{action:'observations'}) as any
  const correction=page.observations.find((e:any)=>e.kind==='correction')
  expect(correction.change_actor.kind).toBe('User')
  expect(correction.changes[0]).toMatchObject({before_authority:'matched_agent_proposal',after_authority:'creator_commit'})
  expect(correction.changes[0].values).toContainEqual({property:'params.font.size_px',before:'78',after:'42'})
  expect(store.view(p).preferences).toHaveLength(0)
})

it('finds older reviewed prompts across projects, consolidates meaning with conditions, and persists one reusable candidate after restart',()=>{
  const {store,project,directory}=setup(),a=project(2),b=project(3),c=project(4)
  const ap=a.snapshot().project_id,bp=b.snapshot().project_id,cp=c.snapshot().project_id
  store.observePrompt(a.snapshot(),'one','one','Keep the pause before the reveal. It builds anticipation here.')
  const first=store.view(ap).evidence[0]!
  creatorAgent(store,ap,{action:'review',evidence_ids:[first.id],outcome:'insufficient',reason:'One reveal could be a project-specific story choice.'})
  store.observePrompt(b.snapshot(),'two','two','You rushed the reveal again. Leave a beat before the answer, but remove dead time elsewhere.')
  const second=store.view(bp).evidence.at(-1)!
  for(let n=0;n<12;n++)store.observePrompt(b.snapshot(),'two',`later-${n}`,`Unrelated synthetic conversation ${n}`)
  const page=creatorAgent(store,cp,{action:'observations',request:'reveal anticipation pause',filter:'all'}) as any
  expect(page.observations.map((e:any)=>e.id)).toEqual(expect.arrayContaining([first.id,second.id]))
  expect(page.project_count).toBe(2)
  // Fake foreground caller authors the semantic interpretation; capture/retrieval never does.
  creatorAgent(store,cp,{action:'hypothesis',hypothesis:'Preserve an anticipatory beat before a reveal while tightening non-expressive dead time.',dimension:'pacing',applicability:'Reveal-led sequences; not an instruction to preserve every pause.',rationale:'Two independent projects pair the same verbal correction with a narrative purpose.',lesson_kind:'style_pattern',evidence_ids:[first.id,second.id]})
  const pref=store.view(cp).preferences[0]!
  creatorAgent(store,cp,{action:'review',evidence_ids:[first.id,second.id],outcome:'learned',preference_ids:[pref.id],reason:'Saved a conditional pacing principle with both actual prompt IDs.'})
  const reopened=new CreatorStyleStore(directory)
  expect(reopened.view(cp).preferences).toHaveLength(1)
  expect(reopened.view(cp).preferences[0]).toMatchObject({status:'candidate',approved:false,lessonKind:'style_pattern',applicability:expect.stringContaining('Reveal-led')})
  expect(reopened.context(cp)).toContain('anticipatory beat')
  expect(reopened.context(cp)).not.toContain('Unrelated synthetic conversation 0')
  store.user(cp,{action:'remove',id:pref.id})
  expect(store.learningContext(cp)).not.toContain('Preserve an anticipatory beat')
  expect(()=>store.agent(cp,{action:'evidence',id:first.id})).toThrow('Unknown')
})

it('cannot report learned from a failed, invented, unrelated or cross-creator write; technical repairs need not create taste',()=>{
  const {store,project}=setup(),actor=project(5),p=actor.snapshot().project_id
  store.observePrompt(actor.snapshot(),'one','one','The subtitle disappeared. Restore the missing subtitle.')
  const evidence=store.view(p).evidence[0]!
  expect(()=>creatorAgent(store,p,{action:'review',evidence_ids:[evidence.id],outcome:'learned',preference_ids:['invented'],reason:'Claim without a write'})).toThrow('successful current evidence-linked')
  expect(store.view(p).evidence[0]!.review).toBeUndefined()
  creatorAgent(store,p,{action:'review',evidence_ids:[evidence.id],outcome:'technical_repair',reason:'Restoring missing authored content is not a new aesthetic preference.'})
  expect(store.view(p).preferences).toHaveLength(0)
  expect((creatorAgent(store,p,{action:'observations',filter:'pending'}) as any).total).toBe(0)
  const other=store.user('other',{action:'create_creator',label:'Other creator'}).creators[1]!
  store.user('other',{action:'bind',creatorId:other.id})
  const observations=creatorAgent(store,'other',{action:'observations'}) as any
  expect(observations.observations).toHaveLength(0)
  expect(()=>creatorAgent(store,'other',{action:'review',evidence_ids:[evidence.id],outcome:'not_style',reason:'Cross-creator request'})).toThrow('Unknown')
  store.user(p,{action:'project_enable',enabled:false})
  const revision=store.view(p).revision
  store.observePrompt(actor.snapshot(),'one','off','Do not record this prompt')
  expect(store.learningContext(p)).toBe('');expect(store.view(p).revision).toBe(revision)
})

it('paginates all retained reactions with fresh revisions, surfaces pending work, and never repeats an explicit non-learning review',()=>{
  const {store,project}=setup(),actor=project(6),p=actor.snapshot().project_id
  for(let n=0;n<10;n++)store.observePrompt(actor.snapshot(),'one',`turn-${n}`,`Synthetic reaction ${n}`)
  const first=creatorAgent(store,p,{action:'observations',filter:'pending'}) as any
  const next=creatorAgent(store,p,{action:'observations',filter:'pending',cursor:first.next_cursor}) as any
  expect(first.observations.length+next.observations.length).toBe(10)
  expect(new Set([...first.observations,...next.observations].map(e=>e.id)).size).toBe(10)
  expect(store.learningContext(p)).toContain('pending_evidence')
  const ids=store.view(p).evidence.map(e=>e.id)
  creatorAgent(store,p,{action:'review',evidence_ids:ids,outcome:'not_style',reason:'Synthetic non-editing conversation.'})
  expect((creatorAgent(store,p,{action:'observations',filter:'pending'}) as any).total).toBe(0)
  expect(()=>store.agent(p,{action:'observations',creator_id:'local',expected_revision:first.revision,cursor:8})).toThrow('Fresh')
  expect((creatorAgent(store,p,{action:'observations',filter:'reviewed'}) as any).total).toBe(10)
})

it('allows an initial observation read to establish bindings while refusing unbound later pages or foreign identities',()=>{
  const {store,project}=setup(),actor=project(20000),p=actor.snapshot().project_id
  for(let n=0;n<9;n++)store.observePrompt(actor.snapshot(),'one',`read-${n}`,`Synthetic feedback ${n}`)
  const first=store.agent(p,{action:'observations'}) as any
  expect(first.observations).toHaveLength(8)
  expect(first.next_cursor).toBe(8)
  expect(()=>store.agent(p,{action:'observations',cursor:8})).toThrow('Fresh')
  expect(()=>store.agent(p,{action:'observations',creator_id:'foreign'})).toThrow('Fresh')
  expect((store.agent(p,{action:'observations',expected_revision:first.revision-1}) as any).revision).toBe(first.revision)
  const second=store.agent(p,{action:'observations',creator_id:first.binding.creatorId,expected_revision:first.revision,cursor:first.next_cursor}) as any
  expect(second.observations).toHaveLength(1)
  expect(new Set([...first.observations,...second.observations].map(e=>e.id)).size).toBe(9)
})

it('archives reviewed legacy style notes without treating model-authored rules as creator confirmation',()=>{
  const {store,project,directory}=setup(),actor=project(7),p=actor.snapshot().project_id
  const source=createHash('sha256').update('Historical generic notes').digest('hex')
  const oldKey=store.sessionKey(p)
  store.archiveLegacyStyleNotes(p,source,['Historical unconditional pacing suggestion'])
  const evidence=store.view(p).evidence[0]!
  expect(evidence).toMatchObject({kind:'legacy_note',authority:'legacy_memory'})
  expect(store.sessionKey(p)).not.toBe(oldKey)
  store.archiveLegacyStyleNotes(p,source,['Historical unconditional pacing suggestion'])
  expect(store.view(p).evidence).toHaveLength(1)
  expect(()=>creatorAgent(store,p,{action:'hypothesis',hypothesis:'Always use that pacing',dimension:'pacing',evidence_ids:[evidence.id]})).toThrow('alone do not establish creator intent')
  expect(new CreatorStyleStore(directory).view(p).preferences).toHaveLength(0)
})

it('recognizes actual current claims beyond the three retained capsule samples without accepting stale meaning versions',()=>{
  const {store,project}=setup(),actor=project(8),p=actor.snapshot().project_id
  for(let n=0;n<5;n++)store.observePrompt(actor.snapshot(),'one',`t${n}`,`Synthetic caption reaction ${n}`)
  const ids=store.view(p).evidence.map(e=>e.id)
  creatorAgent(store,p,{action:'hypothesis',hypothesis:'Keep typography subordinate to the image while readable.',dimension:'caption',evidence_ids:ids})
  const pref=store.view(p).preferences[0]!
  expect(pref.support).toHaveLength(3)
  expect(()=>creatorAgent(store,p,{action:'review',evidence_ids:ids,preference_ids:[pref.id],outcome:'learned',reason:'All five facts have current saved claims despite bounded capsule samples.'})).not.toThrow()
  store.observePrompt(actor.snapshot(),'one','new','A different current request changes the interpretation.')
  const fresh=store.view(p).evidence.at(-1)!
  creatorAgent(store,p,{action:'hypothesis',id:pref.id,hypothesis:'A different conditional caption meaning',dimension:'caption',evidence_ids:[fresh.id]})
  expect(()=>creatorAgent(store,p,{action:'review',evidence_ids:ids,preference_ids:[pref.id],outcome:'learned',reason:'Old version is not support for the new meaning.'})).toThrow()
})

it('links structural audio-role repairs back to the actual AI operation and prompt instead of losing non-layer mistakes',()=>{
  const {store,project}=setup(),actor=project(9),p=actor.snapshot().project_id
  store.observePrompt(actor.snapshot(),'one','brief','Keep the dialogue audible while adjusting the mix.')
  const prompt=store.view(p).evidence[0]!
  expect(actor.dispatchAs({kind:'Agent',client:'synthetic'},'update_role_flags',{role:'dialogue',patch:{muted:true}}).ok).toBe(true)
  expect(actor.dispatch('update_role_flags',{role:'music',patch:{solo:true}}).ok).toBe(true)
  expect(store.view(p).evidence.at(-1)!.kind).toBe('manual_edit')
  store.observePrompt(actor.snapshot(),'one','reaction','The dialogue is gone. Restore it; this is not a request for a different style.')
  expect(actor.dispatch('update_role_flags',{role:'dialogue',patch:{muted:false}}).ok).toBe(true)
  const repair=store.view(p).evidence.at(-1)!
  expect(repair).toMatchObject({kind:'correction',authority:'ProjectActor'})
  expect(repair.data.structureProperties).toContain('audio_roles.dialogue.muted')
  expect(repair.data.structureProposalOpId).toBeTruthy();expect(repair.data.structureProposalPromptId).toBe(prompt.id)
  creatorAgent(store,p,{action:'review',evidence_ids:[repair.id],outcome:'technical_repair',reason:'Restoring requested dialogue repairs a failure; it does not imply a new audio aesthetic.'})
  expect(store.view(p).preferences).toHaveLength(0)
})
