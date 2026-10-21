import {it,expect,vi} from 'vitest'
const manager=vi.hoisted(()=>({get:vi.fn(),dispose:vi.fn(async()=>{})}))
vi.mock('./visionSidecar.js',()=>({getVisionSidecar:manager.get,disposeVisionSidecar:manager.dispose}))
import {disposeVisionRuntime} from './visionRuntime'
it('retires a source-index-owned sidecar even when no vision backend was requested',async()=>{
 await disposeVisionRuntime()
 expect(manager.get).not.toHaveBeenCalled()
 expect(manager.dispose).toHaveBeenCalledOnce()
})
