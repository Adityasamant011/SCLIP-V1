import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import { createActor } from '../actor'
import { seededGen } from '../ids'
import { blankProject } from '../model'
import { reviewState } from '../../sclip/evidenceCoordinates'
import { RevisionLoopGuard } from '../../sclip/revisionLoopGuard'
import { avRelationships } from '../../sclip/mediaRelationships'
import {mediaItemTemplate} from '../mutations/media'
import * as params from '../mutations/params'

function fixture(clock = () => '<TS>') {
  const idGen = seededGen(), actor = createActor({ initial: blankProject(idGen, 'synthetic'), idGen, clock })
  const media = idGen()
  actor.dispatch('add_media', { id: media, kind: 'Video', duration_us: 100_000_000, with_audio: true })
  const track = actor.snapshot().compositions[actor.snapshot().root_id].tracks[0].id
  const audioTrack = actor.dispatch('add_track', { label: 'Audio' })
  if (!audioTrack.ok) throw Error('fixture')
  const video = actor.dispatch('add_layer', { kind: 'video', media, track, src_in_us: 10_000_000, src_out_us: 20_000_000, t_start_us: 0, t_end_us: 10_000_000 })
  const audio = actor.dispatch('add_layer', { kind: 'audio', media, track: audioTrack.value, src_in_us: 10_000_000, src_out_us: 20_000_000, t_start_us: 0, t_end_us: 10_000_000 })
  if (!video.ok || !audio.ok) throw Error('fixture')
  const v = String(video.value), a = String(audio.value)
  if (!actor.dispatch('links_create',{layers:[v,a]}).ok) throw Error('fixture link')
  const op = (layer_id: string, kind: string, value: number) => ({ kind:'update_layer_params', layer_id, patch:{ kind, src_in_us:value } })
  const version = () => createHash('sha256').update(reviewState(actor.snapshot())).digest('hex')
  const run = (operations: unknown[], expected_state_version = version()) => actor.mcpCall('apply_repair_transaction', JSON.stringify({ reason:'Hermes explicitly supplied one repair', expected_state_version, operations }))
  return { actor, v, a, op, run, version }
}
const body = (r: ReturnType<ReturnType<typeof fixture>['run']>) => { if (!r.ok) throw Error(JSON.stringify(r)); return JSON.parse(r.result.content[0].text) }

describe('Restoring explicit A/V edits preserves agency and review coherence', () => {
  for (const atomic of [false,true]) it(`restores an intentional unequal A/V ${atomic ? 'transaction' : 'single edit'}`, () => {
    const {actor,v,a,op,run}=fixture(), g=new RevisionLoopGuard(true), before=actor.snapshot(), state=reviewState(before)
    const r=g.recordEvidence('synthetic','timeline',[0,10_000_000],state,['audio','timeline'])
    const issue=g.recordIssue({description:'Hermes chooses to reconsider source relationships',severity:'minor',repairable:true,
      evidence_dimensions:['audio','timeline'],evidence_receipt_ids:[r.id],layer_ids:[v,a]},state,10_000_000,new Map([[v,[0,10_000_000]],[a,[0,10_000_000]]]))
    g.selectIssue(issue.issue.id,state)
    const checkpoint=actor.checkpoint('Hermes rollback point');g.checkpointCreated()
    expect(g.beforeMutation(state)).toBeNull()
    const result=atomic ? run([op(v,'VideoClip',6_700_000),op(a,'Audio',8_600_000)]) : actor.mcpCall('update_layer_params',JSON.stringify({layer_id:a,patch:{kind:'Audio',src_in_us:8_600_000}}))
    expect(result.ok).toBe(true)
    const abandoned=reviewState(actor.snapshot());g.mutationCommitted(abandoned)
    expect(avRelationships(actor.snapshot())[0].video_minus_audio_source_offset_us).not.toBe(0)
    actor.restoreCheckpoint(checkpoint);g.checkpointRestored(checkpoint,abandoned,reviewState(actor.snapshot()))
    expect(actor.snapshot()).toEqual(before);expect(avRelationships(actor.snapshot())[0].video_minus_audio_source_offset_us).toBe(0)
    expect(g.status.verification_pending).toBe(false);expect(g.status.outcomes).toEqual({})
    expect(g.finishIssue('unresolved',state).outcomes[issue.issue.id]).toBe('unresolved')
  })
})

