import {describe,it,expect,vi} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync,readdirSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {listLocalSpeechVoices,synthesizeSpeechLocally,runTtsCommand,type TtsRuntime} from './localTts'
function fixture() {
 const dir=mkdtempSync(join(tmpdir(),'sclip-tts-unit-')),model=join(dir,'model'),voices=join(dir,'voices');writeFileSync(model,'model');writeFileSync(voices,'voices')
 const run=vi.fn(async(command:string,args:string[])=>{
  if(args.includes('--list-voices'))return JSON.stringify({voices:['af_heart','af_nicole'],aliases:{nova:'af_nicole'}})
  if(command==='python'){writeFileSync(args[args.indexOf('--output')+1],'wav');return JSON.stringify({engine:'kokoro-tts',requested_voice:'nova',resolved_voice:'af_nicole',model:'model',speed:1})}
  writeFileSync(args.at(-1)!,Buffer.alloc(128,1));return ''
 });const rt:TtsRuntime={python:'python',worker:'worker',model,voices,edge:'edge',run};return {dir,run,rt}
}
describe('local speech provenance/cache',()=>{
 it.skipIf(spawnSync(process.env.SCLIP_TEST_PYTHON ?? 'python3',['--version'],{stdio:'ignore'}).error !== undefined)('runs the actual Python command without creating __pycache__ in a script directory',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sclip-tts-python-bytecode-'))
  try {
   writeFileSync(join(dir,'sclip_bytecode_probe.py'),'VALUE = 42\n')
   const script='import sys; sys.path.insert(0, sys.argv[1]); import sclip_bytecode_probe; print(sys.dont_write_bytecode)'
   const output=await runTtsCommand(process.env.SCLIP_TEST_PYTHON ?? 'python3',['-c',script,dir])
   expect(output.trim()).toBe('True')
   expect(existsSync(join(dir,'__pycache__'))).toBe(false)
  } finally { rmSync(dir,{recursive:true,force:true}) }
 })
 it('reports actual voice, validates cache integrity and preserves provenance',async()=>{
  const f=fixture();try{const a=await synthesizeSpeechLocally({text:'Synthetic',voice:'nova'},f.dir,f.rt),b=await synthesizeSpeechLocally({text:'Synthetic',voice:'nova'},f.dir,f.rt)
   expect(a.synthesis.resolved_voice).toBe('af_nicole');expect(b.synthesis).toEqual(a.synthesis);expect(b.cached).toBe(true);expect(f.run).toHaveBeenCalledTimes(2)
   writeFileSync(a.filePath,'corrupt');expect((await synthesizeSpeechLocally({text:'Synthetic',voice:'nova'},f.dir,f.rt)).cached).toBe(false);expect(f.run).toHaveBeenCalledTimes(4)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
 })
 it('strict Kokoro never silently invokes fallback on unknown voice',async()=>{
  const f=fixture();try{f.run.mockRejectedValue(Error('Unknown voice'));await expect(synthesizeSpeechLocally({text:'Synthetic',voice:'unknown'},f.dir,f.rt)).rejects.toThrow('Unknown voice');expect(f.run).toHaveBeenCalledTimes(1);expect(readdirSync(join(f.dir,'voiceover'))).toHaveLength(0)}finally{rmSync(f.dir,{recursive:true,force:true})}
 })
 it('explicit auto fallback cache correctly identifies Edge',async()=>{
  const f=fixture();try{f.rt.python=null;const a=await synthesizeSpeechLocally({text:'Synthetic',engine:'auto',voice:'nova'},f.dir,f.rt),b=await synthesizeSpeechLocally({text:'Synthetic',engine:'auto',voice:'nova'},f.dir,f.rt)
   expect(a.engine).toBe('edge-tts');expect(a.synthesis.resolved_voice).toBe('en-US-AriaNeural');expect(b.engine).toBe('edge-tts');expect(b.cached).toBe(true)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
 })
 it('lists actual voices/aliases without synthesis; missing models are explicit',async()=>{
  const f=fixture();try{expect((await listLocalSpeechVoices(f.rt)).aliases.nova).toBe('af_nicole');expect(f.run).toHaveBeenCalledTimes(1);rmSync(f.rt.model);expect((await listLocalSpeechVoices(f.rt)).status).toBe('unavailable');expect(f.run).toHaveBeenCalledTimes(1)}finally{rmSync(f.dir,{recursive:true,force:true})}
 })
 it('terminates a stuck local subprocess',async()=>{await expect(runTtsCommand(process.execPath,['-e','setInterval(()=>{},1000)'],50)).rejects.toThrow('timed out')})
 it('owned cancellation terminates a real subprocess and the next command succeeds',async()=>{
  const abort=new AbortController(),work=runTtsCommand(process.execPath,['-e','setInterval(()=>{},1000)'],10000,abort.signal)
  setTimeout(()=>abort.abort(),30)
  await expect(work).rejects.toMatchObject({name:'AbortError'})
  expect(await runTtsCommand(process.execPath,['-e','process.stdout.write("recovered")'])).toBe('recovered')
 })
 it('cancellation after worker output cleans only private files and never publishes a partial cache or falls back',async()=>{
  const f=fixture(),abort=new AbortController();try{
   const run=f.run.getMockImplementation()!
   f.run.mockImplementation(async(command,args)=>{const result=await run(command,args);abort.abort();return result})
   await expect(synthesizeSpeechLocally({text:'Cancelled synthetic',engine:'auto'},f.dir,f.rt,abort.signal)).rejects.toMatchObject({name:'AbortError'})
   expect(f.run).toHaveBeenCalledTimes(1);expect(readdirSync(join(f.dir,'voiceover'))).toEqual([])
  }finally{rmSync(f.dir,{recursive:true,force:true})}
 })
 it('pre-cancelled requests preserve a shared verified cache and never run a worker',async()=>{
  const f=fixture();try{
   const saved=await synthesizeSpeechLocally({text:'Shared synthetic'},f.dir,f.rt),files=readdirSync(join(f.dir,'voiceover'))
   f.run.mockClear();const abort=new AbortController();abort.abort()
   await expect(synthesizeSpeechLocally({text:'Shared synthetic'},f.dir,f.rt,abort.signal)).rejects.toMatchObject({name:'AbortError'})
   expect(f.run).not.toHaveBeenCalled();expect(readdirSync(join(f.dir,'voiceover'))).toEqual(files)
   expect((await synthesizeSpeechLocally({text:'Shared synthetic'},f.dir,f.rt)).filePath).toBe(saved.filePath)
  }finally{rmSync(f.dir,{recursive:true,force:true})}
 })
})
