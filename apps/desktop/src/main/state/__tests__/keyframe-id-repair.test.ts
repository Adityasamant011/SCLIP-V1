import { beforeAll, describe, expect, it } from 'vitest'
import { initEval } from '../../../renderer/eval/index'
import { freshActor } from './pbt/harness'
import { parseProject, serializeProject, type KeyframeIdRepair } from '../serialize'
import { isUuid } from '../ids'
import { loadProjectFromJson } from '../persistence'
import { defaultTransform } from '../mutations/add'

const key = (id: string, t_us: number, value: number) => ({ id, t_us, value,
  in: { x: 0, y: 0, mode: 'Free' }, out: { x: 1, y: 1, mode: 'Free' },
  continuity: 'Broken', segment: { kind: 'Linear' } })
const track = () => ({ mode: 'Keyframed', value: [key('s1', 0, 0), key('s2', 1_000_000, 1)], extrapolate: { before: 'Hold', after: 'Hold' } })

function fixture() {
  const actor = freshActor()
  const added = actor.mcpCall('add_text_layer', JSON.stringify({ content: 'Synthetic title', t_start_us: 0, duration_us: 2_000_000 }))
  if (!added.ok) throw new Error(JSON.stringify(added))
  const p = structuredClone(serializeProject(actor.snapshot())) as any
  const layer = p.compositions[p.root_id].tracks.flatMap((t: any) => t.layers)[0]
  layer.params.opacity = track()
  layer.params.transform.scale_x = track()
  layer.params.transform.scale_linked = false
  layer.effects = [{ id: '00000000-0000-0000-0000-000000000099', kind: 'brightness', params: { amount: track() }, enabled: true }]
  return { actor, p, layer, id: added.result.content[0].text }
}

describe('legacy animation keyframe identity repair', () => {
  beforeAll(initEval)
  it('repairs IDs only, including effects; preserves keys and is stable after save/reopen', () => {
    const { p, layer } = fixture()
    const before = structuredClone(p)
    let repairs: readonly KeyframeIdRepair[] = []
    const result = parseProject(p, { onKeyframeIdRepair: r => { repairs = r } })
    expect(repairs).toHaveLength(6)
    expect(new Set(repairs.map(r => r.to)).size).toBe(6)
    for (const r of repairs) expect(isUuid(r.to)).toBe(true)
    // Compare every field except the six repaired identities.
    const restored = JSON.parse(JSON.stringify(result), (k, v) => k === 'id' ? (repairs.find(r => r.to === v)?.from ?? v) : v)
    expect(restored).toEqual(before)
    const saved = JSON.stringify(serializeProject(result))
    expect(JSON.stringify(serializeProject(parseProject(JSON.parse(saved), { onKeyframeIdRepair: () => { throw new Error('must be idempotent') } })))).toBe(saved)
    expect(layer.params.opacity.value.map((k: any) => k.value)).toEqual([0, 1])
  })
  it('leaves valid UUIDs and custom Motif props/metadata untouched across compositions', () => {
    const { p, layer } = fixture()
    const valid = '00000000-0000-0000-0000-000000000021'
    layer.params.opacity.value[0].id = valid
    const nested = structuredClone(p.compositions[p.root_id])
    nested.id = '00000000-0000-0000-0000-000000000022'
    p.compositions[nested.id] = nested
    nested.tracks[0].layers.push({ ...structuredClone(layer), params: { kind: 'Motif', motif_id: 'synthetic', motif_version: 1,
      props: { custom: track() }, src_in_us: 0, opacity: { mode: 'Static', value: 1 }, transform: defaultTransform() }, effects: [] })
    p.metadata.custom = track()
    const result = parseProject(p, { onKeyframeIdRepair: () => {} }) as any
    expect(layer.params.opacity.value[0].id).toBe(valid)
    expect(result.metadata.custom.value[0].id).toBe('s1')
    expect(nested.tracks[0].layers.at(-1).params.props.custom.value[0].id).toBe('s1')
    expect(isUuid(nested.tracks.flatMap((t: any) => t.layers).find((l: any) => l.params.kind === 'Text').params.opacity.value[1].id)).toBe(true)
  })
  it('reports through the workspace loader without changing unrelated identities', () => {
    const { p } = fixture()
    const repairs: KeyframeIdRepair[] = []
    const loaded = loadProjectFromJson(JSON.stringify(p), { dir: '/synthetic', join: (...p) => p.join('/'), onKeyframeIdRepair: r => repairs.push(...r) })
    expect(repairs).toHaveLength(6)
    expect(loaded.project.project_id).toBe(p.project_id)
    expect(loaded.project.root_id).toBe(p.root_id)
  })
  it('rejects new malformed bulk animation without changing actor state/history; valid IDs succeed', () => {
    const { actor, id } = fixture()
    const before = JSON.stringify(actor.snapshot())
    const args = { layer_id: id, param_key: 'opacity', track: track() }
    const rejected = actor.mcpCall('set_param_track', JSON.stringify(args))
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(actor.snapshot())).toBe(before)
    args.track.value.forEach((k, i) => { k.id = `00000000-0000-0000-0000-${String(i + 30).padStart(12, '0')}` })
    expect(actor.mcpCall('set_param_track', JSON.stringify(args)).ok).toBe(true)
  })
})
