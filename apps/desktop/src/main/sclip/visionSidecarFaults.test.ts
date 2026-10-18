import {afterEach,describe,expect,it} from 'vitest'
import {spawn,type ChildProcess} from 'node:child_process'
import {VisionSidecarManager} from './visionSidecar'
const children:ChildProcess[]=[]
const managers:VisionSidecarManager[]=[]
afterEach(async()=>{for(const m of managers.splice(0))await m.dispose();for(const c of children.splice(0))if(c.exitCode===null&&c.signalCode===null)c.kill('SIGKILL')})
const server=`const http=require('node:http');const p=Number(process.env.SCLIP_VLM_PORT);http.createServer((q,r)=>{if(q.url==='/analyze'&&process.env.SCLIP_TEST_HANG==='1')return;r.setHeader('content-type','application/json');r.end(JSON.stringify(q.url==='/health'?{state:'ready'}:{description:'synthetic observed frame',input_frames:1}))}).listen(p,'127.0.0.1',()=>console.log('SCLIP_VLM_PORT='+p))`
function launcher(scripts:string[]):typeof spawn{return ((_command:string,_args:string[],options:any)=>{const c=spawn(process.execPath,['-e',scripts.shift()??server],options);children.push(c);return c}) as typeof spawn}
describe('vision process and HTTP failure recovery (real local children)',()=>{
 it('releases an idle loaded model for generation while preserving in-flight inspection ownership',async()=>{
  const loadedServer=`const http=require('node:http');let loaded=true;http.createServer((q,r)=>{r.setHeader('content-type','application/json');if(q.url==='/health')return r.end(JSON.stringify({state:loaded?'loaded':'ready',model_loaded:loaded}));if(q.url==='/unload'){loaded=false;return r.end('{}')}setTimeout(()=>r.end(JSON.stringify({description:'synthetic frame',input_frames:1})),120)}).listen(Number(process.env.SCLIP_VLM_PORT),'127.0.0.1',()=>console.log('SCLIP_VLM_PORT='+process.env.SCLIP_VLM_PORT))`
  const m=new VisionSidecarManager('synthetic',{spawn:launcher([loadedServer]),startupTimeoutMs:1000,requestTimeoutMs:1000});managers.push(m)
  const pending=m.analyze({question:'in-flight inspection'})
  await expect(m.releaseIdleModel()).rejects.toThrow('busy')
  expect((await pending).ok).toBe(true)
  expect((await m.status()).modelLoaded).toBe(true)
  await m.releaseIdleModel()
  expect((await m.status()).modelLoaded).toBe(false)
 })
 it('does not kill a replacement worker when disposing an older worker that ignores SIGTERM',async()=>{
  const m=new VisionSidecarManager('synthetic',{spawn:launcher([`process.on('SIGTERM',()=>{});${server}`,server]),startupTimeoutMs:1000,requestTimeoutMs:500});managers.push(m)
  expect((await m.analyze({question:'old'})).ok).toBe(true)
  const disposing=m.dispose()
  expect((await m.analyze({question:'new'})).ok).toBe(true)
  await disposing
  expect((await m.status()).running).toBe(true)
 })

 it('terminates an unready child and retries with a fresh worker',async()=>{
  const m=new VisionSidecarManager('synthetic',{spawn:launcher(['setInterval(()=>{},1000)',server]),startupTimeoutMs:150,requestTimeoutMs:500});managers.push(m)
  expect((await m.analyze({question:'first'})).ok).toBe(false)
  await new Promise(r=>setTimeout(r,80));expect(children[0]!.exitCode!==null||children[0]!.signalCode!==null).toBe(true)
  expect((await m.analyze({question:'second'})).description).toBe('synthetic observed frame')
 })
 it('handles a real spawn error without an unhandled error or poisoned startup promise',async()=>{
  let first=true
  const create=((_command:string,_args:string[],options:any)=>{const c=first?spawn('/nonexistent/synthetic-python',[],options):spawn(process.execPath,['-e',server],options);first=false;children.push(c);return c}) as typeof spawn
  const m=new VisionSidecarManager('synthetic',{spawn:create,startupTimeoutMs:500,requestTimeoutMs:500});managers.push(m)
  expect((await m.analyze({question:'missing runtime'})).ok).toBe(false)
  expect((await m.analyze({question:'recovered'})).ok).toBe(true)
 })
 it('bounds an actual HTTP request that never responds and disposes only its worker',async()=>{
  const m=new VisionSidecarManager('synthetic',{spawn:launcher([`process.env.SCLIP_TEST_HANG='1';${server}`]),startupTimeoutMs:1000,requestTimeoutMs:80});managers.push(m)
  const started=Date.now();const result=await m.analyze({question:'hung inference'})
  expect(result.ok).toBe(false);expect(Date.now()-started).toBeLessThan(4000)
  await m.dispose();expect(children[0]!.exitCode!==null||children[0]!.signalCode!==null).toBe(true)
 })
})
