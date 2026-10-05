import { McpArgError } from '../mcp-commands'
import type { Project } from '../model'
import type { IdGen } from '../ids'
import { requireSameComposition, requireLayer } from './helpers'
import { applySplitLayer } from './split'
import { applyRippleDeleteLayers } from './ripple'
import { frameGrid, isCanonicalOnGrid } from '../snap'

/** Mechanical composition ripple. The caller chooses the interval and seeds;
 * existing authored links expand the cut scope, never source synchronization. */
export function applyRippleCutRange(p: Project, idGen: IdGen, seeds: string[], start: number, end: number) {
  if(seeds.length<1 || seeds.length>128)throw new McpArgError('Choose 1–128 seed layers')
  const comp = requireSameComposition(p, seeds)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > comp.duration_us ||
      !isCanonicalOnGrid(start, frameGrid(comp.fps)) || !isCanonicalOnGrid(end, frameGrid(comp.fps))) throw new McpArgError('Range must be within the composition on its frame grid; no silent snapping')
  const selected = new Set(seeds)
  for (const link of comp.links) if (link.members.some(id => selected.has(id))) for (const id of link.members) selected.add(id)
  const candidates = [...selected].map(id => requireLayer(p, id)).filter(({layer:l}) => l.t_start_us < end && l.t_end_us > start)
  if (!candidates.length || candidates.length > 128) throw new McpArgError('Cut requires 1–128 intersecting selected/linked layers')
  let covered = start
  for (const {layer:l} of [...candidates].sort((a,b) => a.layer.t_start_us-b.layer.t_start_us)) {
    if (l.t_start_us > covered) throw new McpArgError('Selected layers do not cover the requested interval')
    covered = Math.max(covered,l.t_end_us)
  }
  if (covered < end) throw new McpArgError('Selected layers do not cover the requested interval')
  const affected = candidates.map(({layer:l}) => l.id), deleted: string[] = [], resulting: string[] = []
  for (const {layer:l,track} of candidates) {
    if (l.locked || track.locked || l.params.kind === 'VideoClip' && l.params.speed !== 1) throw new McpArgError('Cannot cut locked layers or non-unit-speed video')
    let middle = l.id
    if (l.t_start_us < start) { const split = applySplitLayer(p,idGen,middle,start,true); resulting.push(split.left); middle=split.right }
    const current = requireLayer(p,middle).layer
    if (current.t_end_us > end) { const split=applySplitLayer(p,idGen,middle,end,true); resulting.push(split.right) }
    deleted.push(middle)
  }
  // Existing ripple planner refuses unselected intersecting overlays, broken
  // links, locked downstream layers, transitions and illegal landings. A
  // refusal discards this entire actor draft, including all intermediate splits.
  const ripple=applyRippleDeleteLayers(p,deleted)
  return { requested_range_us:[start,end], scope:'selected layers and authored link members; downstream sweep across this composition',
    affected_layer_ids:affected, resulting_layer_ids:resulting, downstream_shift_us:-(end-start), ...ripple }
}


/** Bounded, factual before/after intervals, including created/deleted IDs. */
export function rangeCutLayerChanges(before: Project, after: Project) {
  const index=(p:Project)=>new Map(Object.values(p.compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers.map(l=>[l.id,{
    composition_id:c.id,track_id:t.id,kind:l.params.kind,timeline_range_us:[l.t_start_us,l.t_end_us],
    ...('src_in_us' in l.params && 'src_out_us' in l.params?{source_range_us:[l.params.src_in_us,l.params.src_out_us]}:{}),
    ...('media' in l.params?{media_id:l.params.media}:{})
  }] as const))))
  const a=index(before),b=index(after)
  const changes=[...new Set([...a.keys(),...b.keys()])].filter(id=>JSON.stringify(a.get(id))!==JSON.stringify(b.get(id))).map(id=>({layer_id:id,before:a.get(id)??null,after:b.get(id)??null}))
  return {layer_changes:changes.slice(0,256),omitted_layer_changes:Math.max(0,changes.length-256)}
}
