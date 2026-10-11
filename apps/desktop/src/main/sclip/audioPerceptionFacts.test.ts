import {describe,it,expect} from 'vitest'
import {audioPerceptionFacts} from './audioPerceptionFacts'
describe('audio sense transport truthfulness',()=>{
 it('preserves measured pops and beat fields formerly dropped at the sidecar boundary',()=>{
  const r=audioPerceptionFacts({ok:true,audio_pops:[{cut_t_us:2000,step_discontinuity:.3}],beat_sync_rate:.2,tempo_bpm:90,has_clipping:true,crowd_cheers:[{type:'stadium'}]})
  expect(r.audio_pops).toHaveLength(1);expect(r.beat_sync_rate).toBe(.2);expect(r.has_clipping).toBe(true)
  expect(r.semantic_inferences).toBe(false);expect(r.vocal_delivery_assessed).toBe(false);expect(r).not.toHaveProperty('crowd_cheers')
 })
 it('bounded absent/error measurements are never a successful semantic judgment',()=>{
  const r=audioPerceptionFacts({ok:false,beats_us:Array.from({length:1000},(_,i)=>i),tempo_bpm:NaN})
  expect(r.ok).toBe(false);expect(r.beats_us).toHaveLength(256);expect(r.tempo_bpm).toBe(0);expect(r.vocal_delivery_assessed).toBe(false)
 })
})
