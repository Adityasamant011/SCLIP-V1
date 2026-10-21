import {it,expect,vi} from 'vitest'
vi.mock('./visionRuntime.js',()=>({getVisionRuntime:()=>({status:async()=>({state:'not_loaded',model:'synthetic',running:false,modelLoaded:false})})}))
vi.mock('../media/external/credentials.js',()=>({isProviderConfigured:()=>false}))
import {runtimeCapabilities} from './runtimeCapabilities'
it('reports configured automatic whole-video selection without claiming that a model is ready',async()=>{
 const result=await runtimeCapabilities({getVlm:()=>({config:{qwen3_vl:{binary:'synthetic'}},preferred:'auto',language:null,fps:null,focus:null})})
 expect(result.roles.whole_video).toMatchObject({state:'configured_unverified',backend:'auto',independent_of_frame_vision:true})
 expect(result.roles.frame_vision).toMatchObject({state:'not_loaded',modelLoaded:false})
 expect(result.roles.jev_passage_ranking.state).toBe('disabled')
 expect(result.roles.jev_background.state).toBe('disabled')
})
it('reports an empty whole-video configuration as missing',async()=>{
 const result=await runtimeCapabilities({getVlm:()=>({config:{},preferred:'auto',language:null,fps:null,focus:null})})
 expect(result.roles.whole_video.state).toBe('not_configured')
})

it('optional missing credentials cannot break the read-only runtime status tool',async()=>{
 const result=await runtimeCapabilities({getRuntimePermissions:()=>{throw Error('OpenRouter API key is not configured')},getReasoningProfile:()=>{throw Error('Configuration unavailable')}})
 expect(result.contract).toBe('sclip.runtime.v1');expect(result.roles.jev_background.state).toBe('disabled')
 expect(result.unavailable_status_reads).toContain('permissions');expect(result.unavailable_status_reads).toContain('reasoning')
 expect(result.roles.frame_vision.modelLoaded).toBe(false)
})
