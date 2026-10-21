import { normalizeToolArguments } from '../mcp/argumentNormalization'
import type { Manifest } from '../../shared/motifs/catalog'

/** Decode transport containers using declared types only. Validation still owns
 * all constraints and defaults; text and HTML are never guessed or rewritten. */
export function normalizeGraphicManifest(value: unknown): Manifest {
  const manifest = normalizeToolArguments(value, {
    type: 'object', properties: {
      size: { type: 'array', items: { type: 'integer' } },
      version: { type: 'integer' }, default_duration_s: { type: 'number' },
      max_duration_s: { type: ['number', 'null'] }, content_duration_s: { type: ['number', 'null'] },
      settle_rafs: { type: 'integer' }, fonts: { type: 'array', items: { type: 'object', properties: { weight: { type: 'integer' } } } },
      props_schema: { type: 'object', additionalProperties: { type: 'object', properties: {
        max_length: { type: 'integer' }, multiline: { type: 'boolean' },
        min: { type: 'number' }, max: { type: 'number' }, options: { type: 'array', items: { type: 'string' } },
      } } },
    },
  })
  if (manifest?.props_schema && typeof manifest.props_schema === 'object') {
    for (const spec of Object.values(manifest.props_schema) as any[]) {
      if (spec && typeof spec === 'object' && spec.type === 'number' && Object.hasOwn(spec, 'default'))
        spec.default = normalizeToolArguments(spec.default, { type: 'number' })
    }
  }
  return manifest
}

export function normalizeGraphicProps(manifest: Manifest, value: unknown): unknown {
  const properties = Object.fromEntries(Object.entries(manifest.props_schema).map(([key, spec]) =>
    [key, { type: spec.type === 'number' ? 'number' : 'string' }]))
  return normalizeToolArguments(value, { type: 'object', properties })
}

/** Normalize explicit graphic props on both insertion and in-place repair.
 * Kind and target identity remain the caller's decisions; invalid kinds reject. */
export function normalizeGraphicToolArguments(name:string,args:Record<string,any>,manifest:(id:string)=>Manifest,layerMotif:(layerId:string)=>string|undefined):Record<string,any> {
  const selected=new Map<string,string>()
  const patch=(value:any,layerId:string)=>{
    if(!value || value.kind!=='Motif')return value
    if(typeof value.motif_id==='string')selected.set(layerId,value.motif_id)
    if(value.props===undefined)return value
    const id=value.motif_id??selected.get(layerId)??layerMotif(layerId)
    return id ? {...value,props:normalizeGraphicProps(manifest(id),value.props)} : value
  }
  if(name==='add_motif' && args.props!==undefined)return {...args,props:normalizeGraphicProps(manifest(args.motif_id),args.props)}
  if(name==='update_layer_params')return {...args,patch:patch(args.patch,args.layer_id)}
  if(name==='apply_repair_transaction' && Array.isArray(args.operations))return {...args,operations:args.operations.map(op=>{
    if(op?.kind==='add_motif'&&op.arguments){const id=op.arguments.motif_id;if(op.ref&&typeof id==='string')selected.set('@'+op.ref,id);return {...op,arguments:normalizeGraphicToolArguments('add_motif',op.arguments,manifest,layerMotif)}}
    return op?.kind==='update_layer_params'?{...op,patch:patch(op.patch,op.layer_id)}:op
  })}
  return args
}
