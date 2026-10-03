import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { freshActor } from '../state/__tests__/pbt/harness'
import { initEval } from '../../renderer/eval/index.js'
import { createActor } from '../state/actor.js'
import { seededGen } from '../state/ids.js'
import { buildTimelineContext } from './timelineContext.js'
import { inspectTimelineFrame } from './timelineFrame.js'
import { renderTimelineRange, computeRangeCacheKey } from './rangeRender.js'
import { validateRoughCutReview, type RoughCutReview, type RoughCutInspection } from './roughCutReview.js'
import { compileRoughCutTimeline } from '../state/mutations/roughCut.js'
import { videoClipParams } from '../state/mutations/media.js'
import { textParamsDefault } from '../state/mutations/add.js'
import type { RoughCutPlan } from './roughCutPlan.js'
import type { Project } from '../state/model.js'

const BENCHMARK_A_MEDIA = 'd4ba409b-2162-4b11-a1af-786b09a57c43'
const BENCHMARK_A_DURATION_US = 575_710_839
const REAL_PROJECT_3_DIR = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
const TRANSCRIPTS_DIR = path.join(REAL_PROJECT_3_DIR, 'Cache', 'transcripts')
const REAL_MEDIA_A_PATH = path.join(REAL_PROJECT_3_DIR, 'Media', 'Raw Talking head tutorial video for editing practice.mp4')
const REAL_MEDIA_B_PATH = path.join(REAL_PROJECT_3_DIR, 'Media', '18 Psychology Tricks to Get Viewers Addicted to Your Videos.mp4')

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
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 421_760_000, source_end_us: 542_640_000, reason: 'Mr. Miyagi analogy (120s)' },
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
    goal: 'Make an 8–12 minute YouTube cut prioritizing actionable psychology tricks',
    audience: 'Viewers new to video psychology',
    target_duration_us: 600_000_000,
    tone: ['actionable', 'high-energy', 'punchy'],
  },
  source_summary: 'A 29.5-minute tutorial breaking down 18 video psychology tricks across 6 checkpoints.',
  editorial_thesis: 'Condense 18 tricks down to the single strongest trick per checkpoint.',
  sections: [
    {
      id: 'sec-01',
      purpose: 'Hook',
      clips: [{ media_id: BENCHMARK_B_MEDIA, source_start_us: 0, source_end_us: 63_000_000, action: 'keep', reason: 'High-energy hook' }],
    },
    {
      id: 'sec-02',
      purpose: 'Pain points',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 63_000_000, source_end_us: 89_000_000, action: 'keep', reason: 'Core principle of pain triggers' },
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 128_000_000, source_end_us: 200_000_000, action: 'keep', reason: 'Subtle relatability framing' },
      ],
    },
    {
      id: 'sec-03',
      purpose: 'Credibility',
      clips: [{ media_id: BENCHMARK_B_MEDIA, source_start_us: 545_000_000, source_end_us: 670_000_000, action: 'keep', reason: 'Actionable credibility markers' }],
    },
    {
      id: 'sec-04',
      purpose: 'Roadmap',
      clips: [{ media_id: BENCHMARK_B_MEDIA, source_start_us: 967_000_000, source_end_us: 1_040_000_000, action: 'keep', reason: 'Clear roadmap' }],
    },
    {
      id: 'sec-05',
      purpose: 'Pacing',
      clips: [{ media_id: BENCHMARK_B_MEDIA, source_start_us: 1_152_000_000, source_end_us: 1_240_000_000, action: 'keep', reason: 'Delivery and pacing' }],
    },
    {
      id: 'sec-06',
      purpose: 'Retention',
      clips: [{ media_id: BENCHMARK_B_MEDIA, source_start_us: 1_352_000_000, source_end_us: 1_450_000_000, action: 'keep', reason: 'Curiosity loops' }],
    },
    {
      id: 'sec-07',
      purpose: 'CTA',
      clips: [
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_568_000_000, source_end_us: 1_660_000_000, action: 'keep', reason: 'Takeaway' },
        { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_738_000_000, source_end_us: 1_767_270_748, action: 'keep', reason: 'CTA' },
      ],
    },
  ],
  removed_ranges: [
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 89_000_000, source_end_us: 128_000_000, reason: 'Cut entertainment debate' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 200_000_000, source_end_us: 545_000_000, reason: 'Cut meta hook repetition' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 670_000_000, source_end_us: 967_000_000, reason: 'Cut redundant quick hacks' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_040_000_000, source_end_us: 1_152_000_000, reason: 'Cut checklist filler' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_240_000_000, source_end_us: 1_352_000_000, reason: 'Cut personal tangents' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_450_000_000, source_end_us: 1_568_000_000, reason: 'Cut over-technical jargon' },
    { media_id: BENCHMARK_B_MEDIA, source_start_us: 1_660_000_000, source_end_us: 1_738_000_000, reason: 'Cut recap' },
  ],
  estimated_duration_us: 666_270_748,
  uncertainties: [
    'Verify transition at 128s from 4 horsemen into one standard deviation',
    'Confirm soundbite ending at 1660s before outro pick-up at 1738s',
  ],
}

