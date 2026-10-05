import {createHash} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import {freshActor,aRollId,bRollId} from './pbt/harness'
import {reviewState} from '../../sclip/evidenceCoordinates'
import {avRelationships} from '../../sclip/mediaRelationships'
import * as ripple from '../mutations/ripple'

function fixture() {
  const actor=freshActor(),media='00000000-0000-7000-8000-000000000099'
  actor.dispatch('add_media',{id:media,kind:'Video',duration_us:100000000,with_audio:true})
  const r=actor.mcpCall('add_video_layer',JSON.stringify({media_id:media,track_id:aRollId(actor),src_in_us:10000000,src_out_us:20000000,t_start_us:0,t_end_us:10000000}))
  if(!r.ok)throw Error(JSON.stringify(r))
  const pair=JSON.parse(r.result.content[0].text),v=pair.video_layer_id
  const version=()=>createHash('sha256').update(reviewState(actor.snapshot())).digest('hex')
  const run=(start=2000000,end=4000000,expected=version(),ids=[v])=>actor.mcpCall('ripple_cut_range',JSON.stringify({layer_ids:ids,start_us:start,end_us:end,expected_state_version:expected}))
  return {actor,v,pair,run,version}
}
const parse=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return JSON.parse(r.result.content[0].text)}
describe('Hermes-selected localized range cut',()=>{
  it('cuts linked A/V atomically, shifts downstream and reports state/geometry; one undo restores all',()=>{
    const {actor,run,pair}=fixture()
    const overlay=actor.mcpCall('add_color_layer',JSON.stringify({track_id:bRollId(actor),color:{r:1,g:2,b:3,a:255},t_start_us:6000000,t_end_us:8000000}))
    expect(overlay.ok).toBe(true)
    const before=actor.snapshot(),n=actor.historyStatus().len,events=vi.fn();actor.subscribe(events)
    const result=parse(run())
    expect(result.affected_layer_ids.sort()).toEqual([pair.video_layer_id,pair.audio_layer_id].sort())
    expect(result.layer_changes.some((c:any)=>c.before===null)).toBe(true);
    expect(result.layer_changes.find((c:any)=>c.layer_id===pair.video_layer_id)).toMatchObject({before:{timeline_range_us:[0,10000000],source_range_us:[10000000,20000000]},after:{timeline_range_us:[0,2000000],source_range_us:[10000000,12000000]}});
    expect(result.downstream_shift_us).toBe(-2000000);expect(result.deleted).toHaveLength(2)
    expect(result.starting_state_version).not.toBe(result.resulting_state_version)
    expect(result.geometry.flatMap((t:any)=>t.adjacent_intervals).every((g:any)=>!g.gap_us&&!g.overlap_us)).toBe(true)
    const comp=actor.snapshot().compositions[actor.snapshot().root_id]
    expect(comp.duration_us).toBe(8000000)
    expect(comp.tracks.find(t=>t.id===bRollId(actor))!.layers[0].t_start_us).toBe(4000000)
    expect(events).toHaveBeenCalledTimes(1);expect(actor.historyStatus().len).toBe(n+1)
    expect(avRelationships(actor.snapshot()).every(r=>r.video_minus_audio_source_offset_us===0)).toBe(true)
    expect(actor.mcpCall('undo','{}').ok).toBe(true);expect(actor.snapshot()).toEqual(before)
  })
  it('keeps unrelated upstream overlay intact and rejects a conflicting overlay without partial splits',()=>{
    const {actor,run}=fixture()
    actor.mcpCall('add_color_layer',JSON.stringify({track_id:bRollId(actor),color:{r:1,g:2,b:3,a:255},t_start_us:0,t_end_us:1000000}))
    const upstream=actor.snapshot().compositions[actor.snapshot().root_id].tracks.find(t=>t.id===bRollId(actor))!.layers[0]
    parse(run());expect(actor.snapshot().compositions[actor.snapshot().root_id].tracks.find(t=>t.id===bRollId(actor))!.layers[0]).toEqual(upstream)
    const second=fixture();second.actor.mcpCall('add_color_layer',JSON.stringify({track_id:bRollId(second.actor),color:{r:1,g:2,b:3,a:255},t_start_us:3000000,t_end_us:5000000}))
    const before=second.actor.snapshot(),n=second.actor.historyStatus().len
    expect(second.run().ok).toBe(false);expect(second.actor.snapshot()).toBe(before);expect(second.actor.historyStatus().len).toBe(n)
  })
  it('rejects stale, invalid and off-grid input without history or publications',()=>{
    for(const [s,e,v] of [[0,2000000,'stale'],[-1,1000000,undefined],[1,2000000,undefined],[4000000,2000000,undefined],[0,20000000,undefined]] as const){const f=fixture(),before=f.actor.snapshot();expect(f.run(s,e,v).ok).toBe(false);expect(f.actor.snapshot()).toBe(before)}
  })
  it('preserves an intentional source offset instead of synchronizing linked A/V',()=>{
    const f=fixture();expect(f.actor.mcpCall('update_layer_params',JSON.stringify({layer_id:f.pair.audio_layer_id,patch:{kind:'Audio',src_in_us:9000000}})).ok).toBe(true)
    expect(avRelationships(f.actor.snapshot())[0].video_minus_audio_source_offset_us).toBe(1000000)
    parse(f.run());expect(avRelationships(f.actor.snapshot()).every(p=>p.video_minus_audio_source_offset_us===1000000)).toBe(true)
  })
  it('discards all splits when the existing ripple primitive fails',()=>{
    const f=fixture(),before=f.actor.snapshot(),n=f.actor.historyStatus().len
    const failure=vi.spyOn(ripple,'applyRippleDeleteLayers').mockImplementation(()=>{throw Error('Simulated failure')})
    try{expect(()=>f.run()).toThrow('Simulated failure');expect(f.actor.snapshot()).toBe(before);expect(f.actor.historyStatus().len).toBe(n)}finally{failure.mockRestore()}
  })
  it('accepts different Hermes-selected ranges, with no operation or creative value selected by infrastructure',()=>{
    for(const [s,e] of [[1000000,2000000],[4000000,6000000]]){const f=fixture();expect(parse(f.run(s,e)).requested_range_us).toEqual([s,e])}
  })
})
