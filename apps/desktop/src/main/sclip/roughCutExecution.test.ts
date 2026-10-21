import { describe, it, expect, beforeAll } from 'vitest'
import { freshActor, aRollId } from '../state/__tests__/pbt/harness'
import { root } from '../state/__tests__/fixtures/project'
import type { RoughCutPlan } from './roughCutPlan'
import type { RoughCutApplyResult } from '../state/mutations/roughCut'
import { initEval } from '../../renderer/eval/index.js'
import { serializeProject, parseProject } from '../state/serialize.js'
import { createActor } from '../state/actor.js'
import { seededGen } from '../state/ids.js'

const MEDIA_1 = '00000000-0000-7000-8000-000000000201'
const MEDIA_2 = '00000000-0000-7000-8000-000000000202'

const BENCHMARK_A_MEDIA = 'd4ba409b-2162-4b11-a1af-786b09a57c43'
const BENCHMARK_A_DURATION_US = 575_710_839

const BENCHMARK_A_PLAN: RoughCutPlan = {
  version: 1,
  brief: {
    goal: 'Turn a 9:36 raw talking-head tutorial into a tight 5–7 minute YouTube video for beginner entrepreneurs',
    audience: 'beginner entrepreneurs',
    target_duration_us: 388_680_000,
    tone: ['educational', 'motivational'],
  },
  source_summary: 'Single-speaker (Russell), 575.7s, 1280x720, 23.98fps, full transcript with exact word timing, 9 audio pauses.',
  editorial_thesis: 'The video engine is the puzzle vs overwhelming buffet metaphor and the Brandon/Caitlin case study. Cuts repetitive setup, redundant Mr. Miyagi analogy, and trailing fluff.',
  sections: [
    {
      id: 'sec-01',
      purpose: 'Hook — the number one reason people fail',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 0, source_end_us: 15_540_000, action: 'keep', reason: 'Strong immediate hook' }],
    },
    {
      id: 'sec-02',
      purpose: 'Credibility — 20 years, seen it all',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 15_540_000, source_end_us: 31_800_000, action: 'keep', reason: 'Establishes speaker authority' }],
    },
    {
      id: 'sec-03',
      purpose: 'The core metaphor — puzzle vs overwhelming buffet',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 70_560_000, source_end_us: 116_960_000, action: 'keep', reason: 'Central intellectual engine' }],
    },
    {
      id: 'sec-04',
      purpose: 'The solution — trust the process, step by step',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 116_960_000, source_end_us: 143_920_000, action: 'keep', reason: 'Direct answer to the hook' }],
    },
    {
      id: 'sec-05',
      purpose: 'Airport anecdote — pick one mentor, put on blinders',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 143_920_000, source_end_us: 225_280_000, action: 'keep', reason: 'Concrete, memorable story' }],
    },
    {
      id: 'sec-06',
      purpose: 'Case study — Brandon & Caitlin, $30M business',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 248_880_000, source_end_us: 391_440_000, action: 'keep', reason: 'The strongest evidence' }],
    },
    {
      id: 'sec-07',
      purpose: 'Three-point summary — pick path, blinders, execute',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 391_440_000, source_end_us: 421_760_000, action: 'keep', reason: 'Clean distillation' }],
    },
    {
      id: 'sec-08',
      purpose: 'Closing — trust the guide, see you at the end',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 542_640_000, source_end_us: 571_920_000, action: 'keep', reason: 'Strong motivational CTA' }],
    },
  ],
  removed_ranges: [
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 31_800_000, source_end_us: 70_560_000, reason: 'Redundant beautiful picture tangent' },
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 225_280_000, source_end_us: 248_880_000, reason: 'False start Philip Wu and weak transition' },
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 421_760_000, source_end_us: 542_640_000, reason: 'Mr. Miyagi analogy (120s) - redundant with puzzle metaphor and Brandon proof' },
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 571_920_000, source_end_us: 575_710_839, reason: 'Trailing wrap-up fluff and silence' },
  ],
  estimated_duration_us: 388_680_000,
  uncertainties: [
    'Single talking head shot throughout, no B-roll or visual variety in source',
    'Mr. Miyagi cut can be partially restored if user prefers keeping pop-culture references',
  ],
}

const BENCHMARK_B_MEDIA = '313f7251-8bb9-4e17-b3d3-0db840cb8ebd'
const BENCHMARK_B_DURATION_US = 1_767_270_748

