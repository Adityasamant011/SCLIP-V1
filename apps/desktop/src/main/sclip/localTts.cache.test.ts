import {describe,it,expect,vi} from 'vitest'
import {mkdtempSync,writeFileSync,rmSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
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
})
