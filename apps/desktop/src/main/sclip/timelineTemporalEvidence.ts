import { createHash } from 'node:crypto'
import type { Project } from '../state/model'
import { reviewState, validateTimelineRange } from './evidenceCoordinates'
import { MAX_RANGE_RENDER_DURATION_US } from './rangeRender'
import { inspectTimelineRangeVisuals, representativeTimes } from './timelineVisualEvidence'

export function temporalWindowStructure(project:Project,args:Record<string,unknown>) {
  const id=String(args.composition_id??project.root_id),comp=project.compositions[id]
  if(!comp)throw new Error('Composition not found')
  validateTimelineRange(args.start_us,args.end_us,comp.duration_us,id)
  const start=Number(args.start_us),end=Number(args.end_us),count=Number(args.representative_samples??5)
  if(end-start>MAX_RANGE_RENDER_DURATION_US)throw new Error('Temporal window exceeds configured review duration bound')
  const regular=representativeTimes(start,end,count)
  const layers=comp.tracks.flatMap(t=>t.layers)
  const allEvents=layers.flatMap(l=>[
    {timeline_t_us:l.t_start_us,change:'layer_start',layer_id:l.id,kind:l.params.kind},
    {timeline_t_us:l.t_end_us,change:'layer_end',layer_id:l.id,kind:l.params.kind},
  ]).filter(e=>e.timeline_t_us>=start&&e.timeline_t_us<end).sort((a,b)=>a.timeline_t_us-b.timeline_t_us||a.layer_id.localeCompare(b.layer_id))
  // Even chronological coverage, not ranked scenes or recommendations. Events
  // remain separate from pixels and do not assert perceived shot content.
  const candidates=[...new Set([...regular,...allEvents.map(e=>e.timeline_t_us)])].sort((a,b)=>a-b)
  const times=[...new Set(Array.from({length:count},(_,i)=>candidates[Math.round(i*(candidates.length-1)/(count-1))]))]
  return {composition_id:id,state_version:createHash('sha256').update(reviewState(project)).digest('hex'),times,
    structural_changes:allEvents.slice(0,128),omitted_structural_changes:Math.max(0,allEvents.length-128),
    transitions:comp.transitions.filter(t=>layers.some(l=>l.id===t.from_layer && l.t_end_us>=start&&l.t_end_us<=end)).slice(0,64)}
}
export async function inspectTimelineTemporalWindow(project:Project,args:Record<string,unknown>,getActiveWindow:()=>any,
  inspect:typeof inspectTimelineRangeVisuals=inspectTimelineRangeVisuals,signal?:AbortSignal) {
  const structure=temporalWindowStructure(project,args)
  signal?.throwIfAborted()
  const visuals=await inspect(project,args,getActiveWindow,structure.times,signal)
  signal?.throwIfAborted()
  // Keep authored parameter detail in get_param_track, not a potentially
  // unbounded animation dump in this temporal evidence index.
  const samples=visuals.representative_samples.map(sample=>({...sample,
    current_visual_state:sample.current_visual_state.slice(0,64).map((layer:any)=>({layer_id:layer.layer_id,timeline_range_us:layer.timeline_range_us,
      kind:layer.params.kind,source_mapping:layer.source_mapping,...(layer.params.kind==='Text'?{text:String(layer.params.content).slice(0,256)}:{})})),
    omitted_current_layers:Math.max(0,sample.current_visual_state.length-64)}))
  return {...visuals,representative_samples:samples,state_version:structure.state_version,structural_changes:structure.structural_changes,
    omitted_structural_changes:structure.omitted_structural_changes,transitions:structure.transitions,
    authority:{structure:'AUTHORITATIVE_PROJECT_ACTOR',pixels:'RENDERED_CURRENT_TIMELINE',observations:'MODEL_OBSERVATION'},
    temporal_scope:'Chronological bounded rendered-frame sequence plus authored layer/text/transition boundaries. Motion and unobserved intervals remain unknown. No visual-progression quality verdict.'}
}
