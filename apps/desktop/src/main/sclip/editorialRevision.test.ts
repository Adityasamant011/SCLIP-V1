import { beforeAll, describe, expect, it } from 'vitest'
import { initEval } from '../../renderer/eval/index.js'
import { freshActor } from '../state/__tests__/pbt/harness.js'
import { root } from '../state/__tests__/fixtures/project.js'
import { parseProject, serializeProject } from '../state/serialize.js'
import { createActor } from '../state/actor.js'
import { seededGen } from '../state/ids.js'
import { buildTimelineContext } from './timelineContext.js'
import { MAX_REVISION_ATTEMPTS_PER_ISSUE, validateEditorialRevisionAttempt, type EditorialRevisionAttempt } from './editorialRevisionAttempt.js'
import type { RoughCutPlan } from './roughCutPlan.js'

const MEDIA = '00000000-0000-7000-8000-000000000901'

function fixture() {
  const actor = freshActor()
  expect(actor.dispatch('add_media', { id: MEDIA, kind: 'Video', duration_us: 40_000_000, with_audio: true }).ok).toBe(true)
  const plan: RoughCutPlan = {
    version: 1,
    brief: { goal: 'Revision mechanics', audience: 'Test', target_duration_us: 20_000_000, tone: ['neutral'] },
    source_summary: 'Two source excerpts', editorial_thesis: 'Mechanical test',
    sections: [{ id: 'one', purpose: 'Test', clips: [
      { media_id: MEDIA, source_start_us: 0, source_end_us: 10_000_000, action: 'keep', reason: 'Fixture' },
      { media_id: MEDIA, source_start_us: 20_000_000, source_end_us: 30_000_000, action: 'keep', reason: 'Fixture' },
    ] }],
    removed_ranges: [{ media_id: MEDIA, source_start_us: 10_000_000, source_end_us: 20_000_000, reason: 'Fixture gap' }], estimated_duration_us: 20_000_000, uncertainties: [],
  }
  const applied = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
  expect(applied.ok, JSON.stringify(applied)).toBe(true)
  const video = root(actor.snapshot()).tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')
  const audio = root(actor.snapshot()).tracks[0].layers.filter((l) => l.params.kind === 'Audio')
  return { actor, videoIds: video.map((l) => l.id), audioIds: audio.map((l) => l.id) }
}

function assertPair(actor: ReturnType<typeof freshActor>, videoId: string, audioId: string) {
  const layers = root(actor.snapshot()).tracks.flatMap((t) => t.layers)
  const video = layers.find((l) => l.id === videoId)!
  const audio = layers.find((l) => l.id === audioId)!
  expect(video).toBeDefined()
  expect(audio).toBeDefined()
  expect(Math.abs(video.t_start_us - audio.t_start_us)).toBeLessThanOrEqual(21)
  expect(Math.abs(video.t_end_us - audio.t_end_us)).toBeLessThanOrEqual(21)
  if (video.params.kind !== 'VideoClip' || audio.params.kind !== 'Audio') throw new Error('wrong pair kinds')
  expect(Math.abs(video.params.src_in_us - audio.params.src_in_us)).toBeLessThanOrEqual(21)
  expect(Math.abs(video.params.src_out_us - audio.params.src_out_us)).toBeLessThanOrEqual(21)
}

