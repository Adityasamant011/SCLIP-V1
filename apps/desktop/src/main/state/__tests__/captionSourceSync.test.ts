import {it,expect,describe} from 'vitest'
import {createActor} from '../actor'
import {blankProject} from '../model'
import {seededGen} from '../ids'
import {mediaItemTemplate} from '../mutations/media'
import {runHybrid,type HybridDeps} from '../hybrids'
import {CAPTION_TIMING_KEY,CAPTION_DISPLAY_KEY,readCaptionTiming} from '../../../shared/captionTiming'
import {buildProjectSummary} from '../summary'
import {syncCaptionSources} from '../mutations/captionSourceSync'
async function fixture(){
 const idGen=seededGen(),p=blankProject(idGen,'caption-sync'),mid='11111111-1111-4111-8111-111111111111';p.media_pool[mid]=mediaItemTemplate(mid,'Video',10e6);const actor=createActor({initial:p,idGen,clock:()=>'<test>'});const track=p.compositions[p.root_id]!.tracks[0]!.id;
 const r=actor.dispatch('add_layer',{kind:'video',media:mid,track,src_in_us:0,src_out_us:4e6,t_start_us:0,t_end_us:4e6});if(!r.ok)throw Error(JSON.stringify(r.error));const source=r.value as string;
 const text='one two three four',words=text.split(' ').map((text,i)=>({text,t_start_us:i*1e6+2e5,t_end_us:i*1e6+6e5}));let reads=0;
 await runHybrid('apply_transcripts',{layer_id:source},{actor,compute:{readTranscript:async()=>{reads++;return JSON.stringify({word_timing:'exact',segments:[{text,t_start_us:2e5,t_end_us:3.6e6,words}]})}},workspaceDir:()=>null,snapshotComposition:()=>actor.snapshot().compositions[p.root_id]} as unknown as HybridDeps)
 const caps=()=>actor.snapshot().compositions[p.root_id]!.tracks.flatMap(t=>t.layers).filter(l=>l.params.kind==='Text').sort((a,b)=>a.t_start_us-b.t_start_us)
 const command=(op:string,args:Record<string,unknown>)=>{const r=actor.dispatch(op,args);if(!r.ok)throw Error(JSON.stringify(r.error));return r.value}
 return{actor,source,track,caps,command,reads:()=>reads,mid,root:p.root_id}
}
describe('request-free source anchored caption editing',()=>{
 it('follows source-only moves in the same undo/redo entry with unchanged style and no transcription',async()=>{
  const f=await fixture(),before=structuredClone(f.actor.snapshot()),old=f.caps()[0]!,style=old.params;
  f.command('move_layer',{layer:f.source,to_track:f.track,t_start_us:5e6});const cap=f.caps()[0]!;
  expect(cap.t_start_us).toBe(old.t_start_us+5e6);expect(cap.params).toEqual(style);expect(readCaptionTiming(cap.metadata[CAPTION_TIMING_KEY])?.source?.caption_start_us).toBe(cap.t_start_us);expect(f.reads()).toBe(1)
  const after=structuredClone(f.actor.snapshot());f.command('undo',{});expect(f.actor.snapshot()).toEqual(before);f.command('redo',{});expect(f.actor.snapshot()).toEqual(after)
 })
 it('cuts caption text and observations to the source window after trimming',async()=>{
  const f=await fixture();f.command('trim_layer',{layer:f.source,edge:'in',new_t_us:2e6});const cap=f.caps()[0]!;
  expect(cap.params).toMatchObject({kind:'Text',content:'three four'});expect(cap.t_start_us).toBe(2.2e6);expect(readCaptionTiming(cap.metadata[CAPTION_TIMING_KEY])?.words.map(w=>w.text)).toEqual(['three','four']);expect(f.reads()).toBe(1)
 })
 it('splits word ownership onto the actual right fragment and follows its later move',async()=>{
  const f=await fixture();const result=f.command('split_layer',{layer:f.source,at_t_us:2e6})as{left:string;right:string};
  expect(f.caps().map(l=>l.params.kind==='Text'?l.params.content:'')).toEqual(['one two','three four'])
  const right=f.caps()[1]!;expect(readCaptionTiming(right.metadata[CAPTION_TIMING_KEY])?.source?.id).toBe(result.right)
  f.command('move_layer',{layer:result.right,to_track:f.track,t_start_us:6e6});expect(f.caps()[1]!.t_start_us).toBe(6.2e6);expect(f.reads()).toBe(1)
 })
 it('does not move independently repositioned captions',async()=>{
  const f=await fixture();const cap=f.caps()[0]!;const tr=f.actor.snapshot().compositions[f.root]!.tracks.find(t=>t.layers.some(l=>l.id===cap.id))!;
  f.command('move_layer',{layer:cap.id,to_track:tr.id,t_start_us:8e6});f.command('move_layer',{layer:f.source,to_track:f.track,t_start_us:5e6});expect(f.caps().find(l=>l.id===cap.id)!.t_start_us).toBe(8e6)
 })
 it('does not certify reveal after unsupported speed changes',async()=>{
  const f=await fixture();f.command('restyle_captions',{patch:{caption_display:'word_reveal'}});const before=f.caps()[0]!;
  f.command('update_layer_params',{layer:f.source,patch:{kind:'VideoClip',speed:2}});expect(f.caps()[0]!.t_start_us).toBe(before.t_start_us)
  const view=Object.values(buildProjectSummary(f.actor.snapshot(),f.actor.historyStatus(),()=>true).compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers)).find(l=>l.id===before.id)!.params;
  expect(view.kind).toBe('Text');expect('caption_reveal' in view).toBe(false)
 })
 it('mode toggling changes only metadata, preserves style and is undoable',async()=>{
  const f=await fixture(),before=structuredClone(f.caps());f.command('restyle_captions',{patch:{caption_display:'phrase'}});expect(f.caps()[0]!.params).toEqual(before[0]!.params);expect(f.caps()[0]!.metadata[CAPTION_DISPLAY_KEY]).toBe('phrase');f.command('undo',{});expect(f.caps()).toEqual(before)
  const snapshot=structuredClone(f.actor.snapshot());expect(f.actor.dispatch('restyle_captions',{patch:{caption_display:'invented'}}).ok).toBe(false);expect(f.actor.snapshot()).toEqual(snapshot)
 })
 it('removes fresh owned captions when the source is deleted, with recovery through undo',async()=>{
  const f=await fixture();const before=structuredClone(f.actor.snapshot());f.command('delete_layer',{layer:f.source});expect(f.caps()).toEqual([]);f.command('undo',{});expect(f.actor.snapshot()).toEqual(before)
 })
 it('preserves locked cues and independently edited wording',async()=>{
  const f=await fixture(),cap=f.caps()[0]!;
  f.command('update_layer',{layer:cap.id,patch:{locked:true}})
  f.command('move_layer',{layer:f.source,to_track:f.track,t_start_us:5e6})
  expect(f.caps().find(l=>l.id===cap.id)).toEqual({...cap,locked:true})
  const g=await fixture(),manual=g.caps()[0]!;
  g.command('update_layer_params',{layer:manual.id,patch:{kind:'Text',content:'A deliberate correction'}})
  g.command('move_layer',{layer:g.source,to_track:g.track,t_start_us:5e6})
  expect(g.caps().find(l=>l.id===manual.id)!.params).toMatchObject({content:'A deliberate correction'})
  expect(g.caps().find(l=>l.id===manual.id)!.t_start_us).toBe(manual.t_start_us)
 })
 it('marks a split through a word uncertain without discarding either audible portion',async()=>{
  const f=await fixture();f.command('split_layer',{layer:f.source,at_t_us:400_000})
  const timing=f.caps().map(l=>readCaptionTiming(l.metadata[CAPTION_TIMING_KEY])!)
  expect(timing.filter(t=>t.words.some(w=>w.text==='one')).length).toBe(2)
  expect(timing.filter(t=>t.words.some(w=>w.text==='one')).every(t=>t.provenance==='none')).toBe(true)
  expect(timing.flatMap(t=>t.words).map(w=>w.text)).toEqual(['one','one','two','three','four'])
 })
 it('dry-run predicts the same source edit and leaves history and captions unchanged',async()=>{
  const f=await fixture(),before=structuredClone(f.actor.snapshot());
  const result=f.actor.dryRun([{kind:'MoveLayer',id:f.source,new_track_id:f.track,new_t_start_us:5e6,escape_link:false}])
  expect(result[0]?.ok).toBe(true);expect(f.actor.snapshot()).toEqual(before)
  f.command('move_layer',{layer:f.source,to_track:f.track,t_start_us:5e6});expect(f.caps()[0]!.t_start_us).toBe(5.2e6)
 })

 it('does not mistake relocation to another composition for source deletion',async()=>{
  const f=await fixture(),before=structuredClone(f.actor.snapshot()),after=structuredClone(before),comp=after.compositions[f.root]!,track=comp.tracks.find(t=>t.id===f.track)!,source=track.layers.find(l=>l.id===f.source)!;
  track.layers=track.layers.filter(l=>l.id!==source.id)
  const other=structuredClone(comp);other.id='other-composition';other.tracks=[{...structuredClone(track),id:'other-track',layers:[source]}];after.compositions[other.id]=other
  syncCaptionSources(before,after,seededGen(9999))
  expect(comp.tracks.flatMap(t=>t.layers).filter(l=>l.params.kind==='Text')).toEqual(f.caps())
 })

 it('new and previously saved automatic captions reveal by default without rewriting the saved project',async()=>{
  const f=await fixture();expect(f.caps().every(l=>l.metadata[CAPTION_TIMING_KEY])).toBe(true)
  const legacy=structuredClone(f.actor.snapshot());for(const t of legacy.compositions[f.root]!.tracks)for(const l of t.layers)delete l.metadata[CAPTION_DISPLAY_KEY]
  const before=structuredClone(legacy);const views=Object.values(buildProjectSummary(legacy,f.actor.historyStatus(),()=>true).compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers)).filter(l=>l.params.kind==='Text')
  expect(views.length).toBe(2);for(const v of views)expect(v.params).toMatchObject({caption_display:'word_reveal',caption_reveal:{version:1}})
  expect(legacy).toEqual(before)
  f.command('restyle_captions',{patch:{caption_display:'phrase'}})
  const phrases=Object.values(buildProjectSummary(f.actor.snapshot(),f.actor.historyStatus(),()=>true).compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers)).filter(l=>l.params.kind==='Text')
  for(const v of phrases){expect(v.params).toMatchObject({caption_display:'phrase'});expect(v.params).not.toHaveProperty('caption_reveal')}
 })

})
