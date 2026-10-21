import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { DOMParser } from 'linkedom'
import type { Project } from '../state/model.js'

const digest=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex')
export interface SceneIntent { purpose:string; visual_concept:string; entities?:string[]; beats?:Array<{at_s:number;description:string}> }
export function validateSceneIntent(value:unknown,duration:number):SceneIntent|undefined {
  if(value===undefined)return
  const v=value as SceneIntent
  if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['purpose','visual_concept','entities','beats'].includes(k))||
    [v.purpose,v.visual_concept].some(t=>typeof t!=='string'||!t.trim()||t.length>500))throw new Error('scene_intent needs concise purpose and visual_concept (1–500 characters each)')
  if(v.entities&&(!Array.isArray(v.entities)||v.entities.length>12||v.entities.some(t=>typeof t!=='string'||t.length>100)))throw new Error('scene_intent entities requires up to twelve short names')
  if(v.beats&&(!Array.isArray(v.beats)||v.beats.length>12||v.beats.some((b,i)=>!b||Object.keys(b).some(k=>!['at_s','description'].includes(k))||!Number.isFinite(b.at_s)||b.at_s<0||b.at_s>=duration||i>0&&b.at_s<=v.beats![i-1]!.at_s||typeof b.description!=='string'||b.description.length>200)))throw new Error('scene_intent beats need increasing actual content times inside the duration and short descriptions')
  return structuredClone(v)
}
export function sceneIntentFromHtml(html:string):SceneIntent|undefined {
  try {return JSON.parse(new DOMParser().parseFromString(html,'text/html').querySelector('meta[name="sclip-scene-intent"]')?.getAttribute('content')??'null')??undefined}catch{return}
}
/** Snapshot approved local assets into the source itself. The model passes
 * handles/IDs, never base64. Existing Motif manifests and prop types stay intact. */
export function bindGraphicAssets(html:string,args:Record<string,unknown>,project:Project) {
  let source=html,total=0
  const receipts:Array<{name:string;kind:string;sha256:string;bytes:number}>=[],used=new Set<string>()
  const images=args.asset_bindings??[]
  if(!Array.isArray(images)||images.length>4)throw new Error('asset_bindings requires at most four imported still images')
  for(const a of images){
    if(!a||Object.keys(a).some(k=>!['name','media_id'].includes(k))||typeof a.name!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(a.name)||used.has(a.name))throw new Error('Use unique short asset names and an imported media_id')
    used.add(a.name)
    const media=project.media_pool[a.media_id]
    if(!media||media.kind!=='Image')throw new Error('Graphic binding requires a current imported still image')
    const stat=fs.statSync(media.path_abs);if(!stat.isFile()||stat.size>1200000)throw new Error('Graphic still image must be at most 1.2MB; use an appropriate prepared image')
    const b=fs.readFileSync(media.path_abs)
    const mime=b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'image/png':b[0]===255&&b[1]===216?'image/jpeg':b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'image/webp':null
    if(!mime)throw new Error('Graphic image binding supports verified PNG/JPEG/WebP bytes')
    const token=new RegExp(`sclip-asset:${a.name}(?![A-Za-z0-9_-])`,'g')
    if(!token.test(source))throw new Error(`Unused graphic asset binding: ${a.name}`)
    token.lastIndex=0
    source=source.replace(token,`data:${mime};base64,${b.toString('base64')}`);total+=b.length
    receipts.push({name:a.name,kind:mime,sha256:digest(b),bytes:b.length})
  }
  const fonts=args.font_bindings??[]
  if(!Array.isArray(fonts)||fonts.length>2)throw new Error('font_bindings requires at most two explicit local font files')
  for(const f of fonts){
    if(!f||Object.keys(f).some(k=>!['family','path','weight'].includes(k))||typeof f.family!=='string'||!/^[\w -]{1,80}$/.test(f.family)||typeof f.path!=='string'||!path.isAbsolute(f.path)||
      f.weight!==undefined&&(!Number.isInteger(f.weight)||f.weight<100||f.weight>900))throw new Error('Font binding requires a family, absolute font path and optional weight 100–900')
    const stat=fs.statSync(f.path);if(!stat.isFile()||stat.size>1200000)throw new Error('Embedded local font must be at most 1.2MB')
    const b=fs.readFileSync(f.path),magic=b.toString('ascii',0,4),mime=magic==='wOF2'?'font/woff2':magic==='wOFF'?'font/woff':magic==='OTTO'?'font/otf':b.length>=4&&b.readUInt32BE(0)===0x00010000?'font/ttf':null
    if(!mime)throw new Error('Font file has an unsupported signature')
    const css=`<style>@font-face{font-family:"${f.family}";font-weight:${f.weight??400};src:url(data:${mime};base64,${b.toString('base64')})}</style>`
    source=/<head[\s>]/i.test(source)?source.replace(/<head([^>]*)>/i,`<head$1>${css}`):css+source
    total+=b.length;receipts.push({name:f.family,kind:mime,sha256:digest(b),bytes:b.length})
  }
  if(total>1500000||Buffer.byteLength(source)>2*1024*1024)throw new Error('Bound graphic assets exceed the self-contained 2MiB source budget')
  return {html:source,assets:receipts}
}
export const MOTION_PRIMITIVES={
  spatial_relationship:'Use named SVG objects at grounded positions. At each narration beat: tl.to(object,{attr:{cx:nextX,cy:nextY},duration:0.7,ease:"power2.inOut"},beat). Move the actual object whose role changes, then reveal its relationship/label.',
  directional_connection:'Draw a supplied relationship with an SVG path: const n=path.getTotalLength(); gsap.set(path,{strokeDasharray:n,strokeDashoffset:n}); tl.to(path,{strokeDashoffset:0,duration:0.8,ease:"none"},beat). DrawSVG/MotionPath plugins are not bundled.',
  evidence_focus:'For a real image or diagram, deliberately animate a focus group/crop or highlight at a supplied coordinate while retaining context. A focus effect does not establish identity or track an unmeasured object.',
  data_geometry:'Map verified values into SVG x/y/width/height with an explicit domain; animate bar/point geometry from baseline to its actual value. Keep labels exact. Host code does not invent the data or choose the conclusion.',
  transformation:'Use before/after object geometry and staged connecting movement to explain a supported change. Prefer the changed relationship to a generic title fade. Keep earlier context readable as the next state develops.',
  staged_annotation:'Use a restrained mask/reveal for a label connected to the actual subject. Place text in a measured box, preserve speaker visibility, and reserve enough reading time. A simple reveal is valid when it serves the brief.',
}
export const GRAPHIC_AUTHORING_TOOL={name:'get_hyperframes_authoring_context',description:'Read current canvas, existing graphic intentions/structure, local asset IDs and composable GSAP/SVG motion techniques. Helps design subject-specific graphics beyond recipes; no new model, generated design, edits or quality verdict. Existing repeated structure is diagnostic, not an instruction to randomize the visual language.',inputSchema:{type:'object',properties:{},additionalProperties:false}} as const
