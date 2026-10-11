import {describe,it,expect,vi} from 'vitest'
import {createToolFailureRecovery} from './toolFailureRecovery'
const error={isError:true,content:[{type:'text',text:'LayerNotFound'}]}
describe('bounded technical failure recovery',()=>{
  it('keeps editing with Hermes and makes no default provider call',async()=>{
    const jev=vi.fn(),triage=createToolFailureRecovery(jev),args={layer_id:'missing',patch:{gain_db:2}}
    const a=await triage('update_layer_params',args,error,'state')
    expect(a.category).toBe('missing_current_id');expect(a.automatic_retry).toBe(false);expect(jev).not.toHaveBeenCalled()
    expect(a).not.toHaveProperty('operations');expect(a).not.toHaveProperty('replacement_arguments')
    const b=await triage('update_layer_params',args,error,'state');expect(b.identical_failure_count).toBe(2);expect(b.cached).toBe(true)
  })
  it('optional Jev sees no commands/values/secrets and is cached per failure/state',async()=>{
    const jev=vi.fn(async()=>({answers:{technical_recovery:.7}})) as any,triage=createToolFailureRecovery(jev,()=>true),args={api_key:'secret',text:'private narration'}
    await triage('tool',args,error,'state');await triage('tool',args,error,'state')
    expect(jev).toHaveBeenCalledTimes(1);expect(JSON.stringify(jev.mock.calls)).not.toContain('secret');expect(JSON.stringify(jev.mock.calls)).not.toContain('private narration')
    await triage('tool',args,error,'new state');expect(jev).toHaveBeenCalledTimes(2)
  })
  it('coalesces concurrent repeats and declines extra auxiliary work while busy',async()=>{
    let finish!: (r:any)=>void
    const jev=vi.fn(()=>new Promise<any>(r=>{finish=r})),triage=createToolFailureRecovery(jev,()=>true)
    const first=triage('tool',{},error,'state'),repeat=await triage('tool',{},error,'state'),other=await triage('another',{},error,'state')
    expect(jev).toHaveBeenCalledTimes(1);expect(repeat.cached).toBe(true);expect(other.jev).toEqual({status:'busy',requests:0})
    finish({answers:{technical_recovery:.6}});await first
    expect((await triage('tool',{},error,'state')).jev).toMatchObject({status:'observed',requests:1})
  })
  it('auxiliary failure cannot block normal recovery or automatically retry',async()=>{
    const jev=vi.fn(async()=>{throw Error('provider unavailable')})
    const result=await createToolFailureRecovery(jev,()=>true)('place',{}, {isError:true,message:'LayerOverlap'},'s')
    expect(result.category).toBe('occupied_lane');expect(result.jev).toEqual({status:'unavailable',requests:1});expect(result.automatic_retry).toBe(false)
    await createToolFailureRecovery(jev,()=>{throw Error('config')})('tool',{},error,'s');expect(jev).toHaveBeenCalledTimes(1)
  })
})