describe('Phase 2E revision mechanics', () => {
  beforeAll(initEval)

  it('trims and extends linked source windows, then restores exact pre-revision state', () => {
    const { actor, videoIds, audioIds } = fixture()
    const before = serializeProject(actor.snapshot())
    const checkpoint = actor.mcpCall('checkpoint', JSON.stringify({ label: 'Before AI Revision — boundary' }))
    expect(checkpoint.ok).toBe(true)
    if (!checkpoint.ok) return
    const checkpointId = checkpoint.result.content[0].text

    expect(actor.mcpCall('trim_layer', JSON.stringify({ layer_id: videoIds[0], edge: 'out', new_t_us: 9_000_000 })).ok).toBe(true)
    assertPair(actor, videoIds[0], audioIds[0])
    expect(actor.mcpCall('trim_layer', JSON.stringify({ layer_id: videoIds[0], edge: 'out', new_t_us: 10_000_000 })).ok).toBe(true)
    assertPair(actor, videoIds[0], audioIds[0])
    expect(actor.dispatch('undo', {}).ok).toBe(true)
    assertPair(actor, videoIds[0], audioIds[0])
    expect(actor.dispatch('redo', {}).ok).toBe(true)
    assertPair(actor, videoIds[0], audioIds[0])
    expect(actor.mcpCall('restore_checkpoint', JSON.stringify({ checkpoint_id: checkpointId })).ok).toBe(true)
    expect(serializeProject(actor.snapshot())).toEqual(before)
  })

  it('splits and moves linked A/V while retaining source mapping and save/reload', () => {
    const { actor, videoIds } = fixture()
    expect(actor.mcpCall('split_layer', JSON.stringify({ layer_id: videoIds[0], at_t_us: 5_000_000 })).ok).toBe(true)
    const comp = root(actor.snapshot())
    const leftVideo = comp.tracks[0].layers.find((l) => l.id === videoIds[0])!
    const leftAudio = comp.tracks[0].layers.find((l) => l.params.kind === 'Audio' && l.t_end_us <= 5_000_020)!
    assertPair(actor, leftVideo.id, leftAudio.id)
    const rightVideo = comp.tracks[0].layers.find((l) => l.params.kind === 'VideoClip' && l.t_start_us >= 5_000_000 && l.t_start_us < 6_000_000)!
    const rightAudio = comp.tracks[0].layers.find((l) => l.params.kind === 'Audio' && l.t_start_us >= 4_999_980 && l.t_start_us < 6_000_000)!
    assertPair(actor, rightVideo.id, rightAudio.id)

    // A free gap follows the last clip, so move the second pair into it.
    expect(actor.mcpCall('move_layer', JSON.stringify({ layer_id: videoIds[1], new_track_id: comp.tracks[0].id, new_t_start_us: 22_000_000 })).ok).toBe(true)
    const secondAudio = root(actor.snapshot()).tracks[0].layers.find((l) => l.params.kind === 'Audio' && l.t_start_us >= 22_000_000)!
    assertPair(actor, videoIds[1], secondAudio.id)
    const ctx = buildTimelineContext(actor.snapshot())
    const mapped = ctx.tracks.flatMap((t) => t.layers).find((l) => l.layer_id === videoIds[1])!
    expect(mapped.media_id).toBe(MEDIA)
    expect(mapped.src_in_us).toBe(20_000_000)
    expect(mapped.src_out_us).toBe(30_000_000)
    expect(mapped.linked_layer_ids).toContain(secondAudio.id)

    const saved = serializeProject(actor.snapshot())
    const reloaded = createActor({ initial: parseProject(JSON.parse(JSON.stringify(saved))), idGen: seededGen(999) })
    expect(serializeProject(reloaded.snapshot())).toEqual(saved)
  })

  it('rejects impossible trim without partial state and can undo ripple removal', () => {
    const { actor, videoIds, audioIds } = fixture()
    const before = serializeProject(actor.snapshot())
    expect(actor.mcpCall('trim_layer', JSON.stringify({ layer_id: videoIds[0], edge: 'end', new_t_us: 9_000_000 })).ok).toBe(false)
    expect(actor.dispatch('trim_layer', { layer: videoIds[0], edge: 'end', new_t_us: 9_000_000 }).ok).toBe(false)
    expect(serializeProject(actor.snapshot())).toEqual(before)
    const failed = actor.mcpCall('trim_layer', JSON.stringify({ layer_id: videoIds[0], edge: 'out', new_t_us: 45_000_000 }))
    // An impossible extension either refuses or clamps; it must never pass source bounds.
    if (failed.ok) {
      const layer = root(actor.snapshot()).tracks[0].layers.find((l) => l.id === videoIds[0])!
      if (layer.params.kind !== 'VideoClip') throw new Error('wrong layer')
      expect(layer.params.src_out_us).toBeLessThanOrEqual(40_000_000)
      expect(actor.dispatch('undo', {}).ok).toBe(true)
    }
    expect(serializeProject(actor.snapshot())).toEqual(before)
    expect(actor.mcpCall('ripple_delete_layers', JSON.stringify({ layer_ids: [videoIds[0], audioIds[0]] })).ok).toBe(true)
    const after = root(actor.snapshot()).tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')
    expect(after).toHaveLength(1)
    expect(after[0].t_start_us).toBe(0)
    expect(actor.dispatch('undo', {}).ok).toBe(true)
    expect(serializeProject(actor.snapshot())).toEqual(before)
  })

  it('validates audit facts and the three-attempt guard without editorial scoring', () => {
    const { actor, videoIds } = fixture()
    const comp = root(actor.snapshot())
    const trace: EditorialRevisionAttempt = {
      version: 1, composition_id: comp.id, issue_id: 'issue-1', attempt: 1,
      checkpoint_id: 'checkpoint-1',
      problem: { timeline_range_us: [9_000_000, 11_000_000], description: 'Observed boundary defect' },
      action: { tool: 'trim_layer', target_layer_ids: [videoIds[0]], summary: 'Changed source boundary' },
      before_inspection: { evidence: 'Timeline and source context inspected' },
      after_inspection: { evidence: 'Local timeline context inspected', assessment: 'unchanged' },
    }
    expect(validateEditorialRevisionAttempt(trace, comp)).toEqual([])
    expect(validateEditorialRevisionAttempt({ ...trace, attempt: MAX_REVISION_ATTEMPTS_PER_ISSUE + 1 }, comp)).toContain('attempt must be between 1 and 3')
    expect(validateEditorialRevisionAttempt({ ...trace, action: { ...trace.action, target_layer_ids: ['missing'] } }, comp)).toContain('target layer does not exist in composition')
  })
})
