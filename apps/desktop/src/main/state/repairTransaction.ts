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
export function validateRepairRequest(a: Record<string, unknown>, definition: (name: string) => McpToolDef): void {
  if (Object.keys(a).some(k => !['reason', 'expected_state_version', 'operations'].includes(k))) throw new McpArgError('Unknown transaction field')
  if (typeof a.expected_state_version !== 'string' || !/^[a-f0-9]{64}$/.test(a.expected_state_version)) throw new McpArgError('Current packet expected_state_version required')
  if (typeof a.reason !== 'string' || !a.reason.trim() || a.reason.length > 1000) throw new McpArgError('Repair reason must contain 1–1000 characters')
  if (!Array.isArray(a.operations) || a.operations.length < 1 || a.operations.length > 8) throw new McpArgError('Transaction requires 1–8 explicit operations')
  for (const [index, op] of a.operations.entries()) {
    if (!op || typeof op !== 'object' || !['update_layer', 'update_layer_params'].includes(op.kind)) throw new McpArgError(`operations[${index}]: unsupported operation`)
    if (Object.keys(op).some(k => !['kind', 'layer_id', 'patch'].includes(k))) throw new McpArgError(`operations[${index}]: unknown field`)
    validateValue({ layer_id: op.layer_id, patch: op.patch }, definition(op.kind).inputSchema, `operations[${index}]`)
  }
}
/** Measured adjacent intervals in affected tracks; no editorial verdict. */
export function transactionGeometry(project: Project, layerIds: string[]) {
  return Object.values(project.compositions).flatMap(comp => comp.tracks.filter(track => track.layers.some(l => layerIds.includes(l.id))).map(track => {
    const layers = [...track.layers].filter(l => l.enabled).sort((a,b) => a.t_start_us-b.t_start_us)
    return { composition_id: comp.id, track_id: track.id, adjacent_intervals: layers.slice(1).map((l,i) => ({ left_layer_id: layers[i].id, right_layer_id:l.id, gap_us:Math.max(0,l.t_start_us-layers[i].t_end_us), overlap_us:Math.max(0,layers[i].t_end_us-l.t_start_us) })) }
  }))
}