describe('atomic Hermes repair transactions', () => {
  it('commits explicit paired operations in one history/event boundary and restores the checkpoint', () => {
    const { actor,v,a,op,run }=fixture(), before=actor.snapshot(), len=actor.historyStatus().len
    const events: unknown[]=[];actor.subscribe(e=>events.push(e.new_snapshot))
    const requested=[op(v,'VideoClip',9_000_000),op(a,'Audio',9_000_000)]
    const result=body(run(requested))
    expect(result.status).toBe('success');expect(events).toHaveLength(1);expect(actor.historyStatus().len).toBe(len+1)
    expect(result.operations.map((r:any)=>r.requested_operation)).toEqual(requested)
    expect(result.operations.every((r:any)=>r.committed)).toBe(true)
    expect(avRelationships(actor.snapshot())[0].video_minus_audio_source_offset_us).toBe(0)
    expect(result.operations.map((r:any)=>r.after.params.src_in_us)).toEqual([9_000_000,9_000_000])
    actor.restoreCheckpoint(result.checkpoint_id);expect(actor.snapshot()).toEqual(before)
  })
  it('invalid second operation publishes nothing and creates no checkpoint/history', () => {
    const {actor,v,a,op,run}=fixture(), before=actor.snapshot(), history=actor.historyView(100), notify=vi.fn();actor.subscribe(notify)
    const result=run([op(v,'VideoClip',9_000_000),op(a,'Audio',110_000_000)])
    expect(result.ok).toBe(false);expect(actor.snapshot()).toBe(before);expect(actor.historyView(100)).toEqual(history);expect(notify).not.toHaveBeenCalled()
    if (!result.ok) expect(result.error.data).toMatchObject({status:'rejected',operations:[{committed:false},{committed:false}]})
  })
  it('accepts explicit intentional unequal A/V source and timeline values without synchronization', () => {
    const {actor,v,a,op,run}=fixture()
    const result=body(run([op(v,'VideoClip',9_000_000),op(a,'Audio',8_000_000),{kind:'update_layer',layer_id:a,patch:{t_start_us:1_000_000}}]))
    expect(result.operations).toHaveLength(3)
    expect(avRelationships(actor.snapshot())[0].video_minus_audio_source_offset_us).toBe(2_000_000)
    expect(result.relationship_changes).toHaveLength(1)
  })
  it('accepts different Hermes-selected values and one operation, never generates a partner edit', () => {
    for (const value of [7_000_000,9_000_000]) {
      const {actor,v,a,op,run}=fixture();const requested=[op(v,'VideoClip',value)], result=body(run(requested))
      expect(result.operations.map((o:any)=>o.requested_operation)).toEqual(requested)
      expect(result.operations).toHaveLength(1)
      expect(avRelationships(actor.snapshot())[0].audio_source_range_us[0]).toBe(10_000_000)
      expect(result.operations[0].after.params.src_in_us).toBe(value)
      expect(result.operations[0].affected_layer_ids).toEqual([v]);expect(result.operations[0].affected_layer_ids).not.toContain(a)
    }
  })
  it('keeps the ordinary single mutation path working', () => {
    const {actor,v}=fixture();expect(actor.mcpCall('update_layer_params',JSON.stringify({layer_id:v,patch:{kind:'VideoClip',src_in_us:9_000_000}})).ok).toBe(true)
  })
  it('rejects stale state, missing layer, invalid schema and excessive count before publication', () => {
    const {actor,v,op,run,version}=fixture(), stale=version()
    actor.dispatch('update_layer',{layer:v,patch:{label:'new'}});const before=actor.snapshot()
    const valid=op(v,'VideoClip',9_000_000)
    for(const [ops,state] of [[[valid],stale],[[{...valid,layer_id:'00000000-0000-0000-0000-000000000099'}],version()],[[{...valid,patch:{kind:'VideoClip',src_in_us:'bad'}}],version()],[Array(9).fill(valid),version()]] as [unknown[],string][]) {
      expect(run(ops,state).ok).toBe(false);expect(actor.snapshot()).toBe(before)
    }
  })
  it('rolls back an unexpected failure after the first draft member', () => {
    const {actor,v,a,op,run}=fixture(), before=actor.snapshot(), history=actor.historyView(100), original=params.applyUpdateLayerParams
    let count=0
    const spy=vi.spyOn(params,'applyUpdateLayerParams').mockImplementation((...args)=>{original(...args);if(++count===2)throw Error('simulated internal failure')})
    try {const result=run([op(v,'VideoClip',9_000_000),op(a,'Audio',9_000_000)]);expect(result.ok).toBe(false);expect(count).toBe(2);if(!result.ok)expect(result.error.data).toMatchObject({status:'rolled_back'});expect(actor.snapshot()).toBe(before);expect(actor.historyView(100)).toEqual(history)} finally {spy.mockRestore()}
  })
  it('a failure at the commit boundary removes its checkpoint and publishes no state', () => {
    const clock=vi.fn(()=>'<TS>'),{actor,v,a,op,run}=fixture(clock), before=actor.snapshot(), history=actor.historyView(100), notify=vi.fn()
    actor.subscribe(notify)
    clock.mockImplementationOnce(()=>'<TS>').mockImplementationOnce(()=>{throw Error('simulated commit clock failure')})
    const result=run([op(v,'VideoClip',9_000_000),op(a,'Audio',9_000_000)])
    expect(result.ok).toBe(false);if(!result.ok)expect(result.error.data).toMatchObject({status:'rolled_back'})
    expect(actor.snapshot()).toBe(before);expect(actor.historyView(100)).toEqual(history);expect(notify).not.toHaveBeenCalled()
  })
  it('an unchanged explicit transaction records no mutation or history entry', () => {
    const {actor,v,op,run}=fixture(), before=actor.snapshot(),len=actor.historyStatus().len
    const result=body(run([op(v,'VideoClip',10_000_000)]))
    expect(result.changed).toBe(false);expect(actor.snapshot()).toBe(before);expect(actor.historyStatus().len).toBe(len)
  })
  it('validates the final batch, allowing an intermediate overlap to be resolved before publication', () => {
    const {actor,v,run}=fixture(), track=actor.snapshot().compositions[actor.snapshot().root_id].tracks[0].id
    const add=actor.dispatch('add_layer',{kind:'color',track,t_start_us:10_000_000,t_end_us:20_000_000});if(!add.ok)throw Error('fixture')
    expect(run([{kind:'update_layer',layer_id:v,patch:{t_end_us:11_000_000}},{kind:'update_layer',layer_id:add.value,patch:{t_start_us:11_000_000}}]).ok).toBe(true)
    const before=actor.snapshot()
    expect(run([{kind:'update_layer',layer_id:v,patch:{t_end_us:12_000_000}}]).ok).toBe(false);expect(actor.snapshot()).toBe(before)
  })
})

