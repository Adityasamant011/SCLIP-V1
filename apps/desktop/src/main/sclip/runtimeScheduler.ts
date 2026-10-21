import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { runtimeTrace, type RuntimeIdentity } from './runtimeTrace.js'

export type Resource = 'local_model' | 'audio_cpu' | 'ffmpeg' | 'network'
export interface JobScope extends RuntimeIdentity { signal?: AbortSignal; priority?: number; coalesce_key?:string }
export const runtimeScope=new AsyncLocalStorage<JobScope>()
interface Job { id:string; name:string; resources:Resource[]; scope:JobScope; queued:number; run:()=>void; reject:(e:unknown)=>void; abort:()=>void;controller:AbortController }
/** Admission wraps existing services. A lease ends when the physical operation
 * settles, never merely because its caller stopped awaiting it. Timeline writes
 * are intentionally absent: ProjectActor remains their only executor. */
export class RuntimeScheduler {
  private queue:Job[]=[]
  private active=new Map<string,Job>()
  private used:Partial<Record<Resource,number>>={}
  private shared=new Map<string,{controller:AbortController;promise:Promise<unknown>;users:number}>()
  private closed=false
  constructor(private limits:Record<Resource,number>={local_model:1,audio_cpu:1,ffmpeg:2,network:6}) {}
  run<T>(name:string, resources:Resource[], operation:(signal?:AbortSignal)=>Promise<T>, options:JobScope={}):Promise<T> {
    if(this.closed)return Promise.reject(new Error('Runtime is shutting down; no new worker is authorized'))
    let scope={...runtimeScope.getStore(),...options}; const unique=[...new Set(resources)]
    scope.signal?.throwIfAborted()
    if(scope.coalesce_key){
      const key=JSON.stringify([scope.opening,scope.session_id,scope.turn_id,name,scope.coalesce_key])
      let shared=this.shared.get(key)
      if(!shared){
        const controller=new AbortController()
        shared={controller,users:0,promise:Promise.resolve()}
        this.shared.set(key,shared)
        shared.promise=this.run(name,resources,operation,{...scope,coalesce_key:undefined,signal:controller.signal}).finally(()=>{if(this.shared.get(key)===shared)this.shared.delete(key)})
      }
      shared.users++
      const group=shared
      return new Promise<T>((resolve,reject)=>{
        let settled=false
        const finish=(error:unknown,value?:unknown)=>{
          if(settled)return;settled=true;scope.signal?.removeEventListener('abort',abort);group.users--
          if(!group.users&&error!==undefined)group.controller.abort()
          error!==undefined?reject(error):resolve(value as T)
        }
        const abort=()=>finish(scope.signal?.reason??new DOMException('Cancelled','AbortError'))
        scope.signal?.addEventListener('abort',abort,{once:true})
        group.promise.then(value=>finish(undefined,value),error=>finish(error))
        if(scope.signal?.aborted)abort()
      })
    }
    const controller=new AbortController()
    scope={...scope,signal:scope.signal?AbortSignal.any([scope.signal,controller.signal]):controller.signal}
    if(this.queue.length>=64)return Promise.reject(new Error('RESOURCE_QUEUE_FULL: wait for owned jobs or cancel them before submitting more work'))
    return new Promise<T>((resolve,reject)=>{
      const job:Job={id:randomUUID(),name,resources:unique,scope,queued:performance.now(),reject,abort:()=>{},run:()=>{},controller}
      job.abort=()=>{const index=this.queue.indexOf(job);if(index>=0){this.queue.splice(index,1);scope.signal?.removeEventListener('abort',job.abort);reject(scope.signal?.reason??new DOMException('Cancelled','AbortError'));this.drain()}}
      job.run=()=>{
        scope.signal?.removeEventListener('abort',job.abort)
        const done=runtimeTrace.span(`job.${name}`,{...scope,request_id:job.id,queue_ms:Math.round(performance.now()-job.queued)})
        void runtimeScope.run(scope,async()=>{
          try {scope.signal?.throwIfAborted();const result=await operation(scope.signal);scope.signal?.throwIfAborted();done();resolve(result)}
          catch(e){done(scope.signal?.aborted?'cancelled':'failed');reject(e)}
          finally {this.active.delete(job.id);for(const r of unique)this.used[r]=(this.used[r]??1)-1;this.drain()}
        })
      }
      scope.signal?.addEventListener('abort',job.abort,{once:true})
      if((scope.priority??10)>0)for(const active of this.active.values())if((active.scope.priority??10)<=0&&unique.some(r=>active.resources.includes(r)&&(this.used[r]??0)>=this.limits[r]))active.controller.abort(new DOMException('Background job preempted by foreground work','AbortError'))
      this.queue.push(job);if(scope.signal?.aborted)job.abort();else this.drain()
    })
  }
  private drain() {
    if(this.closed)return
    this.queue.sort((a,b)=>(b.scope.priority??10)-(a.scope.priority??10)||a.queued-b.queued)
    for(let i=0;i<this.queue.length;){
      const job=this.queue[i]!
      if(job.resources.some(r=>(this.used[r]??0)>=this.limits[r])){i++;continue}
      this.queue.splice(i,1);for(const r of job.resources)this.used[r]=(this.used[r]??0)+1
      this.active.set(job.id,job);job.run()
    }
  }
  close(){this.closed=true;for(const job of [...this.queue,...this.active.values()])job.controller.abort(new DOMException('Runtime shutdown','AbortError'))}
  snapshot() {return {limits:this.limits,active:[...this.active.values()].map(j=>({id:j.id,name:j.name,resources:j.resources,turn_id:j.scope.turn_id})),queued:this.queue.map(j=>({id:j.id,name:j.name,resources:j.resources,turn_id:j.scope.turn_id})).slice(0,32)}}
}
export const runtimeScheduler=new RuntimeScheduler()
