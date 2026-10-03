import { beforeAll, describe, expect, it } from 'vitest'
import { MCP_TOOL_DEFS } from '../state/mcp-commands'
import { ROUGH_CUT_PLAN_INPUT_SCHEMA, validateRoughCutPlan, type RoughCutPlan } from './roughCutPlan'
import { freshActor } from '../state/__tests__/pbt/harness'
import { root } from '../state/__tests__/fixtures/project'
import { initEval } from '../../renderer/eval/index'
import { parseProject, serializeProject } from '../state/serialize'
import { createActor } from '../state/actor'
import { seededGen } from '../state/ids'

const MEDIA = '00000000-0000-7000-8000-000000000201'

// Construct only required fields using the published contract, not private
// TypeScript knowledge. Cross-field range/duration arithmetic remains explicit.
function requiredExample(schema: any): any {
  if (schema.enum) return schema.enum[0]
  if (schema.type === 'object' || schema.type?.includes?.('object')) {
    return Object.fromEntries(schema.required.map((k: string) => [k, requiredExample(schema.properties[k])]))
  }
  if (schema.type === 'array') return Array.from({ length: schema.minItems ?? 0 }, () => requiredExample(schema.items))
  if (schema.type === 'string') return 'Already decided'
  return schema.exclusiveMinimum != null ? schema.exclusiveMinimum + 1 : schema.minimum ?? 0
}
function minimalPlan(): RoughCutPlan {
  const schema = ROUGH_CUT_PLAN_INPUT_SCHEMA
  const plan = requiredExample(schema)
  const clip = requiredExample(schema.properties.sections.items.properties.clips.items)
  Object.assign(clip, { media_id: MEDIA, source_start_us: 0, source_end_us: 2_000_000 })
  plan.sections[0].clips = [clip]
  plan.brief.target_duration_us = plan.estimated_duration_us = 2_000_000
  return plan
}

