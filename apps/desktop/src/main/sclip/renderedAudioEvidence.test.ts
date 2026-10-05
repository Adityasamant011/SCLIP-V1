import {describe,it,expect,vi} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {blankProject} from '../state/model'
import {uuidV7Gen} from '../state/ids'
import {measureRenderedPcm,inspectRenderedAudio,decodeRenderedPcm} from './renderedAudioEvidence'
import {resolveFfmpegPath} from './rangeRender'
import {toolDimensions} from './evidenceModalities'
function pcm(values:number[]){const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeFloatLE(v,i*4));return b}
function fixture() {
 const project=blankProject(uuidV7Gen(),'synthetic'),paths:string[]=[],content={value:'synthetic-render-a'}
 project.compositions[project.root_id].duration_us=60000000
 const render=vi.fn(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-audio-test-')),file=path.join(dir,'render.mp4');fs.writeFileSync(file,content.value);paths.push(dir);return {path:file,duration_us:2000000,has_audio:true,cached:false}})
 const decode=vi.fn(async()=>pcm(Array.from({length:32000},(_,i)=>i<16000?.2:0)))
 const transcribe=vi.fn(async(args:any)=>({backend:'whisper_cpp',word_timing:'word',segments:[{text:'Synthetic speech.',t_start_us:args.layer.t_start_us,t_end_us:args.layer.t_start_us+500000,words:[{word:'Synthetic',t_start_us:args.layer.t_start_us,t_end_us:args.layer.t_start_us+300000}]}]}))
 const run=(signal?:AbortSignal)=>inspectRenderedAudio(project,{start_us:4000000,end_us:6000000},()=>null,{render,decode,transcribe},signal)
 return {project,paths,content,render,decode,transcribe,run}
}
describe('actual rendered audio facts, never editorial judgments',()=>{
 it('exposes timeline transcript/words, measurable quiet and signal facts via explicit local Whisper slice',async()=>{
  const f=fixture(),r=await f.run();expect(r.transcript.status).toBe('available');expect(r.transcript.segments[0].words[0].t_start_us).toBe(4000000)
  expect(r.signal!.silence_spans_us).toEqual([[5000000,6000000]]);expect(r.signal!.peak).toBeCloseTo(.2);expect(r.signal!.rms).toBeCloseTo(Math.sqrt(.02))
  const input=f.transcribe.mock.calls[0][0];expect(input.backend).toBe('whisper_cpp');expect(input.layer.params.src_in_us).toBe(0);expect(input.media.path_abs).toContain('render.mp4')
  expect(toolDimensions('inspect_rendered_audio',r)).toEqual(['audio','speech']);expect(f.project.media_pool).toEqual({});expect(f.paths.every(p=>!fs.existsSync(p))).toBe(true)
  expect(JSON.stringify(r)).not.toMatch(/bad pacing|awkward pause|suggested_action|editorial_score/)
 })
 it('reports no audio without inventing transcript or speech coverage',async()=>{const f=fixture();f.decode.mockResolvedValue(null as any);const r=await f.run();expect(r.has_audio).toBe(false);expect(r.observed_dimensions).toEqual([]);expect(f.transcribe).not.toHaveBeenCalled()})
 it('recognition failure leaves signal facts but no speech verification',async()=>{const f=fixture();f.transcribe.mockRejectedValue(Error('local model missing'));const r=await f.run();expect(r.transcript.status).toBe('unavailable');expect(r.observed_dimensions).toEqual(['audio'])})
 it('keys measurement cache by current state, rendered bytes and range; never caches a transcript across config changes',async()=>{
  const f=fixture(),first=await f.run(),again=await f.run();expect(first.cached).toBe(false);expect(again.cached).toBe(true);expect(f.render).toHaveBeenCalledTimes(2);expect(f.transcribe).toHaveBeenCalledTimes(2)
  f.content.value='synthetic-render-b';expect((await f.run()).cached).toBe(false);f.project.compositions[f.project.root_id].background.r=25;expect((await f.run()).cached).toBe(false)
 })
 it('rejects malformed PCM and counts near-full-scale samples without inferring audible clipping',()=>{const r=measureRenderedPcm(pcm([1,-1,0]),0);expect(r.clipping_sample_count).toBe(2);expect(()=>measureRenderedPcm(Buffer.alloc(3),0)).toThrow();expect(()=>measureRenderedPcm(pcm([NaN]),0)).toThrow()})
 it('cancellation discards evidence and temporary render',async()=>{const f=fixture(),ctrl=new AbortController();f.decode.mockImplementation(async()=>{ctrl.abort();return pcm([0])});await expect(f.run(ctrl.signal)).rejects.toThrow();expect(f.paths.every(p=>!fs.existsSync(p))).toBe(true)})
 it('decodes real rendered containers, silence and absent audio; malformed file rejects',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-audio-codec-')),ffmpeg=resolveFfmpegPath(),file=path.join(dir,'silence.mkv'),mute=path.join(dir,'mute.mkv')
  try{
    expect(spawnSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','0.3','-c:a','pcm_s16le',file]).status).toBe(0)
    const decoded=await decodeRenderedPcm(file);expect(decoded).not.toBeNull();expect(measureRenderedPcm(decoded!,0).silence_spans_us).toEqual([[0,300000]])
    expect(spawnSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=s=32x32:r=10','-t','0.3','-an',mute]).status).toBe(0);expect(await decodeRenderedPcm(mute)).toBeNull()
    const broken=path.join(dir,'broken.mp4');fs.writeFileSync(broken,'broken');await expect(decodeRenderedPcm(broken)).rejects.toThrow('decoding failed')
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
 })
})
