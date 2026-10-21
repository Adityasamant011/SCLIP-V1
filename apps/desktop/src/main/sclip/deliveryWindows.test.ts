import {it,expect,vi} from 'vitest'
import {verifyDeliveryWindows,deliveryWindowsCovered} from './deliveryWindows'
it('verifies the entire long output in contiguous bounded windows and rejects incomplete coverage',async()=>{
 const verify=vi.fn(async(start:number,end:number)=>({valid:true,decoded:true,duration_us:end-start,has_video:true,has_audio:true,artifact_sha256:'hash-'+start}))
 const p=await verifyDeliveryWindows(183200000,120000000,verify)
 expect(verify.mock.calls).toEqual([[0,120000000],[120000000,183200000]])
 expect(p).toMatchObject({valid:true,decoded:true,duration_us:183200000,chunk_count:2,artifact_kind:'ordered_window_manifest'})
 expect(deliveryWindowsCovered(p,183200000)).toBe(true)
 expect(deliveryWindowsCovered({...p,verified_ranges_us:[[0,120000000]]},183200000)).toBe(false)
 expect(deliveryWindowsCovered({...p,verified_ranges_us:[[0,119000000],[120000000,183200000]]},183200000)).toBe(false)
})
it('never certifies a prefix, missing streams, failed decode or an unbounded workload',async()=>{
 const verify=vi.fn(async(start:number,end:number)=>start?{valid:false,reason:'second window failed'}:{valid:true,decoded:true,duration_us:end-start,has_video:true,has_audio:true,artifact_sha256:'hash'})
 expect(await verifyDeliveryWindows(150000000,120000000,verify)).toMatchObject({valid:false,reason:'second window failed'})
 const no=vi.fn();expect((await verifyDeliveryWindows(30000000000,120000000,no)).valid).toBe(false);expect(no).not.toHaveBeenCalled()
 const p=await verifyDeliveryWindows(150000000,120000000,async(a,b)=>({valid:true,decoded:true,duration_us:b-a,has_video:a===0,has_audio:true,artifact_sha256:'hash'}))
 expect(p.has_video).toBe(false)
})
