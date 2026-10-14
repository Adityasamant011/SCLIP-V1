import {describe,it,expect,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {createActor} from '../state/actor'
import {blankProject} from '../state/model'
import {uuidV7Gen} from '../state/ids'
import {CompletionCheckpoint,type HermesTurnEvent} from './completionCheckpoint'
import {completionReview,completionDisposition,type CompletionReview} from './completionReview'
import {sourceFingerprint} from './finalOutput'
import {reviewState} from './evidenceCoordinates'
vi.mock('electron',()=>({app:{isPackaged:true}}))
function fixture() {
 const ids=uuidV7Gen(),p=blankProject(ids,'lifecycle'),actor=createActor({initial:p,idGen:ids}),sessions=new Map<string,CompletionReview>()
 expect(actor.dispatch('add_layer',{track:p.compositions[p.root_id].tracks[0].id,kind:'color',color:{r:20,g:80,b:120,a:255},t_start_us:0,t_end_us:30e6}).ok).toBe(true)
 let opening='opening-1',pending=false,proofValid=true
 const verify=vi.fn(async()=>({valid:proofValid,decoded:proofValid,has_video:proofValid,duration_us:30e6,reason:proofValid?undefined:'real export refused'})),end=vi.fn()
 const controller=new CompletionCheckpoint(sessions,{current:()=>({actor,opening,pending}),review:()=>({availability:'available',project_id:p.project_id,state_version:createHash('sha256').update(reviewState(actor.snapshot())).digest('hex'),issues:[],total_issues:0,critical_count:0,warning_count:0,suggestion_count:0,status:'clean',commit_id:'current',updated_at:0}),verify,endWork:end})
 const binding=controller.bind(p.project_id,'native-session')
 function start(turn='t1',brief='Make a 30-second video.') {controller.start(binding,{kind:'start',turn_id:turn,user_message:brief})}
 function reviewed() {const e=completionReview(actor.snapshot(),sessions),state=reviewState(actor.snapshot());if(e.guard.status.phase==='idle')e.guard.begin();const r=e.guard.recordEvidence('inspect_timeline_frame','timeline',[0,0],state,['visual']);e.guard.concludeNoRepair('Keep the intentionally authored image',r.id,state);e.started=true;e.reviewedState=state;e.reviewedEpoch=e.renderedEpoch=e.epoch;e.renderedSources=sourceFingerprint(actor.snapshot());e.decision={action:'conclude_no_repair',reason:'Intentional authored composition'}}
 const normal=(turn='t1'):HermesTurnEvent=>({kind:'end',turn_id:turn,completed:true,failed:false,interrupted:false,turn_exit_reason:'text_response(stop)',background_jobs_pending:false})
 return {actor,sessions,controller,binding,start,reviewed,normal,verify,end,setPending:(b:boolean)=>pending=b,setProof:(b:boolean)=>proofValid=b,reopen:()=>opening='opening-2',close:()=>controller.close()}
}
describe('Structured native termination and authoritative completion checkpoint',()=>{
 it('continuation retains the original brief and includes a directly callable missing-evidence action',async()=>{
  const f=fixture();try{
   f.start('t1','Make a 30-second video.');const r=await f.controller.finish(f.binding,f.normal(),true)
   expect(r.followup).toContain('CONTINUE the original creator request')
   expect(r.followup).toContain('Original request: Make a 30-second video.')
   expect(r.followup).toContain('mcp__weftcut__vision_inspect')
   expect(r.followup).toContain('Memory summaries, terminal echo')
   f.start('t2','continue');expect(completionReview(f.actor.snapshot(),f.sessions).originalBrief).toBe('Make a 30-second video.')
  }finally{f.close()}
 })
 it.each(['cancel','supersede','reopen','interrupt'] as const)('expires only the original native operation on %s',action=>{
  const f=fixture();try{
   f.start();const lease=f.controller.captureRequestAuthority(f.binding);expect(lease).not.toThrow()
   if(action==='cancel')f.controller.cancel(f.binding)
   if(action==='supersede')f.start('new-turn','Make a 30-second video with audio.')
   if(action==='reopen')f.reopen()
   if(action==='interrupt')f.controller.interrupt(f.binding,'process exited')
   expect(lease).toThrow()
   expect(lease.signal.aborted).toBe(true)
   if(action==='supersede')expect(f.controller.captureRequestAuthority(f.binding)).not.toThrow()
  }finally{f.close()}
 })
 it('releasing a superseded request cannot detach the next request from cancellation',()=>{
  const f=fixture();try{
   f.start();const old=f.controller.captureRequestAuthority(f.binding)
   f.start('new-turn');const next=f.controller.captureRequestAuthority(f.binding)
   old.release();expect(next.signal.aborted).toBe(false)
   f.controller.cancel(f.binding);expect(next.signal.aborted).toBe(true)
  }finally{f.close()}
 })
 it('native cancellation reaches an active completion artifact verifier and cannot record late completion',async()=>{
  const f=fixture();try{
   f.start();f.reviewed();let began!:()=>void
   const started=new Promise<void>(r=>began=r)
   ;(f.verify as any).mockImplementation(async(_project:unknown,_requirements:unknown,signal:AbortSignal)=>new Promise((_resolve,reject)=>{
    began();signal.addEventListener('abort',()=>reject(new DOMException('Cancelled verifier','AbortError')),{once:true})
   }))
   const work=f.controller.finish(f.binding,f.normal(),false),refused=expect(work).rejects.toMatchObject({name:'AbortError'})
   await started;f.controller.cancel(f.binding);await refused
   expect(completionDisposition(f.actor.snapshot(),f.sessions).status).toBe('cancelled')
  }finally{f.close()}
 })
 it('normal final answer without explicit end cannot certify a skipped review; gives bounded feedback to Hermes',async()=>{const f=fixture();try{f.start();const r=await f.controller.finish(f.binding,f.normal(),true);expect(r.status).toBe('review_required');expect(r.followup).toContain('CURRENT_HERMES_RENDERED_REVIEW_REQUIRED');expect(f.verify).toHaveBeenCalledOnce();expect(f.end).not.toHaveBeenCalled()}finally{f.close()}})
 it('allows a current legitimate no-repair decision and decoded output',async()=>{const f=fixture();try{f.start();f.reviewed();const r=await f.controller.finish(f.binding,f.normal(),true);expect(r.status).toBe('completed');expect(r.decision.action).toBe('conclude_no_repair');expect(f.end).toHaveBeenCalledOnce()}finally{f.close()}})
 it('duplicate finalization is idempotent and gives no duplicate continuation',async()=>{const f=fixture();try{f.start();const [a,b]=await Promise.all([f.controller.finish(f.binding,f.normal(),true),f.controller.finish(f.binding,f.normal(),true)]);expect(a.followup).toBeTruthy();expect(b.followup).toBeUndefined();expect(f.verify).toHaveBeenCalledOnce()}finally{f.close()}})
 it('waits for pending MCP operations after a genuine task end',async()=>{const f=fixture();try{f.start();f.reviewed();f.setPending(true);const done=f.controller.finish(f.binding,f.normal(),true);expect(f.verify).not.toHaveBeenCalled();setTimeout(()=>f.setPending(false),30);expect((await done).status).toBe('completed')}finally{f.close()}})
 it('never confuses active provider silence with completion',()=>{const f=fixture();try{f.start();expect(completionDisposition(f.actor.snapshot(),f.sessions).status).toBe('running');expect(f.verify).not.toHaveBeenCalled()}finally{f.close()}})
 it('rejects stale render evidence after mutation and after returning to equal content',async()=>{const f=fixture();try{f.start();f.reviewed();const old=f.actor.snapshot();expect(f.actor.dispatch('add_layer',{track:old.compositions[old.root_id].tracks[0].id,kind:'color',t_start_us:30e6,t_end_us:31e6,color:{r:0,g:0,b:0,a:255}}).ok).toBe(true);f.actor.replaceState(old);expect((await f.controller.finish(f.binding,f.normal(),true)).status).toBe('review_required')}finally{f.close()}})
 it('rejects concurrent mutation during complete rendered validation',async()=>{const f=fixture();try{f.start();f.reviewed();f.verify.mockImplementationOnce(async()=>{const p=f.actor.snapshot();f.actor.dispatch('add_layer',{track:p.compositions[p.root_id].tracks[0].id,kind:'color',t_start_us:30e6,t_end_us:31e6,color:{r:0,g:0,b:0,a:255}});return {valid:true,decoded:true,has_video:true,duration_us:30e6,reason:undefined}});expect((await f.controller.finish(f.binding,f.normal(),true)).status).toBe('review_required')}finally{f.close()}})
 it.each([['user cancel',true,true,false,'interrupted','cancelled'],['provider failure',false,false,true,'api_error','interrupted'],['timeout',false,true,false,'timeout','interrupted'],['iteration exhaustion',false,false,false,'max_iterations','incomplete']])('%s leaves a truthful unverified outcome',async(_label,cancelled,interrupted,failed,reason,status)=>{const f=fixture();try{f.start();f.reviewed();const r=await f.controller.finish(f.binding,{...f.normal(),completed:false,interrupted:Boolean(interrupted),failed:Boolean(failed),turn_exit_reason:String(reason)},true,Boolean(cancelled));expect(r.status).toBe(status);expect(f.verify).not.toHaveBeenCalled();expect(r.readiness).toBe('unverified')}finally{f.close()}})
 it('a cancellation signal wins over an otherwise normal native final response',async()=>{const f=fixture();try{f.start();f.reviewed();const r=await f.controller.finish(f.binding,f.normal(),true,true);expect(r.status).toBe('cancelled');expect(f.verify).not.toHaveBeenCalled()}finally{f.close()}})
 it('cancellation during final media validation wins and a subsequent native turn can restart honestly',async()=>{const f=fixture();try{f.start();f.reviewed();f.verify.mockImplementationOnce(async()=>{f.controller.cancel(f.binding);return {valid:true,decoded:true,has_video:true,duration_us:30e6,reason:undefined}});expect((await f.controller.finish(f.binding,f.normal(),true)).status).toBe('cancelled');expect(f.end).toHaveBeenCalledOnce();f.start('next');expect(completionDisposition(f.actor.snapshot(),f.sessions).status).toBe('running');expect(completionReview(f.actor.snapshot(),f.sessions).guard.status.phase).toBe('idle')}finally{f.close()}})
 it('provider output-token exhaustion is not a normal completed task even when native completed is true',async()=>{const f=fixture();try{f.start();f.reviewed();const r=await f.controller.finish(f.binding,{...f.normal(),turn_exit_reason:'text_response(finish_reason=length)'},true);expect(r.status).toBe('incomplete');expect(f.verify).not.toHaveBeenCalled();expect(r.readiness).toBe('unverified')}finally{f.close()}})
 it('failed render remains incomplete when continuation is unavailable',async()=>{const f=fixture();try{f.start();f.reviewed();f.setProof(false);const r=await f.controller.finish(f.binding,f.normal(),false);expect(r.status).toBe('incomplete');expect(r.reason).toContain('OUTPUT_RENDER_OR_DECODE_FAILED')}finally{f.close()}})
 it('wrong duration blocks completion even with a prior review',async()=>{const f=fixture();try{f.start('t1','Make a 20-second video.');f.reviewed();const r=await f.controller.finish(f.binding,f.normal(),false);expect(r.status).toBe('incomplete');expect(r.reason).toContain('OUTPUT_DURATION_UNMET');expect(f.verify).not.toHaveBeenCalled()}finally{f.close()}})
 it('missing video cannot complete a video brief',async()=>{const f=fixture();try{f.start();const p=structuredClone(f.actor.snapshot());p.compositions[p.root_id].tracks[0].layers=[];f.actor.replaceState(p);const r=await f.controller.finish(f.binding,f.normal(),false);expect(r.status).toBe('incomplete');expect(r.reason).toContain('REQUIRED_VIDEO_ABSENT')}finally{f.close()}})
 it('exhausts two correction continuations honestly without launching an agent',async()=>{const f=fixture();try{f.start();for(let i=1;i<=3;i++){const r=await f.controller.finish(f.binding,f.normal(`t${i}`),true);expect(r.status).toBe(i<3?'review_required':'incomplete');if(i<3){expect(r.followup).toBeTruthy();f.start(`t${i+1}`,'[Sclip completion checkpoint] Check the existing output.')}else expect(r.followup).toBeUndefined()}}finally{f.close()}})
 it('reopen invalidates old terminal and completed evidence; restart cannot inherit readiness',async()=>{const f=fixture();try{f.start();f.reviewed();await f.controller.finish(f.binding,f.normal(),true);f.reopen();expect(()=>f.controller.start(f.binding,{kind:'start',turn_id:'old'})).toThrow('Stale');expect(completionDisposition(f.actor.snapshot(),f.sessions).readiness).toBe('unverified')}finally{f.close()}})
 it('pending native background work prevents a finished claim or automatic continuation',async()=>{const f=fixture();try{f.start();f.reviewed();const r=await f.controller.finish(f.binding,{...f.normal(),background_jobs_pending:true},true);expect(r.status).toBe('incomplete');expect(r.followup).toBeUndefined();expect(f.verify).not.toHaveBeenCalled()}finally{f.close()}})
 it('a newer user submission supersedes late validation',async()=>{const f=fixture();try{f.start();f.reviewed();f.verify.mockImplementationOnce(async()=>{f.start('new','Make a 20-second video.');return {valid:true,decoded:true,has_video:true,duration_us:30e6,reason:undefined}});expect((await f.controller.finish(f.binding,f.normal(),true)).status).toBe('running');expect(f.end).not.toHaveBeenCalled()}finally{f.close()}})
 it('process crash is interruption; an already completed task is not downgraded on CLI exit',async()=>{const f=fixture();try{f.start();f.controller.interrupt(f.binding,'crash');expect(completionDisposition(f.actor.snapshot(),f.sessions).status).toBe('interrupted')}finally{f.close()}const g=fixture();try{g.start();g.reviewed();await g.controller.finish(g.binding,g.normal(),true);g.controller.interrupt(g.binding,'exit:0');expect(completionDisposition(g.actor.snapshot(),g.sessions).status).toBe('completed')}finally{g.close()}})
})
