import {describe,it,expect,vi} from 'vitest'
import {blankProject} from '../state/model'
import {uuidV7Gen} from '../state/ids'
import {videoClipParams} from '../state/mutations/media'
import {textParamsDefault} from '../state/mutations/add'
import {inspectTimelineTemporalWindow,temporalWindowStructure} from './timelineTemporalEvidence'
import {toolDimensions,evidenceCoverage} from './evidenceModalities'
const analyze=vi.hoisted(()=>vi.fn(async(req:any)=>({ok:true,description:req.context.includes('sample 0')?'Empty view':'Different object visible',visibleContent:[],confidence:null,model:'synthetic-temporal',latencyMs:0})))
vi.mock('./visionRuntime',()=>({getVisionRuntime:()=>({analyze,status:async()=>({model:'synthetic-temporal'})})}))
function fixture(){const p=blankProject(uuidV7Gen(),'temporal synthetic'),c=p.compositions[p.root_id];c.duration_us=90000000
 c.tracks[0].layers=[{id:uuidV7Gen()(),label:null,t_start_us:0,t_end_us:45000000,enabled:true,locked:false,metadata:{},effects:[],params:videoClipParams(uuidV7Gen()(),1000000,46000000)}]
 c.tracks[1].layers=[{id:uuidV7Gen()(),label:null,t_start_us:50000000,t_end_us:80000000,enabled:true,locked:false,metadata:{},effects:[],params:textParamsDefault('Synthetic label',c)}]
 const execute=vi.fn(async(code:string)=>({pngBase64:Buffer.from('temporal-synthetic-pixels').toString('base64'),tUs:Number(code.match(/captureFrameAt\((\d+)/)![1])}))
 return {p,c,execute,window:()=>({isDestroyed:()=>false,webContents:{executeJavaScript:execute}})} }
describe('bounded temporal visual evidence',()=>{
 it('preserves chronological current pixels, source mappings, caption changes and contradictory observations',async()=>{
  analyze.mockClear();const f=fixture(),r=await inspectTimelineTemporalWindow(f.p,{start_us:0,end_us:90000000},f.window)
  const times=r.representative_samples.map(s=>s.timeline_t_us);expect(times).toEqual([...times].sort((a,b)=>a-b));expect(times).toHaveLength(5);expect(times.at(-1)).toBeLessThan(90000000)
  expect(r.authority.structure).toBe('AUTHORITATIVE_PROJECT_ACTOR');expect(r.frame_observations.every(o=>o.evidence_class==='MODEL_OBSERVATION')).toBe(true)
  expect(r.frame_observations[0].description).toBe('Empty view');expect(r.frame_observations[1].description).toBe('Different object visible')
  expect(r.structural_changes.some(e=>e.kind==='Text')).toBe(true);expect(r.representative_samples[0].current_visual_state[0].source_mapping.coordinate_space).toBe('source')
  expect(toolDimensions('inspect_timeline_temporal_window',r)).toEqual(['visual','geometry']);expect(evidenceCoverage('inspect_timeline_temporal_window',r,[0,90000000]).visual).toHaveLength(5)
  expect(JSON.stringify(r)).not.toMatch(/add a zoom|cut faster|too static|suggested_action|editorial_score/)
 })
 it('reuses perception only for same pixels/time/question/model, with fresh authoritative state every time',async()=>{
  analyze.mockClear();const f=fixture(),args={start_us:1000000,end_us:70000000,question:'Cache-specific synthetic question'}
  const a=await inspectTimelineTemporalWindow(f.p,args,f.window),n=analyze.mock.calls.length
  const b=await inspectTimelineTemporalWindow(f.p,args,f.window);expect(analyze.mock.calls.length).toBe(n);expect(b.state_version).toBe(a.state_version)
  f.c.background.r=30;const d=await inspectTimelineTemporalWindow(f.p,args,f.window);expect(d.state_version).not.toBe(a.state_version);expect(f.execute).toHaveBeenCalledTimes(15)
 })
 it('rejects invalid range/count, resource overflow and cancellation before observing',async()=>{
  const f=fixture();expect(()=>temporalWindowStructure(f.p,{start_us:90000000,end_us:200000000})).toThrow();expect(()=>temporalWindowStructure(f.p,{start_us:0,end_us:80000000,representative_samples:6})).toThrow()
  f.c.duration_us=400000000;expect(()=>temporalWindowStructure(f.p,{start_us:0,end_us:350000000})).toThrow('review duration bound')
  const ctrl=new AbortController();ctrl.abort();await expect(inspectTimelineTemporalWindow(f.p,{start_us:0,end_us:1000000},f.window,undefined,ctrl.signal)).rejects.toThrow();expect(f.execute).not.toHaveBeenCalled()
 })
 it('bounds structural events and explicitly reports omissions',()=>{const f=fixture(),l=f.c.tracks[0].layers[0];f.c.tracks[0].layers=Array.from({length:200},(_,i)=>({...l,id:String(i),t_start_us:i*100000,t_end_us:i*100000+100000}));const r=temporalWindowStructure(f.p,{start_us:0,end_us:90000000});expect(r.structural_changes).toHaveLength(128);expect(r.omitted_structural_changes).toBeGreaterThan(0);expect(r.times.length).toBeLessThanOrEqual(5)})
})