describe('existing rough-cut MCP contract disclosure', () => {
  beforeAll(initEval)

  it('apply and validator publish the same complete inline nested contract', () => {
    for (const name of ['apply_rough_cut_plan', 'validate_rough_cut_plan']) {
      const input = MCP_TOOL_DEFS.find(t => t.name === name)!.inputSchema as any
      expect(input.required).toContain('plan')
      expect(input.properties.plan).toBe(ROUGH_CUT_PLAN_INPUT_SCHEMA)
      // Actual tools/list JSON retains every nested field after serialization.
      const wire = JSON.parse(JSON.stringify(input)).properties.plan
      expect(wire.properties.brief.required).toEqual(['goal', 'audience', 'target_duration_us', 'tone'])
      expect(wire.properties.sections.items.properties.clips.items.required).toEqual(
        ['media_id', 'source_start_us', 'source_end_us', 'action', 'reason'])
      expect(wire.properties.source_summary).toBeDefined()
      expect(wire.properties.brief.properties.source_summary).toBeUndefined()
      expect(JSON.stringify(wire)).not.toContain('$ref')
    }
    expect(validateRoughCutPlan(minimalPlan(), { [MEDIA]: { duration_us: 60_000_000 } }).valid).toBe(true)
  })

  it('every advertised required field remains required by production validation', () => {
    const plan = minimalPlan()
    const paths = [
      ...ROUGH_CUT_PLAN_INPUT_SCHEMA.required.map(k => [k]),
      ...ROUGH_CUT_PLAN_INPUT_SCHEMA.properties.brief.required.map(k => ['brief', k]),
      ...ROUGH_CUT_PLAN_INPUT_SCHEMA.properties.sections.items.required.map(k => ['sections', 0, k]),
      ...ROUGH_CUT_PLAN_INPUT_SCHEMA.properties.sections.items.properties.clips.items.required.map(k => ['sections', 0, 'clips', 0, k]),
    ]
    for (const path of paths) {
      const broken = structuredClone(plan) as any
      const parent = path.slice(0, -1).reduce((o, key) => o[key], broken)
      delete parent[path.at(-1)!]
      expect(validateRoughCutPlan(broken).valid, path.join('.')).toBe(false)
    }
    expect(validateRoughCutPlan({ ...plan, estimated_duration_us: 3_000_000 }).valid).toBe(false)
    expect(validateRoughCutPlan({ ...plan, estimated_duration_us: undefined }).valid).toBe(true)
    const misplaced = structuredClone(plan) as any
    misplaced.brief.source_summary = misplaced.source_summary
    delete misplaced.source_summary
    expect(validateRoughCutPlan(misplaced).errors).toContain('source_summary must be a non-empty string')
    const wrongEnum = structuredClone(plan)
    ;(wrongEnum.sections[0].clips[0] as any).action = 'select'
    expect(validateRoughCutPlan(wrongEnum).valid).toBe(false)
  })

  it('derives omitted estimate from selected intervals without hiding an incorrect supplied estimate', () => {
    const actor = freshActor()
    expect(actor.dispatch('add_media', { id: MEDIA, kind: 'Video', duration_us: 90_000_000, with_audio: true }).ok).toBe(true)
    const plan = minimalPlan()
    plan.sections[0].clips = [{ ...plan.sections[0].clips[0], source_start_us: 0, source_end_us: 30_000_000 },
      { ...plan.sections[0].clips[0], source_start_us: 35_000_000, source_end_us: 66_860_000 }]
    plan.brief.target_duration_us = 42_000_000
    plan.estimated_duration_us = 42_000_000
    const before = JSON.stringify(actor.snapshot())
    const rejected = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(actor.snapshot())).toBe(before)
    if (rejected.ok) return
    expect(JSON.stringify(rejected.error)).toContain('61860000')
    expect(JSON.stringify(rejected.error)).toContain('shorten/change the ranges')

    const withoutEstimate = { ...plan, estimated_duration_us: undefined }
    const dry = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: withoutEstimate, dry_run: true }))
    expect(dry.ok).toBe(true)
    expect(JSON.stringify(actor.snapshot())).toBe(before)
    if (!dry.ok) return
    const predicted = JSON.parse(dry.result.content[0].text)
    expect(predicted.planned_duration_us).toBe(61_860_000)
    expect(predicted.actual_duration_us).toBeGreaterThan(61_800_000)
  })

  it('six synthetic decided ranges use one actor edit with A/V, atomic undo/redo and reopen', () => {
    const actor = freshActor()
    expect(actor.dispatch('add_media', { id: MEDIA, kind: 'Video', duration_us: 60_000_000, with_audio: true }).ok).toBe(true)
    const plan = minimalPlan()
    plan.sections[0].clips = Array.from({ length: 6 }, (_, i) => ({ ...plan.sections[0].clips[0],
      source_start_us: i * 4_000_000 + 160_000,
      source_end_us: i * 4_000_000 + 3_200_000 }))
    plan.brief.target_duration_us = plan.estimated_duration_us = 18_240_000
    const before = JSON.stringify(actor.snapshot())
    const dry = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan, dry_run: true }))
    expect(dry.ok).toBe(true)
    expect(JSON.stringify(actor.snapshot())).toBe(before)
    const applied = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    const result = JSON.parse(applied.result.content[0].text)
    expect(result.clips_created).toBe(6)
    expect(result.checkpoint_id).toBeTruthy()
    const comp = root(actor.snapshot())
    expect(comp.links).toHaveLength(6)
    const layers = comp.tracks.flatMap(t => t.layers)
    let cursor = 0
    for (const [i, item] of result.mapping.entries()) {
      expect(item.requested_source_range_us).toEqual([plan.sections[0].clips[i].source_start_us, plan.sections[0].clips[i].source_end_us])
      expect(item.timeline_range_us[0]).toBe(cursor)
      cursor = item.timeline_range_us[1]
      const video = layers.find(l => l.id === item.layer_id)!, audio = layers.find(l => l.id === item.audio_layer_id)!
      expect(video.params.kind).toBe('VideoClip')
      expect(audio.params.kind).toBe('Audio')
      expect([audio.t_start_us, audio.t_end_us]).toEqual([video.t_start_us, video.t_end_us])
      expect([...(comp.links.find(l => l.id === item.link_id)?.members ?? [])].sort()).toEqual([video.id, audio.id].sort())
    }
    expect(comp.duration_us).toBe(cursor)
    const after = JSON.stringify(actor.snapshot())
    expect(actor.dispatch('undo', {}).ok).toBe(true)
    expect(JSON.stringify(actor.snapshot())).toBe(before)
    expect(actor.dispatch('redo', {}).ok).toBe(true)
    expect(JSON.stringify(actor.snapshot())).toBe(after)
    const reopened = createActor({ initial: parseProject(serializeProject(actor.snapshot())), idGen: seededGen() })
    expect(serializeProject(reopened.snapshot())).toEqual(serializeProject(actor.snapshot()))
  })
})
