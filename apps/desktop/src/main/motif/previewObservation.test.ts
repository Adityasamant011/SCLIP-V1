import {it,expect,vi} from 'vitest'
import fs from 'node:fs'
import {observeGraphicPreview} from './previewObservation'
it('observes exact preview bytes locally, reports draft placement and removes temporary media',async()=>{
 let image='';const analyze=vi.fn(async(r:any)=>{image=r.imagePath;expect(fs.readFileSync(image)).toEqual(Buffer.from('pixels'));expect(r.localOnly).toBe(true);return {ok:true,description:'Two circles on a path.',model:'local-fixture',outputLimitReached:false}})
 const r=await observeGraphicPreview('draft',1.5,Buffer.from('pixels').toString('base64'),{}, {analyze} as any,[])
 expect(r).toMatchObject({evidence_origin:'DRAFT_PREVIEW',placement_status:'not_placed',observation:{status:'available',description:'Two circles on a path.'}});expect(fs.existsSync(image)).toBe(false)
 expect(r).not.toHaveProperty('aligned');expect(r).not.toHaveProperty('coordinate_space','timeline')
})
it('keeps image-only requests free of inference and preserves unavailable evidence without false success',async()=>{
 const analyze=vi.fn(async()=>{throw Error('observer offline')})
 const a=await observeGraphicPreview('draft',0,'AA==',{inspect:false},{analyze} as any,['placed'])
 expect(a.observation.status).toBe('not_requested');expect(analyze).not.toHaveBeenCalled()
 const limited=await observeGraphicPreview('draft',0,'AA==',{inspect:false,inspection_reason:'budget reached'},{analyze} as any,[]);expect(limited.observation).toMatchObject({status:'budget_limited',reason:'budget reached'});expect(analyze).not.toHaveBeenCalled()
 const b=await observeGraphicPreview('draft',0,'AA==',{}, {analyze} as any,[])
 expect(b.observation).toMatchObject({status:'unavailable',error:'observer offline'})
})