it('diagnoses stringified/alias repair arguments without accepting or committing them',()=>{
 const {actor,v,version}=fixture(),before=actor.snapshot(),history=actor.historyStatus().len
 for(const argumentsObject of [
  {expected_state_version:version(),reason:'Synthetic invalid representation',operations:JSON.stringify([{kind:'update_layer_params',layer_id:v,patch:{kind:'VideoClip',opacity:.8}}])},
  {current_state_version:version(),reason:'Synthetic alias',operations:[]},
 ]){
  const result=actor.mcpCall('apply_repair_transaction',JSON.stringify(argumentsObject))
  expect(result.ok).toBe(false)
  if(!result.ok)expect(JSON.stringify(result.error)).toContain('expected_state_version, reason, operations')
  expect(actor.snapshot()).toBe(before);expect(actor.historyStatus().len).toBe(history)
 }
})

it('replaces a source atomically without deleting the slot or changing sibling audio',()=>{
 const {actor,v,a,run}=fixture();const media=seededGen(999)();const item=mediaItemTemplate(media,'Video',100e6,true);item.metadata.video={width:1920,height:1080} as any;expect(actor.dispatch('add_media_item',{media:item}).ok).toBe(true)
 const old=actor.snapshot(),oldAudio=old.compositions[old.root_id].tracks.flatMap(t=>t.layers).find(l=>l.id===a)!
 const result=run([{kind:'replace_source',layer_id:v,patch:{media_id:media,src_in_us:0,src_out_us:10e6}}]);expect(result.ok).toBe(true)
 const next=actor.snapshot(),video=next.compositions[next.root_id].tracks.flatMap(t=>t.layers).find(l=>l.id===v)!
 expect((video.params as any).media).toBe(media);expect([video.t_start_us,video.t_end_us]).toEqual([0,10e6]);expect(next.compositions[next.root_id].tracks.flatMap(t=>t.layers).find(l=>l.id===a)).toEqual(oldAudio)
 const beforeBad=actor.snapshot();expect(run([{kind:'replace_source',layer_id:v,patch:{media_id:media,src_in_us:0,src_out_us:1e6}}]).ok).toBe(false);expect(actor.snapshot()).toEqual(beforeBad)
})

