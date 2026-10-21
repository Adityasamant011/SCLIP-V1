import fs from 'node:fs'
import { createHash } from 'node:crypto'
import type { Project } from '../state/model.js'
import { runtimeScope } from './runtimeScheduler.js'
import { reviewState } from './evidenceCoordinates.js'

export type EvidenceKind='visual'|'audio'
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
/** Projected dependencies, not a new editorial state. Entire animated curves
 * and transition lists remain dependencies, including keys outside the window.
 * External Motif source is not in Project; visual reuse fails closed for it. */
export function rangeDependency(project:Project,start:number,end:number,kind:EvidenceKind,compositionId=project.root_id):string|null {
  const media=new Set<string>(),seen=new Set<string>()
  let unsupported=false
  function composition(id:string,lo:number,hi:number,depth:number):unknown {
    const comp=project.compositions[id]
    if(!comp||depth>32||seen.has(id)){unsupported=true;return null}
    seen.add(id)
    const tracks=comp.tracks.filter(t=>t.enabled).map(t=>({id:t.id,enabled:t.enabled,muted:t.muted,solo:t.solo,
      layers:t.layers.filter(l=>l.enabled&&l.t_start_us<hi&&l.t_end_us>lo&&
        (kind==='visual'?l.params.kind!=='Audio':l.params.kind==='Audio'||l.params.kind==='CompositionRef')).map(l=>{
          if('media' in l.params)media.add(l.params.media)
          if(kind==='visual'&&l.params.kind==='Motif')unsupported=true
          return {layer:l,...(l.params.kind==='CompositionRef'?{child:composition(l.params.composition,
            Math.max(lo,l.t_start_us)-l.t_start_us+l.params.src_in_us,
            Math.min(hi,l.t_end_us)-l.t_start_us+l.params.src_in_us,depth+1)}:{})}
        })})).filter(t=>t.layers.length>0)
    seen.delete(id)
    return {id,canvas:[comp.width,comp.height,comp.fps,comp.duration_us,comp.sample_rate,comp.channels,comp.color_space,comp.background],tracks,transitions:comp.transitions}
  }
  const structure=composition(compositionId,start,end,0)
  const sources=[...media].sort().map(id=>{
    const m=project.media_pool[id]
    if(!m){unsupported=true;return null}
    const stat=fs.statSync(m.path_abs,{throwIfNoEntry:false})
    if(!stat?.isFile()){unsupported=true;return null}
    return {id,path:m.path_abs,hash:m.file_hash_blake3,size:stat.size,mtime:stat.mtimeMs,ctime:stat.ctimeMs,metadata:m.metadata}
  })
  return unsupported?null:hash({project_id:project.project_id,structure,sources,settings:project.settings,...(kind==='audio'?{roles:project.audio_roles}:{})})
}
interface Entry { dependency:string; state:string; result:unknown; bytes:number; project:string; opening?:string; start:number; end:number; kind:EvidenceKind; comp:string }
/** Bounded current-process observations. Reuse revalidates dependencies and
 * creates a new acquisition response; it does not resurrect old review IDs. */
export class EvidenceStore {
  private entries=new Map<string,Entry>();private bytes=0
  private key(project:Project,start:number,end:number,kind:EvidenceKind,variant:unknown,comp:string) {
    const scope=runtimeScope.getStore()
    return hash({project:project.project_id,opening:scope?.opening??'local',kind,start,end,comp,variant})
  }
  get<T>(project:Project,start:number,end:number,kind:EvidenceKind,variant:unknown,comp=project.root_id):T|undefined {
    const dependency=rangeDependency(project,start,end,kind,comp)
    if(!dependency)return
    const key=this.key(project,start,end,kind,variant,comp),entry=this.entries.get(key)
    if(!entry||entry.dependency!==dependency)return
    this.entries.delete(key);this.entries.set(key,entry)
    const result=structuredClone(entry.result) as Record<string,unknown>
    result.state_version=hash(JSON.parse(reviewState(project)))
    result.evidence_reuse={dependency_sha256:dependency,original_state_sha256:createHash('sha256').update(entry.state).digest('hex'),validated_against_current_dependencies:true,scope:'same source/render/model dependencies; original sampled coverage only'}
    return result as T
  }
  put(project:Project,start:number,end:number,kind:EvidenceKind,variant:unknown,result:unknown,comp=project.root_id) {
    const dependency=rangeDependency(project,start,end,kind,comp);if(!dependency)return
    const size=Buffer.byteLength(JSON.stringify(result));if(size>512*1024)return
    const key=this.key(project,start,end,kind,variant,comp),old=this.entries.get(key)
    if(old){this.bytes-=old.bytes;this.entries.delete(key)}
    this.entries.set(key,{dependency,state:reviewState(project),result:structuredClone(result),bytes:size,project:project.project_id,opening:runtimeScope.getStore()?.opening,start,end,kind,comp});this.bytes+=size
    while(this.entries.size>64||this.bytes>8*1024*1024){const k=this.entries.keys().next().value!;this.bytes-=this.entries.get(k)!.bytes;this.entries.delete(k)}
  }
  currentAudio(project:Project):Array<{start:number;end:number;result:any}> {
    const opening=runtimeScope.getStore()?.opening
    if(!opening)return []
    return [...this.entries.values()].reverse().filter(e=>e.project===project.project_id&&e.opening===opening&&e.kind==='audio'&&e.dependency===rangeDependency(project,e.start,e.end,e.kind,e.comp))
      .slice(0,8).map(e=>({start:e.start,end:e.end,result:structuredClone(e.result)}))
  }
}
export const evidenceStore=new EvidenceStore()
