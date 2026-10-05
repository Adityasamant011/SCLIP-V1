import { describe,it,expect,vi } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildSourceUnderstanding, sourceSpeechContext, SOURCE_MAP_LIMITS } from './sourceUnderstanding'
import { SourceObservationIndex, type SourceObservationIndexResult } from './sourceObservationIndex'
import type { MediaItem } from '../state/model'
import { validateRoughCutPlan } from './roughCutPlan'

const media={id:'synthetic-source',file_hash_blake3:'synthetic-hash',path_abs:'/tmp/technical-synthetic.mp4',kind:'Video',metadata:{duration_us:3_600_000_000,video:{width:640,height:360},audio:{sample_rate:48000}}} as unknown as MediaItem
const observation={source_t_us:10_000_000,kind:'visual' as const,description:'Two people beside a counter.',model:'test-local',evidence:'model_observation' as const,sample_window_us:[0,120_000_000] as [number,number]}
const index={media_id:media.id,source_hash:media.file_hash_blake3,observations:[observation],audio:{status:'not_generated'},cached:true} as SourceObservationIndexResult
const transcript={source_hash:media.file_hash_blake3,segments:[{text:'A complete observation.',t_start_us:9_000_000,t_end_us:12_000_000,words:[{text:'complete',t_start_us:10_000_000,t_end_us:11_000_000}]}]}