it('an unused import rebases review state without consuming a repair cycle',()=>{const g=new RevisionLoopGuard(true);const r=g.recordEvidence('vision_inspect','timeline',[0,10],'before',['visual']);g.recordIssue({description:'Replace a blurry shot',severity:'moderate',repairable:true,evidence_receipt_ids:[r.id],evidence_dimensions:['visual'],affected_range_us:[0,10]},'before',10,new Map());g.selectIssue('issue-1','before');g.checkpointCreated();g.rebaseUnchangedOutput('before','after-import');expect(g.beforeMutation('after-import')).toBeNull();expect(g.status.attempts).toEqual({})})

it('creates referenced text and its lane atomically, then reconciles the exact request without replay',()=>{
 const {actor}=fixture(),before=actor.snapshot(),history=actor.historyStatus().len
 const request={request_id:'batch-example',expected_state_version:createHash('sha256').update(reviewState(before)).digest('hex'),reason:'An explicit native label',operations:[
  {kind:'create_track',ref:'labels',arguments:{}},
  {kind:'add_text_layer',ref:'title',arguments:{track_id:'@labels',content:'A useful label',t_start_us:0,duration_us:2000000}},
  {kind:'update_layer_params',layer_id:'@title',patch:{kind:'Text',x:100,y:100}},
 ]}
 const first=actor.mcpCall('apply_repair_transaction',JSON.stringify(request));expect(first.ok,JSON.stringify(first)).toBe(true)
 const receipt=body(first);expect(receipt.references.title).toBeTruthy();expect(actor.historyStatus().len).toBe(history+1)
 const current=actor.snapshot();expect(actor.mcpCall('apply_repair_transaction',JSON.stringify(request))).toEqual(first);expect(actor.snapshot()).toBe(current);expect(actor.historyStatus().len).toBe(history+1)
 const found=body(actor.mcpCall('get_transaction_receipt',JSON.stringify({request_id:'batch-example'})));expect(found.known).toBe(true)
 actor.restoreCheckpoint(receipt.checkpoint_id);expect(actor.snapshot()).toEqual(before)
})
it('rejects an invalid later create batch without publishing its preceding lane or label',()=>{
 const {actor}=fixture(),before=actor.snapshot(),history=actor.historyStatus().len
 const result=actor.mcpCall('apply_repair_transaction',JSON.stringify({expected_state_version:createHash('sha256').update(reviewState(before)).digest('hex'),reason:'Invalid batch',operations:[{kind:'create_track',ref:'labels',arguments:{}},{kind:'add_text_layer',ref:'title',arguments:{track_id:'@labels',content:'Label',t_start_us:0,duration_us:2000000}},{kind:'update_layer_params',layer_id:'@missing',patch:{kind:'Text',x:100,y:100}}]}))
 expect(result.ok).toBe(false);expect(actor.snapshot()).toBe(before);expect(actor.historyStatus().len).toBe(history)
})

it('anchors an atomic insert to a real preceding layer end without rounded times',()=>{
 const {actor,v,run}=fixture(),comp=actor.snapshot().compositions[actor.snapshot().root_id]
 const result=body(run([{kind:'create_track',arguments:{label:'Anchored'},ref:'lane'},{kind:'add_text_layer',arguments:{track_id:'@lane',content:'Next',duration_us:1000000},after_layer_id:v,ref:'caption'}]))
 const id=result.references?.caption??result.operations[1].created_id
 const layer=actor.snapshot().compositions[comp.id].tracks.flatMap(t=>t.layers).find(l=>l.id===id)!
 expect(layer.t_start_us).toBe(10000000);expect(layer.t_end_us).toBe(11000000)
})
