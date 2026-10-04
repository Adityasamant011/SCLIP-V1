import { describe, it, expect } from 'vitest'
import { blankProject } from '../state/model'
import { uuidV7Gen } from '../state/ids'
import { videoClipParams, audioParams } from '../state/mutations/media'
import { RevisionLoopGuard } from './revisionLoopGuard'
import {reviewState} from './evidenceCoordinates'
import { createActor } from '../state/actor'
import { buildEditorialEvidencePacket, PACKET_FIELD_CLASSES, PACKET_LIMITS } from './editorialEvidencePacket'
import { avRelationships, changedAVRelationships } from './mediaRelationships'
function fixture() {
  const ids=uuidV7Gen(), actor=createActor({initial:blankProject(ids,'Synthetic evidence'),idGen:ids,clock:()=> 'now'})
  const media='00000000-0000-0000-0000-000000000001'
  actor.dispatch('add_media',{id:media,kind:'Video',duration_us:600000000})
  const track=actor.snapshot().compositions[actor.snapshot().root_id].tracks[0].id
  actor.dispatch('add_layer',{track,kind:'color',t_start_us:0,t_end_us:60000000})
  const p=structuredClone(actor.snapshot()),comp=p.compositions[p.root_id],v=comp.tracks[0].layers[0];v.params=videoClipParams(media,100000000,160000000)
  const a={...structuredClone(v),id:ids(),params:audioParams(media,100000000,160000000)};comp.tracks[0].layers.push(a);comp.links.push({id:ids(),members:[v.id,a.id].sort()})
  const loader=()=>({segments:[{text:'An invented statement with context',t_start_us:99500000,t_end_us:160000000,words:[{text:'statement',t_start_us:99900000,t_end_us:100200000},{text:'context',t_start_us:159000000,t_end_us:160000000}]}]})
  return {p,v,a,ids,loader}
}
describe('Compact editorial evidence and agency',()=>{
  it('maps each edited video AND audio range with current state and source word context',()=>{
    const {p,v,a,loader}=fixture(),packet=buildEditorialEvidencePacket(p,{transcriptLoader:loader})
    expect(packet.clips[0]).toMatchObject({layer_id:v.id,timeline_range_us:[0,60000000],source_range_us:[100000000,160000000]})
    expect(packet.speech.map(s=>s.layer_id)).toEqual([v.id,a.id]);expect(packet.speech[0].boundary_words[0].mapped_timeline_start_us).toBe(-100000)
    expect(packet.identity.state_version).toHaveLength(64);expect(packet.speech[0].evidence_class).toBe('MODEL_OBSERVATION');expect(packet.identity.evidence_class).toBe('AUTHORITATIVE_STATE')
    expect(packet.relationships[0]).toMatchObject({video_layer_id:v.id,audio_layer_id:a.id,video_minus_audio_source_offset_us:0,relationship_basis:'authored_link_and_shared_source'})
  })
  it('exposes video-only source changes without forcing audio or declaring an offset wrong',()=>{
    const {p,v,a,ids}=fixture(),actor=createActor({initial:p,idGen:ids,clock:()=> 'now'}),before=actor.snapshot()
    const result=actor.mcpCall('update_layer_params',JSON.stringify({layer_id:v.id,patch:{kind:'VideoClip',src_in_us:99900000}}));expect(result.ok).toBe(true)
    const after=actor.snapshot(),notes=changedAVRelationships(before,after)
    expect(notes[0]).toMatchObject({code:'PAIR_RELATIONSHIP_CHANGED',source_offset_delta_us:-100000})
    expect(avRelationships(after)[0].audio_source_range_us).toEqual([100000000,160000000]);expect(notes[0].current!.offset_scope).toContain('intentional')
    expect(after.compositions[after.root_id].tracks[0].layers.find(l=>l.id===a.id)?.params).toEqual(a.params)
  })
  it('permits intentional offset and independent technically valid parameter choices',()=>{
    for(const start of [99800000,100100000]) {
      const {p,v,ids}=fixture(),actor=createActor({initial:p,idGen:ids,clock:()=> 'now'})
      const before=reviewState(actor.snapshot()),g=new RevisionLoopGuard(true),r=g.recordEvidence('state','timeline',[0,60000000],before,['timeline'])
      const issue=g.recordIssue({description:'Hermes chooses independent source selection',severity:'minor',repairable:true,evidence_dimensions:['timeline'],evidence_receipt_ids:[r.id],layer_ids:[v.id]},before,60000000,new Map([[v.id,[0,60000000]]]))
      g.selectIssue(issue.issue.id,before);g.checkpointCreated();expect(g.beforeMutation(before)).toBeNull()
      expect(actor.mcpCall('update_layer_params',JSON.stringify({layer_id:v.id,patch:{kind:'VideoClip',src_in_us:start}})).ok).toBe(true)
      const after=reviewState(actor.snapshot());g.mutationCommitted(after);g.recordEvidence('state','timeline',[0,60000000],after,['timeline']);g.finishIssue('resolved',after);expect(g.complete().workflow_stage).toBe('COMPLETE')
      expect(avRelationships(actor.snapshot())[0].video_source_range_us[0]).toBe(start)
    }
  })
  it('classifies every packet field and supplies no editorial recommendation or creative values',()=>{
    const {p,loader}=fixture(),packet=buildEditorialEvidencePacket(p,{transcriptLoader:loader})
    expect(Object.keys(packet).sort()).toEqual(Object.keys(PACKET_FIELD_CLASSES).sort())
    expect(Object.values(PACKET_FIELD_CLASSES).every(c=>['EVIDENCE','STATE','TECHNICAL INVARIANT','PROVENANCE','WORKFLOW'].includes(c))).toBe(true)
    for(const forbidden of ['recommended_issue','recommended_repair','trim_at_us','desired_crop','desired_caption','pacing_score'])expect(JSON.stringify(packet)).not.toContain(forbidden)
    expect(packet.clips[0]).not.toHaveProperty('proposed_transform');expect(packet.deeper_evidence.instruction).toContain('Choose any justified issue')
  })
  it('bounds oversized state and explicitly indexes omitted material',()=>{
    const {p,v,ids}=fixture();for(let i=0;i<500;i++)p.compositions[p.root_id].tracks[0].layers.push({...structuredClone(v),id:ids(),label:'Long '.repeat(500)})
    const packet=buildEditorialEvidencePacket(p);expect(packet.clips.length).toBeLessThanOrEqual(16);expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(PACKET_LIMITS.bytes)
    expect(packet.truncation.source_layers_total).toBe(502);expect(packet.visuals).toMatchObject({status:'not_observed'})
  })
})
