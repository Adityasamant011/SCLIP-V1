import {describe,it,expect} from 'vitest'
import {captionRevealEnd, type CaptionTiming} from './captionTiming'
const text='One two, three.'
const timing: CaptionTiming={version:1,text,duration_us:3_000_000,provenance:'exact',words:[
 {text:'One',start_us:100_000,end_us:500_000},{text:'two,',start_us:800_000,end_us:1_200_000},{text:'three.',start_us:2_000_000,end_us:2_500_000}]}
describe('deterministic caption reveal',()=>{
 it('reveals only words whose stored start has passed, including exact boundaries and reverse seeks',()=>{
  for(const [t,end]of [[0,0],[99_999,0],[100_000,3],[799_999,3],[800_000,8],[2_000_000,text.length],[500_000,3]])expect(captionRevealEnd(text,timing,t)).toBe(end)
 })
 it('does not change timing provenance or the original words',()=>{
  const before=structuredClone(timing);expect(captionRevealEnd(text,{...timing,provenance:'interpolated_from_cue'},900_000)).toBe(8);expect(timing).toEqual(before)
 })
 it.each([null,{}, {...timing,text:'different'}, {...timing,words:timing.words.slice(1)}, {...timing,words:[{text,start_us:1,end_us:1}]}, {...timing,words:[...timing.words,{text:'extra',start_us:2_000_000,end_us:2_800_000}]}])('abstains for missing, stale, partial or overlapping observations',bad=>{
  expect(captionRevealEnd(text,bad,1_000_000)).toBeUndefined()
 })
 it('matches repeated words in sequence and retains punctuation/newlines',()=>{
  const t={...timing,text:'Go,\nGo!',words:[{text:'Go,',start_us:0,end_us:500_000},{text:'Go!',start_us:800_000,end_us:1_000_000}]};expect(captionRevealEnd(t.text,t,0)).toBe(3);expect(captionRevealEnd(t.text,t,800_000)).toBe(t.text.length)
 })
 it('abstains on unsupported RTL layout rather than hiding words',()=>expect(captionRevealEnd('مرحبا',{...timing,text:'مرحبا',words:[{text:'مرحبا',start_us:0,end_us:1000}]},0)).toBeUndefined())
})
