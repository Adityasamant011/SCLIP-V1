import { runtimeScope } from './runtimeScheduler.js'
import { runtimeTrace, type RuntimeIdentity } from './runtimeTrace.js'
import type { RequestAuthority } from './completionCheckpoint.js'
import { failureEnvelope } from './toolFailure.js'

export async function runtimeRequest<T>(name:string, extra:unknown, identity:RuntimeIdentity,
  acquire:(()=>RequestAuthority)|undefined, work:()=>Promise<T>, args?:unknown):Promise<T> {
  let authority:RequestAuthority|undefined
  try {
    authority=acquire?.();authority?.()
    const transport=(extra as {signal?:AbortSignal})?.signal
    const signals=[transport,authority?.signal].filter((s):s is AbortSignal=>!!s)
    const signal=signals.length?AbortSignal.any(signals):undefined
    const done=runtimeTrace.span('tool',{...identity,tool_name:name})
    return await runtimeScope.run({...identity,signal,priority:10},async()=>{
      try {
        signal?.throwIfAborted();const result=await work()
        const failure=result as {isError?:boolean;content?:Array<{type:string;text?:string}>}
        if(failure?.isError&&Array.isArray(failure.content)){
          const text=failure.content.find(c=>c.type==='text')?.text??'Tool returned an error'
          failure.content.push({type:'text',text:JSON.stringify({execution_failure:failureEnvelope(name,args,text,`${identity.opening}/${identity.turn_id}`)})})
        }
        // Native Hermes reads this one versioned envelope; other MCP clients
        // retain their standard content blocks, including image observations.
        if(Array.isArray(failure?.content)&&failure.content.every(c=>c.type==='text')){
          const parts=failure.content.map(c=>{try{return JSON.parse(c.text??'')}catch{return c.text??''}})
          ;(failure as any).structuredContent={contract:'sclip.tool.v2',tool:name,ok:!failure.isError,
            ...(failure.isError?{error:parts}:{data:parts.length===1?parts[0]:parts})}
        }
        done(failure?.isError?'returned_error':'ok');return result
      }
      catch(e){done(signal?.aborted?'cancelled':'failed');throw e}
    })
  } finally {authority?.release()}
}
