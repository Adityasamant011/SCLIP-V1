import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CreatorStyleStore } from './creatorStyle'
import { creatorAgent, legacyFixture } from './creatorMemory.test-utils'
const dirs: string[] = []
const setup = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(),'creator-safety-')); dirs.push(dir); return {dir,store:new CreatorStyleStore(dir)} }
afterEach(() => { vi.restoreAllMocks(); dirs.splice(0).forEach(d => fs.rmSync(d,{recursive:true,force:true})) })
function fact(s: CreatorStyleStore, project: string) {
  s.reference(project, {relationship:'own_finished',intent:'persistent',observations:{status:'unavailable'}})
  return s.view(project).evidence.at(-1)!
}
describe('Original creator-control defects, guarded without model inference', () => {
  it('counterexamples and hypothesis updates cannot revive a disabled preference or its wording under a new ID', () => {
    const {store,dir}=setup(),p=store.user('one',{action:'explicit',text:'Synthetic restrained text'}).preferences[0]!
    store.user('one',{action:'disable',id:p.id});const e=fact(store,'one')
    expect(()=>creatorAgent(store,'one',{action:'counterexample',id:p.id,evidence_ids:[e.id]})).toThrow('disabled')
    expect(()=>creatorAgent(store,'one',{action:'hypothesis',hypothesis:p.hypothesis,dimension:'text',evidence_ids:[e.id]})).toThrow('Controlled')
    expect(new CreatorStyleStore(dir).context('new')).not.toContain(p.hypothesis)
    store.user('one',{action:'approve',id:p.id})
    expect(store.context('new')).toContain(p.hypothesis)
  })
  it('forget hides linked evidence, rejects fresh exact recreation and invalidates previous context', () => {
    const {store,dir}=setup(),p=store.user('one',{action:'explicit',text:'Synthetic old taste'}).preferences[0]!,e=p.support[0]!,old=store.agent('one',{action:'context'})
    store.user('one',{action:'remove',id:p.id})
    expect(()=>store.agent('one',{action:'hypothesis',creator_id:'local',expected_revision:old.revision,hypothesis:p.hypothesis,dimension:'text',evidence_ids:[e]})).toThrow('Stale')
    expect(()=>store.agent('one',{action:'evidence',id:e})).toThrow('Unknown')
    const fresh=fact(store,'one')
    expect(()=>creatorAgent(store,'one',{action:'hypothesis',hypothesis:p.hypothesis,dimension:'text',evidence_ids:[fresh.id]})).toThrow('Controlled')
    expect(new CreatorStyleStore(dir).context('other')).not.toContain(p.hypothesis)
  })
  it('changing scope or wording starts a new version without old support/counterexamples', () => {
    const {store}=setup();store.user('a',{action:'bind',creatorId:'local',seriesId:'series-a'})
    const a=fact(store,'a');creatorAgent(store,'a',{action:'hypothesis',hypothesis:'Synthetic text observation',dimension:'text',scope:{kind:'series'},evidence_ids:[a.id]})
    const p=store.view('a').preferences[0]!
    creatorAgent(store,'a',{action:'counterexample',id:p.id,evidence_ids:[a.id]})
    store.user('b',{action:'bind',creatorId:'local',seriesId:'series-b'});const b=fact(store,'b')
    expect(()=>creatorAgent(store,'b',{action:'hypothesis',id:p.id,hypothesis:'Different meaning',dimension:'audio',scope:{kind:'series'},evidence_ids:[b.id]})).toThrow('wrong scope')
    expect(()=>creatorAgent(store,'b',{action:'hypothesis',hypothesis:'Different meaning',dimension:'audio',scope:{kind:'series'},evidence_ids:[a.id]})).toThrow('cross-creator')
    const newer=fact(store,'a')
    creatorAgent(store,'a',{action:'hypothesis',id:p.id,hypothesis:'Revised synthetic interpretation',dimension:'text',scope:{kind:'series'},evidence_ids:[newer.id]})
    const changed=store.view('a').preferences[0]!
    expect(changed).toMatchObject({version:2,support:[newer.id],counterexamples:[],confidence:'tentative'})
    expect(changed.history![0]).toMatchObject({version:1,support:[a.id],counterexamples:[a.id]})
  })
  it('protects creator approval despite counterexamples, and rejects stale versions/cross-creator identities', () => {
    const {store}=setup(),p=store.user('one',{action:'explicit',text:'Keep synthetic context'}).preferences[0]!,e=fact(store,'one')
    creatorAgent(store,'one',{action:'counterexample',id:p.id,evidence_ids:[e.id]})
    expect(()=>creatorAgent(store,'one',{action:'hypothesis',id:p.id,hypothesis:'Override',dimension:'text',evidence_ids:[e.id]})).toThrow('Do not overwrite')
    expect(()=>creatorAgent(store,'one',{action:'counterexample',id:p.id,expected_version:99,evidence_ids:[e.id]})).toThrow('Stale preference')
    expect(()=>creatorAgent(store,'one',{action:'counterexample',creator_id:'another',id:p.id,evidence_ids:[e.id]})).toThrow('cross-creator')
    expect(store.view('one').preferences[0]).toMatchObject({approved:true,hypothesis:p.hypothesis,confidence:'explicit'})
  })
  it('approval of one preference cannot unsuppress another forgotten preference shared through evidence', () => {
    const {store}=setup(),e=fact(store,'one')
    for(const hypothesis of ['First hypothesis','Second hypothesis'])creatorAgent(store,'one',{action:'hypothesis',hypothesis,dimension:'text',evidence_ids:[e.id]})
    const [a,b]=store.view('one').preferences
    store.user('one',{action:'remove',id:a!.id});store.user('one',{action:'approve',id:b!.id})
    expect(()=>store.agent('one',{action:'evidence',id:e.id})).toThrow('Unknown')
    expect(store.context('one')).not.toContain('First hypothesis')
  })
  it('migrates only after backup verification and refuses an older snapshot after a disable', () => {
    const {dir}=setup(),legacy=JSON.stringify(legacyFixture())
    fs.writeFileSync(path.join(dir,'creator-style.json'),legacy)
    const store=new CreatorStyleStore(dir)
    expect(fs.readFileSync(store.file,'utf8')).toBe(legacy) // constructor is read-only
    store.user('first',{action:'explicit',text:'Another exact approved statement'})
    const backups=fs.readdirSync(dir).filter(f=>f.endsWith('.backup'))
    expect(backups).toHaveLength(1);expect(fs.readFileSync(path.join(dir,backups[0]!),'utf8')).toBe(legacy)
    const old=fs.readFileSync(store.file,'utf8'),p=store.view('first').preferences.at(-1)!
    store.user('first',{action:'disable',id:p.id});fs.writeFileSync(store.file,old)
    expect(()=>new CreatorStyleStore(dir)).toThrow('rollback/control mismatch')
  })
  it('a failed migration/commit preserves original bytes and never initializes an empty store', () => {
    const {dir}=setup(),file=path.join(dir,'creator-style.json'),legacy=JSON.stringify(legacyFixture());fs.writeFileSync(file,legacy)
    const store=new CreatorStyleStore(dir),rename=fs.renameSync
    vi.spyOn(fs,'renameSync').mockImplementation((from,to)=>{if(to===file)throw Error('Synthetic write failure');return rename(from,to)})
    expect(()=>store.user('first',{action:'explicit',text:'New statement'})).toThrow('Synthetic write failure')
    expect(fs.readFileSync(file,'utf8')).toBe(legacy)
    expect(()=>new CreatorStyleStore(dir)).toThrow('rollback/control mismatch')
  })
})
