import {it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {bundledWhisperRuntime} from './bundledWhisperRuntime'
it('reports missing/corrupt resources and verifies recovery without modifying the app resources',()=>{
 const resources=fs.mkdtempSync(path.join(os.tmpdir(),'bundled-whisper-test-'))
 try {
  expect(bundledWhisperRuntime(resources)).toMatchObject({ready:false,detail:expect.stringContaining('missing')})
  const root=path.join(resources,'whisper');fs.mkdirSync(root)
  const files:Record<string,string>={}
  for(const name of ['whisper-cli','WHISPER-LICENSE.txt','GGML-LICENSE.txt','runtime-pin.json']){fs.writeFileSync(path.join(root,name),'synthetic resource');files[name]=createHash('sha256').update('synthetic resource').digest('hex')}
  const manifest={schema:1,whisper_version:'1.9.1',ggml_version:'0.15.2',execution:'cpu',files}
  const manifestPath=path.join(root,'runtime-manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest))
  expect(bundledWhisperRuntime(resources)).toMatchObject({ready:true,binary:path.join(root,'whisper-cli')})
  fs.writeFileSync(path.join(root,'whisper-cli'),'corrupt')
  expect(bundledWhisperRuntime(resources)).toMatchObject({ready:false,detail:expect.stringContaining('corrupt')})
  fs.writeFileSync(path.join(root,'whisper-cli'),'synthetic resource')
  expect(bundledWhisperRuntime(resources).ready).toBe(true)
  fs.writeFileSync(manifestPath,JSON.stringify({...manifest,whisper_version:'unknown'}))
  expect(bundledWhisperRuntime(resources)).toMatchObject({ready:false,detail:expect.stringContaining('provenance')})
  expect(fs.readFileSync(path.join(root,'whisper-cli'),'utf8')).toBe('synthetic resource')
 }finally{fs.rmSync(resources,{recursive:true,force:true})}
})
