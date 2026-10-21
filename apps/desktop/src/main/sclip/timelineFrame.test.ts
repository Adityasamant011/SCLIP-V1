import {it,expect,vi} from 'vitest'
import vm from 'node:vm'
import {blankProject} from '../state/model'
import {seededGen} from '../state/ids'
import {inspectTimelineFrame} from './timelineFrame'

it('waits briefly for a remounting preview bridge and preserves the requested frame',async()=>{
 vi.useFakeTimers()
 try{
  const p=blankProject(seededGen(),'remount');p.compositions[p.root_id].duration_us=5e6
  const window:any={};const capture=vi.fn(async(tUs:number)=>({pngBase64:'AQ==',tUs,width:640,height:360}))
  setTimeout(()=>{window.__weftcutPreview={captureFrameAt:capture}},60)
  const active={isDestroyed:()=>false,webContents:{executeJavaScript:(code:string)=>vm.runInNewContext(code,{window,Date,setTimeout})}}
  const result=inspectTimelineFrame(p,{t_us:1e6,getActiveWindow:()=>active,requireLiveCompositor:true})
  await vi.advanceTimersByTimeAsync(90)
  expect((await result).source).toBe('live_compositor');expect(capture).toHaveBeenCalledWith(1e6,p.root_id,false)
 }finally{vi.useRealTimers()}
})

it('keeps a missing preview unavailable after its bounded grace period',async()=>{
 vi.useFakeTimers()
 try{
  const p=blankProject(seededGen(),'missing');p.compositions[p.root_id].duration_us=5e6
  const active={isDestroyed:()=>false,webContents:{executeJavaScript:(code:string)=>vm.runInNewContext(code,{window:{},Date,setTimeout})}}
  const result=inspectTimelineFrame(p,{t_us:1e6,getActiveWindow:()=>active,requireLiveCompositor:true})
  const rejected=expect(result).rejects.toThrow('CURRENT_FRAME_UNAVAILABLE')
  await vi.advanceTimersByTimeAsync(1530);await rejected
 }finally{vi.useRealTimers()}
})
