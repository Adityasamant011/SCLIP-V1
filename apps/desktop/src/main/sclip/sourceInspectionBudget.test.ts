import {it,expect} from 'vitest'
import {SourceInspectionBudget,isSourceDiscovery} from './sourceInspectionBudget'
it('bounds admissions without prescribing an unsupported edit',()=>{
 const budget=new SourceInspectionBudget()
 for(let n=0;n<12;n++)expect(budget.admit()).toBeUndefined()
 expect(budget.admit()).toContain('evidence is insufficient')
 expect(budget.admit()).toContain('Do not bypass')
 expect(budget.guidance().source_inspection_calls).toBe(12)
})
it('retains unused inspection admissions after unrelated authoring/model delay',()=>{
 let now=100;const budget=new SourceInspectionBudget(()=>now)
 expect(budget.admit(6)).toBeUndefined();now+=300000
 for(let i=0;i<6;i++)expect(budget.admit()).toBeUndefined()
 expect(budget.admit()).toContain('budget reached')
})

it('permits exactly one bounded refinement after an actual assembly, never repeated resets',()=>{
 const budget=new SourceInspectionBudget()
 for(let i=0;i<12;i++)budget.admit()
 expect(budget.admit()).toContain('budget reached')
 budget.assemblyCommitted();expect(budget.guidance().phase).toBe('refinement')
 for(let i=0;i<6;i++)expect(budget.admit()).toBeUndefined()
 budget.assemblyCommitted();expect(budget.admit()).toContain('budget reached')
})

it('permits six total previews of newly imported stock after discovery expires, without reopening original-source reads',()=>{let t=1;const b=new SourceInspectionBudget(()=>t);b.admit(12);t+=60000;b.registerStock('stock');expect(b.admit()).toContain('budget reached');expect(b.admitStockPreview('original')).toBe(false);for(let i=0;i<6;i++)expect(b.admitStockPreview('stock')).toBe(true);b.assemblyCommitted();b.registerStock('another');expect(b.admitStockPreview('another')).toBe(false)})

it('separates narration and graphic previews from original-footage discovery without unbounded admissions',()=>{
 const p={compositions:{c:{tracks:[{layers:[{id:'voice',params:{kind:'Audio'}},{id:'video',params:{kind:'VideoClip'}}]}]}}} as any
 expect(isSourceDiscovery(p,'transcribe_clip',{layer_id:'voice'})).toBe(false)
 expect(isSourceDiscovery(p,'transcribe_clip',{layer_id:'video'})).toBe(true)
 expect(isSourceDiscovery(p,'vision_inspect',{image_path:'/tmp/graphic.png'})).toBe(false)
 expect(isSourceDiscovery(p,'vision_inspect',{media_id:'original',source_t_us:0})).toBe(true)
 const b=new SourceInspectionBudget();b.admit(12)
 for(let i=0;i<12;i++)expect(b.admitArtifactPreview()).toBe(true)
 expect(b.admitArtifactPreview()).toBe(false);expect(b.admit()).toContain('budget reached')
})
