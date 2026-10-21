import { spawn } from 'node:child_process'
/** Bounded no-shell command; abort/timeout kills only this child and settlement
 * waits for close so the caller can safely release files and resource leases. */
export function ownedCommand(command:string,args:string[],signal?:AbortSignal,timeoutMs=30000):Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:['ignore','ignore','pipe']})
    let error:Error|undefined,stderr=''
    const stop=(why:Error)=>{error??=why;child.kill('SIGKILL')}
    const abort=()=>stop(new DOMException('Command cancelled','AbortError'))
    const timer=setTimeout(()=>stop(new Error('Owned command exceeded its deadline')),timeoutMs)
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
    child.stderr.on('data',b=>{stderr=(stderr+String(b)).slice(-2048)})
    child.once('error',e=>{error??=e})
    child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):code===0?resolve():reject(new Error(`Owned command failed (${code}): ${stderr}`))})
  })
}
