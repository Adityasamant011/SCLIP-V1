import { createHash } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import { createActor } from '../actor'
import { seededGen } from '../ids'
import { blankProject } from '../model'
import { reviewState } from '../../sclip/evidenceCoordinates'
import { avRelationships } from '../../sclip/mediaRelationships'
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
