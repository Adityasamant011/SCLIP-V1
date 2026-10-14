import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface LocalTtsArgs { text: string; voice?: string; speed?: number; engine?: 'kokoro' | 'auto' | 'openai' }
export interface SpeechProvenance {
  engine: 'kokoro-tts' | 'edge-tts' | 'macos-say'
  requested_voice: string; resolved_voice: string; speed: number; model?: string; language?: string; sample_rate?: number
}
export interface LocalTtsResult { filePath: string; cached: boolean; engine: SpeechProvenance['engine']; synthesis: SpeechProvenance }
export interface TtsRuntime {
  python: string | null; worker: string | null; model: string; voices: string; edge: string | null
  run(command: string, args: string[], timeoutMs?: number, signal?: AbortSignal): Promise<string>
}
const EDGE: Record<string,string> = {alloy:'en-US-JennyNeural',echo:'en-US-GuyNeural',fable:'en-US-ChristopherNeural',onyx:'en-US-BrianNeural',nova:'en-US-AriaNeural',shimmer:'en-US-AvaNeural',default:'en-US-ChristopherNeural'}
const SAY: Record<string,string> = {alloy:'Samantha',echo:'Daniel',fable:'Alex',onyx:'Fred',nova:'Victoria',shimmer:'Karen',default:'Samantha'}
const first = (paths: string[]) => paths.find(p => fs.existsSync(p)) ?? null
/** No shell; bounded diagnostics and runtime. Timeout/failure never publishes a cache hit. */
export function runTtsCommand(command: string, args: string[], timeoutMs = 120_000, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  return new Promise((resolve,reject) => {
    const child = spawn(command,args,{stdio:['ignore','pipe','pipe']})
    let stdout='',stderr='',done=false
    const finish = (error?: Error) => {if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort', abort);error?reject(error):resolve(stdout)}
    const abort = () => {child.kill('SIGKILL')}
    child.stdout.on('data',chunk => {stdout=(stdout+String(chunk)).slice(-16_384)})
    child.stderr.on('data',chunk => {stderr=(stderr+String(chunk)).slice(-2048)})
    const timer=setTimeout(() => {child.kill('SIGKILL');finish(new Error(`Local TTS process timed out after ${timeoutMs}ms`))},timeoutMs)
    signal?.addEventListener('abort', abort, {once:true})
    if (signal?.aborted) abort()
    child.on('error',error => finish(error))
    // Wait for process close before the caller cleans its private output files.
    child.on('close',code => finish(signal?.aborted ? new DOMException('Speech synthesis cancelled', 'AbortError') : code===0?undefined:new Error(`Local TTS process failed (${code}): ${stderr}`)))
  })
}
function runtime(): TtsRuntime {
  const home=process.env.HOME??'', support=path.join(home,'Library','Application Support','Sclip')
  const dir=path.join(support,'models','kokoro')
  return {python:first(['python','python3'].map(n=>path.join(support,'vision-sidecar','venv','bin',n))),
    worker:first([path.resolve(__dirname,'..','..','vision','sidecar','kokoro_tts_worker.py'),path.resolve(__dirname,'..','..','src','vision','sidecar','kokoro_tts_worker.py'),path.join(process.resourcesPath??'','vision','sidecar','kokoro_tts_worker.py')]),
    model:first(['kokoro-v1.0.int8.onnx','kokoro-v1.0.onnx','kokoro-v0_19.onnx'].map(n=>path.join(dir,n)))??path.join(dir,'kokoro-v1.0.int8.onnx'),
    voices:first(['voices-v1.0.bin','voices.bin'].map(n=>path.join(dir,n)))??path.join(dir,'voices-v1.0.bin'),
    edge:first(['/opt/homebrew/bin/edge-tts','/usr/local/bin/edge-tts',path.join(home,'.local','bin','edge-tts')]),run:runTtsCommand}
}
export async function listLocalSpeechVoices(rt=runtime()) {
  if(!rt.python||!rt.worker||!fs.existsSync(rt.model)||!fs.existsSync(rt.voices)) return {engine:'kokoro-tts',status:'unavailable',voices:[],aliases:{},reason:'Local Python, Kokoro worker or model/voices files unavailable. No download or inference attempted.'}
  const catalog=JSON.parse(await rt.run(rt.python,[rt.worker,'--list-voices','--model',rt.model,'--voices',rt.voices]))
  if(!Array.isArray(catalog.voices)||catalog.voices.some((v:unknown)=>typeof v!=='string'))throw new Error('Invalid installed Kokoro voice catalog')
  return {...catalog,engine:'kokoro-tts',status:'available',selection:'Actual installed voice IDs and alias mappings, not a delivery-quality verdict. Choose a local preview for the requested delivery; Hermes/user decides which voice fits.'}
}
/** Kokoro is the default local engine. Other engines require explicit auto;
 * no silent cloud/OS substitute for an explicitly requested Kokoro voice. */
export async function synthesizeSpeechLocally(args:LocalTtsArgs,cacheDir:string,rt=runtime(),signal?:AbortSignal):Promise<LocalTtsResult> {
  signal?.throwIfAborted()
  const text=args.text?.trim();if(!text)throw new Error('text is empty')
  const voice=(args.voice??'default').toLowerCase().trim(),speed=args.speed??1
  if(!Number.isFinite(speed)||speed<0.25||speed>4)throw new Error('speed must be between 0.25 and 4')
  if(args.engine && !['kokoro','auto'].includes(args.engine))throw new Error('Unsupported local speech engine')
  const engines:SpeechProvenance['engine'][]=args.engine==='auto'?['kokoro-tts','edge-tts','macos-say']:['kokoro-tts']
  const dir=path.join(cacheDir,'voiceover');fs.mkdirSync(dir,{recursive:true})
  const failures:string[]=[]
  for(const engine of engines) {
    signal?.throwIfAborted()
    const modelIdentity=engine==='kokoro-tts'?[rt.model,rt.voices].map(p=>{try{const st=fs.statSync(p);return [p,st.size,st.mtimeMs]}catch{return [p,'missing']}}):engine
    const hash=crypto.createHash('sha256').update(JSON.stringify(['local_tts_v2',engine,modelIdentity,voice,speed,text])).digest('hex')
    const dest=path.join(dir,hash+'.mp3'),meta=path.join(dir,hash+'.json')
    try {
      const saved=JSON.parse(fs.readFileSync(meta,'utf8'))
      if(saved.synthesis?.engine===engine && saved.sha256===crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex'))return {filePath:dest,cached:true,engine,synthesis:saved.synthesis}
    }catch{/* Old/unverified caches are preserved, never falsely labelled Kokoro. */}
    const temp=path.join(dir,hash+'.'+crypto.randomUUID()+'.mp3'),wav=path.join(os.tmpdir(),'sclip-tts-'+crypto.randomUUID()+'.wav')
    try {
      let synthesis:SpeechProvenance
      if(engine==='kokoro-tts') {
        if(!rt.python||!rt.worker||!fs.existsSync(rt.model)||!fs.existsSync(rt.voices))throw new Error('Kokoro local runtime/model unavailable; configure local models first')
        synthesis=JSON.parse(await rt.run(rt.python,[rt.worker,'--text',text,'--voice',voice,'--speed',String(speed),'--output',wav,'--model',rt.model,'--voices',rt.voices], undefined, signal))
        if(synthesis.engine!==engine||!synthesis.resolved_voice)throw new Error('Kokoro worker returned no verified voice provenance')
      } else if(engine==='edge-tts') {
        if(!rt.edge)throw new Error('edge-tts not installed')
        const resolved=EDGE[voice]??voice,rate=Math.round((speed-1)*100)
        await rt.run(rt.edge,['--text',text,'--voice',resolved,'--rate',(rate>=0?'+':'')+rate+'%','--write-media',temp], undefined, signal)
        synthesis={engine,requested_voice:voice,resolved_voice:resolved,speed}
      } else {
        if(process.platform!=='darwin')throw new Error('macOS say unavailable')
        const resolved=SAY[voice]??voice
        await rt.run('/usr/bin/say',['-v',resolved,'-r',String(Math.max(80,Math.min(360,Math.round(185*speed)))),'-o',wav,'--data-format=LEI16@44100','--',text], undefined, signal)
        synthesis={engine,requested_voice:voice,resolved_voice:resolved,speed}
      }
      signal?.throwIfAborted()
      if(engine!=='edge-tts')await rt.run('ffmpeg',['-y','-i',wav,'-c:a','libmp3lame','-q:a','2',temp], undefined, signal)
      signal?.throwIfAborted()
      if(!fs.existsSync(temp)||fs.statSync(temp).size<100)throw new Error('Synthesizer produced no usable MP3')
      const sha256=crypto.createHash('sha256').update(fs.readFileSync(temp)).digest('hex')
      fs.renameSync(temp,dest)
      const metaTemp = temp+'.json'
      fs.writeFileSync(metaTemp,JSON.stringify({version:2,sha256,synthesis}))
      fs.renameSync(metaTemp,meta)
      return {filePath:dest,cached:false,engine,synthesis}
    }catch(error){signal?.throwIfAborted();failures.push(`${engine}: ${error instanceof Error?error.message:String(error)}`)}
    finally {for(const p of [wav,temp])try{fs.rmSync(p,{force:true})}catch{}}
  }
  throw new Error('Local speech synthesis failed; no fallback outside requested engines. '+failures.join('; '))
}
