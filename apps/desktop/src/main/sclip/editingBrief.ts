import type { Project } from '../state/model'

export interface DurationRequirement {
  target_us: number; tolerance_us: number; requested_text: string
  kind?: 'exact' | 'maximum' | 'minimum' | 'range'
  min_us?: number; max_us?: number
}
const unitUs=(n:string,u:string)=>Math.round(Number(n)*(/^min/i.test(u)?60:1)*1e6)
/** Parse only explicit request clauses, never a source/gap duration or copied
 * article. Bounds are requirements, not instructions to pad/trim to a maximum. */
export function explicitOutputDuration(brief:string):DurationRequirement|undefined {
  const lines=brief.split(/\r?\n|(?<=[.!?])\s+/).filter(l=>/\b(make|create|produce|deliver|build|keep|duration|length|actually)\b/i.test(l))
  const results:DurationRequirement[]=[]
  for(const line of lines){
    if(/\b(gap|pause|silence|source|transition)\b/i.test(line)&&!/\b(?:video|cut|reel|highlight|excerpt)\s+(?:duration|length)\b/i.test(line))continue
    const range=line.match(/(?:between\s+)?(\d+(?:\.\d+)?)\s*(?:(seconds?|secs?|minutes?|mins?)\s*)?(?:–|—|-|to|and)\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)\b/i)
    if(range){const lo=unitUs(range[1],range[2]??range[4]),hi=unitUs(range[3],range[4]);if(lo>0&&hi>=lo&&hi<=86400e6)results.push({kind:'range',target_us:hi,tolerance_us:0,min_us:lo,max_us:hi,requested_text:line.slice(0,250)});continue}
    const bound=line.match(/\b(max(?:imum)?|at most|no more than|up to|under|less than|min(?:imum)?|at least|no less than|over|more than)\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)\b/i)
      ??line.match(/\b(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)\s*(max(?:imum)?|min(?:imum)?)\b/i)?.map((v,i,a)=>i===1?a[3]:i===2?a[1]:i===3?a[2]:v)
    if(bound){const n=unitUs(bound[2],bound[3]);if(n>0&&n<=86400e6){const min=/^(min|at least|no less|over|more)/i.test(bound[1]);results.push({kind:min?'minimum':'maximum',target_us:n,tolerance_us:0,...(min?{min_us:n}:{max_us:n}),requested_text:line.slice(0,250)})}continue}
    const exact=line.match(/\b(?:make|create|produce|deliver|build|keep)\b[^.!?]{0,70}?\b(?:(roughly|approximately|about|around|exactly)\s+)?(\d+(?:\.\d+)?)\s*[- ]?\s*(seconds?|secs?|minutes?|mins?)\s*[- ]?\s+(?:\w+\s+){0,4}(?:video|cut|excerpt|highlight|showcase|reel)\b/i)
      ??line.match(/\b(?:make|keep)\s+it\s+(?:(roughly|approximately|about|around|exactly)\s+)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)\b/i)
    if(exact){const n=unitUs(exact[2],exact[3]);if(n>0&&n<=86400e6)results.push({target_us:n,tolerance_us:exact[1]&&exact[1].toLowerCase()!=='exactly'?Math.max(1e6,Math.round(n*.1)):0,requested_text:exact[0]})}
  }
  return results.length===1?results[0]:undefined
}
/** A clearly revised but unparseable duration must not revive an earlier exact
 * target. Other follow-ups (captions, source choices) retain existing bounds. */
export function revisesOutputDuration(brief:string){return /\b(?:duration|length|(?:make|keep)\s+it|(?:max(?:imum)?|min(?:imum)?|at most|at least)\b)/i.test(brief)&&/\b(?:seconds?|secs?|minutes?|mins?|shorter|longer)\b/i.test(brief)}
export function durationBounds(r:DurationRequirement,frame=0):[number,number]{
  const tolerance=Math.max(frame,r.tolerance_us)
  if(r.kind==='maximum')return [0,(r.max_us??r.target_us)+frame]
  if(r.kind==='minimum')return [Math.max(0,(r.min_us??r.target_us)-frame),Infinity]
  if(r.kind==='range')return [Math.max(0,(r.min_us??r.target_us)-frame),(r.max_us??r.target_us)+frame]
  return [Math.max(0,r.target_us-tolerance),r.target_us+tolerance]
}

/** Compact facts about the actual authored composition, never chosen edits. */
export function currentOutput(project: Project, requirement?: DurationRequirement) {
  const comp=project.compositions[project.root_id]
  const layers=comp.tracks.flatMap(t=>t.enabled===false?[]:t.layers.filter(l=>l.enabled))
  const sourceLayers=layers.flatMap(l=>{
    const p=l.params
    if (!('src_in_us' in p)||!('src_out_us' in p)||!('media' in p))return []
    const media=project.media_pool[p.media]
    return [{layer_id:l.id,kind:p.kind,timeline_range_us:[l.t_start_us,l.t_end_us],source_range_us:[p.src_in_us,p.src_out_us],source_duration_us:media?.metadata.duration_us??null,entire_source:p.src_in_us===0&&media?.metadata.duration_us!=null&&p.src_out_us>=media.metadata.duration_us-1e6*comp.fps.den/comp.fps.num}]
  })
  const frame=1e6*comp.fps.den/comp.fps.num
  const bounds=requirement?durationBounds(requirement,frame):undefined
  const unmet=bounds&&(comp.duration_us<bounds[0]||comp.duration_us>bounds[1])
  return {coordinate_space:'timeline',composition_id:comp.id,duration_us:comp.duration_us,duration_seconds:comp.duration_us/1e6,time_units:'Tool times are integer microseconds; 1000000us = 1 second',layer_count:layers.length,source_layers:sourceLayers.slice(0,16),omitted_source_layers:Math.max(0,sourceLayers.length-16),
    duration_requirement:requirement?{...requirement,met:!unmet,actual_us:comp.duration_us,actual_seconds:comp.duration_us/1e6,allowed_range_seconds:bounds!.map(n=>Number.isFinite(n)?n/1e6:null)}:null,
    interpretation:'Timeline duration is output length; source duration is available footage. Entire-source layers are observations, not automatic removal instructions. Hermes chooses the edit.'}
}

/** Collect ordinary terminal submissions without interpreting shell/CLI commands.
 * Unsupported cursor editing deliberately clears inferred requirements. */
export class SubmittedPrompt {
  private line=''
  private supported=true
  private pasting=false
  feed(data:string):Array<string|null> {
    const submissions:Array<string|null>=[]
    for(const part of data.split(/(\x1b\[(?:200|201)~)/)){
     if(part==='\x1b[200~'){this.pasting=true;continue}
     if(part==='\x1b[201~'){this.pasting=false;continue}
     for(const char of part){
      if((char==='\r'||char==='\n')&&this.pasting){
        if(this.line.length<65536)this.line+='\n';else this.supported=false
      }else if(char==='\r'||char==='\n'){
        if(this.line.trim()||!this.supported)submissions.push(this.supported?this.line:null)
        this.line='';this.supported=true
      }else if(char==='\x7f'||char==='\b')this.line=this.line.slice(0,-1)
      else if(char==='\x15')this.line=''
      else if(char==='\x03'){this.line='';this.supported=true;this.pasting=false}
      else if(char<' '||char==='\x1b')this.supported=false
      else if(this.line.length<65536)this.line+=char
      else this.supported=false
    }
    }
    return submissions
  }
}
