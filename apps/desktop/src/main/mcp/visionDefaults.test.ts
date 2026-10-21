import {it,expect,vi} from 'vitest'
const {analyze}=vi.hoisted(()=>({analyze:vi.fn(async(_request:unknown)=>({ok:true,description:'A diagram with a red marker.',model:'synthetic',latencyMs:1,visibleContent:[]}))}))
vi.mock('electron',()=>({app:{isPackaged:true}}))
vi.mock('../sclip/visionRuntime',()=>({getVisionRuntime:()=>({analyze})}))
import {handleCallTool} from './server'
import {freshActor} from '../state/__tests__/pbt/harness'
it('uses a focused direct-vision budget without reducing an explicitly requested detailed observation',async()=>{
 const actor=freshActor(),host={actor} as any
 const r:any=await handleCallTool({} as any,()=>host,'vision_inspect',{image_path:'/tmp/synthetic-graphic.png',question:'Read the diagram title.'})
 expect(r.isError).not.toBe(true);expect(analyze.mock.calls.at(-1)?.[0]).toMatchObject({maxTokens:96})
 await handleCallTool({} as any,()=>host,'vision_inspect',{image_path:'/tmp/synthetic-graphic.png',question:'Read the complete diagram.',max_tokens:256})
 expect(analyze.mock.calls.at(-1)?.[0]).toMatchObject({maxTokens:256})
})
