import type {Project} from '../state/model'
import {audioAudibility,placedLayers} from './audioAudibility'
/** A bounded worksheet of current composed output, not a semantic match verdict.
 * Partition at authored visual boundaries; graphic sections get two seek times. */
export function narrationAlignmentPlan(project:Project,audio:any,start:number,end:number) {
  if(audio.transcript?.status!=='available')throw new Error('Rendered narration transcript unavailable; alignment is unverified.')
  const segments=(audio.transcript.segments??[]).filter((s:any)=>typeof s.text==='string'&&Number.isSafeInteger(s.t_start_us)&&Number.isSafeInteger(s.t_end_us)&&s.t_end_us>s.t_start_us)
  if(!segments.length)throw new Error('No recognized narration segments; alignment is unverified.')
  const placed=placedLayers(project,project.root_id,start,end)
  const foreground=placed.filter(p=>['VideoClip','Motif','ImageOverlay'].includes(p.layer.params.kind))
  const layers=foreground.length?foreground:placed.filter(p=>p.layer.params.kind==='Text')
  const boundaries=[...new Set([start,end,...layers.flatMap(p=>[Math.max(start,p.start_us),Math.min(end,p.end_us)])])].sort((a,b)=>a-b)
  const all=boundaries.slice(0,-1).flatMap((a,i)=>{
    const b=boundaries[i+1],spoken=segments.filter((s:any)=>s.t_start_us<b&&s.t_end_us>a)
    if(b<=a)return []
    const visible=layers.filter(p=>p.start_us<b&&p.end_us>a)
    const graphic=visible.some(p=>p.layer.params.kind==='Motif')
    if(!spoken.length&&!graphic)return []
    const lo=spoken.length?Math.max(a,Math.min(...spoken.map((s:any)=>s.t_start_us))):a,hi=spoken.length?Math.min(b,Math.max(...spoken.map((s:any)=>s.t_end_us))):b
    const times=graphic?[Math.floor(lo+(hi-lo)*0.25),Math.floor(lo+(hi-lo)*0.75)]:[Math.floor((lo+hi)/2)]
    return times.map(t=>{
      const placement=visible.find(p=>p.layer.params.kind==='VideoClip'),clip=placement?.layer
      return {layer_id:clip?.id??visible.at(-1)?.layer.id??null,layer_ids:visible.map(p=>p.layer.id),instances:visible.map(p=>({layer_id:p.layer.id,instance_path:p.instance_path,composition_id:p.composition_id,timeline_offset_us:p.offset_us})),timeline_range_us:[a,b],timeline_t_us:t,spoken_segments:spoken,
        source_mapping:clip?.params.kind==='VideoClip'?{media_id:clip.params.media,source_t_us:clip.params.src_in_us+(t-placement!.offset_us-clip.t_start_us)*clip.params.speed}:null}
    })
  })
  if(!all.length)throw new Error('No recognized narration in this interval; alignment is unverified.')
  const times=[...new Set(all.map(p=>p.timeline_t_us))].sort((a,b)=>a-b),selected=times.slice(0,12)
  const omitted=all.filter(p=>!selected.includes(p.timeline_t_us))
  const coveredEnd=omitted.length?Math.min(...omitted.map(p=>p.timeline_range_us[0])):end
  return {sample_times:selected,pairs:all.filter(p=>selected.includes(p.timeline_t_us)),omitted_sample_count:times.length-selected.length,
    covered_ranges_us:coveredEnd>start?[[start,coveredEnd]]:[],remaining_range_us:omitted.length?[coveredEnd,end]:null,
    coverage:omitted.length?'bounded_sample_only':'all_authored_graphic_sections_and_speech_bearing_footage'}
}

/** Accumulate inspected windows only for the exact current output state. A
 * bounded partial worksheet never certifies an omitted section. */
export function recordAlignmentCoverage(entry:{alignmentState?:string;alignmentWindows?:{state:string;ranges:number[][]}}, project:Project,state:string,paired:any,explicitSpeech=false) {
  if(paired.status!=='available')return
  const prior=entry.alignmentWindows?.state===state?entry.alignmentWindows.ranges:[]
  const ranges=[...prior,...(paired.covered_ranges_us??[])].sort((a,b)=>a[0]-b[0])
  entry.alignmentWindows={state,ranges}
  const audio=audioAudibility(project,project.root_id,0,project.compositions[project.root_id].duration_us,Number.MAX_SAFE_INTEGER).layers.filter(l=>l.selected_by_mix_gates)
  const voice=audio.filter(l=>l.role==='voiceover'),subjects=voice.length?voice:explicitSpeech?audio.filter(l=>l.role!=='music'):[]
  const covers=(a:number,b:number)=>{let cursor=a;for(const [s,e] of ranges){if(s>cursor)break;if(e>cursor)cursor=e;if(cursor>=b)return true}return false}
  if(subjects.length&&subjects.every(l=>covers(l.timeline_range_us[0],l.timeline_range_us[1])))entry.alignmentState=state
}
export function pairNarrationEvidence(plan:ReturnType<typeof narrationAlignmentPlan>,visual:any,audio:any) {
 const pairs=plan.pairs.map(p=>({...p,visual_observation:visual.frame_observations?.find((f:any)=>f.timeline_t_us===p.timeline_t_us)??null}))
 return {coordinate_space:'timeline',evidence_origin:'CURRENT_TIMELINE',timeline_range_us:audio.timeline_range_us,
   state_version:audio.state_version,status:pairs.every(p=>p.visual_observation?.inference_ok)?'available':'unavailable',
   ...visual,audio,alignment_pairs:pairs,coverage:plan.coverage,omitted_sample_count:plan.omitted_sample_count,covered_ranges_us:plan.covered_ranges_us,remaining_range_us:plan.remaining_range_us,
   instruction:'Compare the recognized words with the observed subject or diagram for EACH pair. For graphics, compare the two seek times, arrows, labels and timing against the spoken explanation. If remaining_range_us is present, inspect that remaining interval before concluding. Visual resemblance alone does not establish the exact named object or location. Do not call a contradiction aligned. Register mismatches, rewrite unsupported narration or choose supported footage, then inspect again. Generic location metadata does not establish a venue visit. Samples and ASR can be wrong; disclose uncertainty. This is paired evidence, not a semantic quality certification.'}
}
export const AUDIO_VISUAL_ALIGNMENT_TOOL={name:'inspect_audio_visual_alignment',description:'Inspect CURRENT rendered narration and its matching composed visuals in ONE bounded call, preferred to separate audio and visual scans. Local Whisper yields actual word/segment times, then up to twelve frame observations follow authored shot/graphic boundaries; graphic sections get two seek times. remaining_range_us reports any interval needing a further bounded call. Compare nouns/actions/locations explicitly; neither generic eating nor a timeline overlap proves a claim. Required before completing a narrated video. No timeline edits or cloud fallback.',inputSchema:{type:'object',properties:{start_us:{type:'integer',minimum:0},end_us:{type:'integer',minimum:1}},required:['start_us','end_us'],additionalProperties:false}}
