import type { Project } from '../state/model.js'
import type { CompletionReview } from './completionReview.js'
import { requiredRenderedDimensions } from './finalOutput.js'
import { reviewState } from './evidenceCoordinates.js'
import { RevisionLoopGuard } from './revisionLoopGuard.js'
import { MAX_RANGE_RENDER_DURATION_US } from './rangeRender.js'

/** Grounded protocol feedback; examples never assert a defect or choose an edit. */
export function reviewProgress(guard: RevisionLoopGuard, project: Project, completion?: CompletionReview, opening?: string, failedAction?: string) {
  const progress=guard.guidance(reviewState(project),requiredRenderedDimensions(project,completion?.requirements))
  const duration=project.compositions[project.root_id].duration_us
  const range=progress.inspection_range_us??[0,duration]
  const start=Math.max(0,range[0]),end=Math.min(duration,range[1],start+MAX_RANGE_RENDER_DURATION_US)
  const needed=new Set([...progress.missing_rendered_modalities,...(progress.missing_repair_modalities??[])])
  const inspectionExamples:Array<{name:string;arguments:Record<string,unknown>}>=end>start?[{
    name:'mcp__weftcut__vision_inspect',arguments:{timeline_t_us:Math.floor((start+end)/2),question:'Describe the actual current rendered result in relation to the brief, including visible text and framing. Do not infer an unobserved action.'},
  },{
    name:'mcp__weftcut__inspect_rendered_audio',arguments:{start_us:start,end_us:end},
  },{
    name:'mcp__weftcut__render_timeline_range',arguments:{start_us:start,end_us:end},
  }].filter(example=>example.name.endsWith('inspect_rendered_audio')?needed.has('audio')||needed.has('speech'):needed.has('visual')||needed.has('geometry')||needed.has('text')):[]
  return {...progress,
    // A missing receipt must still have a callable next-action example.
    tool_call_examples:progress.legal_next_actions.includes('current_rendered_inspection')?[...inspectionExamples,...progress.tool_call_examples].slice(0,3):progress.tool_call_examples,
    project_id:project.project_id,composition_id:project.root_id,opening_id:opening,
    timeline_duration_us:duration,timeline_duration_seconds:duration/1e6,time_units:'Integer microseconds; 1s=1000000us',
    actor_epoch:completion?.epoch,request_serial:completion?.requestSerial,turn_id:completion?.lifecycle?.turn_id,
    ...(progress.legal_next_actions.includes('current_rendered_inspection')?{inspection_tool_options:inspectionExamples}:{}),
    ...(failedAction?{previous_action_failure:failedAction.slice(0,600)}:{}),
    reason_scope:'Hermes owns issue selection, subjective judgment and every edit. A recorded issue is an evidence-linked editorial claim, not an automatically certified technical defect.'}
}