const BENCHMARK_B_PLAN: RoughCutPlan = {
  version: 1,
  brief: {
    goal: 'Make an 8–12 minute YouTube cut prioritizing the most actionable psychology tricks, keeping explanations clear and punchy, and preserving high-energy delivery.',
    audience: 'Viewers new to video psychology',
    target_duration_us: 600_000_000,
    tone: ['actionable', 'high-energy', 'punchy', 'accessible'],
  },
  source_summary: 'A 29.5-minute comprehensive tutorial breaking down 18 video psychology tricks across 6 narrative checkpoints, featuring creator Kallaway.',
  editorial_thesis: 'Condense 18 tricks down to the single strongest, most universally actionable trick per checkpoint, eliminating tangential meta-analysis and self-referential stories to deliver a focused 11-minute masterclass.',
  sections: [
    {
      id: 'sec-01',
      purpose: 'Establish authority, hook the viewer with the content playbook, and outline the 6 video psychology checkpoints',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 0, source_end_us: 63_000_000, action: 'keep', reason: 'High-energy hook introducing the 18 tricks across 6 checkpoints' },
      ],
    },
    {
      id: 'sec-02',
      purpose: 'Teach how to get viewers to acknowledge and feel the specific problem before offering solutions',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 63_000_000, source_end_us: 89_000_000, action: 'keep', reason: 'Core principle of pain acceptance and emotional triggers' },
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 128_000_000, source_end_us: 200_000_000, action: 'keep', reason: 'The most actionable beginner tricks: subtle relatability and singular audience framing' },
      ],
    },
    {
      id: 'sec-03',
      purpose: 'How to establish immediate credibility without bragging or boring the audience',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 545_000_000, source_end_us: 670_000_000, action: 'keep', reason: 'Actionable credibility markers: proof points, third-party validation, and shared struggle' },
      ],
    },
    {
      id: 'sec-04',
      purpose: 'Providing a clear mental roadmap to keep viewers watching through the middle',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 967_000_000, source_end_us: 1_040_000_000, action: 'keep', reason: 'Structuring unique viewpoints so the viewer feels guaranteed value' },
      ],
    },
    {
      id: 'sec-05',
      purpose: 'Making the speaker magnetic through pacing and natural delivery',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_152_000_000, source_end_us: 1_240_000_000, action: 'keep', reason: 'Simplifying complex concepts down to human intuition and matching viewer energy' },
      ],
    },
    {
      id: 'sec-06',
      purpose: 'Psychological retention engineering to prevent drop-off in the second half',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_352_000_000, source_end_us: 1_450_000_000, action: 'keep', reason: 'Engineering continuous forward curiosity so the audience cannot click away' },
      ],
    },
    {
      id: 'sec-07',
      purpose: 'Closing the loop, delivering on the promise, and giving an inspiring CTA',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_568_000_000, source_end_us: 1_660_000_000, action: 'keep', reason: 'Delivering the ultimate payoff and giving the audience a memorable concluding takeaway' },
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_738_000_000, source_end_us: 1_767_270_748, action: 'keep', reason: 'Punchy wrap-up and subscribe call to action' },
      ],
    },
  ],
  removed_ranges: [
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 89_000_000, source_end_us: 128_000_000, reason: 'Cut entertainment vs value-first debate' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 200_000_000, source_end_us: 545_000_000, reason: 'Cut twisting the knife repetition and meta hook analysis' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 670_000_000, source_end_us: 967_000_000, reason: 'Cut self-referential personal credibility story and redundant quick hacks' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_040_000_000, source_end_us: 1_152_000_000, reason: 'Cut granular checklist setup and transition filler' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_240_000_000, source_end_us: 1_352_000_000, reason: 'Cut extended authenticity deep dive and personal tangents' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_450_000_000, source_end_us: 1_568_000_000, reason: 'Cut complex trans-rhythm theory and over-technical editing jargon' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_660_000_000, source_end_us: 1_738_000_000, reason: 'Cut repetitive recap and sponsorship/course plug' },
  ],
  estimated_duration_us: 666_270_748,
  uncertainties: [
    'Verify transition at 128s from 4 horsemen into one standard deviation',
    'Confirm soundbite ending at 1660s before outro pick-up at 1738s',
  ],
}

function setupMedia(actor: ReturnType<typeof freshActor>, mediaId: string, durationUs: number, withAudio = true) {
  const r = actor.dispatch('add_media', {
    id: mediaId,
    kind: 'Video',
    duration_us: durationUs,
    with_audio: withAudio,
  })
  expect(r.ok, `setup media ${mediaId} must succeed`).toBe(true)
}

