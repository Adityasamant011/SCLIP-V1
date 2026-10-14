import {describe,it,expect,vi} from 'vitest'
import {exportThroughLiveCompositor} from './rangeRender'
import {blankProject} from '../state/model'
import {uuidV7Gen} from '../state/ids'

describe('owned compositor cancellation',()=>{
 it('pre-cancelled requests never enter the renderer',async()=>{
  const signal=AbortSignal.abort(),executeJavaScript=vi.fn()
  await expect(exportThroughLiveCompositor(blankProject(uuidV7Gen(),'synthetic'),{isDestroyed:()=>false,webContents:{executeJavaScript}},{outputPath:'/synthetic/unused.mp4',startUs:0,endUs:1,signal})).rejects.toMatchObject({name:'AbortError'})
  expect(executeJavaScript).not.toHaveBeenCalled()
 })
 it('forwards exactly the executing request UUID and waits for its release; never sends a global cancel',async()=>{
  const abort=new AbortController();let reject!: (error:Error)=>void;let id:string|undefined
  const executeJavaScript=vi.fn(async(code:string)=>{
   if(code.includes('__sclipExportRange ?')){
    const request=JSON.parse(code.slice(code.indexOf('__sclipExportRange(')+19,code.indexOf('}) :')+1));id=request.requestId
    return new Promise((_resolve,r)=>reject=r)
   }
   expect(code).toBe(`window.__sclipCancelExportRange?.(${JSON.stringify(id)})`)
   reject(new DOMException('Owned render stopped','AbortError'));return true
  })
  const job=exportThroughLiveCompositor(blankProject(uuidV7Gen(),'synthetic'),{isDestroyed:()=>false,webContents:{executeJavaScript}},{outputPath:'/synthetic/unused.mp4',startUs:0,endUs:1,signal:abort.signal})
  expect(id).toMatch(/^[\da-f-]{36}$/);abort.abort()
  await expect(job).rejects.toMatchObject({name:'AbortError'});expect(executeJavaScript).toHaveBeenCalledTimes(2)
 })
})
