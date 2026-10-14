import {it,expect,vi} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type {Backend} from '@weftcut/core'
import type {ContentDeps} from './contentDownload'
import type {ContentQueue} from './contentQueue'
import {createModelFeature} from './model-feature'
import {createSpeechConfigStore} from './speech-config'
import {createVlmConfigStore} from './vlm-config'
vi.mock('./keys',()=>({loadAllKeys:()=>({}),setKey:vi.fn()}))
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'models-bundled-whisper-'))
 const atomicFs={exists:fs.existsSync,readFile:(p:string)=>fs.readFileSync(p,'utf8'),writeFile:(p:string,s:string)=>fs.writeFileSync(p,s),rename:fs.renameSync,mkdirp:(p:string)=>fs.mkdirSync(p,{recursive:true})}
 const speech=createSpeechConfigStore({fs:atomicFs,dir,path:path.join(dir,'speech.json')})
 const vlm=createVlmConfigStore({fs:atomicFs,dir,path:path.join(dir,'vlm.json')})
 const ensure=vi.fn(async()=>{})
 const queue={ensure,entryOf:()=>undefined,isPending:()=>false,cancel:vi.fn()} as unknown as ContentQueue
 const content={downloadsDir:path.join(dir,'downloads'),partialDir:path.join(dir,'partial'),join:path.join,fs:{statBytes:()=>null,rm:vi.fn()}} as unknown as ContentDeps
 let ready=true
 const binary=path.join(dir,'app-resources/whisper/whisper-cli')
 const backend={invoke:vi.fn(async()=>JSON.stringify({device:'cpu'})),setLocalBackend:vi.fn(),setCloudKey:vi.fn()} as unknown as Backend
 const create=()=>createModelFeature({dir,cacheDir:path.join(dir,'cache'),atomicFs,content,platform:'darwin-arm64',queue,speech,vlm,backend,changed:()=>{},activated:()=>{},bundledWhisper:()=>({binary,ready,detail:'Bundled Whisper runtime is corrupt.'})})
 return {dir,speech,backend,ensure,binary,create,setReady:(value:boolean)=>{ready=value},close:()=>fs.rmSync(dir,{recursive:true,force:true})}
}
it('routes fresh macOS setup through model-only download and the bundled runtime',async()=>{
 const f=fixture();try{
  const manager=f.create();expect(manager.view().active.speech).toBeNull()
  expect(manager.view().models.find(p=>p.id==='whisper-base')?.supported).toBe(true)
  manager.use({id:'whisper-base'})
  await vi.waitFor(()=>expect(manager.active('speech')?.id).toBe('whisper-base'))
  expect(f.ensure).toHaveBeenCalledWith(['whisper-model-base'],expect.any(AbortSignal))
  expect(manager.active('speech')?.local?.binary).toBe(f.binary)
  const verification=vi.mocked(f.backend.invoke).mock.calls.find(([name])=>name==='settings_verify_model')!
  expect(JSON.parse(verification[1]!).local.binary).toBe(f.binary)
  expect(manager.active('speech')?.executionDevice).toBe('cpu')
 }finally{f.close()}
})
it('blocks corrupt bundled runtime before download and preserves explicit custom paths',async()=>{
 const f=fixture();try{
  f.setReady(false);let manager=f.create();manager.use({id:'whisper-base'})
  await vi.waitFor(()=>expect(manager.view().operations[0]?.phase).toBe('error'))
  expect(manager.view().operations[0]?.error).toContain('corrupt');expect(f.ensure).not.toHaveBeenCalled()
  fs.rmSync(path.join(f.dir,'model_settings.json'))
  const custom={binary:path.join(f.dir,'my-runtime'),model:path.join(f.dir,'my-model')}
  f.speech.apply({preferred_engine:'whisper_cpp',local:{backend:'whisper_cpp',config:custom}})
  manager=f.create()
  expect(manager.active('speech')?.local).toEqual(custom)
  expect(manager.active('speech')?.custom).toBe(true)
  const id=manager.active('speech')!.id;manager.use({id})
  await vi.waitFor(()=>expect(manager.view().operations).toHaveLength(0))
  expect(manager.active('speech')?.local).toEqual(custom)
  expect(f.ensure).toHaveBeenCalledWith([],expect.any(AbortSignal))
 }finally{f.close()}
})
