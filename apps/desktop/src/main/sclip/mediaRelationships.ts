import type { Project } from '../state/model.js'
/** Shared-source overlapping candidates, with explicit link identity when authored. No sync verdict. */
export function avRelationships(project: Project, compositionId = project.root_id) {
  const comp = project.compositions[compositionId]; if (!comp) return []
  const layers = comp.tracks.flatMap(t => t.layers).filter(l => l.enabled)
  const videos = layers.filter(l => l.params.kind === 'VideoClip')
  const audio = layers.filter(l => l.params.kind === 'Audio')
  return videos.flatMap(v => audio.flatMap(a => {
    if (v.params.kind !== 'VideoClip' || a.params.kind !== 'Audio' || v.params.media !== a.params.media) return []
    const start = Math.max(v.t_start_us, a.t_start_us), end = Math.min(v.t_end_us, a.t_end_us)
    if (end <= start) return []
    const links = comp.links.filter(l => l.members.includes(v.id) && l.members.includes(a.id)).map(l => l.id)
    return [{ video_layer_id: v.id, audio_layer_id: a.id, media_id: v.params.media, link_ids: links,
      relationship_basis: links.length ? 'authored_link_and_shared_source' : 'overlapping_shared_source_candidate',
      timeline_overlap_us: [start, end], video_source_range_us: [v.params.src_in_us, v.params.src_out_us], audio_source_range_us: [a.params.src_in_us, a.params.src_out_us],
      video_minus_audio_source_offset_us: v.params.src_in_us + (start - v.t_start_us) * v.params.speed - (a.params.src_in_us + start - a.t_start_us),
      video_speed: v.params.speed, offset_scope: 'At overlap start; unequal rates can change offset through the overlap. Authored offsets may be intentional.' }]
  }))
}
export function changedAVRelationships(before: Project, after: Project) {
  const previous = avRelationships(before), current = avRelationships(after)
  const key = (r: typeof current[number]) => `${r.video_layer_id}/${r.audio_layer_id}`
  const ids=new Set([...previous.map(key),...current.map(key)])
  return [...ids].flatMap(id => {const old=previous.find(r=>key(r)===id),r=current.find(r=>key(r)===id);return JSON.stringify(old)!==JSON.stringify(r) ? [{code:'PAIR_RELATIONSHIP_CHANGED',previous:old??null,current:r??null,source_offset_delta_us:old&&r ? r.video_minus_audio_source_offset_us-old.video_minus_audio_source_offset_us : null}] : []})
}
