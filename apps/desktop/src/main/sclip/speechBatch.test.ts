import {it,expect,vi} from 'vitest'
import fs from 'node:fs'
import {SpeechBatch} from './speechBatch'
import {runtimeScope} from './runtimeScheduler'
it('microbatches concurrent explicit auditions into one worker/model load with separate results',async()=>{
 const batch=new SpeechBatch(),run=vi.fn(async(_cmd:string,args:string[])=>{
  const file=args[args.indexOf('--batch-json')+1]!,jobs=JSON.parse(fs.readFileSync(file,'utf8'))
  expect(jobs.map((j:any)=>j.text)).toEqual(['first','second'])
  return JSON.stringify(jobs.map((j:any)=>({requested_voice:j.voice,words:j.text})))
 })
 const args=(text:string)=>['worker.py','--text',text,'--voice','af_heart','--speed','1','--output','/tmp/'+text+'.wav','--model','/tmp/model','--voices','/tmp/voices']
 await runtimeScope.run({opening:'p',session_id:'s',turn_id:'t'},async()=>{
  const [a,b]=await Promise.all([batch.enqueue('python',args('first'),1000,undefined,run),batch.enqueue('python',args('second'),1000,undefined,run)])
  expect(JSON.parse(a).words).toBe('first');expect(JSON.parse(b).words).toBe('second')
 });expect(run).toHaveBeenCalledOnce()
})
