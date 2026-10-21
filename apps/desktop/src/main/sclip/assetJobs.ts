import { randomUUID } from 'node:crypto'
import type { RequestAuthority } from './completionCheckpoint.js'
import { runtimeScope, type JobScope } from './runtimeScheduler.js'
import { runtimeTrace } from './runtimeTrace.js'

const names=['generate_image','generate_music','synthesize_speech','resolve_visual_intents','evaluate_source_passages'] as const
export const PREPARE_ASSETS_TOOL={name:'prepare_assets',description:'Start up to four explicitly chosen independent asset/evidence preparations and return owned job IDs promptly so editing can continue. Supports local image/short sound, speech audition (always preview_only, never places), stock intent matching, and enabled optional Jev passage ranking. Uses each actual tool schema and existing permissions; no remote fallback, download of model packs, import or timeline writes. Jobs stay bound to this native request/project opening. Use asset_job await once when a result is needed, then choose/import/place with ordinary editing tools.',inputSchema:{type:'object',properties:{jobs:{type:'array',minItems:1,maxItems:4,items:{type:'object',properties:{tool:{type:'string',enum:names},arguments:{type:'object'}},required:['tool','arguments'],additionalProperties:false}}},required:['jobs'],additionalProperties:false}} as const
export const ASSET_JOB_TOOL={name:'asset_job',description:'Read, await (up to 15 seconds), or cancel one preparation owned by the current native request. Await returns the real tool result when ready; running is not success or completion evidence. Use progress events and work on independent edits instead of rapid polling. Cancel waits for physical work to settle before resources are reused.',inputSchema:{type:'object',properties:{id:{type:'string'},action:{type:'string',enum:['status','await','cancel']},wait_ms:{type:'integer',minimum:0,maximum:15000}},required:['id','action'],additionalProperties:false}} as const
type State='queued'|'running'|'completed'|'failed'|'cancelled'
interface AssetJob {id:string;tool:string;owner:JobScope;state:State;controller:AbortController;settled:Promise<void>;result?:unknown;error?:string}
export class AssetJobs {
  constructor(private allowed:readonly string[]=names){}
  private jobs=new Map<string,AssetJob>()
  submit(tool:string, acquire:()=>RequestAuthority, execute:(signal:AbortSignal,assert:()=>void)=>Promise<unknown>) {
    if(!this.allowed.includes(tool))throw new Error('Unsupported asset preparation tool')
    const owner=runtimeScope.getStore()
    if(!owner?.turn_id||!owner.opening)throw new Error('Asset jobs require an authoritative native request')
    for(const [id,j] of this.jobs)if(['completed','failed','cancelled'].includes(j.state)&&this.jobs.size>=32)this.jobs.delete(id)
    if(this.jobs.size>=32)throw new Error('Asset job limit reached; finish/cancel existing work')
    const lease=acquire(),controller=new AbortController(),signal=AbortSignal.any([lease.signal,controller.signal])
    const job:AssetJob={id:randomUUID(),tool,owner:{...owner,signal},state:'queued',controller,settled:Promise.resolve()}
    this.jobs.set(job.id,job)
    job.settled=runtimeScope.run(job.owner,async()=>{
      const done=runtimeTrace.span('asset_job',{...owner,request_id:job.id,tool_name:tool})
      try {
        signal.throwIfAborted();lease();job.state='running'
        const result=await execute(signal,()=>{signal.throwIfAborted();lease()})
        signal.throwIfAborted();lease()
        if((result as {isError?:boolean})?.isError)throw new Error(JSON.stringify(result))
        if(Buffer.byteLength(JSON.stringify(result))>1024*1024)throw new Error('Asset result exceeds the bounded job store; use the direct tool')
        job.result=result;job.state='completed';done()
      } catch(e){job.state=signal.aborted?'cancelled':'failed';job.error=(e instanceof Error?e.message:String(e)).slice(0,1600);done(job.state)}
      finally {lease.release()}
    })
    return {id:job.id,tool,state:job.state,placed:false}
  }
  private owned(id:string) {
    const job=this.jobs.get(id),owner=runtimeScope.getStore()
    if(!job||!owner||job.owner.opening!==owner.opening||job.owner.session_id!==owner.session_id||job.owner.turn_id!==owner.turn_id)throw new Error('Unknown job or expired request authority')
    return job
  }
  async read(id:string,action:string,waitMs=15000) {
    const job=this.owned(id)
    if(!['status','await','cancel'].includes(action))throw new Error('Invalid asset job action')
    if(!Number.isSafeInteger(waitMs)||waitMs<0||waitMs>15000)throw new Error('wait_ms must be 0–15000')
    if(action==='cancel'&&['queued','running'].includes(job.state))job.controller.abort(new DOMException('Asset preparation cancelled','AbortError'))
    if(action==='await'||action==='cancel')await new Promise<void>(resolve=>{const timer=setTimeout(resolve,waitMs);void job.settled.then(()=>{clearTimeout(timer);resolve()})})
    this.owned(id);runtimeScope.getStore()?.signal?.throwIfAborted()
    return {id:job.id,tool:job.tool,state:job.controller.signal.aborted&&job.state==='running'?'cancelling':job.state,result:job.result,error:job.error,placed:false,completion_evidence:false}
  }
  pending(opening?:string) {return [...this.jobs.values()].some(j=>(!opening||j.owner.opening===opening)&&['queued','running'].includes(j.state))}
  close(){for(const job of this.jobs.values())job.controller.abort();this.jobs.clear()}
}
