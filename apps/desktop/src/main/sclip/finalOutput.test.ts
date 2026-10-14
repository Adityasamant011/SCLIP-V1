import {describe,it,expect,vi} from 'vitest'
import {blankProject} from '../state/model'
import {createActor} from '../state/actor'
import {uuidV7Gen} from '../state/ids'
import {mediaItemTemplate} from '../state/mutations/media'
import {validateOutputState,outputRequirements,visualOutput,requiredRenderedDimensions,verifyDelivery,deliveryProofValid} from './finalOutput'
vi.mock('electron',()=>({app:{isPackaged:true}}))
function fixture(kind='video',duration=30e6) {
 const ids=uuidV7Gen(),p=blankProject(ids,'synthetic'),actor=createActor({initial:p,idGen:ids})
 const m=mediaItemTemplate(ids(),kind==='audio'?'Audio':'Video',60e6);m.metadata.video={width:1920,height:1080};m.path_abs='/nonexistent-synthetic-source'
 actor.dispatch('add_media',{...m}); // Use authoritative state template for standalone input-contract cases below.
 const q=structuredClone(p);q.media_pool[m.id]=m
 const a=createActor({initial:q,idGen:ids})
 if(kind!=='empty')expect(a.dispatch('add_layer',{track:q.compositions[q.root_id].tracks[0].id,kind:kind==='audio'?'audio':'video',media:m.id,t_start_us:0,t_end_us:duration,src_in_us:0,src_out_us:duration}).ok).toBe(true)
 return {actor:a,p:()=>a.snapshot(),ids}
}
describe('Final output is observable content, not model prose or duration alone',()=>{
 it.each([
  ['Make a 30-second video with an audio track.',true,true,false],
  ['Make a 30-second video with audio.',true,true,false],
  ['Make a video with narration.',true,true,true],
  ['Make an audio-only narration.',false,true,true],
  ['Make a podcast.',false,true,false],
  ['Make a music track.',false,true,false],
  ['Make a silent video.',true,false,false],
  ['Make a video without audio.',true,false,false],
  ['Make a video with no sound.',true,false,false],
  ['Make a video with music, no narration.',true,true,false],
  ['Make a video with narration, without music.',true,true,true],
  ['Make a video, do not include speech.',true,false,false],
  ['Make an audio track without video.',false,true,false],
 ] as const)('independent literal modality requirements: %s',(brief,v,a,s)=>{
  const f=fixture('empty'),req=outputRequirements(brief,f.p())
  expect([req.requiresVideo,req.requiresAudio,req.requiresSpeech]).toEqual([v,a,s])
 })
 it('both historical mixed-media briefs reject missing state and missing artifact streams independently',()=>{
  for(const brief of ['Make a 30-second video with an audio track.','Make a 30-second video with audio.']){
   const audio=fixture('audio'),video=fixture(),req=outputRequirements(brief,audio.p())
   expect(validateOutputState(audio.p(),req).errors).toContain('REQUIRED_VIDEO_ABSENT')
   expect(validateOutputState(video.p(),req).errors).toContain('REQUIRED_AUDIO_ABSENT')
   const decoded={valid:true,decoded:true,duration_us:30e6}
   expect(deliveryProofValid(video.p(),req,{...decoded,has_video:true,has_audio:false})).toBe(false)
   expect(deliveryProofValid(audio.p(),req,{...decoded,has_video:false,has_audio:true})).toBe(false)
   expect(deliveryProofValid(video.p(),req,{...decoded,has_video:true,has_audio:true})).toBe(true)
  }
 })
 it('accepts a correctly bounded 30s video state',()=>{const f=fixture();expect(validateOutputState(f.p(),outputRequirements('Make a 30-second product video.',f.p())).valid).toBe(true)})
 it('refuses a 30s audio-only output for a video brief',()=>{const f=fixture('audio');const v=validateOutputState(f.p(),outputRequirements('Make a 30-second product video.',f.p()));expect(v.errors).toContain('REQUIRED_VIDEO_ABSENT');expect(v.current_output.duration_requirement?.met).toBe(true)})
 it('refuses entirely empty output',()=>{const f=fixture('empty');expect(validateOutputState(f.p(),outputRequirements('Make a product video.',f.p())).errors).toContain('EMPTY_OUTPUT')})
 it('rejects the observed seconds/us confusion without generating an edit',()=>{const f=fixture();const p=structuredClone(f.p());p.compositions[p.root_id].duration_us=30_000e6;expect(validateOutputState(p,outputRequirements('Make a 30-second video.',p)).errors).toContain('OUTPUT_DURATION_UNMET');expect(p.compositions[p.root_id].duration_us).toBe(30_000e6)})
 it('reports long visual gaps as uncertain warnings, not forced edits',()=>{const f=fixture();const p=structuredClone(f.p());p.compositions[p.root_id].tracks[0].layers[0].t_start_us=10e6;const v=validateOutputState(p,outputRequirements('Make a 30-second video.',p));expect(v.valid).toBe(true);expect(v.visual_output.uncovered_ranges_us).toEqual([[0,10e6]]);expect(v.warnings.length).toBeGreaterThan(0)})
 it('allows a legitimate audio-only request without demanding video',()=>{const f=fixture('audio');const req=outputRequirements('Make a 30-second audio-only edit.',f.p());expect(req.media).toBe('audio');expect(validateOutputState(f.p(),req).valid).toBe(true);expect(requiredRenderedDimensions(f.p(),req)).toEqual(['audio'])})
 it('counts an explicit intentional black Color, excludes transparent content',()=>{const f=fixture('empty');const p=f.p();expect(f.actor.dispatch('add_layer',{track:p.compositions[p.root_id].tracks[0].id,kind:'color',t_start_us:0,t_end_us:30e6,color:{r:0,g:0,b:0,a:255}}).ok).toBe(true);expect(validateOutputState(f.p(),outputRequirements('Make a 30-second black-screen video.',f.p())).valid).toBe(true);const q=structuredClone(f.p());(q.compositions[q.root_id].tracks[0].layers[0].params as any).color.value.a=0;expect(visualOutput(q).potential_visual_ranges_us).toEqual([])})
 it('excludes disabled tracks and zero static opacity',()=>{const f=fixture();const p=structuredClone(f.p());p.compositions[p.root_id].tracks[0].enabled=false;expect(visualOutput(p).potential_visual_ranges_us).toEqual([]);p.compositions[p.root_id].tracks[0].enabled=true;(p.compositions[p.root_id].tracks[0].layers[0].params as any).opacity.value=0;expect(visualOutput(p).potential_visual_ranges_us).toEqual([])})
 it('checks physical source bounds without rejecting one-frame rounding',()=>{const f=fixture();const p=structuredClone(f.p()),l=p.compositions[p.root_id].tracks[0].layers[0];(l.params as any).src_out_us=60e6+5828;expect(validateOutputState(p).errors).not.toContain(`INVALID_SOURCE_RANGE:${l.id}`);(l.params as any).src_out_us=90e6;expect(validateOutputState(p).errors).toContain(`INVALID_SOURCE_RANGE:${l.id}`)})
 it('requires actual audio when speech is explicitly requested',()=>{const f=fixture();expect(validateOutputState(f.p(),outputRequirements('Create a tutorial video with speech.',f.p())).errors).toContain('REQUIRED_AUDIO_ABSENT')})
 it('does not trust a bare success flag, an undecoded artifact or missing required stream',()=>{const f=fixture();const req=outputRequirements('Make a 30-second video.',f.p());expect(deliveryProofValid(f.p(),req,{valid:true})).toBe(false);expect(deliveryProofValid(f.p(),req,{valid:true,decoded:false,duration_us:30e6,has_video:true})).toBe(false);expect(deliveryProofValid(f.p(),req,{valid:true,decoded:true,duration_us:30e6,has_video:false})).toBe(false);expect(deliveryProofValid(f.p(),req,{valid:true,decoded:true,duration_us:30e6,has_video:true})).toBe(true)})
 it('bounds whole-output proof rather than certifying a long prefix',async()=>{const f=fixture();const p=structuredClone(f.p());p.compositions[p.root_id].duration_us=30_000e6;const w=vi.fn();expect((await verifyDelivery(p,undefined,w)).valid).toBe(false);expect(w).not.toHaveBeenCalled()})
 it('refuses missing source provenance before a surviving cache can masquerade as current output',async()=>{const f=fixture(),exportSurface=vi.fn();const r=await verifyDelivery(f.p(),outputRequirements('Make a video.',f.p()),()=>({isDestroyed:()=>false,webContents:{executeJavaScript:exportSurface}}));expect(r.valid).toBe(false);expect(r.reason).toContain('Required source file unavailable');expect(exportSurface).not.toHaveBeenCalled()})
 it('fails precise render refusal when the real compositor is unavailable',async()=>{const f=fixture();const r=await verifyDelivery(f.p(),undefined,()=>null);expect(r.valid).toBe(false);expect(r.reason).toContain('open Sclip desktop window')})
})
