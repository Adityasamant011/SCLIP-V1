// Offline evidence/operation contracts, not a simulation proving editorial intelligence.
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createActor } from '../state/actor'
import { blankProject } from '../state/model'
import { seededGen } from '../state/ids'
import { sourceSpeechContext } from './sourceUnderstanding'
import { buildEditorialEvidencePacket } from './editorialEvidencePacket'
import { inspectRenderedAudio } from './renderedAudioEvidence'
import { reviewState } from './evidenceCoordinates'
import { RevisionLoopGuard } from './revisionLoopGuard'
import { avRelationships } from './mediaRelationships'
import { toolDimensions } from './evidenceModalities'

function fixture() {
  const ids=seededGen(), actor=createActor({initial:blankProject(ids,'Synthetic boundary experiment'),idGen:ids,clock:()=> 'fixture'})
  const media=ids();expect(actor.dispatch('add_media',{id:media,kind:'Video',duration_us:60_000_000,with_audio:true}).ok).toBe(true)
  const track=actor.snapshot().compositions[actor.snapshot().root_id].tracks[0].id
  const audioTrack=actor.dispatch('add_track',{label:'Audio'});if(!audioTrack.ok)throw Error('fixture track')
  const v=actor.dispatch('add_layer',{kind:'video',media,track,src_in_us:10_000_000,src_out_us:20_000_000,t_start_us:0,t_end_us:10_000_000})
  const a=actor.dispatch('add_layer',{kind:'audio',media,track:audioTrack.value,src_in_us:10_000_000,src_out_us:20_000_000,t_start_us:0,t_end_us:10_000_000})
  if(!v.ok||!a.ok)throw Error('fixture layers')
  const video=String(v.value),audio=String(a.value)
  expect(actor.dispatch('links_create',{layers:[video,audio]}).ok).toBe(true)
  const version=()=>createHash('sha256').update(reviewState(actor.snapshot())).digest('hex')
  const op=(layer_id:string,kind:string,start:number)=>({kind:'update_layer_params',layer_id,patch:{kind,src_in_us:start}})
  return {actor,media,video,audio,version,op}
}

async function rendered(project: ReturnType<ReturnType<typeof fixture>['actor']['snapshot']>, text: string | null) {
  // Real evidence assembly with fake local rendering/recognition dependencies.
  const render=vi.fn(async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'boundary-audio-')),file=path.join(dir,'mix.mp4')
    fs.writeFileSync(file,JSON.stringify({state:reviewState(project),text}))
    return {path:file,duration_us:10_000_000,has_audio:true,cached:false}
  })
  const decode=vi.fn(async()=>Buffer.alloc(16000*10*4))
  const transcribe=vi.fn(async()=>{
    if(text===null)throw Error('Synthetic ambiguous recognition')
    return {backend:'whisper_cpp',segments:[{text,t_start_us:0,t_end_us:10_000_000}]}
  })
  return inspectRenderedAudio(project,{start_us:0,end_us:10_000_000},()=>null,{render,decode,transcribe})
}

describe('Boundary experiment evidence retains alternatives and uncertainty',()=>{
  const scenarios=[
    {name:'unexplained opening reference',before:'There are two safety steps.',selected:'This is the second.',after:'Then disconnect power.',actual:'This is the second.',choice:'CHANGE'},
    {name:'unfinished ending',before:'Compare these materials.',selected:'It is stronger than',after:'the earlier material.',actual:'It is stronger than',choice:'CHANGE'},
    {name:'complete source projection but incomplete actual speech',before:'Compare these materials.',selected:'It is stronger than the earlier material.',after:'Now test it.',actual:'It is stronger than',choice:'UNCERTAIN'},
    {name:'self-contained opening',before:'Earlier setup.',selected:'Disconnect the power before opening the case.',after:'Check the light.',actual:'Disconnect the power before opening the case.',choice:'KEEP'},
    {name:'intentional abrupt ending',before:'Prepare the suspense scene.',selected:'And behind the door was',after:'the visitor.',actual:'And behind the door was',choice:'KEEP'},
    {name:'recognition unavailable',before:'Earlier explanation.',selected:'A possible statement.',after:'More detail.',actual:null,choice:'UNCERTAIN'},
  ]
  for(const s of scenarios)it(s.name+' supplies facts without choosing the fake Hermes response',async()=>{
    const f=fixture(),p=f.actor.snapshot(),transcript={segments:[
      {text:s.before,t_start_us:5_000_000,t_end_us:10_000_000},
      {text:s.selected,t_start_us:10_000_000,t_end_us:20_000_000},
      {text:s.after,t_start_us:20_000_000,t_end_us:25_000_000},
    ]}
    const source=sourceSpeechContext(p.media_pool[f.media],transcript,10_000_000,20_000_000)
    const mix=await rendered(p,s.actual),packet=buildEditorialEvidencePacket(p,{transcriptLoader:()=>transcript})
    expect(source.before[0].text).toBe(s.before);expect(source.selected[0].text).toBe(s.selected);expect(source.after[0].text).toBe(s.after)
    expect(source.coordinate_space).toBe('source');expect(source.evidence_class).toBe('MODEL_TRANSCRIPTION')
    expect(mix.coordinate_space).toBe('timeline');expect(mix.state_version).toBe(f.version())
    if(s.actual===null){expect(mix.transcript.status).toBe('unavailable');expect(toolDimensions('inspect_rendered_audio',mix)).not.toContain('speech')}
    else expect(mix.transcript.segments[0].text).toBe(s.actual)
    expect(packet.clips.find(c=>c.layer_id===f.audio)).toMatchObject({source_range_us:[10_000_000,20_000_000],timeline_range_us:[0,10_000_000]})
    expect(f.actor.snapshot()).toBe(p)
    // This is a scripted model choice, NOT a production conclusion or quality result.
    const fakeDecision={decision:s.choice,source,actual:mix}
    expect(['KEEP','CHANGE','UNCERTAIN']).toContain(fakeDecision.decision)
    for(const evidence of [source,mix,packet])expect(evidence).not.toHaveProperty('recommended_repair')
  })
})