describe('Source understanding is evidence, not a story generator',()=>{
 it('bounds long/oversized sources and preserves explicit unobserved time',()=>{
  for(const duration of [600_000_000,3_600_000_000,90_000_000_000]) {
   const m={...media,metadata:{...media.metadata,duration_us:duration}}
   const p=buildSourceUnderstanding(m,[index],null)
   expect(p.structure.cells.length).toBeLessThanOrEqual(12);expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(SOURCE_MAP_LIMITS.bytes)
   expect(p.structure.cells.at(-1)!.visual.status).toBe('unobserved')
   expect(p.structure.cells[0].visual.sample_times_us).toEqual([10_000_000]);expect(p.observations[0].observed_range_us).toEqual([10_000_000,10_000_000])
  }
 })
 it('does not confuse visual, speech, signal, text or metadata coverage',()=>{
  const visual=buildSourceUnderstanding(media,[index],null)
  expect(visual.structure.cells[0].speech.status).toBe('not_observed');expect(visual.transcript.speech_presence).toBe('unknown')
  const speech=buildSourceUnderstanding(media,[],transcript)
  expect(speech.structure.cells[0].visual.status).toBe('unobserved');expect(speech.structure.cells[0].speech.status).toBe('cached_transcript_segments')
  expect(speech.structure.cells[0].text.status).toBe('not_observed');expect(speech.metadata.evidence_class).toBe('AUTHORITATIVE_MEDIA_METADATA')
 })
 it('provides bounded before/selected/after source speech with original word timings',()=>{
  const p=sourceSpeechContext(media,transcript,10_000_000,11_000_000,2_000_000,3_000_000)
  expect(p.context_range_us).toEqual([8_000_000,14_000_000]);expect(p.selected[0].words?.[0].t_start_us).toBe(10_000_000)
  expect(p.before).toHaveLength(1);expect(p.after).toHaveLength(1);expect(p.coordinate_space).toBe('source')
  expect(()=>sourceSpeechContext(media,transcript,0,80_000_000)).toThrow('60 source seconds')
  expect(()=>sourceSpeechContext(media,transcript,0,1_000_000,20_000_000)).toThrow('context padding')
 })
 it('rejects stale source/hash evidence and missing transcript remains unknown',()=>{
  expect(buildSourceUnderstanding(media,[{...index,source_hash:'replaced'}],{...transcript,source_hash:'replaced'}).observations).toEqual([])
  expect(sourceSpeechContext(media,{...transcript,source_hash:'replaced'},0,1_000_000).status).toBe('not_generated')
  expect(buildSourceUnderstanding(media,[index],null).identity).toMatchObject({media_id:media.id,source_hash:media.file_hash_blake3,evidence_origin:'SOURCE_MEDIA'})
 })
 it('preserves contradictory frames and bounds huge observation/text inputs',()=>{
  const many={...index,observations:Array.from({length:500},(_,i)=>({...observation,source_t_us:10_000_000+i,description:(i%2?'No person visible.':'Person visible.')+' x'.repeat(5000)}))}
  const p=buildSourceUnderstanding(media,[many],transcript)
  expect(p.observations[0].description).toContain('Person visible');expect(p.observations[1].description).toContain('No person visible')
  expect(p.truncation.observations_omitted).toBeGreaterThan(0);expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThanOrEqual(SOURCE_MAP_LIMITS.bytes)
 })
 it('accepts alternative Hermes-authored stories, ranges, values or no edit from identical evidence',()=>{
  const before=JSON.stringify(buildSourceUnderstanding(media,[index],transcript))
  for(const [thesis,start,end] of [['Explore conversation',1_000_000,7_000_000],['Explain objects',40_000_000,53_000_000],['Observe setting',100_000_000,102_000_000]] as const){
   const plan={version:1,brief:{goal:thesis,audience:'Viewers',target_duration_us:end-start,tone:['natural']},source_summary:'Synthetic evidence',editorial_thesis:thesis,sections:[{id:'choice',purpose:thesis,clips:[{media_id:media.id,source_start_us:start,source_end_us:end,action:'keep',reason:'Hermes choice'}]}],removed_ranges:[],estimated_duration_us:end-start,uncertainties:[]}
   expect(validateRoughCutPlan(plan,{[media.id]:{duration_us:media.metadata.duration_us!}}).valid).toBe(true)
   expect(JSON.stringify(buildSourceUnderstanding(media,[index],transcript))).toBe(before)
  }
  const noEdit=buildSourceUnderstanding(media,[index],transcript)
  expect(noEdit).not.toHaveProperty('operations');expect(noEdit).not.toHaveProperty('best_story');expect(noEdit.observations.every(o=>!('rank' in o)&&!('recommended_action' in o))).toBe(true)
 })
 it('performs a bounded coarse acquisition once and reuses cache without extra local inference',async()=>{
  const cacheDir=await mkdtemp(path.join(os.tmpdir(),'source-coarse-test-'))
  const analyze=vi.fn(async()=>({ok:true,description:'Observed setting.',model:'local',confidence:null,latencyMs:0,visibleContent:[]})), audio=vi.fn()
  const idx=new SourceObservationIndex({cacheDir,visionSidecar:{analyze,analyzeAudio:audio} as never,frameExtractor:async()=>{},readTranscript:async()=>transcript})
  const first=await idx.coarseUnderstanding(media);expect(analyze).toHaveBeenCalledTimes(6);expect(audio).not.toHaveBeenCalled()
  expect(first.observations.filter(x=>x.kind==='visual')).toHaveLength(6)
  await idx.coarseUnderstanding(media);expect(analyze).toHaveBeenCalledTimes(6)
  const reimported=await idx.coarseUnderstanding({...media,id:'another-project-import'})
  expect(reimported.identity.media_id).toBe('another-project-import')
  expect(reimported.observations.filter(x=>x.kind==='visual')).toHaveLength(6)
  expect(Buffer.byteLength(JSON.stringify(reimported))).toBeLessThanOrEqual(SOURCE_MAP_LIMITS.bytes)
  expect(analyze).toHaveBeenCalledTimes(6)
  const newTranscript={segments:[{text:'New speech cache',t_start_us:25_000_000,t_end_us:27_000_000}]}
  const fresh=new SourceObservationIndex({cacheDir,visionSidecar:{analyze,analyzeAudio:audio} as never,readTranscript:async()=>newTranscript})
  expect((await fresh.speechContext(media,25_000_000,27_000_000)).selected[0].text).toBe('New speech cache')
 })
})