function makeProjectWithMedia(mediaId: string, durationUs: number, pathAbs?: string, hash?: string): Project {
  const actor = freshActor()
  const r = actor.dispatch('add_media', {
    id: mediaId,
    kind: 'Video',
    duration_us: durationUs,
    with_audio: true,
  })
  expect(r.ok).toBe(true)
  const snap = JSON.parse(JSON.stringify(actor.snapshot())) as Project
  if (snap.media_pool[mediaId]) {
    if (pathAbs) snap.media_pool[mediaId].path_abs = pathAbs
    snap.media_pool[mediaId].file_hash_blake3 = hash ?? (mediaId === BENCHMARK_B_MEDIA ? '99006ed9cd10ff3fc82035e9f0f9cfd30a026690d49174787c15882b539a8488' : '6c1001e336ff916ef94c1777493f4acafeeff5ae6978f5e89b24563127d0eb32')
  }
  return snap
}

describe('SCLIP Phase 2D: Timeline Inspection & Editorial Self-Review', () => {
  beforeAll(async () => {
    await initEval()
  })

  describe('1. get_timeline_context (Deliverable C)', () => {
    it('extracts compact structured facts from compiled timeline with zero mutations', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      compileRoughCutTimeline(project, seededGen(1), BENCHMARK_A_PLAN, { dry_run: false })
      const snapBefore = JSON.stringify(project)

      const ctx = buildTimelineContext(project, { transcriptsDir: TRANSCRIPTS_DIR })

      // Invariant: project snapshot is 100% untouched
      expect(JSON.stringify(project)).toBe(snapBefore)

      // Verified metadata
      expect(ctx.composition_id).toBe(project.root_id)
      expect(ctx.resolution.width).toBe(project.compositions[project.root_id].width)
      expect(ctx.resolution.height).toBe(project.compositions[project.root_id].height)
      expect(ctx.duration_us).toBe(project.compositions[project.root_id].duration_us)
      expect(ctx.total_layers).toBe(16) // 8 video + 8 audio

      // Tracks and clips
      expect(ctx.tracks.length).toBe(2) // A-Roll + B-Roll
      const aRoll = ctx.tracks[0]
      expect(aRoll.layer_count).toBe(16)

      // Cut boundaries: 8 clips assembled sequentially -> 7 cut boundaries
      expect(ctx.cut_boundaries.length).toBe(7)
      for (let i = 0; i < ctx.cut_boundaries.length; i++) {
        const b = ctx.cut_boundaries[i]
        expect(b.cut_index).toBe(i)
        expect(b.outgoing_clip.layer_id).toBeTruthy()
        expect(b.incoming_clip.layer_id).toBeTruthy()
        expect(b.outgoing_clip.media_id).toBe(BENCHMARK_A_MEDIA)
        expect(b.incoming_clip.media_id).toBe(BENCHMARK_A_MEDIA)
        expect(b.has_gap).toBe(false)
      }

      // Word-level speech cues are extracted from the cached transcript
      const firstCut = ctx.cut_boundaries[0]
      expect(firstCut.speech_cues).toBeDefined()
      expect(firstCut.speech_cues?.outgoing_tail_text).toBeTruthy()
      expect(firstCut.speech_cues?.incoming_head_text).toBeTruthy()
      expect(Math.abs(firstCut.speech_cues?.source_jump_us ?? 0)).toBeLessThan(50_000) // Continuous within 1 frame (< 50ms)
    })

    it('narrows cut boundaries and layers when range is specified', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      compileRoughCutTimeline(project, seededGen(1), BENCHMARK_A_PLAN, { dry_run: false })

      // Range around second cut (~31.8s)
      const rangeCtx = buildTimelineContext(project, {
        range: { start_us: 20_000_000, end_us: 50_000_000 },
        transcriptsDir: TRANSCRIPTS_DIR,
      })

      expect(rangeCtx.cut_boundaries.length).toBe(1)
      expect(rangeCtx.cut_boundaries[0].cut_index).toBe(1)
      // Jump over the removed picture tangent (31.8s to 70.56s = ~38.76s jump, aligned to frame boundaries)
      expect(Math.abs((rangeCtx.cut_boundaries[0].speech_cues?.source_jump_us ?? 0) - 38_760_000)).toBeLessThan(50_000)
    })

    it('identifies timeline gaps correctly', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      // Manually create two clips with a 1-second gap between them
      const comp = project.compositions[project.root_id]
      const track = comp.tracks[0]
      track.layers = [
        {
          id: 'v1',
          t_start_us: 0,
          t_end_us: 5_000_000,
          label: 'Clip 1',
          enabled: true,
          locked: false,
          params: videoClipParams(BENCHMARK_A_MEDIA, 0, 5_000_000),
          metadata: {}, effects: [],
        },
        {
          id: 'v2',
          t_start_us: 6_000_000, // 1s gap
          t_end_us: 10_000_000,
          label: 'Clip 2',
          enabled: true,
          locked: false,
          params: videoClipParams(BENCHMARK_A_MEDIA, 20_000_000, 24_000_000),
          metadata: {}, effects: [],
        },
      ]
      comp.duration_us = 10_000_000

      const ctx = buildTimelineContext(project)
      expect(ctx.gaps.length).toBe(1)
      expect(ctx.gaps[0].duration_us).toBe(1_000_000)
      expect(ctx.cut_boundaries.length).toBe(1)
      expect(ctx.cut_boundaries[0].has_gap).toBe(true)
      expect(ctx.cut_boundaries[0].gap_duration_us).toBe(1_000_000)
    })
  })

  describe('2. Read-only & State Invariant Verification', () => {
    it('ProjectActor mcpCall for get_timeline_context produces 0 mutations and 0 history entries', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      const actor = createActor({ initial: project, idGen: seededGen(42) })

      // Execute plan
      actor.mcpCall('apply_rough_cut_plan', JSON.stringify({ plan: BENCHMARK_A_PLAN }))
      const snapAfterApply = actor.snapshot()
      const historyAfterApply = actor.historyView(100)

      // Call get_timeline_context multiple times via MCP
      const res1 = actor.mcpCall('get_timeline_context', JSON.stringify({}))
      expect(res1.ok).toBe(true)
      const res2 = actor.mcpCall('get_timeline_context', JSON.stringify({ start_us: 0, end_us: 30_000_000 }))
      expect(res2.ok).toBe(true)

      // Invariants: Snapshot is byte-for-byte identical, history count is unchanged
      expect(JSON.stringify(actor.snapshot())).toBe(JSON.stringify(snapAfterApply))
      expect(actor.historyView(100).ops.length).toBe(historyAfterApply.ops.length)
    })
  })

  describe('3. inspect_timeline_frame (Deliverable A)', () => {
    it('captures composed frame without error and respects composition dimensions', async () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      compileRoughCutTimeline(project, seededGen(1), BENCHMARK_A_PLAN, { dry_run: false })

      const frame = await inspectTimelineFrame(project, {
        t_us: 5_000_000,
        resourcesPath: path.resolve(__dirname, '../../../resources'),
      })

      expect(frame.width).toBe(project.compositions[project.root_id].width)
      expect(frame.height).toBe(project.compositions[project.root_id].height)
      expect(frame.t_us).toBe(5_000_000)
      expect(frame.source).toBe('headless_compositor')
      expect(frame.pngBase64.length).toBeGreaterThan(1000)
      expect(frame.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    })

    it('delegates to live compositor bridge when BrowserWindow is available without moving playhead', async () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      let executedScript = ''

      const mockWin = {
        isDestroyed: () => false,
        webContents: {
          executeJavaScript: async (code: string) => {
            executedScript = code
            return {
              pngBase64: mockBase64,
              width: 1920,
              height: 1080,
            }
          },
        },
      }

      const frame = await inspectTimelineFrame(project, {
        t_us: 12_345_678,
        getActiveWindow: () => mockWin,
      })

      expect(frame.source).toBe('live_compositor')
      expect(frame.pngBase64).toBe(mockBase64)
      expect(frame.width).toBe(1920)
      expect(frame.height).toBe(1080)
      expect(executedScript).toContain('window.__weftcutPreview.captureFrameAt(12345678')
    })
  })

  describe('4. render_timeline_range (Deliverable B)', () => {
    it('enforces 30s mechanical duration limit', async () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      await expect(
        renderTimelineRange(project, {
          start_us: 0,
          end_us: 31_000_000, // 31 seconds > 30s cap
        }),
      ).rejects.toThrow(/exceeds maximum allowed preview range of 30s/i)
    })

    it('rejects invalid timestamp bounds', async () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      await expect(
        renderTimelineRange(project, { start_us: -100, end_us: 5_000_000 }),
      ).rejects.toThrow(/cannot be negative/i)

      await expect(
        renderTimelineRange(project, { start_us: 5_000_000, end_us: 2_000_000 }),
      ).rejects.toThrow(/must be greater than start_us/i)
    })

    it('computes deterministic content-addressed cache keys and isolates cache', () => {
      const compId = 'test-comp'
      const layers: any[] = [
        { id: 'l1', t_start_us: 0, t_end_us: 5_000_000, params: { kind: 'VideoClip', media: 'm1', src_in_us: 0, src_out_us: 5_000_000 } },
      ]

      const k1 = computeRangeCacheKey(compId, 0, 5_000_000, layers)
      const k2 = computeRangeCacheKey(compId, 0, 5_000_000, layers)
      expect(k1).toBe(k2)

      // Timing shift invalidates cache key
      const layersModified = [
        { id: 'l1', t_start_us: 0, t_end_us: 4_500_000, params: { kind: 'VideoClip', media: 'm1', src_in_us: 0, src_out_us: 4_500_000 } },
      ]
      const k3 = computeRangeCacheKey(compId, 0, 5_000_000, layersModified as any)
      expect(k1).not.toBe(k3)
    })

    it('renders a valid 5s preview with audio stream and caches repeat calls', async () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      compileRoughCutTimeline(project, seededGen(1), BENCHMARK_A_PLAN, { dry_run: false })

      // Render 5 seconds across first cut point (13s to 18s, cut at ~15.54s)
      const res1 = await renderTimelineRange(project, {
        start_us: 13_000_000,
        end_us: 18_000_000,
        resourcesPath: path.resolve(__dirname, '../../../resources'),
      })

      expect(res1.duration_us).toBe(5_000_000)
      expect(res1.has_audio).toBe(true)
      expect(fs.existsSync(res1.path)).toBe(true)
      expect(fs.statSync(res1.path).size).toBeGreaterThan(10_000)

      // Second call is instant cache hit
      const res2 = await renderTimelineRange(project, {
        start_us: 13_000_000,
        end_us: 18_000_000,
        resourcesPath: path.resolve(__dirname, '../../../resources'),
      })
      expect(res2.cached).toBe(true)
      expect(res2.path).toBe(res1.path)
    }, 20_000)
  })

  describe('5. validateRoughCutReview (Deliverables F & G)', () => {
    it('validates a well-formed editorial review against the composition', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      compileRoughCutTimeline(project, seededGen(1), BENCHMARK_A_PLAN, { dry_run: false })
      const comp = project.compositions[project.root_id]
      const firstLayer = comp.tracks[0].layers[0]

      const review: RoughCutReview = {
        version: 1,
        project_id: project.project_id,
        composition_id: comp.id,
        summary: 'Pacing is tight and cohesive; narrative flows cleanly from hook into buffet metaphor.',
        total_duration_us: comp.duration_us,
        clip_count: 8,
        inspections: [
          {
            id: 'insp-01',
            type: 'boundary',
            timeline_range_us: [14_000_000, 17_000_000],
            method: 'context_only',
            evidence: 'Outgoing speech ends with "why people fail, okay?". Incoming speech starts with "And so for me".',
            assessment: 'natural',
            reason: 'Clean transition between hook and authority proof.',
            clip_ids: [firstLayer.id],
          },
        ],
        identified_issues: [],
        ready_for_next_stage: true,
      }

      const res = validateRoughCutReview(review, comp)
      expect(res.valid).toBe(true)
      expect(res.errors).toEqual([])
      expect(res.inspections_count).toBe(1)
      expect(res.issues_count).toBe(0)
      expect(res.has_critical_issues).toBe(false)
    })

    it('rejects duration mismatch exceeding 1 frame', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      const comp = project.compositions[project.root_id]
      comp.duration_us = 100_000_000

      const review: Partial<RoughCutReview> = {
        version: 1,
        project_id: project.project_id,
        composition_id: comp.id,
        summary: 'Test',
        total_duration_us: 120_000_000, // 20s difference
        clip_count: 1,
        inspections: [],
        identified_issues: [],
        ready_for_next_stage: true,
      }

      const res = validateRoughCutReview(review, comp)
      expect(res.valid).toBe(false)
      expect(res.errors.some((e) => e.includes('differs from actual composition duration'))).toBe(true)
    })

    it('rejects non-existent clip IDs and invalid timestamp ranges', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      const comp = project.compositions[project.root_id]
      comp.duration_us = 50_000_000

      const review: RoughCutReview = {
        version: 1,
        project_id: project.project_id,
        composition_id: comp.id,
        summary: 'Test',
        total_duration_us: 50_000_000,
        clip_count: 1,
        inspections: [
          {
            id: 'insp-bad',
            type: 'boundary',
            timeline_range_us: [60_000_000, 70_000_000], // Beyond composition duration
            method: 'context_only',
            evidence: 'out of bounds',
            assessment: 'bad',
            reason: 'test',
            clip_ids: ['non-existent-layer-uuid'],
          },
        ],
        identified_issues: [],
        ready_for_next_stage: true,
      }

      const res = validateRoughCutReview(review, comp)
      expect(res.valid).toBe(false)
      expect(res.errors.some((e) => e.includes('exceeds composition duration'))).toBe(true)
      expect(res.errors.some((e) => e.includes('does not exist in composition'))).toBe(true)
    })

    it('rejects logical contradiction where critical issue exists but ready_for_next_stage is true', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      const comp = project.compositions[project.root_id]
      comp.duration_us = 50_000_000

      const review: RoughCutReview = {
        version: 1,
        project_id: project.project_id,
        composition_id: comp.id,
        summary: 'Test',
        total_duration_us: 50_000_000,
        clip_count: 1,
        inspections: [],
        identified_issues: [
          {
            id: 'crit-01',
            severity: 'critical',
            timeline_t_us: 10_000_000,
            affected_range_us: [9_000_000, 11_000_000],
            issue_type: 'incomplete_sentence',
            description: 'Mid-word cut on essential explanation',
            suggestion: 'Extend out-point by 600ms',
          },
        ],
        ready_for_next_stage: true, // Contradiction!
      }

      const res = validateRoughCutReview(review, comp)
      expect(res.valid).toBe(false)
      expect(res.errors.some((e) => e.includes('ready_for_next_stage cannot be true when critical issues are identified'))).toBe(true)
    })
  })

  describe('6. Benchmark C & D: Editorial Cut Quality Verification', () => {
    it('Benchmark C: Intentionally bad cut fixture flags mid-word discontinuity at exact timestamp', () => {
      // Create project with cut positioned directly mid-word
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      const comp = project.compositions[project.root_id]
      const track = comp.tracks[0]

      // In Russell video, around 4.5s speaker is saying "talking about"
      // Cutting at 4.45s creates a mid-word cut
      const midWordCutUs = 4_450_000
      track.layers = [
        {
          id: 'v-midword',
          t_start_us: 0,
          t_end_us: midWordCutUs,
          label: 'Mid-word clip',
          enabled: true,
          locked: false,
          params: videoClipParams(BENCHMARK_A_MEDIA, 0, midWordCutUs),
          metadata: {}, effects: [],
        },
        {
          id: 'v-glued',
          t_start_us: midWordCutUs,
          t_end_us: midWordCutUs + 10_000_000,
          label: 'Glued clip',
          enabled: true,
          locked: false,
          params: videoClipParams(BENCHMARK_A_MEDIA, 300_000_000, 310_000_000),
          metadata: {}, effects: [],
        },
      ]
      comp.duration_us = midWordCutUs + 10_000_000

      const ctx = buildTimelineContext(project, { transcriptsDir: TRANSCRIPTS_DIR })
      expect(ctx.cut_boundaries.length).toBe(1)
      const cut = ctx.cut_boundaries[0]
      expect(cut.timeline_t_us).toBe(midWordCutUs)
      expect(cut.speech_cues).toBeDefined()
      expect(cut.speech_cues?.is_mid_word).toBe(true)

      // Hermes editorial review accurately flags this defect
      const review: RoughCutReview = {
        version: 1,
        project_id: project.project_id,
        composition_id: comp.id,
        summary: 'Detected critical mid-word cut at boundary 0.',
        total_duration_us: comp.duration_us,
        clip_count: 2,
        inspections: [
          {
            id: 'insp-midword',
            type: 'boundary',
            timeline_range_us: [midWordCutUs - 1_000_000, midWordCutUs + 1_000_000],
            method: 'context_only',
            evidence: `Cut occurred mid-word at ${midWordCutUs} µs. Outgoing tail text truncated: "${cut.speech_cues?.outgoing_tail_text}".`,
            assessment: 'bad',
            reason: 'Speaker was cut mid-word before finishing sentence.',
            clip_ids: ['v-midword', 'v-glued'],
          },
        ],
        identified_issues: [
          {
            id: 'issue-midword',
            severity: 'critical',
            timeline_t_us: midWordCutUs,
            affected_range_us: [midWordCutUs - 500_000, midWordCutUs + 500_000],
            issue_type: 'incomplete_sentence',
            description: 'Abrupt speech cut mid-word into unrelated topic.',
            suggestion: 'Extend outgoing clip out-point to 7.3s at natural sentence end.',
          },
        ],
        ready_for_next_stage: false,
      }

      const val = validateRoughCutReview(review, comp)
      expect(val.valid).toBe(true)
      expect(val.has_critical_issues).toBe(true)
    })

    it('Benchmark D: Clean natural sentence boundary confirmed without false positives', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      const comp = project.compositions[project.root_id]
      const track = comp.tracks[0]

      // Natural sentence boundary in Russell video is at 15.54s
      const naturalCutUs = 15_540_000
      track.layers = [
        {
          id: 'v-clean-1',
          t_start_us: 0,
          t_end_us: naturalCutUs,
          label: 'Clip 1',
          enabled: true,
          locked: false,
          params: videoClipParams(BENCHMARK_A_MEDIA, 0, naturalCutUs),
          metadata: {}, effects: [],
        },
        {
          id: 'v-clean-2',
          t_start_us: naturalCutUs,
          t_end_us: naturalCutUs + 16_260_000,
          label: 'Clip 2',
          enabled: true,
          locked: false,
          params: videoClipParams(BENCHMARK_A_MEDIA, naturalCutUs, naturalCutUs + 16_260_000),
          metadata: {}, effects: [],
        },
      ]
      comp.duration_us = naturalCutUs + 16_260_000

      const ctx = buildTimelineContext(project, { transcriptsDir: TRANSCRIPTS_DIR })
      expect(ctx.cut_boundaries.length).toBe(1)
      const cut = ctx.cut_boundaries[0]
      expect(cut.speech_cues?.is_mid_word).toBe(false)

      const review: RoughCutReview = {
        version: 1,
        project_id: project.project_id,
        composition_id: comp.id,
        summary: 'Cut boundary aligns naturally with spoken cadence.',
        total_duration_us: comp.duration_us,
        clip_count: 2,
        inspections: [
          {
            id: 'insp-clean',
            type: 'boundary',
            timeline_range_us: [naturalCutUs - 1_000_000, naturalCutUs + 1_000_000],
            method: 'context_only',
            evidence: 'Clean natural pause with continuous speech flow.',
            assessment: 'natural',
            reason: 'Sentence concludes cleanly before speaker breathes.',
            clip_ids: ['v-clean-1', 'v-clean-2'],
          },
        ],
        identified_issues: [],
        ready_for_next_stage: true,
      }

      const val = validateRoughCutReview(review, comp)
      expect(val.valid).toBe(true)
      expect(val.issues_count).toBe(0)
      expect(val.has_critical_issues).toBe(false)
    })
  })

  describe('7. Visual Composition Test', () => {
    it('renders composed frame reflecting video and text overlays', async () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      const comp = project.compositions[project.root_id]

      // Add a text overlay layer on track 0
      comp.tracks[0].layers.push({
        id: 'text-overlay-01',
        t_start_us: 0,
        t_end_us: 10_000_000,
        label: 'Title Overlay',
        enabled: true,
        locked: false,
        params: textParamsDefault('WHY PEOPLE FAIL', comp),
        metadata: {}, effects: [],
      })

      const frame = await inspectTimelineFrame(project, {
        t_us: 2_000_000,
        resourcesPath: path.resolve(__dirname, '../../../resources'),
      })

      expect(frame.pngBase64.length).toBeGreaterThan(1000)
      expect(frame.width).toBe(comp.width)
      expect(frame.height).toBe(comp.height)
    })
  })

  describe('8. Benchmark A: Full Rough-Cut Review across all 7 Boundaries', () => {
    it('inspects real compiled Benchmark A timeline and validates complete 7-boundary review', () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      compileRoughCutTimeline(project, seededGen(1), BENCHMARK_A_PLAN, { dry_run: false })
      const comp = project.compositions[project.root_id]

      const ctx = buildTimelineContext(project, { transcriptsDir: TRANSCRIPTS_DIR })
      expect(ctx.cut_boundaries.length).toBe(7)

      // Collect layer IDs
      const videoLayers = comp.tracks[0].layers.filter((l) => l.params.kind === 'VideoClip')

      const inspections: RoughCutInspection[] = ctx.cut_boundaries.map((b, idx) => ({
        id: `insp-b${idx}`,
        type: 'boundary',
        timeline_range_us: [Math.max(0, b.timeline_t_us - 1_500_000), Math.min(comp.duration_us, b.timeline_t_us + 1_500_000)],
        method: 'context_only',
        evidence: `Boundary ${idx} at ${Math.round(b.timeline_t_us / 1_000_000)}s: outgoing "${b.speech_cues?.outgoing_tail_text ?? ''}" -> incoming "${b.speech_cues?.incoming_head_text ?? ''}" (jump: ${Math.round((b.speech_cues?.source_jump_us ?? 0) / 1_000_000)}s)`,
        assessment: b.speech_cues?.is_mid_word ? 'questionable' : 'natural',
        reason: b.speech_cues?.is_mid_word ? 'Potential speech discontinuity' : 'Natural editorial pacing',
        clip_ids: [b.outgoing_clip.layer_id, b.incoming_clip.layer_id],
      }))

      const review: RoughCutReview = {
        version: 1,
        project_id: project.project_id,
        composition_id: comp.id,
        summary: 'Benchmark A 388.7s rough cut demonstrates strong cohesion. The 7 cut boundaries cleanly excise the picture tangent, Philip Wu false start, and 120s Mr. Miyagi analogy while preserving speech rhythm.',
        total_duration_us: comp.duration_us,
        clip_count: videoLayers.length,
        inspections,
        identified_issues: [],
        ready_for_next_stage: true,
      }

      const val = validateRoughCutReview(review, comp)
      expect(val.valid).toBe(true)
      expect(val.inspections_count).toBe(7)
      expect(val.issues_count).toBe(0)
    })
  })

  describe('9. Benchmark B: Progressive Review of 9-Clip Rough Cut', () => {
    it('progressively inspects multi-clip psychology tutorial and validates review', () => {
      const project = makeProjectWithMedia(BENCHMARK_B_MEDIA, BENCHMARK_B_DURATION_US, REAL_MEDIA_B_PATH)
      compileRoughCutTimeline(project, seededGen(2), BENCHMARK_B_PLAN, { dry_run: false })
      const comp = project.compositions[project.root_id]

      // Progressive Tier 1: Full Context
      const fullCtx = buildTimelineContext(project, { transcriptsDir: TRANSCRIPTS_DIR })
      expect(fullCtx.cut_boundaries.length).toBe(8)

      // Progressive Tier 1: Targeted sub-range (60s to 180s)
      const subCtx = buildTimelineContext(project, {
        range: { start_us: 60_000_000, end_us: 180_000_000 },
        transcriptsDir: TRANSCRIPTS_DIR,
      })
      expect(subCtx.cut_boundaries.length).toBeGreaterThanOrEqual(1)

      const review: RoughCutReview = {
        version: 1,
        project_id: project.project_id,
        composition_id: comp.id,
        summary: 'Benchmark B 9-clip rough cut condenses 18 psychology tricks into a focused 11-minute cut.',
        total_duration_us: comp.duration_us,
        clip_count: 9,
        inspections: [
          {
            id: 'insp-b-scene1',
            type: 'section',
            timeline_range_us: [0, 63_000_000],
            method: 'context_only',
            evidence: 'High-energy hook introduces the 6 psychology checkpoints.',
            assessment: 'natural',
            reason: 'Compelling audience retention hook.',
            clip_ids: [comp.tracks[0].layers[0].id],
          },
        ],
        identified_issues: [],
        ready_for_next_stage: true,
      }

      const val = validateRoughCutReview(review, comp)
      expect(val.valid).toBe(true)
    })
  })

  describe('10. Performance Table: Cold vs Cached Latency', () => {
    it('measures and benchmarks cold vs cached inspection operations', async () => {
      const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
      compileRoughCutTimeline(project, seededGen(1), BENCHMARK_A_PLAN, { dry_run: false })

      // 1. Context extraction
      const t0 = performance.now()
      buildTimelineContext(project, { transcriptsDir: TRANSCRIPTS_DIR })
      const contextColdMs = Math.round(performance.now() - t0)

      const t1 = performance.now()
      buildTimelineContext(project, { transcriptsDir: TRANSCRIPTS_DIR })
      const contextCachedMs = Math.round(performance.now() - t1)

      // 2. Frame inspection
      const t2 = performance.now()
      await inspectTimelineFrame(project, {
        t_us: 10_000_000,
        resourcesPath: path.resolve(__dirname, '../../../resources'),
      })
      const frameColdMs = Math.round(performance.now() - t2)

      const t3 = performance.now()
      await inspectTimelineFrame(project, {
        t_us: 10_000_000,
        resourcesPath: path.resolve(__dirname, '../../../resources'),
      })
      const frameRepeatMs = Math.round(performance.now() - t3)

      // 3. Range renders (5s, 15s)
      const t4 = performance.now()
      const r5Cold = await renderTimelineRange(project, {
        start_us: 0,
        end_us: 5_000_000,
        resourcesPath: path.resolve(__dirname, '../../../resources'),
      })
      expect(r5Cold.duration_us).toBe(5_000_000)
      const render5sColdMs = Math.round(performance.now() - t4)

      const t5 = performance.now()
      const r5Cached = await renderTimelineRange(project, {
        start_us: 0,
        end_us: 5_000_000,
        resourcesPath: path.resolve(__dirname, '../../../resources'),
      })
      const render5sCachedMs = Math.round(performance.now() - t5)
      expect(r5Cached.cached).toBe(true)

      console.log('\n================ SCLIP PHASE 2D PERFORMANCE BENCHMARKS ================')
      console.log(`| Operation                 | Cold Latency | Cached / Repeat Latency |`)
      console.log(`|---------------------------|--------------|-------------------------|`)
      console.log(`| get_timeline_context      | ${contextColdMs} ms       | ${contextCachedMs} ms                  |`)
      console.log(`| inspect_timeline_frame    | ${frameColdMs} ms       | ${frameRepeatMs} ms                  |`)
      console.log(`| render_timeline_range (5s)| ${render5sColdMs} ms       | ${render5sCachedMs} ms                  |`)
      console.log('=======================================================================\n')

      expect(contextColdMs).toBeLessThan(500)
      expect(contextCachedMs).toBeLessThan(100)
      expect(render5sCachedMs).toBeLessThan(50)
    }, 30_000)
  })
})
