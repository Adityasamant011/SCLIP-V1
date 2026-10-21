import { layerOverlapClass } from '../../renderer/grid'
import type { McpToolDef } from './mcp-commands'
import { McpArgError } from './mcp-commands'
import type { Project } from './model'

// Reuse the existing tool schemas; accept values, never supply them or expand
// a named layer to its A/V partner.
function validateValue(value: unknown, schema: any, at: string): void {
  const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type]
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  if (schema.type && !types.some(t => t === actual || t === 'integer' && Number.isSafeInteger(value))) throw new McpArgError(`${at}: invalid type`)
  if (typeof value === 'number' && (!Number.isFinite(value) || schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)) throw new McpArgError(`${at}: invalid numeric value`)
  if (schema.enum && !schema.enum.includes(value)) throw new McpArgError(`${at}: invalid enum value`)
  if (actual === 'object' && value !== null) {
    const object = value as Record<string, unknown>
    for (const required of schema.required ?? []) if (!(required in object)) throw new McpArgError(`${at}.${required}: required`)
    if (schema.properties) for (const [key, v] of Object.entries(object)) {
      if (!(key in schema.properties)) throw new McpArgError(`${at}.${key}: unknown field`)
      validateValue(v, schema.properties[key], `${at}.${key}`)
    }
  }
}
function validateRepairRequestFields(a: Record<string, unknown>, definition: (name: string) => McpToolDef): void {
  if (Object.keys(a).some(k => !['reason', 'expected_state_version', 'operations','request_id'].includes(k))) throw new McpArgError('Unknown transaction field')
  if (typeof a.expected_state_version !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_state_version)) throw new McpArgError('Current packet expected_state_version required')
  if(a.request_id!==undefined&&(typeof a.request_id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(a.request_id)))throw new McpArgError('request_id must be a short opaque identifier')
  if (typeof a.reason !== 'string' || !a.reason.trim() || a.reason.length > 1000) throw new McpArgError('Repair reason must contain 1–1000 characters')
  if (!Array.isArray(a.operations) || a.operations.length < 1 || a.operations.length > 8) throw new McpArgError('Transaction requires 1–8 explicit operations')
  const refs=new Set<string>()
  for (const [index, op] of a.operations.entries()) {
    if(!op||typeof op!=='object')throw new McpArgError(`operations[${index}]: object required`)
    if(['create_track','add_media_layer','add_text_layer','add_motif','set_param_track'].includes(op.kind)){
      if(Object.keys(op).some(k=>!['kind','arguments','ref','after_layer_id','gap_us'].includes(k))||!op.arguments||typeof op.arguments!=='object'||Array.isArray(op.arguments))throw new McpArgError(`operations[${index}]: use {kind, arguments, optional ref}`)
      if(op.ref!==undefined){if(typeof op.ref!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(op.ref)||refs.has(op.ref)||op.kind==='set_param_track')throw new McpArgError('Create references must be unique short names');refs.add(op.ref)}
      if(op.after_layer_id!==undefined&&(typeof op.after_layer_id!=='string'||op.kind==='create_track'||op.kind==='set_param_track'||op.arguments.t_start_us!==undefined))throw new McpArgError('after_layer_id needs a layer identity and replaces t_start_us for an insert')
      if(op.gap_us!==undefined&&(!op.after_layer_id||!Number.isSafeInteger(op.gap_us)||op.gap_us<0))throw new McpArgError('gap_us needs after_layer_id and a nonnegative integer')
      if(op.kind==='create_track'){
        if(Object.keys(op.arguments).some(k=>!['composition_id','label'].includes(k)))throw new McpArgError('create_track supports only composition_id and label')
      }else validateValue(op.after_layer_id?{...op.arguments,t_start_us:0}:op.arguments,definition(op.kind).inputSchema,`operations[${index}].arguments`)
      continue
    }
    if(!['update_layer','update_layer_params','replace_source','delete_layer'].includes(op.kind))throw new McpArgError(`operations[${index}]: unsupported operation`)
    if(Object.keys(op).some(k=>!['kind','layer_id','patch'].includes(k)))throw new McpArgError(`operations[${index}]: unknown field`)
    if(op.kind==='delete_layer'){if(typeof op.layer_id!=='string'||op.patch!==undefined)throw new McpArgError('delete_layer needs only layer_id');continue}
    if(op.kind==='replace_source') {
      validateValue(op,{type:'object',properties:{kind:{enum:['replace_source']},layer_id:{type:'string'},patch:{type:'object',properties:{media_id:{type:'string'},src_in_us:{type:'integer'},src_out_us:{type:'integer'}},required:['media_id','src_in_us','src_out_us']}}},`operations[${index}]`);continue
    }
    validateValue({ layer_id: op.layer_id, patch: op.patch }, definition(op.kind).inputSchema, `operations[${index}]`)
  }
}
export function validateRepairRequest(a: Record<string, unknown>, definition: (name: string) => McpToolDef): void {
  try { validateRepairRequestFields(a,definition) }
  catch(error) { throw new McpArgError(`Repair contract: {expected_state_version, reason, operations: [{kind, layer_id, patch}]}. operations must be a JSON array, not a string; use patch {kind: "Text", x, y} for text position. No aliases or partial edits accepted. ${error instanceof Error?error.message:String(error)}`) }
}
/** Measured adjacent intervals in affected tracks; no editorial verdict. */
export function transactionGeometry(project: Project, layerIds: string[]) {
  return Object.values(project.compositions).flatMap(comp => comp.tracks.filter(track => track.layers.some(l => layerIds.includes(l.id))).flatMap(track => (['visual','audio'] as const).map(overlapClass => {
    const layers = [...track.layers].filter(l => l.enabled && layerOverlapClass(l.params)===overlapClass).sort((a,b) => a.t_start_us-b.t_start_us)
    return { composition_id: comp.id, track_id: track.id, overlap_class: overlapClass, adjacent_intervals: layers.slice(1).map((l,i) => ({ left_layer_id: layers[i].id, right_layer_id:l.id, gap_us:Math.max(0,l.t_start_us-layers[i].t_end_us), overlap_us:Math.max(0,layers[i].t_end_us-l.t_start_us) })) }
  })))
}
