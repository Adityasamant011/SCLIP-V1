import type { Project, Layer } from '../state/model.js'

/** Native mix.rs placement convention: root t = child t + ref start - src_in.
 * Facts only. Never generates partner edits or changes mute/solo settings. */
export function placedLayers(project: Project, compositionId = project.root_id, start = 0, end = project.compositions[compositionId]?.duration_us ?? 0) {
  const out: Array<{ layer: Layer; start_us: number; end_us: number; composition_id: string; instance_path: string; offset_us:number }> = []
  function walk(id: string, offset: number, lo: number, hi: number, path: string, depth: number) {
    if (depth > 32 || lo >= hi) return
    for (const track of project.compositions[id]?.tracks ?? []) {
      if (track.enabled === false) continue
      for (const layer of track.layers) {
        if (!layer.enabled) continue
        const a = Math.max(lo, offset + layer.t_start_us), b = Math.min(hi, offset + layer.t_end_us)
        if (a >= b) continue
        if (layer.params.kind === 'CompositionRef') {
          walk(layer.params.composition, offset + layer.t_start_us - layer.params.src_in_us, a, b, `${path}${layer.id}/`, depth + 1)
        } else out.push({ layer, start_us: a, end_us: b, composition_id: id, instance_path: path, offset_us:offset })
      }
    }
  }
  walk(compositionId, 0, start, end, '', 0)
  return out
}

export function audioAudibility(project: Project, compositionId = project.root_id, start = 0, end = project.compositions[compositionId]?.duration_us ?? 0, detailLimit=32) {
  const anySolo = Object.values(project.audio_roles).some(r => r.solo)
  const layers = placedLayers(project, compositionId, start, end).flatMap(p => {
    const q = p.layer.params
    if (q.kind !== 'Audio') return []
    const role = project.audio_roles[q.role] ?? { muted: false, solo: false, gain_db: 0 }
    const excludedBy = [p.layer.locked ? 'layer_locked' : '', q.mute ? 'layer_muted' : '', role.muted ? 'role_muted' : '', anySolo && !role.solo ? 'other_role_soloed' : ''].filter(Boolean)
    return [{ layer_id: p.layer.id, instance_path: p.instance_path, media_id: q.media, role: q.role,
      timeline_range_us: [p.start_us, p.end_us], source_range_us: [q.src_in_us, q.src_out_us],
      layer_mute: q.mute, role_settings: role, layer_gain_db: q.gain_db.mode === 'Static' ? q.gain_db : { mode: q.gain_db.mode, key_count: q.gain_db.value.length },
      selected_by_mix_gates: excludedBy.length === 0, excluded_by: excludedBy }]
  })
  return { evidence_class: 'AUTHORITATIVE_STATE', coordinate_space: 'timeline', timeline_range_us: [start, end], any_role_solo: anySolo,
    roles: project.audio_roles, candidate_count: layers.length, selected_count: layers.filter(l => l.selected_by_mix_gates).length,
    layers: layers.slice(0, detailLimit), omitted_layers: Math.max(0, layers.length - detailLimit),
    limitation: 'Enabled in-window layers after native mute/solo/lock gates. Gains are exposed, not judged. Selection does not prove signal, successful decoding or audible speech; inspect_rendered_audio measures the actual mix. No settings are changed.' }
}

export function timelineCoverage(project: Project, compositionId = project.root_id) {
  const comp = project.compositions[compositionId]
  const placed = placedLayers(project, compositionId)
  const visual = placed.filter(p => ['VideoClip', 'ImageOverlay', 'Text', 'Motif', 'Color'].includes(p.layer.params.kind))
  const last = visual.reduce((t, p) => Math.max(t, p.end_us), 0)
  return { evidence_class: 'DETERMINISTIC_MEASUREMENT', composition_duration_us: comp?.duration_us ?? 0,
    last_enabled_visual_layer_end_us: last,
    trailing_range_without_visual_layers_us: comp && last < comp.duration_us ? [last, comp.duration_us] : null,
    limitation: 'Layer interval coverage only, not rendered pixels. Background, opacity, nested content and intentional empty endings require inspection. Never changes duration.' }
}
