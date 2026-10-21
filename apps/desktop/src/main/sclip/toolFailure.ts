import { createHash } from 'node:crypto'
const repeated=new Map<string,number>()
/** Technical recovery hints only; never supply missing creative parameters or
 * infer that an error proves a mutation did not commit. */
export function failureEnvelope(name:string,args:unknown,text:string,owner:string) {
  const category=/cancel|authority_expired|superseded/i.test(text)?'cancelled_or_expired':
    /STALE_|state.version|binding.changed|project.*changed/i.test(text)?'stale_state':
    /not.configured|not.installed|unavailable|disabled|not.downloaded/i.test(text)?'capability_unavailable':
    /headroom|resource_|busy|queue/i.test(text)?'resource_admission':
    /budget|inspection.limit|review.stage|protocol|reinspection|verification.*required/i.test(text)?'review_or_budget':
    /schema|required|invalid|unknown field|contract|argument/i.test(text)?'invalid_arguments':
    /provider|HTTP|rate.limit|quota|timeout|timed.out/i.test(text)?'provider_or_worker':'execution_failure'
  const key=createHash('sha256').update(JSON.stringify([owner,name,args,category,text.slice(0,2000)])).digest('hex')
  const count=(repeated.get(key)??0)+1;repeated.set(key,count);if(repeated.size>128)repeated.delete(repeated.keys().next().value!)
  return {category,identical_failure_count:count,success_established:false,
    recovery:category==='invalid_arguments'?'Read this tool contract (tool_describe names can batch up to six), repair the supplied fields, and retry the corrected call. Do not change provider configuration.':
      category==='stale_state'?'Read current state/IDs and choose the edit again; reconcile a request_id receipt before replaying a mutation.':
      category==='capability_unavailable'?'Use an actually available capability or disclose this limitation; do not repeatedly retry or silently enable another provider.':
      category==='resource_admission'?'Await/cancel the owned job or choose a lower-resource supported route.':
      category==='review_or_budget'?'Address the specific missing current evidence/legal stage or end honestly incomplete; do not restart unchanged scans.':
      category==='cancelled_or_expired'?'Stop this owned request. New creator input establishes fresh authority.':
      'Inspect the original failure and current state. A transport error does not prove no edit committed; avoid blind mutation replay.',
    ...(count>=3?{repetition_notice:'The same call failed repeatedly. Change the underlying approach or report the specific blocker; repeating this exact request is not progress.'}:{})}
}
