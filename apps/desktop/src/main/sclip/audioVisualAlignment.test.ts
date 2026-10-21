import {it,expect} from 'vitest'
import {narrationAlignmentPlan,pairNarrationEvidence,recordAlignmentCoverage} from './audioVisualAlignment'
import {blankProject} from '../state/model'
import {seededGen} from '../state/ids'
it('pairs actual narration times with the shot shown then, preserving contradictions',()=>{
 const p=blankProject(seededGen(),'alignment'),c=p.compositions[p.root_id];c.duration_us=30e6
 c.tracks[0].layers=[{id:'baguette',enabled:true,t_start_us:2.5e6,t_end_us:5.5e6,params:{kind:'VideoClip',media:'vlog',src_in_us:8e6,speed:1}} as any]
 const audio={timeline_range_us:[0,30e6],transcript:{status:'available',segments:[{t_start_us:3e6,t_end_us:5e6,text:'A croissant from a bakery.'}]}}
 const plan=narrationAlignmentPlan(p,audio,0,30e6);expect(plan.sample_times).toEqual([4e6]);expect(plan.pairs[0].source_mapping?.source_t_us).toBe(9.5e6)
 const paired=pairNarrationEvidence(plan,{frame_observations:[{timeline_t_us:4e6,inference_ok:true,description:'Eating a baguette sandwich'}]},audio)
 expect(paired.alignment_pairs[0].spoken_segments[0].text).toContain('croissant');expect(paired.alignment_pairs[0].visual_observation.description).toContain('baguette');expect(paired).not.toHaveProperty('aligned',true)
})
it('refuses absent recognition and exposes failed frame inference as unavailable',()=>{
 const p=blankProject(seededGen(),'alignment');expect(()=>narrationAlignmentPlan(p,{transcript:{status:'unavailable'}},0,30e6)).toThrow('unverified')
})

it('reviews every graphic section at two seek times, with explicit bounded continuation',()=>{
 const p=blankProject(seededGen(),'graphics'),c=p.compositions[p.root_id];c.duration_us=14e6
 c.tracks[0].layers=Array.from({length:7},(_,i)=>({id:`scene-${i}`,enabled:true,t_start_us:i*2e6,t_end_us:(i+1)*2e6,params:{kind:'Motif'}} as any))
 const audio={timeline_range_us:[0,14e6],transcript:{status:'available',segments:Array.from({length:7},(_,i)=>({t_start_us:i*2e6,t_end_us:(i+1)*2e6,text:`Scene ${i}`}))}}
 const plan=narrationAlignmentPlan(p,audio,0,14e6)
 expect(plan.sample_times).toHaveLength(12);expect(plan.omitted_sample_count).toBe(2)
 expect(plan.covered_ranges_us).toEqual([[0,12e6]]);expect(plan.remaining_range_us).toEqual([12e6,14e6])
 const tail=narrationAlignmentPlan(p,audio,12e6,14e6)
 expect(tail.sample_times).toEqual([12.5e6,13.5e6]);expect(tail.omitted_sample_count).toBe(0)
 expect(plan.pairs[0].source_mapping).toBeNull()
})

it('requires all voiced windows in the same output state, never a partial or stale worksheet',()=>{
 const p=blankProject(seededGen(),'voice'),c=p.compositions[p.root_id];c.duration_us=14e6
 c.tracks[0].layers=[{id:'voice',enabled:true,locked:false,t_start_us:0,t_end_us:14e6,params:{kind:'Audio',media:'voice',role:'voiceover',mute:false,gain_db:{mode:'Static',value:0}}} as any]
 const entry:any={}
 recordAlignmentCoverage(entry,p,'one',{status:'available',covered_ranges_us:[[0,12e6]]})
 expect(entry.alignmentState).toBeUndefined()
 recordAlignmentCoverage(entry,p,'two',{status:'available',covered_ranges_us:[[12e6,14e6]]})
 expect(entry.alignmentState).toBeUndefined()
 recordAlignmentCoverage(entry,p,'two',{status:'available',covered_ranges_us:[[0,12e6]]})
 expect(entry.alignmentState).toBe('two')
})

it('maps repeated nested instances into root time without changing the authored source windows',()=>{
 const p=blankProject(seededGen(),'nested'),c=p.compositions[p.root_id];c.duration_us=12e6
 const child={...structuredClone(c),id:'child',duration_us:6e6};p.compositions.child=child
 child.tracks[0].layers=[{id:'leaf',enabled:true,t_start_us:1e6,t_end_us:5e6,params:{kind:'VideoClip',media:'source',src_in_us:10e6,speed:1}} as any]
 c.tracks[0].layers=[{id:'instance',enabled:true,t_start_us:4e6,t_end_us:8e6,params:{kind:'CompositionRef',composition:'child',src_in_us:1e6}} as any]
 const before=JSON.stringify(p),plan=narrationAlignmentPlan(p,{transcript:{status:'available',segments:[{t_start_us:5e6,t_end_us:7e6,text:'A grounded explanation.'}]}},0,12e6)
 expect(plan.sample_times).toEqual([6e6]);expect(plan.pairs[0].source_mapping).toEqual({media_id:'source',source_t_us:12e6})
 expect(plan.pairs[0].instances[0]).toMatchObject({instance_path:'instance/',composition_id:'child',timeline_offset_us:3e6});expect(JSON.stringify(p)).toBe(before)
})
