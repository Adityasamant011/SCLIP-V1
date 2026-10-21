import {it,expect,vi} from 'vitest'
import {mcpDef} from '../state/mcp-commands'
import {validateRepairRequest} from '../state/repairTransaction'
import {normalizeToolArguments} from '../mcp/argumentNormalization'
import {normalizeGraphicToolArguments} from './argumentTransport'
import type {Manifest} from '../../shared/motifs/catalog'
const manifest={props_schema:{title:{type:'string',default:'001'},amount:{type:'number',default:1,min:0,max:10}}} as unknown as Manifest
it('advertises and validates the real Motif replacement contract with numeric XML transport',()=>{
 const raw={expected_state_version:'a'.repeat(64),reason:'Replace the explicit graphic',operations:{item:{kind:'update_layer_params',layer_id:'layer',patch:{kind:'Motif',motif_id:'new-draft',motif_version:'1',props:{title:'001',amount:'2.5'}}}}}
 const typed=normalizeToolArguments(raw,mcpDef('apply_repair_transaction').inputSchema)
 const normalized=normalizeGraphicToolArguments('apply_repair_transaction',typed,()=>manifest,()=>undefined)
 expect(normalized.operations[0].patch).toEqual({kind:'Motif',motif_id:'new-draft',motif_version:1,props:{title:'001',amount:2.5}})
 expect(()=>validateRepairRequest(normalized,mcpDef)).not.toThrow()
 expect(raw.operations.item.patch.motif_version).toBe('1')
})
it('uses the existing graphic manifest for props-only edits and never changes a wrong layer kind',()=>{
 const resolve=vi.fn(()=>manifest),existing=vi.fn(()=> 'old-draft')
 const a=normalizeGraphicToolArguments('update_layer_params',{layer_id:'layer',patch:{kind:'Motif',props:{amount:'3'}}},resolve,existing)
 expect(resolve).toHaveBeenCalledWith('old-draft');expect(a.patch.props.amount).toBe(3)
 resolve.mockClear();const wrong={layer_id:'layer',patch:{kind:'VideoClip',motif_id:'new-draft',props:{amount:'3'}}}
 expect(normalizeGraphicToolArguments('update_layer_params',wrong,resolve,existing).patch).toEqual(wrong.patch);expect(resolve).not.toHaveBeenCalled()
})

it('uses an earlier explicitly selected replacement manifest for a later props-only operation in the same transaction',()=>{
 const calls:string[]=[]
 const r=normalizeGraphicToolArguments('apply_repair_transaction',{operations:[{kind:'update_layer_params',layer_id:'same',patch:{kind:'Motif',motif_id:'replacement'}},{kind:'update_layer_params',layer_id:'same',patch:{kind:'Motif',props:{amount:'001'}}}]},id=>{calls.push(id);return {props_schema:{amount:{type:'string',default:''}}} as unknown as Manifest},()=> 'old-numeric-manifest')
 expect(calls).toEqual(['replacement']);expect(r.operations[1].patch.props.amount).toBe('001')
})