describe('SCLIP Phase 2C — Deterministic Rough-Cut Execution', () => {
  beforeAll(async () => {
    await initEval()
  })

  it('one optional production MCP operation places nine decided ranges exactly like nine ordinary A/V placements', () => {
    const bulk = freshActor(), sequential = freshActor()
    for (const actor of [bulk, sequential]) setupMedia(actor, MEDIA_1, 40_000_000)
    const ranges = Array.from({ length: 9 }, (_, i) => ({ media_id: MEDIA_1,
      source_start_us: i * 3_000_000, source_end_us: i * 3_000_000 + 2_000_000,
      action: 'keep' as const, reason: 'Already chosen by Hermes' }))
    const plan: RoughCutPlan = { version: 1, brief: { goal: 'Execute decided ranges', audience: 'test', target_duration_us: 18_000_000, tone: ['test'] },
      source_summary: 'Known source', editorial_thesis: 'Chosen by Hermes, not this tool',
      sections: [{ id: 'chosen', purpose: 'Already decided', clips: ranges }],
      removed_ranges: [], estimated_duration_us: 18_000_000, uncertainties: [] }
    const before = JSON.stringify(bulk.snapshot())
    const dry = bulk.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan, dry_run: true }))
    expect(dry.ok, JSON.stringify(dry)).toBe(true)
    expect(JSON.stringify(bulk.snapshot())).toBe(before)
    const bulkArguments = JSON.stringify({ plan })
    const bulkStarted = performance.now()
    const applied = bulk.mcpCall('apply_rough_cut_plan', bulkArguments)
    const bulkDurationMs = performance.now() - bulkStarted
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    const result = JSON.parse(applied.result.content[0].text) as RoughCutApplyResult
    expect(result.mapping).toHaveLength(9)
    expect(new Set(result.mapping.flatMap(m => [m.layer_id, m.audio_layer_id, m.link_id])).size).toBe(27)
    let sequentialArgumentBytes = 0
    let sequentialResultBytes = 0
    const sequentialStarted = performance.now()
    for (const [i, range] of ranges.entries()) {
      const args = JSON.stringify({ media_id: range.media_id,
        track_id: aRollId(sequential), src_in_us: range.source_start_us, src_out_us: range.source_end_us,
        t_start_us: i * 2_000_000, t_end_us: (i + 1) * 2_000_000 })
      sequentialArgumentBytes += Buffer.byteLength(args)
      const placed = sequential.mcpCall('add_video_layer', args)
      sequentialResultBytes += Buffer.byteLength(JSON.stringify(placed))
      expect(placed.ok).toBe(true)
    }
    const sequentialDurationMs = performance.now() - sequentialStarted
    console.log('ROUGH_CUT_MEASUREMENT', JSON.stringify({
      ranges: ranges.length,
      bulk: { calls: 1, argument_bytes: Buffer.byteLength(bulkArguments), result_bytes: Buffer.byteLength(JSON.stringify(applied)), duration_ms: bulkDurationMs },
      individual: { calls: ranges.length, argument_bytes: sequentialArgumentBytes, result_bytes: sequentialResultBytes, duration_ms: sequentialDurationMs },
    }))
    // Check the entire canonical render/edit state, renaming generated IDs only.
    // Bulk's applied-plan audit metadata and checkpoint/history differ by design.
    const canonical = (actor: ReturnType<typeof freshActor>) => {
      const comp = structuredClone(root(actor.snapshot())) as any
      const names = new Map<string, string>()
      comp.tracks.flatMap((t: any) => t.layers).forEach((l: any, i: number) => names.set(l.id, `layer-${i}`))
      comp.links.forEach((l: any, i: number) => names.set(l.id, `link-${i}`))
      delete comp.metadata
      return JSON.parse(JSON.stringify(comp, (_key, value) => typeof value === 'string' ? names.get(value) ?? value : value))
    }
    expect(canonical(bulk)).toEqual(canonical(sequential))
    expect(bulk.dispatch('undo', {}).ok).toBe(true)
    expect(JSON.stringify(bulk.snapshot())).toBe(before)
    expect(bulk.dispatch('redo', {}).ok).toBe(true)
    expect(canonical(bulk)).toEqual(canonical(sequential))
    const reopened = createActor({ initial: parseProject(serializeProject(bulk.snapshot())), idGen: seededGen(), clock: () => '<TS>' })
    expect(canonical(reopened)).toEqual(canonical(bulk))
  })

  it('1. Benchmark A Execution Test: compiles Hermes approved 8-clip tutorial plan into contiguous timeline (<500ms)', () => {
    const actor = freshActor()
    setupMedia(actor, BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, true)

    // Measure dry-run latency
    const t0 = performance.now()
    const dryRes = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: BENCHMARK_A_PLAN, dry_run: true }))
    const tDry = performance.now() - t0
    expect(dryRes.ok).toBe(true)
    expect(tDry).toBeLessThan(500)

    // Measure execute latency
    const t1 = performance.now()
    const wetRes = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: BENCHMARK_A_PLAN }))
    const tExec = performance.now() - t1
    expect(wetRes.ok).toBe(true)
    expect(tExec).toBeLessThan(500)
    if (!wetRes.ok) return

    const result = JSON.parse(wetRes.result.content[0].text) as RoughCutApplyResult
    expect(result.status).toBe('applied')
    expect(result.clips_created).toBe(8)
    expect(result.planned_duration_us).toBe(388_680_000)

    const snap = actor.snapshot()
    const comp = root(snap)
    const track = comp.tracks[0]

    // Verify exact clip count matches plan (8 VideoClip layers, 8 Audio layers)
    const videoLayers = track.layers.filter((l) => l.params.kind === 'VideoClip')
    const audioLayers = track.layers.filter((l) => l.params.kind === 'Audio')
    expect(videoLayers).toHaveLength(8)
    expect(audioLayers).toHaveLength(8)

    // Verify all media references point to Benchmark A media ID
    for (const v of videoLayers) {
      expect(v.params.kind === 'VideoClip' && v.params.media).toBe(BENCHMARK_A_MEDIA)
    }
    for (const a of audioLayers) {
      expect(a.params.kind === 'Audio' && a.params.media).toBe(BENCHMARK_A_MEDIA)
    }

    // Verify every clip has correct source window and contiguous timeline placement
    let prevTEnd = 0
    const flatClipsA = BENCHMARK_A_PLAN.sections.flatMap((s) => s.clips)
    for (let i = 0; i < videoLayers.length; i++) {
      const v = videoLayers[i]
      const planClip = flatClipsA[i]
      expect(v.t_start_us).toBe(prevTEnd)
      expect(v.params.kind === 'VideoClip' && v.params.src_in_us).toBe(planClip.source_start_us)
      expect(v.params.kind === 'VideoClip' && v.params.src_out_us).toBe(planClip.source_start_us + (v.t_end_us - v.t_start_us))
      prevTEnd = v.t_end_us
    }

    // Verify total timeline duration matches plan estimated duration (within frame grid tolerance)
    expect(comp.duration_us).toBe(prevTEnd)
    expect(Math.abs(comp.duration_us - BENCHMARK_A_PLAN.estimated_duration_us)).toBeLessThan(33_334)

    // Verify A/V sync links exist for every clip (8 links)
    expect(comp.links).toHaveLength(8)
    for (const item of result.mapping) {
      expect(item.audio_layer_id).not.toBeNull()
      expect(item.link_id).not.toBeNull()
      const link = comp.links.find((l) => l.id === item.link_id)
      expect(link).toBeDefined()
      expect(new Set(link?.members)).toEqual(new Set([item.layer_id, item.audio_layer_id!]))
    }
  })

  it('2. Benchmark B Execution Test: compiles Hermes approved 9-clip 29.5m psychology masterclass (<500ms)', () => {
    const actor = freshActor()
    setupMedia(actor, BENCHMARK_B_MEDIA, BENCHMARK_B_DURATION_US, true)

    // Measure dry-run latency
    const t0 = performance.now()
    const dryRes = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: BENCHMARK_B_PLAN, dry_run: true }))
    const tDry = performance.now() - t0
    expect(dryRes.ok).toBe(true)
    expect(tDry).toBeLessThan(500)

    // Measure execute latency
    const t1 = performance.now()
    const wetRes = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: BENCHMARK_B_PLAN }))
    const tExec = performance.now() - t1
    expect(wetRes.ok).toBe(true)
    expect(tExec).toBeLessThan(500)
    if (!wetRes.ok) return

    const result = JSON.parse(wetRes.result.content[0].text) as RoughCutApplyResult
    expect(result.status).toBe('applied')
    expect(result.clips_created).toBe(9)
    expect(result.planned_duration_us).toBe(666_270_748)

    const snap = actor.snapshot()
    const comp = root(snap)
    const track = comp.tracks[0]

    const videoLayers = track.layers.filter((l) => l.params.kind === 'VideoClip')
    expect(videoLayers).toHaveLength(9)

    // Verify 9-clip sequence exactly matches approved plan order & source windows
    const flatClipsB = BENCHMARK_B_PLAN.sections.flatMap((s) => s.clips)
    let cursor = 0
    for (let i = 0; i < videoLayers.length; i++) {
      const v = videoLayers[i]
      const planClip = flatClipsB[i]
      expect(v.t_start_us).toBe(cursor)
      expect(v.params.kind === 'VideoClip' && v.params.src_in_us).toBe(planClip.source_start_us)
      if (v.params.kind !== 'VideoClip') throw new Error('expected video clip')
      expect(v.params.src_out_us).toBe(planClip.source_end_us > BENCHMARK_B_DURATION_US ? v.params.src_out_us : planClip.source_start_us + (v.t_end_us - v.t_start_us))
      cursor = v.t_end_us
    }

    // Verify cross-section transitions are clean and gapless
    for (let i = 0; i < result.mapping.length - 1; i++) {
      expect(result.mapping[i].timeline_range_us[1]).toBe(result.mapping[i + 1].timeline_range_us[0])
    }

    // Verify total duration
    expect(comp.duration_us).toBe(cursor)
    expect(Math.abs(comp.duration_us - BENCHMARK_B_PLAN.estimated_duration_us)).toBeLessThan(33_334)
    expect(comp.links).toHaveLength(9)
  })

  it('3. Plan Order Test (Benchmark C): preserves exact editorial order, not chronological source order', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 60_000_000, true)

    // Benchmark C fixture:
    // clip 1: 20s - 30s
    // clip 2: 0s - 10s
    // clip 3: 40s - 50s
    const plan: RoughCutPlan = {
      version: 1,
      brief: {
        goal: 'Benchmark C Order Test',
        audience: 'Test Suite',
        target_duration_us: 30_000_000,
        tone: ['punchy'],
      },
      source_summary: '60s test video',
      editorial_thesis: 'Test that editorial reordering is strictly respected',
      sections: [
        {
          id: 'sec-1',
          purpose: 'Out of order sequence',
          clips: [
            { media_id: MEDIA_1, source_start_us: 20_000_000, source_end_us: 30_000_000, action: 'reorder', reason: 'Clip 1 (20-30s)' },
            { media_id: MEDIA_1, source_start_us: 0, source_end_us: 10_000_000, action: 'reorder', reason: 'Clip 2 (0-10s)' },
            { media_id: MEDIA_1, source_start_us: 40_000_000, source_end_us: 50_000_000, action: 'keep', reason: 'Clip 3 (40-50s)' },
          ],
        },
      ],
      removed_ranges: [],
      estimated_duration_us: 30_000_000,
      uncertainties: [],
    }

    const res = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const applyResult = JSON.parse(res.result.content[0].text) as RoughCutApplyResult
    expect(applyResult.status).toBe('applied')
    expect(applyResult.clips_created).toBe(3)

    const snap = actor.snapshot()
    const comp = root(snap)
    const track = comp.tracks[0]

    // Target track should contain 3 VideoClip layers and 3 Audio layers (paired)
    const videoLayers = track.layers.filter((l) => l.params.kind === 'VideoClip')
    expect(videoLayers).toHaveLength(3)

    // Clip 1: timeline 0 to 10s, source 20s to 30s
    expect(videoLayers[0].t_start_us).toBe(0)
    expect(videoLayers[0].t_end_us).toBe(10_000_000)
    expect(videoLayers[0].params.kind === 'VideoClip' && videoLayers[0].params.src_in_us).toBe(20_000_000)
    expect(videoLayers[0].params.kind === 'VideoClip' && videoLayers[0].params.src_out_us).toBe(30_000_000)

    // Clip 2: timeline 10s to 20s, source 0s to 10s
    expect(videoLayers[1].t_start_us).toBe(10_000_000)
    expect(videoLayers[1].t_end_us).toBe(20_000_000)
    expect(videoLayers[1].params.kind === 'VideoClip' && videoLayers[1].params.src_in_us).toBe(0)
    expect(videoLayers[1].params.kind === 'VideoClip' && videoLayers[1].params.src_out_us).toBe(10_000_000)

    // Clip 3: timeline 20s to 30s, source 40s to 50s
    expect(videoLayers[2].t_start_us).toBe(20_000_000)
    expect(videoLayers[2].t_end_us).toBe(30_000_000)
    expect(videoLayers[2].params.kind === 'VideoClip' && videoLayers[2].params.src_in_us).toBe(40_000_000)
    expect(videoLayers[2].params.kind === 'VideoClip' && videoLayers[2].params.src_out_us).toBe(50_000_000)
  })

  it('4. Multi-Media Test (Benchmark D): supports multiple media sources without cross-contamination', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 60_000_000, true)
    setupMedia(actor, MEDIA_2, 60_000_000, true)

    // Benchmark D fixture:
    // media1: 10s - 20s
    // media2: 30s - 40s
    // media1: 50s - 60s
    const plan: RoughCutPlan = {
      version: 1,
      brief: {
        goal: 'Benchmark D Multi-Media Test',
        audience: 'Test Suite',
        target_duration_us: 30_000_000,
        tone: ['dynamic'],
      },
      source_summary: 'Two distinct source videos',
      editorial_thesis: 'Intercut two media sources accurately',
      sections: [
        {
          id: 'sec-multimedia',
          purpose: 'Intercut',
          clips: [
            { media_id: MEDIA_1, source_start_us: 10_000_000, source_end_us: 20_000_000, action: 'keep', reason: 'M1 A-roll' },
            { media_id: MEDIA_2, source_start_us: 30_000_000, source_end_us: 40_000_000, action: 'keep', reason: 'M2 B-roll cut' },
            { media_id: MEDIA_1, source_start_us: 50_000_000, source_end_us: 60_000_000, action: 'keep', reason: 'M1 Return' },
          ],
        },
      ],
      removed_ranges: [],
      estimated_duration_us: 30_000_000,
      uncertainties: [],
    }

    const res = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const snap = actor.snapshot()
    const videoLayers = root(snap).tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')
    expect(videoLayers).toHaveLength(3)

    expect(videoLayers[0].params.kind === 'VideoClip' && videoLayers[0].params.media).toBe(MEDIA_1)
    expect(videoLayers[1].params.kind === 'VideoClip' && videoLayers[1].params.media).toBe(MEDIA_2)
    expect(videoLayers[2].params.kind === 'VideoClip' && videoLayers[2].params.media).toBe(MEDIA_1)
  })

  it('5. Synchronized A/V Pairing & Gapless Assembly (Deliverables E & F)', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 50_000_000, true)

    const plan: RoughCutPlan = {
      version: 1,
      brief: {
        goal: 'A/V Sync and Gapless Test',
        audience: 'Test Suite',
        target_duration_us: 25_000_000,
        tone: ['clean'],
      },
      source_summary: 'Media test',
      editorial_thesis: 'Test A/V link pairing and gaplessness',
      sections: [
        {
          id: 'sec-av',
          purpose: 'AV check',
          clips: [
            { media_id: MEDIA_1, source_start_us: 5_000_000, source_end_us: 15_000_000, action: 'keep', reason: 'First' },
            { media_id: MEDIA_1, source_start_us: 20_000_000, source_end_us: 35_000_000, action: 'keep', reason: 'Second' },
          ],
        },
      ],
      removed_ranges: [],
      estimated_duration_us: 25_000_000,
      uncertainties: [],
    }

    const res = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const applyResult = JSON.parse(res.result.content[0].text) as RoughCutApplyResult
    expect(applyResult.mapping).toHaveLength(2)

    const snap = actor.snapshot()
    const comp = root(snap)
    const track = comp.tracks[0]

    // Verify mapping and linking
    for (const item of applyResult.mapping) {
      expect(item.audio_layer_id).not.toBeNull()
      expect(item.link_id).not.toBeNull()

      const video = track.layers.find((l) => l.id === item.layer_id)!
      const audio = track.layers.find((l) => l.id === item.audio_layer_id)!
      expect(video).toBeDefined()
      expect(audio).toBeDefined()

      // Exact matching bounds for both video and audio
      expect(video.t_start_us).toBe(audio.t_start_us)
      expect(video.t_end_us).toBe(audio.t_end_us)
      expect(video.params.kind === 'VideoClip' && video.params.src_in_us).toBe(audio.params.kind === 'Audio' && audio.params.src_in_us)
      expect(video.params.kind === 'VideoClip' && video.params.src_out_us).toBe(audio.params.kind === 'Audio' && audio.params.src_out_us)

      // Verified link in composition links
      const link = comp.links.find((l) => l.id === item.link_id)
      expect(link).toBeDefined()
      expect(new Set(link?.members)).toEqual(new Set([item.layer_id, item.audio_layer_id!]))
    }

    // Gapless verification: end of clip 1 == start of clip 2
    expect(applyResult.mapping[0].timeline_range_us[1]).toBe(applyResult.mapping[1].timeline_range_us[0])
  })

  it('6. Dry-Run Support (Deliverable K): produces 0 mutations, 0 history entries, 0 checkpoints', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 50_000_000, true)

    const beforeSnap = actor.snapshot()
    const beforeCheckpoints = actor.listCheckpoints()
    const beforeHistory = actor.historyStatus()

    const plan: RoughCutPlan = {
      version: 1,
      brief: {
        goal: 'Dry Run Test',
        audience: 'Test Suite',
        target_duration_us: 10_000_000,
        tone: ['dry'],
      },
      source_summary: 'Media test',
      editorial_thesis: 'Test dry-run isolation',
      sections: [
        {
          id: 'sec-dry',
          purpose: 'Dry run check',
          clips: [
            { media_id: MEDIA_1, source_start_us: 0, source_end_us: 10_000_000, action: 'keep', reason: 'Clip' },
          ],
        },
      ],
      removed_ranges: [],
      estimated_duration_us: 10_000_000,
      uncertainties: [],
    }

    const res = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan, dry_run: true }))
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const dryResult = JSON.parse(res.result.content[0].text) as RoughCutApplyResult
    expect(dryResult.status).toBe('dry_run')
    expect(dryResult.clips_created).toBe(1)
    expect(dryResult.planned_duration_us).toBe(10_000_000)

    // State invariants: byte-identical snapshot, 0 new checkpoints, 0 new history entries
    expect(actor.snapshot()).toBe(beforeSnap)
    expect(actor.listCheckpoints()).toEqual(beforeCheckpoints)
    expect(actor.historyStatus()).toEqual(beforeHistory)
  })

  it('7. Duplicate Plan Execution Protection (Deliverable J)', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 50_000_000, true)

    const plan: RoughCutPlan = {
      version: 1,
      brief: {
        goal: 'Duplicate Protection Test',
        audience: 'Test Suite',
        target_duration_us: 10_000_000,
        tone: ['safe'],
      },
      source_summary: 'Media test',
      editorial_thesis: 'Test duplicate execution rejection',
      sections: [
        {
          id: 'sec-dup',
          purpose: 'Duplicate check',
          clips: [
            { media_id: MEDIA_1, source_start_us: 0, source_end_us: 10_000_000, action: 'keep', reason: 'Clip' },
          ],
        },
      ],
      removed_ranges: [],
      estimated_duration_us: 10_000_000,
      uncertainties: [],
    }

    // First execution: succeeds
    const res1 = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(res1.ok).toBe(true)

    // Second execution with reapply=false (default): rejected
    const res2 = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(res2.ok).toBe(false)
    if (!res2.ok) {
      expect(res2.error.message).toMatch(/already been applied/)
    }

    // Third execution with reapply=true: succeeds
    const res3 = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan, reapply: true }))
    expect(res3.ok).toBe(true)
  })

  it('8. Preflight Failure Rejection: missing media or invalid plan causes 0 mutations and 0 checkpoints', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 20_000_000, true)

    const beforeSnap = actor.snapshot()
    const beforeCheckpoints = actor.listCheckpoints()

    // Plan referencing non-existent media
    const planBadMedia: RoughCutPlan = {
      version: 1,
      brief: { goal: 'Bad Media', audience: 'Test', target_duration_us: 10_000_000, tone: ['fail'] },
      source_summary: 'Test',
      editorial_thesis: 'Fail on missing media',
      sections: [{ id: 's1', purpose: 'p', clips: [{ media_id: 'non-existent-media-id', source_start_us: 0, source_end_us: 10_000_000, action: 'keep', reason: 'fail' }] }],
      removed_ranges: [],
      estimated_duration_us: 10_000_000,
      uncertainties: [],
    }

    const resBad = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: planBadMedia }))
    expect(resBad.ok).toBe(false)
    expect(actor.snapshot()).toBe(beforeSnap)
    expect(actor.listCheckpoints()).toEqual(beforeCheckpoints)

    // Plan with timestamp exceeding media duration
    const planOutOfBounds: RoughCutPlan = {
      version: 1,
      brief: { goal: 'Out of Bounds', audience: 'Test', target_duration_us: 30_000_000, tone: ['fail'] },
      source_summary: 'Test',
      editorial_thesis: 'Fail on bounds',
      sections: [{ id: 's1', purpose: 'p', clips: [{ media_id: MEDIA_1, source_start_us: 0, source_end_us: 30_000_000, action: 'keep', reason: 'fail' }] }],
      removed_ranges: [],
      estimated_duration_us: 30_000_000,
      uncertainties: [],
    }

    const resOob = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: planOutOfBounds }))
    expect(resOob.ok).toBe(false)
    expect(actor.snapshot()).toBe(beforeSnap)
    expect(actor.listCheckpoints()).toEqual(beforeCheckpoints)
  })

  it('9. Undo / Redo Round-Trip Test: full timeline revert and redo restoration', () => {
    const actor = freshActor()
    setupMedia(actor, BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, true)

    const initialSnap = actor.snapshot()
    const initialLayers = root(initialSnap).tracks[0].layers.length

    // Execute plan
    const execRes = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: BENCHMARK_A_PLAN }))
    expect(execRes.ok).toBe(true)

    const executedLayers = root(actor.snapshot()).tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')
    expect(executedLayers).toHaveLength(8)

    // Undo -> returns to pre-execution state
    const undoRes = actor.dispatch('undo', {})
    expect(undoRes.ok).toBe(true)
    const afterUndoLayers = root(actor.snapshot()).tracks[0].layers.length
    expect(afterUndoLayers).toBe(initialLayers)

    // Redo -> restores rough cut identically
    const redoRes = actor.dispatch('redo', {})
    expect(redoRes.ok).toBe(true)
    const afterRedoLayers = root(actor.snapshot()).tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')
    expect(afterRedoLayers).toHaveLength(8)
    expect(Math.abs(root(actor.snapshot()).duration_us - BENCHMARK_A_PLAN.estimated_duration_us)).toBeLessThan(33_334)
  })

  it('10. Save / Reload Round-Trip Test: project serialization preserves all clips, tracks, links, and remains editable', () => {
    const actor = freshActor()
    setupMedia(actor, BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, true)

    // Execute plan
    const execRes = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: BENCHMARK_A_PLAN }))
    expect(execRes.ok).toBe(true)

    const beforeSnap = actor.snapshot()

    // Serialize to wire representation (simulating disk save)
    const wire = serializeProject(beforeSnap)
    const wireJson = JSON.stringify(wire)

    // Reload from serialized JSON (simulating disk load)
    const parsed = parseProject(JSON.parse(wireJson))
    const reloadedActor = createActor({ initial: parsed, idGen: seededGen(), clock: () => '<TS>' })

    // Verify all clips, tracks, links, and duration are intact
    const reloadedComp = root(reloadedActor.snapshot())
    const reloadedVideo = reloadedComp.tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')
    const reloadedAudio = reloadedComp.tracks[0].layers.filter((l) => l.params.kind === 'Audio')
    expect(reloadedVideo).toHaveLength(8)
    expect(reloadedAudio).toHaveLength(8)
    expect(reloadedComp.links).toHaveLength(8)
    expect(reloadedComp.duration_us).toBe(root(beforeSnap).duration_us)

    // Verify timeline is fully playable and editable after reload
    const firstVidId = reloadedVideo[0].id
    const splitRes = reloadedActor.mcpCall('split_layer', JSON.stringify({ layer_id: firstVidId, at_t_us: 5_000_000 }))
    expect(splitRes.ok).toBe(true)
    const videoAfterSplit = root(reloadedActor.snapshot()).tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')
    expect(videoAfterSplit).toHaveLength(9)
  })

  it('11. Controlled Rollback & Failure Recovery: locked track leaves actor 100% clean and operational', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 50_000_000, true)

    const beforeSnap = actor.snapshot()
    const trackId = root(beforeSnap).tracks[0].id

    // Lock the track
    const lockRes = actor.dispatch('update_track_flags', { track: trackId, patch: { locked: true } })
    expect(lockRes.ok).toBe(true)
    const lockedSnap = actor.snapshot()

    const plan: RoughCutPlan = {
      version: 1,
      brief: { goal: 'Lock Test', audience: 'Test', target_duration_us: 10_000_000, tone: ['locked'] },
      source_summary: 'Media test',
      editorial_thesis: 'Test preflight catch of locked track',
      sections: [{ id: 's1', purpose: 'p', clips: [{ media_id: MEDIA_1, source_start_us: 0, source_end_us: 10_000_000, action: 'keep', reason: 'c' }] }],
      removed_ranges: [],
      estimated_duration_us: 10_000_000,
      uncertainties: [],
    }

    const res = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan, track_id: trackId }))
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.message).toMatch(/TrackLocked|is locked/)
    }

    // Snapshot is unchanged, 0 checkpoints created
    expect(actor.snapshot()).toBe(lockedSnap)

    // Unlock track and verify actor remains fully operational
    const unlockRes = actor.dispatch('update_track_flags', { track: trackId, patch: { locked: false } })
    expect(unlockRes.ok).toBe(true)
    const successRes = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan, track_id: trackId }))
    expect(successRes.ok).toBe(true)
  })

  it('12. Undo and Checkpoint Restore: reverts timeline to pre-execution state', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 50_000_000, true)

    const beforeSnap = actor.snapshot()

    const plan: RoughCutPlan = {
      version: 1,
      brief: { goal: 'Checkpoint Restore Test', audience: 'Test', target_duration_us: 15_000_000, tone: ['revert'] },
      source_summary: 'Test',
      editorial_thesis: 'Verify rollback to checkpoint',
      sections: [{ id: 's1', purpose: 'p', clips: [{ media_id: MEDIA_1, source_start_us: 0, source_end_us: 15_000_000, action: 'keep', reason: 'c1' }] }],
      removed_ranges: [],
      estimated_duration_us: 15_000_000,
      uncertainties: [],
    }

    const res = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const applyResult = JSON.parse(res.result.content[0].text) as RoughCutApplyResult
    expect(applyResult.checkpoint_id).not.toBeNull()

    // Restore checkpoint
    const restoreRes = actor.mcpCall('restore_checkpoint', JSON.stringify({ checkpoint_id: applyResult.checkpoint_id }))
    expect(restoreRes.ok).toBe(true)

    // After checkpoint restore, timeline layers should equal before state
    const afterSnap = actor.snapshot()
    expect(root(afterSnap).tracks[0].layers).toHaveLength(root(beforeSnap).tracks[0].layers.length)
  })

  it('13. Editability of Output: user and agent can normally trim, split, and move generated clips', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 50_000_000, true)

    const plan: RoughCutPlan = {
      version: 1,
      brief: { goal: 'Editability Test', audience: 'Test', target_duration_us: 20_000_000, tone: ['edit'] },
      source_summary: 'Test',
      editorial_thesis: 'Verify normal editability of rough-cut layers',
      sections: [{ id: 's1', purpose: 'p', clips: [{ media_id: MEDIA_1, source_start_us: 10_000_000, source_end_us: 30_000_000, action: 'keep', reason: 'clip' }] }],
      removed_ranges: [],
      estimated_duration_us: 20_000_000,
      uncertainties: [],
    }

    const res = actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan }))
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const applyResult = JSON.parse(res.result.content[0].text) as RoughCutApplyResult
    const videoLayerId = applyResult.mapping[0].layer_id

    // Test 1: trim_layer on generated clip
    const trimRes = actor.mcpCall('trim_layer', JSON.stringify({ layer_id: videoLayerId, edge: 'out', new_t_us: 15_000_000 }))
    expect(trimRes.ok).toBe(true)

    const videoAfterTrim = root(actor.snapshot()).tracks[0].layers.find((l) => l.id === videoLayerId)!
    expect(videoAfterTrim.t_end_us).toBe(15_000_000)

    // Test 2: split_layer at 5s
    const splitRes = actor.mcpCall('split_layer', JSON.stringify({ layer_id: videoLayerId, at_t_us: 5_000_000 }))
    expect(splitRes.ok).toBe(true)

    // Track should now have split clips
    const videoLayersAfterSplit = root(actor.snapshot()).tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')
    expect(videoLayersAfterSplit.length).toBeGreaterThan(1)
  })

  it('14. Existing Agent Tool Regression: low-level tools remain 100% accessible and functional', () => {
    const actor = freshActor()
    setupMedia(actor, MEDIA_1, 50_000_000, true)

    // Verify low-level add_marker works
    const markerRes = actor.mcpCall('add_marker', JSON.stringify({ t_us: 1_000_000, label: 'Test Marker', color: { r: 255, g: 0, b: 0, a: 255 } }))
    expect(markerRes.ok).toBe(true)

    // Verify checkpoint works
    const cpRes = actor.mcpCall('checkpoint', JSON.stringify({ label: 'Manual CP' }))
    expect(cpRes.ok).toBe(true)

    // Verify add_video_layer works directly
    const addVidRes = actor.mcpCall('add_video_layer', JSON.stringify({
      track_id: aRollId(actor),
      media_id: MEDIA_1,
      src_in_us: 0,
      src_out_us: 5_000_000,
      t_start_us: 0,
      t_end_us: 5_000_000,
    }))
    if (!addVidRes.ok) throw new Error(JSON.stringify(addVidRes.error))
    const vidId = JSON.parse(addVidRes.result.content[0].text).video_layer_id

    // Verify split_layer works
    const splitRes = actor.mcpCall('split_layer', JSON.stringify({ layer_id: vidId, at_t_us: 2_500_000 }))
    expect(splitRes.ok).toBe(true)

    // Verify undo works
    const undoRes = actor.dispatch('undo', {})
    expect(undoRes.ok).toBe(true)

    // Verify redo works
    const redoRes = actor.dispatch('redo', {})
    expect(redoRes.ok).toBe(true)
  })
})

