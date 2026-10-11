/** On-demand CPU observations only. No editorial decisions, network, or resident model. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import type {ContentItem} from '../../shared/content-download'
import {CONTENT_CATALOG} from '../../shared/content-catalog'

export const AUDIO_UNDERSTANDING_MAX_US = 30_000_000
const RATE = 16000, WINDOW = RATE * 10
const LIMITATIONS = 'Fallible coarse language, emotion and event labels per window, not exhaustive event detection or a delivery-quality verdict. Unknown labels remain unknown. Recognition is not word-aligned verification; use local Whisper and listen to the actual result. No judgment of assertiveness, whisperiness, suitability or pacing.'
export type AudioModelPaths = {binary:string;model:string;tokens:string}
export function managedAudioPaths(downloads:string): AudioModelPaths {
  const file=(id:string) => {const item=CONTENT_CATALOG.find(i=>i.id===id)!;return path.join(downloads,item.id,item.version,item.platforms['darwin-arm64']!.entryPath)}
  return {binary:file('sensevoice-runtime'),model:file('sensevoice-model-int8'),tokens:file('sensevoice-tokens')}
}
export type AudioUnderstandingBackend = ReturnType<typeof createAudioUnderstanding>
type Runner = (binary:string,args:string[],signal?:AbortSignal)=>Promise<string>
export const runAudioModel: Runner = (binary,args,signal) => new Promise((resolve,reject)=>{
  signal?.throwIfAborted()
  execFile('/usr/bin/nice',['-n','10',binary,...args],{signal,timeout:60_000,killSignal:'SIGKILL',maxBuffer:1024*1024},(error,stdout)=>error?reject(error):resolve(stdout))
})
export function parseAudioObservations(stdout:string,count:number) {
  const rows=stdout.split(/\r?\n/).filter(l=>l.trim().startsWith('{')).map(line=>JSON.parse(line))
  if(rows.length!==count)throw new Error('Audio model returned an unexpected window count')
  const tag=(value:unknown,allowed:string[])=>{if(typeof value!=='string')throw new Error('Missing audio label');const m=/^<\|([^|]+)\|>$/.exec(value);if(!m||!allowed.includes(m[1]))throw new Error('Unknown audio label');return m[1]}
  return rows.map(row=>{
    if(typeof row.text!=='string'||row.text.length>8192)throw new Error('Malformed audio recognition')
    return {language:tag(row.lang,['zh','en','ja','ko','yue','nospeech']),emotion:tag(row.emotion,['NEUTRAL','HAPPY','SAD','ANGRY','FEARFUL','DISGUSTED','SURPRISED','OTHER','EMO_UNKNOWN']),event:tag(row.event,['Speech','BGM','Applause','Laughter','Cry','Sneeze','Breath','Cough','Sing','Speech_Noise','GBG','Event_UNK']),transcript:row.text,confidence:null}
  })
}
export function encodeAudioWindow(pcm:Buffer): Buffer {
  if(!pcm.length||pcm.length%4)throw new Error('Malformed audio PCM')
  const samples=pcm.length/4,wav=Buffer.alloc(44+samples*2)
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(RATE,24);wav.writeUInt32LE(RATE*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40)
  for(let i=0;i<samples;i++){const v=pcm.readFloatLE(i*4);if(!Number.isFinite(v))throw new Error('Non-finite audio PCM');wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2)}
  return wav
}
export function createAudioUnderstanding(paths:()=>AudioModelPaths,run:Runner=runAudioModel,platform=process.platform,arch=process.arch) {
  let busy=false
  const cache=new Map<string,ReturnType<typeof parseAudioObservations>>()
  function status() {
    const resolved=paths(),missing=Object.entries(resolved).filter(([,p])=>{try{return !fs.statSync(p).isFile()}catch{return true}}).map(([k])=>k)
    return {status:platform!=='darwin'||arch!=='arm64'?'unsupported_platform':missing.length?'unavailable':'ready',missing,model:'SenseVoiceSmall INT8',runtime:'sherpa-onnx 1.13.4',provider:'local_cpu',threads:1,max_range_us:AUDIO_UNDERSTANDING_MAX_US,window_us:10_000_000,timeout_ms:60_000,concurrency:1,resident_model:false,paths:resolved,limitations:LIMITATIONS,provider_calls:0}
  }
  async function understand(pcm:Buffer,timelineStartUs:number,signal?:AbortSignal) {
    signal?.throwIfAborted()
    if(!Number.isSafeInteger(timelineStartUs)||timelineStartUs<0)throw new Error('Invalid timeline start')
    const ready=status(),base={evidence_class:'MODEL_OBSERVATION',coordinate_space:'timeline',evidence_origin:'CURRENT_TIMELINE',model:ready.model,runtime:ready.runtime,provider:'local_cpu',limitations:LIMITATIONS,provider_calls:0}
    if(!pcm.length||pcm.length%4)throw new Error('Malformed audio PCM')
    if(pcm.length/4>RATE*30)return {...base,status:'range_too_long',max_range_us:AUDIO_UNDERSTANDING_MAX_US,windows:[]}
    if(ready.status!=='ready')return {...base,status:ready.status,missing:ready.missing,windows:[]}
    const modelPaths=paths(),identity=Object.values(modelPaths).map(p=>{const s=fs.statSync(p);return [p,s.size,s.mtimeMs,s.ctimeMs]})
    const key=createHash('sha256').update(JSON.stringify(identity)).update(pcm).digest('hex')
    const mapped=(rows:ReturnType<typeof parseAudioObservations>)=>rows.map((r,i)=>({...r,timeline_range_us:[timelineStartUs+i*10_000_000,timelineStartUs+Math.round(Math.min((i+1)*WINDOW,pcm.length/4)/RATE*1e6)]}))
    const hit=cache.get(key)
    if(hit)return {...base,status:'available',cached:true,latency_ms:0,windows:mapped(hit)}
    if(busy)return {...base,status:'busy',windows:[],retry:'Reuse current evidence or inspect later; one CPU model job at a time.'}
    busy=true;let dir:string|undefined;const started=performance.now()
    try {
      dir=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-sensevoice-'))
      const files:string[]=[]
      for(let offset=0;offset<pcm.length;offset+=WINDOW*4){const f=path.join(dir,`${files.length}.wav`);fs.writeFileSync(f,encodeAudioWindow(pcm.subarray(offset,Math.min(offset+WINDOW*4,pcm.length))));files.push(f)}
      const stdout=await run(modelPaths.binary,['--print-args=false','--provider=cpu','--num-threads=1',`--sense-voice-model=${modelPaths.model}`,`--tokens=${modelPaths.tokens}`,'--sense-voice-language=auto','--sense-voice-use-itn=true',...files],signal)
      signal?.throwIfAborted()
      const rows=parseAudioObservations(stdout,files.length)
      cache.set(key,rows);if(cache.size>8)cache.delete(cache.keys().next().value!)
      return {...base,status:'available',cached:false,latency_ms:Math.round(performance.now()-started),windows:mapped(rows)}
    }catch(error){signal?.throwIfAborted();return {...base,status:'unavailable',error:error instanceof Error?error.message:String(error),windows:[]}}
    finally {if(dir)fs.rmSync(dir,{recursive:true,force:true});busy=false}
  }
  return {status,understand}
}
/** Verified archive needs local ad-hoc signatures on macOS before atomic publication. */
export async function prepareAudioRuntime(item:ContentItem,dir:string) {
  if(item.id!=='sensevoice-runtime'||process.platform!=='darwin')return
  const artifact=item.platforms['darwin-arm64']!
  const binary=path.join(dir,artifact.entryPath),lib=path.join(path.dirname(binary),'../lib')
  const files=fs.readdirSync(lib).filter(f=>f.endsWith('.dylib')).map(f=>path.join(lib,f)).filter(f=>!fs.lstatSync(f).isSymbolicLink())
  for(const file of [...files,binary])await new Promise<void>((resolve,reject)=>execFile('/usr/bin/codesign',['--force','--sign','-',file],{timeout:10_000},error=>error?reject(error):resolve()))
}
