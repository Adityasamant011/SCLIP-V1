import type { Project } from '../state/model'

export interface DurationRequirement { target_us: number; tolerance_us: number; requested_text: string }

/** Only unambiguous output-duration requests; source lengths and gap lengths
 * are not output targets. Unrecognized/ambiguous wording stays unvalidated. */
export function explicitOutputDuration(brief: string): DurationRequirement | undefined {
  const matches = [...brief.matchAll(/\b(?:make|create|produce|deliver|build)\b[^.!?\n]{0,90}?\b(?:(roughly|approximately|about|around)\s+)?(\d+(?:\.\d+)?)\s*[- ]?\s*(seconds?|secs?|minutes?|mins?)\s*[- ]?\s+(?:\w+\s+){0,4}(?:video|cut|excerpt|highlight|showcase|reel)\b/gi)]
  if (matches.length !== 1) return undefined
  const match=matches[0]
  if(/\b(?:gap|pause|silence|source|transition)\b/i.test(match[0]))return undefined
  const seconds=Number(match[2])*(/^min/i.test(match[3])?60:1)
  if (!Number.isFinite(seconds)||seconds<=0||seconds>86400) return undefined
  return { target_us:Math.round(seconds*1e6), tolerance_us:match[1]?Math.max(1e6,Math.round(seconds*1e5)):0, requested_text:match[0] }
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
  const unmet=requirement&&Math.abs(comp.duration_us-requirement.target_us)>Math.max(frame,requirement.tolerance_us)
  const allowedTolerance=requirement?Math.max(frame,requirement.tolerance_us):0
  return {coordinate_space:'timeline',composition_id:comp.id,duration_us:comp.duration_us,duration_seconds:comp.duration_us/1e6,time_units:'Tool times are integer microseconds; 1000000us = 1 second',layer_count:layers.length,source_layers:sourceLayers.slice(0,16),omitted_source_layers:Math.max(0,sourceLayers.length-16),
    duration_requirement:requirement?{...requirement,met:!unmet,actual_us:comp.duration_us,actual_seconds:comp.duration_us/1e6,allowed_range_seconds:[Math.max(0,requirement.target_us-allowedTolerance)/1e6,(requirement.target_us+allowedTolerance)/1e6]}:null,
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
