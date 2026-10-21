import {it,expect,vi} from 'vitest'
import {compactTranscriptRange} from './compactTranscript'
it('coalesces source windows in one response and preserves text/times while deduplicating overlapping boundary segments',async()=>{
 const boundary={text:'Exact boundary.',t_start_us:59000000,t_end_us:61000000,words:[{text:'Exact'}]}
 const read=vi.fn(async(start:number,end:number)=>({content:[{type:'text',text:JSON.stringify({media:{id:'source'},range:{start_us:start,end_us:end},transcript:{status:'available',segments:[boundary,{text:'Window '+start,t_start_us:start,t_end_us:start+1}]}})}]}))
 const r=await compactTranscriptRange(0,130000000,read),b=JSON.parse(r.content[0].text)
 expect(read.mock.calls).toEqual([[0,60000000],[60000000,120000000],[120000000,130000000]])
 expect(b.range).toEqual({start_us:0,end_us:130000000});expect(b.transcript.segments.filter((s:any)=>s.text==='Exact boundary.')).toEqual([{text:'Exact boundary.',t_start_us:59000000,t_end_us:61000000}])
 expect(b.transcript.status).toBe('available')
})
it('never silently drops errors, missing coverage or oversized text',async()=>{
 const err={isError:true,content:[{type:'text',text:'cache unavailable'}]}
 expect(await compactTranscriptRange(0,120000000,async()=>err)).toBe(err)
 await expect(compactTranscriptRange(0,960000000,async()=>({}))).rejects.toThrow('15 minutes')
 await expect(compactTranscriptRange(0,120000000,async()=>({content:[{type:'text',text:JSON.stringify({transcript:{status:'available',segments:[{text:'x'.repeat(33000)}]}})}]}))).rejects.toThrow('response limit')
})