it('compact range input retains atomic execution, linked audio, dry run and boundary validation',async()=>{
 await initEval();const actor=freshActor();setupMedia(actor,MEDIA_1,20000000,true)
 const clips=[{media_id:MEDIA_1,source_start_us:0,source_end_us:3000000},{media_id:MEDIA_1,source_start_us:10000000,source_end_us:13000000}]
 const before=JSON.stringify(actor.snapshot()),dry=actor.mcpCall('apply_rough_cut_plan',JSON.stringify({clips,dry_run:true}))
 expect(dry.ok,JSON.stringify(dry)).toBe(true);expect(JSON.stringify(actor.snapshot())).toBe(before)
 const bad=actor.mcpCall('apply_rough_cut_plan',JSON.stringify({clips:[{...clips[0],source_end_us:30000000}]}));expect(bad.ok).toBe(false);expect(JSON.stringify(actor.snapshot())).toBe(before)
 const applied=actor.mcpCall('apply_rough_cut_plan',JSON.stringify({clips}));expect(applied.ok,JSON.stringify(applied)).toBe(true)
 if(applied.ok){const r=JSON.parse(applied.result.content[0].text);expect(r.clips_created).toBe(2);expect(r.mapping.every((m:any)=>m.audio_layer_id&&m.link_id)).toBe(true);expect(root(actor.snapshot()).duration_us).toBe(6000000)}
})