describe('Fake Hermes chosen repair → actual ProjectActor commit → fresh relevant evidence',()=>{
  for(const [videoStart,audioStart] of [[8_000_000,8_000_000],[9_000_000,7_000_000]]) {
    it(`accepts chosen alternative ${videoStart}/${audioStart}, respects explicit offsets and modality/state safety`,async()=>{
      const f=fixture(),g=new RevisionLoopGuard(true),before=f.version(),first=await rendered(f.actor.snapshot(),'An incomplete statement')
      const receipt=g.recordEvidence('inspect_rendered_audio','timeline',[0,10_000_000],first.state_version,['audio','speech'])
      const issue=g.recordIssue({description:'Fake Hermes selects a speech context concern',severity:'moderate',repairable:true,
        evidence_dimensions:['speech'],evidence_receipt_ids:[receipt.id],layer_ids:[f.audio]},before,10_000_000,new Map([[f.audio,[0,10_000_000]]]))
      g.selectIssue(issue.issue.id,before);f.actor.checkpoint('Chosen repair');g.checkpointCreated()
      expect(g.beforeMutation(before)).toBeNull()
      const operations=[f.op(f.video,'VideoClip',videoStart),f.op(f.audio,'Audio',audioStart)]
      const result=f.actor.mcpCall('apply_repair_transaction',JSON.stringify({reason:'Fake Hermes explicitly chooses both operations',expected_state_version:before,operations}))
      expect(result.ok).toBe(true);if(!result.ok)throw Error('fixture repair')
      const committed=JSON.parse(result.result.content[0].text)
      expect(committed.operations.map((o:any)=>o.requested_operation)).toEqual(operations)
      const after=f.version();expect(after).not.toBe(before);g.mutationCommitted(after)
      expect(avRelationships(f.actor.snapshot())[0].video_minus_audio_source_offset_us).toBe(videoStart-audioStart)
      // Old audio, source-only audio and fresh visual evidence cannot certify speech.
      g.recordEvidence('inspect_rendered_audio','timeline',[0,10_000_000],before,['speech'])
      g.recordEvidence('get_source_speech_context','source',[0,10_000_000],after,['speech'])
      g.recordEvidence('vision_inspect','timeline',[0,10_000_000],after,['visual'])
      expect(g.status.verification_pending).toBe(true);expect(()=>g.finishIssue('resolved',after)).toThrow('reinspection')
      const fresh=await rendered(f.actor.snapshot(),'Synthetic changed speech observation')
      expect(fresh.render_content_sha256).not.toBe(first.render_content_sha256)
      g.recordEvidence('inspect_rendered_audio','timeline',[0,10_000_000],fresh.state_version,toolDimensions('inspect_rendered_audio',fresh))
      expect(g.status.verification_pending).toBe(false);expect(g.status.outcomes).toEqual({})
      g.finishIssue('unresolved',after) // Evidence exists; fake Hermes may still judge repair inadequate.
      expect(g.status.outcomes[issue.issue.id]).toBe('unresolved')
    })
  }
  it('permits no repair and an independent single edit without inventing a linked partner',async()=>{
    const f=fixture(),before=f.actor.snapshot(),g=new RevisionLoopGuard(true),mix=await rendered(before,'A self-contained explanation.')
    const r=g.recordEvidence('inspect_rendered_audio','timeline',[0,10_000_000],mix.state_version,['speech'])
    expect(g.concludeNoRepair('Fake Hermes finds this opening adequate for the brief',r.id,f.version()).workflow_stage).toBe('COMPLETE')
    expect(f.actor.snapshot()).toBe(before)
    expect(f.actor.mcpCall('update_layer_params',JSON.stringify({layer_id:f.video,patch:{kind:'VideoClip',src_in_us:9_000_000}})).ok).toBe(true)
    expect(avRelationships(f.actor.snapshot())[0].audio_source_range_us[0]).toBe(10_000_000)
  })
})
