import {describe,it,expect,vi} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createAudioUnderstanding,encodeAudioWindow,parseAudioObservations,managedAudioPaths} from './audioUnderstanding'
import {RENDERED_AUDIO_TOOL,AUDIO_UNDERSTANDING_STATUS_TOOL,registeredMcpTools} from '../mcp/server'
function pcm(seconds=1){const p=Buffer.alloc(seconds*16000*4);for(let i=0;i<p.length;i+=4)p.writeFloatLE(.15,i);return p}
const json=(emotion='NEUTRAL',event='Speech')=>JSON.stringify({lang:'<|en|>',emotion:`<|${emotion}|>`,event:`<|${event}|>`,text:'Synthetic speech'})
function fixture(run=vi.fn(async(..._args:any[])=>json())){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sense-test-')),paths={binary:path.join(dir,'binary'),model:path.join(dir,'model'),tokens:path.join(dir,'tokens')}
 for(const p of Object.values(paths))fs.writeFileSync(p,'synthetic')
 return {dir,paths,run,backend:createAudioUnderstanding(()=>paths,run,'darwin','arm64'),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})}
}
describe('bounded local audio observation, no creative brain',()=>{
 it('preserves independent contradictory/unknown labels without quality verdict',()=>{const r=parseAudioObservations(json('HAPPY')+'\n'+json('SAD','BGM'),2);expect(r.map(x=>x.emotion)).toEqual(['HAPPY','SAD']);expect(r[1].event).toBe('BGM');expect(r[0].confidence).toBeNull();expect(r[0]).not.toHaveProperty('quality');expect(parseAudioObservations(json('EMO_UNKNOWN'),1)[0].emotion).toBe('EMO_UNKNOWN')})
 it('rejects unsupported labels, malformed JSON, missing windows and oversized prose',()=>{expect(()=>parseAudioObservations(json('confident'),1)).toThrow();expect(()=>parseAudioObservations('{broken',1)).toThrow();expect(()=>parseAudioObservations(json(),2)).toThrow();expect(()=>parseAudioObservations(JSON.stringify({text:'x'.repeat(9000)}),1)).toThrow()})
 it('encodes mono WAV and rejects nonfinite/malformed PCM',()=>{const b=encodeAudioWindow(pcm());expect(b.toString('ascii',0,4)).toBe('RIFF');expect(b.readUInt32LE(24)).toBe(16000);expect(b.readUInt32LE(40)).toBe(32000);expect(()=>encodeAudioWindow(Buffer.alloc(3))).toThrow();const bad=pcm();bad.writeFloatLE(NaN);expect(()=>encodeAudioWindow(bad)).toThrow()})
 it('one CPU thread, temporary windows, bounded cache and fresh timeline coordinates',async()=>{
  const run=vi.fn(async(..._args:any[])=>json('HAPPY')+'\n'+json('SAD')),f=fixture(run)
  try{const r=await f.backend.understand(pcm(12),3e6);expect(r.status).toBe('available');expect(r.windows.map(w=>w.timeline_range_us)).toEqual([[3e6,13e6],[13e6,15e6]]);const argv=run.mock.calls[0];expect(argv[1]).toContain('--provider=cpu');expect(argv[1]).toContain('--num-threads=1');expect(argv[1].slice(-2).every((p:string)=>!fs.existsSync(p))).toBe(true);const cached=await f.backend.understand(pcm(12),20e6);expect(cached.windows[0].timeline_range_us).toEqual([20e6,30e6]);expect(run).toHaveBeenCalledTimes(1);expect(cached.provider_calls).toBe(0);fs.writeFileSync(f.paths.model,'new synthetic model');await f.backend.understand(pcm(12),0);expect(run).toHaveBeenCalledTimes(2)}finally{f.cleanup()}
 })
 it('caps range and reports missing/unsupported installations without inference',async()=>{const f=fixture();try{expect((await f.backend.understand(pcm(31),0)).status).toBe('range_too_long');fs.rmSync(f.paths.model);expect(f.backend.status().missing).toContain('model');expect((await f.backend.understand(pcm(),0)).status).toBe('unavailable');expect(f.run).not.toHaveBeenCalled();expect(createAudioUnderstanding(()=>f.paths,f.run,'linux','x64').status().status).toBe('unsupported_platform')}finally{f.cleanup()}})
 it('one concurrent job; cancellation and failures leave no resident work or failed cache',async()=>{let finish!:(value:string)=>void;const run=vi.fn((..._args:any[])=>new Promise<string>(resolve=>finish=resolve)),f=fixture(run);try{const first=f.backend.understand(pcm(),0);expect((await f.backend.understand(pcm(2),0)).status).toBe('busy');finish(json());expect((await first).status).toBe('available');const c=new AbortController();c.abort();await expect(f.backend.understand(pcm(),0,c.signal)).rejects.toThrow();const failed=fixture(vi.fn(async(..._args:any[])=>{throw Error('native failure')}));try{expect((await failed.backend.understand(pcm(),0)).status).toBe('unavailable');await failed.backend.understand(pcm(),0);expect(failed.run).toHaveBeenCalledTimes(2)}finally{failed.cleanup()}}finally{f.cleanup()}})
 it('active cancellation cleans temporary windows without caching cancelled observations',async()=>{
  const ctrl=new AbortController(),run=vi.fn(async(..._args:any[])=>{ctrl.abort();return json()}),f=fixture(run)
  try{await expect(f.backend.understand(pcm(),0,ctrl.signal)).rejects.toThrow();expect(run.mock.calls[0][1].slice(-1).every((p:string)=>!fs.existsSync(p))).toBe(true);await f.backend.understand(pcm(),0);expect(run).toHaveBeenCalledTimes(2)}finally{f.cleanup()}
 })
 it('evicts beyond eight distinct cached windows and validates timeline coordinates',async()=>{
  const f=fixture();try{await expect(f.backend.understand(pcm(),-1)).rejects.toThrow('timeline start');for(let i=0;i<9;i++){const b=pcm();b.writeFloatLE(i/10);await f.backend.understand(b,0)}const b=pcm();b.writeFloatLE(0);await f.backend.understand(b,0);expect(f.run).toHaveBeenCalledTimes(10)}finally{f.cleanup()}
 })
 it('pinned catalog paths and optional discoverable schemas',async()=>{const paths=managedAudioPaths('/synthetic/downloads');expect(paths.model).toContain('sensevoice-model-int8');expect(RENDERED_AUDIO_TOOL.inputSchema.properties.include_understanding.type).toBe('boolean');expect(AUDIO_UNDERSTANDING_STATUS_TOOL.description).toContain('No cloud fallback');expect((await registeredMcpTools({mcpCatalog:async()=>JSON.stringify({tools:[]})} as any,{audioUnderstanding:createAudioUnderstanding(()=>paths)})).some(t=>t.name==='get_audio_understanding_status')).toBe(true)})
})
