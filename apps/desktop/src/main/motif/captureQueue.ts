/** One physical capture host; prioritize urgent work without parallel seeks. */
export class CaptureQueue<T> {
  private pending:Array<{key:string;owner?:string;priority:number;work:()=>Promise<T>;resolve:(v:T)=>void;reject:(e:unknown)=>void}>=[]
  private shared=new Map<string,Promise<T>>()
  private running=false
  run(key:string,work:()=>Promise<T>,priority=10,owner?:string):Promise<T>{
    key=JSON.stringify([owner??null,key])
    const existing=this.shared.get(key);if(existing)return existing
    if(owner)for(const job of [...this.pending])if(job.owner===owner){this.pending.splice(this.pending.indexOf(job),1);job.reject(new Error('CAPTURE_SUPERSEDED: a newer playhead frame replaced this queued request'))}
    if(this.pending.length>=64)return Promise.reject(new Error('CAPTURE_QUEUE_FULL: wait for the current frame before requesting more'))
    const promise=new Promise<T>((resolve,reject)=>{this.pending.push({key,owner,priority,work,resolve,reject})})
    this.shared.set(key,promise)
    void promise.finally(()=>{if(this.shared.get(key)===promise)this.shared.delete(key)}).catch(()=>{})
    void this.drain();return promise
  }
  private async drain(){
    if(this.running)return;this.running=true
    try{while(this.pending.length){this.pending.sort((a,b)=>b.priority-a.priority);const job=this.pending.shift()!;try{job.resolve(await job.work())}catch(e){job.reject(e)}}}finally{this.running=false}
  }
}
