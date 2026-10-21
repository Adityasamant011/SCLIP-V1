import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {runtimeScheduler,runtimeScope} from './runtimeScheduler.js'
interface Request {args:string[];signal?:AbortSignal;resolve:(s:string)=>void;reject:(e:unknown)=>void}
type Run=(command:string,args:string[],timeout:number,signal?:AbortSignal)=>Promise<string>
/** Short, scope-bound microbatch. One process/model load, individual artifact
 * identities and cancellation. Never synthesizes different text/voice/speed. */
export class SpeechBatch {
 private groups=new Map<string,Request[]>()
 enqueue(command:string,args:string[],timeout:number,signal:AbortSignal|undefined,run:Run):Promise<string>{
  const scope=runtimeScope.getStore(),value=(a:string[],key:string)=>a[a.indexOf(key)+1]
  const key=JSON.stringify([command,args[0],value(args,'--model'),value(args,'--voices'),scope?.opening,scope?.session_id,scope?.turn_id,timeout])
  if(!this.groups.has(key)&&this.groups.size>=64)return Promise.reject(new Error('SPEECH_BATCH_QUEUE_FULL: await owned speech jobs before submitting more'))
  let group=this.groups.get(key)
  if(!group){group=[];this.groups.set(key,group);const owned=group
   setTimeout(()=>{if(this.groups.get(key)===owned)this.groups.delete(key);void this.flush(command,owned,timeout,run,scope).catch(()=>{})},8)
  }
  if(group.length>=8){this.groups.delete(key);return this.enqueue(command,args,timeout,signal,run)}
  return new Promise((resolve,reject)=>group!.push({args,signal,resolve,reject}))
 }
 private async flush(command:string,requests:Request[],timeout:number,run:Run,scope:ReturnType<typeof runtimeScope.getStore>){
  const alive=requests.filter(r=>!r.signal?.aborted);for(const r of requests)if(r.signal?.aborted)r.reject(r.signal.reason)
  if(!alive.length)return
  const ctrl=new AbortController(),abort=()=>{if(alive.every(r=>r.signal?.aborted))ctrl.abort()}
  for(const r of alive)r.signal?.addEventListener('abort',abort)
  let dir:string|undefined
  const value=(a:string[],key:string)=>a[a.indexOf(key)+1]
  try{
   const rows=await runtimeScheduler.run('speech_batch',['audio_cpu'],async signal=>{
    dir=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-speech-batch-'))
    const file=path.join(dir,'batch.json')
    fs.writeFileSync(file,JSON.stringify(alive.map(r=>({text:value(r.args,'--text'),voice:value(r.args,'--voice'),speed:Number(value(r.args,'--speed')),output:value(r.args,'--output')}))),{mode:0o600})
    return JSON.parse(await run(command,[alive[0]!.args[0]!,'--batch-json',file,'--model',value(alive[0]!.args,'--model')!,'--voices',value(alive[0]!.args,'--voices')!],timeout,signal)) as Array<unknown>
   },{...scope,signal:ctrl.signal})
   if(!Array.isArray(rows)||rows.length!==alive.length)throw new Error('Invalid speech batch result')
   alive.forEach((r,i)=>r.signal?.aborted?r.reject(r.signal.reason):r.resolve(JSON.stringify(rows[i])))
  }catch(e){for(const r of alive)r.reject(e)}
  finally{for(const r of alive)r.signal?.removeEventListener('abort',abort);if(dir)fs.rmSync(dir,{recursive:true,force:true})}
 }
}
