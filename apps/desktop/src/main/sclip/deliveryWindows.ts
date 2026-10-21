import {createHash} from 'node:crypto'
import type {DeliveryProof} from './finalOutput.js'
export function deliveryWindowsCovered(proof: DeliveryProof, duration: number): boolean {
  if(proof.chunk_count === undefined)return true
  const ranges=proof.verified_ranges_us
  if(!Number.isInteger(proof.chunk_count)||proof.chunk_count<1||proof.chunk_count>8||!ranges||ranges.length!==proof.chunk_count)return false
  let cursor=0
  for(const range of ranges){if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]!==cursor||range[1]<=cursor||range[1]>duration)return false;cursor=range[1]}
  return cursor===duration
}
/** Same production render/decode check in bounded contiguous windows, not an
 * agent inspection loop. A failure anywhere rejects whole-output proof. */
export async function verifyDeliveryWindows(duration:number,limit:number,verify:(start:number,end:number)=>Promise<DeliveryProof>):Promise<DeliveryProof>{
  if(!Number.isSafeInteger(duration)||duration<=0||limit<=0||duration>limit*8)return {valid:false,reason:'Full output exceeds bounded completion QA capacity (eight render windows); whole-output decodability remains unproven.'}
  const ranges:Array<[number,number]>=[],proofs:DeliveryProof[]=[]
  for(let start=0;start<duration;start+=limit){
    const end=Math.min(start+limit,duration),p=await verify(start,end)
    if(!p.valid||!p.decoded||!Number.isFinite(p.duration_us)||Math.abs(p.duration_us!-(end-start))>100000||!p.artifact_sha256)return {valid:false,reason:p.reason??'A complete output window could not be rendered and decoded.'}
    ranges.push([start,end]);proofs.push(p)
  }
  return {valid:true,decoded:true,duration_us:proofs.reduce((n,p)=>n+p.duration_us!,0),has_video:proofs.every(p=>p.has_video===true),has_audio:proofs.every(p=>p.has_audio===true),chunk_count:ranges.length,verified_ranges_us:ranges,artifact_kind:'ordered_window_manifest',artifact_sha256:createHash('sha256').update(JSON.stringify(ranges.map((range,i)=>({range,sha256:proofs[i].artifact_sha256})))).digest('hex')}
}
