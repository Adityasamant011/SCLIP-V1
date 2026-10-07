import {describe,it,expect,vi} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {blankProject} from '../state/model'
import {uuidV7Gen} from '../state/ids'
import {renderComposedTimelineRange,reviewRangeLimitUs,MAX_RANGE_RENDER_DURATION_US} from './rangeRender'
const project=()=>{const p=blankProject(uuidV7Gen(),'synthetic');p.compositions[p.root_id].duration_us=400000000;return p}
describe('coherent bounded review export',()=>{
 it('configures a resource ceiling, never a creative duration assumption',()=>{expect(reviewRangeLimitUs()).toBe(120000000);expect(reviewRangeLimitUs('180')).toBe(180000000);expect(reviewRangeLimitUs('999')).toBe(300000000);expect(reviewRangeLimitUs('broken')).toBe(120000000);expect(reviewRangeLimitUs('-1')).toBe(120000000)})
 it('allows one coherent 75-second composition range through production export',async()=>{const p=project(),execute=vi.fn(async(code:string)=>{const request=JSON.parse(code.slice(code.indexOf('(')+1,code.indexOf(') : Promise.reject')));expect(request.endUs-request.startUs).toBe(75000000);fs.writeFileSync(request.outputPath,Buffer.alloc(2048))});const r=await renderComposedTimelineRange(p,{start_us:0,end_us:75000000,getActiveWindow:()=>({isDestroyed:()=>false,webContents:{executeJavaScript:execute}})});expect(r.duration_us).toBe(75000000);fs.rmSync(path.dirname(r.path),{recursive:true,force:true})})
 it('uses the existing audio-only export for audio evidence without requiring picture',async()=>{
  const p=project(),before=JSON.stringify(p)
  const execute=vi.fn(async(code:string)=>{const request=JSON.parse(code.slice(code.indexOf('(')+1,code.indexOf(') : Promise.reject')));expect(request.audioOnly).toBe(true);expect(request.outputPath).toMatch(/\.m4a$/);fs.writeFileSync(request.outputPath,Buffer.alloc(2048))})
  const r=await renderComposedTimelineRange(p,{start_us:0,end_us:1000000,audioOnly:true,getActiveWindow:()=>({isDestroyed:()=>false,webContents:{executeJavaScript:execute}})})
  expect(JSON.stringify(p)).toBe(before);fs.rmSync(path.dirname(r.path),{recursive:true,force:true})
 })
 it('rejects invalid/outside/resource-overflow ranges before export',async()=>{const execute=vi.fn();for(const [s,e] of [[-1,1000],[0,0],[NaN,1000],[0,500000000],[0,MAX_RANGE_RENDER_DURATION_US+1]])await expect(renderComposedTimelineRange(project(),{start_us:s,end_us:e,getActiveWindow:()=>({isDestroyed:()=>false,webContents:{executeJavaScript:execute}})})).rejects.toThrow();expect(execute).not.toHaveBeenCalled()})
 it('cancellation discards completed artifacts without returning canceled evidence',async()=>{const ctrl=new AbortController();let file='';const execute=async(code:string)=>{const r=JSON.parse(code.slice(code.indexOf('(')+1,code.indexOf(') : Promise.reject')));file=r.outputPath;fs.writeFileSync(file,Buffer.alloc(2048));ctrl.abort()};await expect(renderComposedTimelineRange(project(),{start_us:0,end_us:75000000,signal:ctrl.signal,getActiveWindow:()=>({isDestroyed:()=>false,webContents:{executeJavaScript:execute}})})).rejects.toThrow();expect(fs.existsSync(file)).toBe(false)})
 it('export failure/empty output cleans the isolated directory',async()=>{let dir='';await expect(renderComposedTimelineRange(project(),{start_us:0,end_us:75000000,getActiveWindow:()=>({isDestroyed:()=>false,webContents:{executeJavaScript:async code=>{const r=JSON.parse(code.slice(code.indexOf('(')+1,code.indexOf(') : Promise.reject')));dir=path.dirname(r.outputPath);fs.writeFileSync(r.outputPath,'bad')}}})})).rejects.toThrow('did not produce');expect(fs.existsSync(dir)).toBe(false)})
})
