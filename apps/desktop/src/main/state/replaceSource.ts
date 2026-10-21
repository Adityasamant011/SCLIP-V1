import type { Project } from './model'
import { McpArgError } from './mcp-commands'
/** Replace only an explicitly named source. Preserve layer ID, timing, transform,
 * roles and links; linked audio changes only when separately named in the batch. */
export function applyReplaceSource(project: Project, id: string, patch: Record<string,unknown>, Failure: new(message:string)=>Error = McpArgError) {
  const found=Object.values(project.compositions).flatMap(c=>c.tracks.map(track=>({track,layer:track.layers.find(l=>l.id===id)}))).find(x=>x.layer)
  const layer=found?.layer, media=project.media_pool[String(patch.media_id)]
  if(!layer || !found)throw new Failure('Replacement layer not found; read current IDs.')
  if(layer.locked || found.track.locked)throw new Failure('Replacement layer/track is locked.')
  if(!['VideoClip','Audio'].includes(layer.params.kind))throw new Failure('replace_source supports VideoClip or Audio only.')
  if(!media || (layer.params.kind==='VideoClip' ? !media.metadata.video : !media.metadata.audio))throw new Failure('Replacement media lacks the required video/audio stream.')
  const a=patch.src_in_us, b=patch.src_out_us
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||Number(a)<0||Number(b)<=Number(a)||media.metadata.duration_us==null||Number(b)>media.metadata.duration_us)throw new Failure('Replacement needs valid probed source bounds.')
  const params=layer.params as Extract<typeof layer.params,{kind:'VideoClip'|'Audio'}>
  const speed=params.kind==='VideoClip'?params.speed:1
  if(Number(b)-Number(a)<Math.ceil((layer.t_end_us-layer.t_start_us)*speed)-1)throw new Failure('Replacement source window cannot cover the retained timeline duration.')
  params.media=media.id;params.src_in_us=Number(a);params.src_out_us=Number(b)
}
