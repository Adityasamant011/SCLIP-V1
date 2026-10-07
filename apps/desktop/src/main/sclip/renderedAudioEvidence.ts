import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { Project } from '../state/model'
import { audioParams, mediaItemTemplate } from '../state/mutations/media'
import { renderComposedTimelineRange, resolveFfmpegPath, MAX_RANGE_RENDER_DURATION_US } from './rangeRender'
import { reviewState, validateTimelineRange } from './evidenceCoordinates'

const SAMPLE_RATE = 16000
export function measureRenderedPcm(pcm: Buffer, timelineStartUs: number) {
  if (!pcm.length || pcm.length % 4) throw new Error('Malformed decoded PCM')
  const samples = pcm.length/4, window = 320, threshold = 10 ** (-50/20)
  let sum = 0, peak = 0, clippingSamples = 0, quietStart: number | undefined
  const quiet: number[][] = []
  for (let i=0;i<samples;i+=window) {
    let energy=0
    for(let j=i;j<Math.min(samples,i+window);j++) {
      const v=pcm.readFloatLE(j*4); if(!Number.isFinite(v))throw new Error('Non-finite decoded PCM')
      energy+=v*v; peak=Math.max(peak,Math.abs(v)); if(Math.abs(v)>=0.999)clippingSamples++
    }
    sum+=energy
    const silent=Math.sqrt(energy/Math.min(window,samples-i))<=threshold
    if(silent && quietStart===undefined)quietStart=i
    if(!silent && quietStart!==undefined) { if(i-quietStart>=1600)quiet.push([quietStart,i]);quietStart=undefined }
  }
  if(quietStart!==undefined && samples-quietStart>=1600)quiet.push([quietStart,samples])
  return { evidence_class:'DETERMINISTIC_MEASUREMENT', duration_us:Math.round(samples/SAMPLE_RATE*1e6), sample_rate:SAMPLE_RATE,
    rms:Math.sqrt(sum/samples),peak,clipping_sample_count:clippingSamples,clipping_threshold:0.999,
    silence_threshold_dbfs:-50,silence_window_us:20000,min_silence_us:100000,
    silence_spans_us:quiet.map(([s,e])=>[timelineStartUs+Math.round(s/SAMPLE_RATE*1e6),timelineStartUs+Math.round(e/SAMPLE_RATE*1e6)]),
    limitations:'Mono 16kHz rendered-mix measurements. Quiet spans are threshold facts, not pacing defects; near-full-scale samples are not proof of audible clipping.' }
}
export function decodeRenderedPcm(file: string, signal?: AbortSignal): Promise<Buffer | null> {
  return new Promise((resolve,reject)=>{
    signal?.throwIfAborted()
    const child=spawn(resolveFfmpegPath(process.resourcesPath),['-v','error','-i',file,'-map','0:a:0?','-vn','-ac','1','-ar',String(SAMPLE_RATE),'-f','f32le','pipe:1'],{signal})
    const buffers:Buffer[]=[];let bytes=0,errors=''
    child.stdout.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>MAX_RANGE_RENDER_DURATION_US/1e6*SAMPLE_RATE*4+64000){child.kill();reject(new Error('Decoded audio exceeds review bound'))}else buffers.push(b)})
    child.stderr.on('data',b=>{errors=(errors+String(b)).slice(-2048)})
    child.on('error',reject);child.on('close',code=>{if(code!==0){if(errors.includes('Output file does not contain any stream'))resolve(null);else reject(new Error(`Rendered audio decoding failed: ${errors}`))}else resolve(bytes?Buffer.concat(buffers):null)})
  })
}
/** Ephemeral compute slice only; never added to ProjectActor or media pool. */
export function renderedTranscriptArgs(file:string, contentHash:string, start:number, duration:number) {
  const id=randomUUID(),media=mediaItemTemplate(randomUUID(),'Audio',duration,true)
  media.path_abs=file;media.file_hash_blake3=contentHash;media.file_size=fs.statSync(file).size
  return {layer_id:id,backend:'whisper_cpp',word_timestamps:true,
    layer:{id,label:null,t_start_us:start,t_end_us:start+duration,enabled:true,locked:false,metadata:{},effects:[],params:audioParams(media.id,0,duration)},media}
}
type Deps = { render: typeof renderComposedTimelineRange; decode: typeof decodeRenderedPcm; transcribe:(args:ReturnType<typeof renderedTranscriptArgs>)=>Promise<any> }
const cache=new Map<string,unknown>()
export async function inspectRenderedAudio(project:Project,args:Record<string,unknown>,getActiveWindow:()=>any,deps:Deps,signal?:AbortSignal) {
  const compId=String(args.composition_id??project.root_id)
  const comp=project.compositions[compId]
  if(!comp)throw new Error('Composition not found')
  validateTimelineRange(args.start_us,args.end_us,comp.duration_us,compId)
  signal?.throwIfAborted()
  const state=createHash('sha256').update(reviewState(project)).digest('hex')
  const rendered=await deps.render(project,{start_us:Number(args.start_us),end_us:Number(args.end_us),composition_id:args.composition_id as string|undefined,getActiveWindow,signal,
    audioOnly:comp.tracks.some(t=>t.layers.some(l=>l.params.kind==='Audio' && l.t_end_us>Number(args.start_us) && l.t_start_us<Number(args.end_us)))})
  try {
    signal?.throwIfAborted()
    const hash=createHash('sha256').update(fs.readFileSync(rendered.path)).digest('hex')
    // No render cache: production compositor always runs. Only signal facts
    // reuse identical bytes/range/state; native Whisper owns its engine cache.
    const key=[state,hash,args.start_us,args.end_us].join(':')
    const hit=cache.get(key) as any
    const pcm=hit?undefined:await deps.decode(rendered.path,signal)
    const hasAudio=!!hit||!!pcm
    const start=Number(args.start_us)
    const facts=hit??(pcm?measureRenderedPcm(pcm,start):null)
    let transcript:any={status:'no_audio',evidence_class:'MODEL_OBSERVATION',segments:[]}
    if(hasAudio) {
      try { const result=await deps.transcribe(renderedTranscriptArgs(rendered.path,hash,start,facts!.duration_us));
        if(result.isError)throw new Error(result.content?.[0]?.text??'Local transcription failed')
        const data=typeof result.segments!=='undefined'?result:JSON.parse(result.content.find((c:any)=>c.type==='text').text)
        if(!Array.isArray(data.segments))throw new Error('Malformed local transcript')
        transcript={status:'available',evidence_class:'MODEL_OBSERVATION',backend:data.backend,word_timing:data.word_timing,language:data.language,segments:data.segments}
      }catch(error){transcript={status:'unavailable',evidence_class:'MODEL_OBSERVATION',segments:[],error:String(error)}}
    }
    signal?.throwIfAborted()
    const evidence={coordinate_space:'timeline',evidence_origin:'CURRENT_TIMELINE',state_version:state,composition_id:args.composition_id??project.root_id,
      timeline_range_us:[start,Number(args.end_us)],render_content_sha256:hash,has_audio:hasAudio,
      signal:facts,transcript,cached:!!hit,observed_dimensions:hasAudio?['audio',...(transcript.status==='available'?['speech']:[])]:[],
      semantics:'Actual production audio mix. Signal facts are measurements; local transcript/words are fallible recognition, not source projections or an editorial verdict.'}
    // Failed recognition is not cached as permanent unavailability.
    if(facts){cache.set(key,facts);if(cache.size>8)cache.delete(cache.keys().next().value!)}
    return evidence
  }finally{fs.rmSync(path.dirname(rendered.path),{recursive:true,force:true})}
}
