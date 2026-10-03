import { beforeAll, describe, expect, it } from 'vitest'
import { initEval } from '../../renderer/eval/index.js'
import { freshActor } from '../state/__tests__/pbt/harness.js'
import { createActor } from '../state/actor.js'
import { seededGen } from '../state/ids.js'
import { serializeProject } from '../state/serialize.js'
import { compileRoughCutTimeline } from '../state/mutations/roughCut.js'
import type { RoughCutPlan } from './roughCutPlan.js'
import type { Layer, Project } from '../state/model.js'

const MEDIA = 'd4ba409b-2162-4b11-a1af-786b09a57c43'
const MEDIA_DURATION_US = 575_710_839
const REPAIRED_CUT_US = 4_666_667 // first frame after the transcript's 4.640 s word end

function fixture() {
  const seed = freshActor()
  expect(seed.dispatch('add_media', { id: MEDIA, kind: 'Video', duration_us: MEDIA_DURATION_US, with_audio: true }).ok).toBe(true)
  const project = JSON.parse(JSON.stringify(seed.snapshot())) as Project
  const plan: RoughCutPlan = {
    version: 1,
    brief: { goal: 'Test rough cut with intentional defect', audience: 'Reviewer', target_duration_us: 14_450_000, tone: ['educational'] },
    source_summary: 'Raw tutorial', editorial_thesis: 'Test rough cut',
    sections: [
      { id: 'sec-01', purpose: 'Opening fragment ending mid-word', clips: [
        { media_id: MEDIA, source_start_us: 0, source_end_us: 4_450_000, action: 'keep', reason: 'Cut mid-word at 4.45s' },
      ] },
      { id: 'sec-02', purpose: 'Unrelated continuation from 300s', clips: [
        { media_id: MEDIA, source_start_us: 300_000_000, source_end_us: 310_000_000, action: 'keep', reason: 'Jump to 300s' },
      ] },
    ],
    removed_ranges: [{ media_id: MEDIA, source_start_us: 4_450_000, source_end_us: 300_000_000, reason: 'Removed span' }],
    estimated_duration_us: 14_450_000, uncertainties: [],
  }
  compileRoughCutTimeline(project, seededGen(1), plan, { dry_run: false })
  const actor = createActor({ initial: project, idGen: seededGen(1) })
  const comp = actor.snapshot().compositions[project.root_id]
  const videos = comp.tracks.flatMap((t) => t.layers).filter((l) => l.params.kind === 'VideoClip').sort((a, b) => a.t_start_us - b.t_start_us)
  const audio = comp.tracks.flatMap((t) => t.layers).filter((l) => l.params.kind === 'Audio').sort((a, b) => a.t_start_us - b.t_start_us)
  return { actor, track: comp.tracks.find((t) => t.layers.some((l) => l.id === videos[0].id))!.id, videos, audio }
}

function layer(actor: ReturnType<typeof createActor>, id: string): Layer {
  return Object.values(actor.snapshot().compositions).flatMap((c) => c.tracks).flatMap((t) => t.layers).find((l) => l.id === id)!
}

describe('Phase 2E bad-cut existing-tool forensic proof', () => {
  beforeAll(initEval)

  it('repairs the exact bad-cut plan with two existing MCP edits and restores via undo/checkpoint', () => {
    const { actor, track, videos, audio } = fixture()
    const [outVideo, inVideo] = videos
    const [outAudio, inAudio] = audio
    const before = serializeProject(actor.snapshot())
    expect([outVideo.t_start_us, outVideo.t_end_us, inVideo.t_start_us, inVideo.t_end_us]).toEqual([0, 4_466_667, 4_466_667, 14_466_667])
    expect([outAudio.t_start_us, outAudio.t_end_us, inAudio.t_start_us, inAudio.t_end_us]).toEqual([0, 4_466_667, 4_466_667, 14_466_667])
    for (const item of [outVideo, outAudio, inVideo, inAudio]) {
      if (item.params.kind !== 'VideoClip' && item.params.kind !== 'Audio') throw new Error('wrong fixture layer')
      expect([item.params.src_in_us, item.params.src_out_us]).toEqual(item.t_start_us === 0
        ? [0, 4_466_667] : [300_000_000, 310_000_000])
    }
    const links = actor.snapshot().compositions[actor.snapshot().root_id].links
    expect(links.some((g) => g.members.includes(outVideo.id) && g.members.includes(outAudio.id))).toBe(true)
    expect(links.some((g) => g.members.includes(inVideo.id) && g.members.includes(inAudio.id))).toBe(true)

    const checkpoint = actor.mcpCall('checkpoint', JSON.stringify({ label: 'Before bad-cut repair' }))
    expect(checkpoint.ok).toBe(true)
    if (!checkpoint.ok) return
    const checkpointId = checkpoint.result.content[0].text

    // First make room, moving the incoming VideoClip and its linked Audio together.
    const moved = actor.mcpCall('move_layer', JSON.stringify({ layer_id: inVideo.id, new_track_id: track, new_t_start_us: REPAIRED_CUT_US }))
    expect(moved.ok, JSON.stringify(moved)).toBe(true)
    // Then reveal the remaining spoken word on both outgoing linked layers.
    const trimmed = actor.mcpCall('trim_layer', JSON.stringify({ layer_id: outVideo.id, edge: 'out', new_t_us: REPAIRED_CUT_US }))
    expect(trimmed.ok, JSON.stringify(trimmed)).toBe(true)

    const final = [outVideo.id, outAudio.id, inVideo.id, inAudio.id].map((id) => layer(actor, id))
    expect(final.map((l) => [l.t_start_us, l.t_end_us])).toEqual([
      [0, REPAIRED_CUT_US], [0, REPAIRED_CUT_US],
      [REPAIRED_CUT_US, 14_666_667], [REPAIRED_CUT_US, 14_666_667],
    ])
    expect(final.map((l) => [l.params.kind === 'VideoClip' || l.params.kind === 'Audio' ? l.params.src_in_us : null,
      l.params.kind === 'VideoClip' || l.params.kind === 'Audio' ? l.params.src_out_us : null])).toEqual([
      [0, REPAIRED_CUT_US], [0, REPAIRED_CUT_US],
      [300_000_000, 310_000_000], [300_000_000, 310_000_000],
    ])
    expect(REPAIRED_CUT_US).toBeGreaterThan(4_640_000)
    expect(REPAIRED_CUT_US).toBeLessThan(MEDIA_DURATION_US)
    expect(actor.snapshot().compositions[actor.snapshot().root_id].links).toEqual(links)

    expect(actor.mcpCall('undo', '{}').ok).toBe(true)
    expect(layer(actor, outAudio.id).t_end_us).toBe(4_466_667)
    expect(actor.mcpCall('undo', '{}').ok).toBe(true)
    expect(serializeProject(actor.snapshot())).toEqual(before)
    expect(actor.mcpCall('redo', '{}').ok).toBe(true)
    expect(actor.mcpCall('redo', '{}').ok).toBe(true)
    expect(layer(actor, outAudio.id).t_end_us).toBe(REPAIRED_CUT_US)
    expect(actor.mcpCall('restore_checkpoint', JSON.stringify({ checkpoint_id: checkpointId })).ok).toBe(true)
    expect(serializeProject(actor.snapshot())).toEqual(before)
  })
})
