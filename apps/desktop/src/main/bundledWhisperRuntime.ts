import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'

export interface BundledWhisperStatus { binary: string; ready: boolean; detail: string }
/** Packaged runtime is an app resource, not downloaded content or a creator's custom path. */
export function bundledWhisperRuntime(resources: string): BundledWhisperStatus {
 const root=path.join(resources,'whisper'),binary=path.join(root,'whisper-cli')
 const fail=(detail:string):BundledWhisperStatus=>({binary,ready:false,detail:`Bundled Whisper ${detail}`})
 try {
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'runtime-manifest.json'),'utf8')) as {schema?:number;whisper_version?:string;ggml_version?:string;execution?:string;files?:Record<string,string>}
  if(manifest.schema!==1||manifest.whisper_version!=='1.9.1'||manifest.ggml_version!=='0.15.2'||manifest.execution!=='cpu')return fail('runtime version or provenance is invalid. Use a verified Sclip package.')
  for(const name of ['whisper-cli','WHISPER-LICENSE.txt','GGML-LICENSE.txt','runtime-pin.json']) {
   const expected=manifest.files?.[name]
   if(!expected||!/^[a-f0-9]{64}$/.test(expected))return fail('runtime integrity manifest is invalid. Use a verified Sclip package.')
   const actual=createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')
   if(actual!==expected)return fail('runtime is corrupt. Use a verified Sclip package, or configure your own runtime.')
  }
  return {binary,ready:true,detail:'Bundled Whisper 1.9.1 CPU runtime is ready.'}
 }catch(error){
  if((error as NodeJS.ErrnoException).code==='ENOENT')return fail('runtime is missing. Use a verified Sclip package, or configure your own runtime.')
  return fail('runtime could not be verified. Use a verified Sclip package, or configure your own runtime.')
 }
}
