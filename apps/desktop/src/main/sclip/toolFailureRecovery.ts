import {createHash} from 'node:crypto'
import type {JevDecide} from './jevClient'

/** Failure bookkeeping is advisory: never changes arguments, executes a retry,
 * invents an ID, or picks an editing operation. Jev is optional and read-only. */
export function createToolFailureRecovery(jev?: JevDecide, authorized: () => boolean = () => false) {
  const seen = new Map<string,{count:number; advisory:unknown}>()
  let inFlight = false
  return async (tool:string,args:Record<string,unknown>,result:unknown,state:string) => {
    const raw = JSON.stringify(result)
    const signature = createHash('sha256').update(JSON.stringify([tool,args,raw,state])).digest('hex')
    const previous = seen.get(signature)
    if(previous) {previous.count++;return {...previous.advisory as object, identical_failure_count:previous.count, cached:true,
      next_step:'The same request previously failed on this project state. Avoid blind retries; first address the technical constraint or establish that runtime readiness changed. Hermes chooses whether a retry or another approach is justified.'}}
    const category = /LayerNotFound|TrackNotFound|MediaNotFound/.test(raw)?'missing_current_id':
      /overlap|LayerOverlap/i.test(raw)?'occupied_lane': /STALE_|stale.*state/i.test(raw)?'stale_state':
      /unavailable|not configured|requires the live|missing.*(model|binary|engine)/i.test(raw)?'unavailable_capability':
      /required|invalid.*(param|argument)|schema|maximum|max.*(range|seconds)|at most/i.test(raw)?'arguments': 'unclassified'
    const guidance:Record<string,string> = {
      missing_current_id:'Read current authoritative IDs; do not guess an ID from a label or old proposal.',
      occupied_lane:'No automatic lane move, trim or overwrite is authorized by this error. Hermes chooses a valid placement or revises the edit.',
      stale_state:'Reacquire current relevant evidence and state identity before submitting a mutation.',
      arguments:'Use the actual schema and reported range/field constraints; retain Hermes-selected creative values.',
      unavailable_capability:'Report the actual unavailable dependency; do not loop or silently substitute a paid service.',
      unclassified:'Inspect the bounded error. Hermes decides whether a corrected technical request, different approach or user input is justified.',
    }
    let advisory:Record<string,unknown> = {category, identical_failure_count:1, cached:false, automatic_retry:false,
      editorial_owner:'Hermes', next_step:guidance[category], jev:{status:'disabled',requests:0}}
    // No provider call without a separate explicit opt-in. Never send raw tool
    // arguments, commands, model prose or credentials to the auxiliary route.
    let enabled=false; try {enabled=authorized()} catch {}
    const entry = {count:1, advisory:advisory as unknown}
    seen.set(signature,entry);if(seen.size>32)seen.delete(seen.keys().next().value!)
    if(jev && enabled && inFlight) advisory={...advisory,jev:{status:'busy',requests:0}}
    if(jev && enabled && !inFlight) {
      inFlight=true
      entry.advisory={...advisory,jev:{status:'pending',requests:1}}
      try {
        const response=await jev({tool,technical_category:category,argument_fields:Object.keys(args).slice(0,32),
          state_identity:createHash('sha256').update(state).digest('hex')},{technical_recovery:{type:'noul',
          instructions:'Assess only whether the reported failure category allows technical recovery from schema/current-state evidence. Do not select a creative issue, edit, parameter or replacement command.',
          criteria:{true:'A technical constraint can be addressed using schema/current IDs or availability evidence.',false:'Insufficient information or a creative/user choice is required; return to the primary Hermes editor.'}}})
        advisory={...advisory,jev:{status:'observed',requests:1,technical_recovery_score:response.answers.technical_recovery,
          semantics:'Uncalibrated advisory score. Jev cannot write/execute commands. Hermes chooses any retry and all creative values.'}}
      }catch {advisory={...advisory,jev:{status:'unavailable',requests:1},next_step:guidance[category]}}
      finally {inFlight=false}
    }
    entry.advisory=advisory
    return advisory
  }
}
