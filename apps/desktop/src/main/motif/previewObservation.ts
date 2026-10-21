import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import type {VisionBackend} from '../sclip/visionRuntime'

/** The existing local observer reads the exact preview bytes. A draft is never
 * current-timeline evidence, and an unavailable observer cannot certify it. */
export async function observeGraphicPreview(id:string,t:number,png:string,args:{inspect?:boolean;question?:string;inspection_reason?:string},runtime:Pick<VisionBackend,'analyze'>,placed:string[]) {
 const facts={evidence_origin:'DRAFT_PREVIEW',coordinate_space:'draft',draft_id:id,content_time_seconds:t,
  image_sha256:createHash('sha256').update(Buffer.from(png,'base64')).digest('hex'),placed_layer_ids:placed,
  placement_status:placed.length?'placed_source_preview':'not_placed',
  scope:'This is the draft source, not verification of a composed timeline. Choose when to place with add_motif, then review actual output. A working first scene can be placed before further polish.'}
 if(args.inspect===false)return {...facts,observation:{status:args.inspection_reason?'budget_limited':'not_requested',reason:args.inspection_reason??null}}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-draft-observation-')),file=path.join(dir,'frame.png')
 try{
  fs.writeFileSync(file,Buffer.from(png,'base64'))
  const r=await runtime.analyze({imagePath:file,question:(args.question?.trim()||'Describe the visible labels, objects and their relative positions; mention clipping or overlap if observed.')+' Answer in at most 40 words; do not infer unobserved motion.',resolution:'high',maxTokens:96,localOnly:true})
  return {...facts,observation:{status:r.ok?'available':'unavailable',evidence_class:'MODEL_OBSERVATION',description:r.description,model:r.model,output_limit_reached:r.outputLimitReached??null,error:r.error??null,
   limitation:'Fallible local single-frame observation, not a creative verdict or proof of motion. Compare another meaningful time only when needed; do not repeat the same image through another tool.'}}
 }catch(e){return {...facts,observation:{status:'unavailable',error:e instanceof Error?e.message:String(e)}}}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
}
