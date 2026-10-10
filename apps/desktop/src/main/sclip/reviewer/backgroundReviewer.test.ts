import { describe, it, expect, vi } from 'vitest'
import { BackgroundReviewer } from './backgroundReviewer.js'

function makeMockProject(overrides?: any): any {
  const rootComp: any = {
    id: 'root-comp-id',
    label: 'Root',
    width: 1080,
    height: 1920,
    fps: { num: 60, den: 1 },
    sample_rate: 48000,
    channels: 2,
    color_space: 'SRgb',
    duration_us: 30_000_000,
    background: { r: 0, g: 0, b: 0, a: 1 },
    tracks: [],
    markers: [],
    transitions: [],
    links: [],
    ...overrides,
  }

  return {
    project_id: 'test-proj',
    root_id: 'root-comp-id',
    active_composition_id: 'root-comp-id',
    compositions: { 'root-comp-id': rootComp },
    media_pool: Object.fromEntries(Object.entries(overrides?.media_pool ?? {}).map(([id, m]: [string, any]) => [id, { ...m, metadata: m.metadata ?? { duration_us: 30_000_000 } }])),
    links: {},
    groups: {},
    history: { entries: [{ id: 'commit_1' }] },
  }
}

describe('BackgroundReviewer Audit', () => {
  it('flags captions placed off-screen at bottom', async () => {
    const offscreenCaption: any = {
      id: 'cap-1',
      label: 'Caption',
      track_id: 't-1',
      t_start_us: 1_000_000,
      t_end_us: 4_000_000,
      enabled: true,
      locked: false,
      transform: {
        position: { x: 0, y: 1500 }, // Center is 960 -> 960 + 1500 = 2460 > 1920
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
      params: {
        kind: 'Text',
        text: 'This is offscreen',
      } as any,
    }

    const track: any = {
      id: 't-1',
      label: 'Captions',
      role: 'Caption',
      locked: false,
      muted: false,
      layers: [offscreenCaption],
    }

    const proj = makeMockProject({ tracks: [track] })
    const mockHost = {
      actor: {
        snapshot: () => proj,
        subscribe: vi.fn(),
      },
    } as any

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50)
    const summary = await reviewer.runReview()

    expect(summary.status).toBe('has_issues')
    expect(summary.critical_count).toBe(1)
    expect(summary.issues[0].category).toBe('caption_placement')
    expect(summary.issues[0].description).toContain('estimated Y=1500')
    expect(summary.issues[0].description).toContain('actual rendered bounds are uninspected')
  })

  it('flags overlapping motifs with same vertical alignment', async () => {
    const motif1: any = {
      id: 'm-1',
      label: 'Hook 1',
      track_id: 't-1',
      t_start_us: 0,
      t_end_us: 5_000_000,
      enabled: true,
      locked: false,
      params: {
        kind: 'Motif',
        motif_id: 'text-fx',
        props: { v_align: 'top' },
      } as any,
    }

    const motif2: any = {
      id: 'm-2',
      label: 'Hook 2',
      track_id: 't-2',
      t_start_us: 3_000_000,
      t_end_us: 8_000_000,
      enabled: true,
      locked: false,
      params: {
        kind: 'Motif',
        motif_id: 'text-fx',
        props: { v_align: 'top' },
      } as any,
    }

    const proj = makeMockProject({
      tracks: [
        { id: 't-1', label: 'M1', role: 'Custom' as any, locked: false, muted: false, layers: [motif1] },
        { id: 't-2', label: 'M2', role: 'Custom' as any, locked: false, muted: false, layers: [motif2] },
      ],
    })

    const mockHost = {
      actor: {
        snapshot: () => proj,
        subscribe: vi.fn(),
      },
    } as any

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50)
    const summary = await reviewer.runReview()

    expect(summary.warning_count).toBe(1)
    expect(summary.issues[0].category).toBe('motif_collision')
    expect(summary.issues[0].description).toContain('overlap on timeline')
  })

  it('reports clean on properly configured timeline', async () => {
    const properCaption: any = {
      id: 'cap-good',
      label: 'Good Caption',
      track_id: 't-1',
      t_start_us: 1_000_000,
      t_end_us: 4_000_000,
      enabled: true,
      locked: false,
      transform: {
        position: { x: 0, y: -200 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
      params: {
        kind: 'Text',
        text: 'Visible Caption',
      } as any,
    }

    const proj = makeMockProject({
      tracks: [
        { id: 't-1', label: 'Captions', role: 'Caption', locked: false, muted: false, layers: [properCaption] },
      ],
    })

    const mockHost = {
      actor: {
        snapshot: () => proj,
        subscribe: vi.fn(),
      },
    } as any

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50)
    const summary = await reviewer.runReview()

    expect(summary.status).toBe('clean')
    expect(summary.critical_count).toBe(0)
    expect(summary.issues.length).toBe(0)
  })

  it('flags unreadably small caption font sizes on mobile vertical video', async () => {
    const tinyCaption: any = {
      id: 'cap-tiny',
      label: 'Tiny Caption',
      track_id: 't-1',
      t_start_us: 1_000_000,
      t_end_us: 4_000_000,
      enabled: true,
      locked: false,
      transform: {
        position: { x: 0, y: -200 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
      params: {
        kind: 'Text',
        text: 'Too small',
        font_size: 24, // < 36px threshold
      } as any,
    }

    const proj = makeMockProject({
      tracks: [
        { id: 't-1', label: 'Captions', role: 'Caption', locked: false, muted: false, layers: [tinyCaption] },
      ],
    })

    const mockHost = {
      actor: {
        snapshot: () => proj,
        subscribe: vi.fn(),
      },
    } as any

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50)
    const summary = await reviewer.runReview()

    expect(summary.warning_count).toBe(1)
    expect(summary.issues[0].id).toContain('text_font_small')
    expect(summary.issues[0].description).toContain('too small for mobile')
  })

  it('detects speech chops and audio pops when audio sidecar is connected', async () => {
    const clip1: any = {
      id: 'clip-1',
      label: 'Clip 1',
      track_id: 't-aroll',
      t_start_us: 0,
      t_end_us: 2_000_000,
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: 'm-1' } as any,
    }
    const clip2: any = {
      id: 'clip-2',
      label: 'Clip 2',
      track_id: 't-aroll',
      t_start_us: 2_000_000,
      t_end_us: 5_000_000,
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: 'm-1' } as any,
    }

    const clip3: any = {
      id: 'clip-3',
      label: 'Clip 3',
      track_id: 't-aroll',
      t_start_us: 5_000_000,
      t_end_us: 8_000_000,
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: 'm-1' } as any,
    }
    const clip4: any = {
      id: 'clip-4',
      label: 'Clip 4',
      track_id: 't-aroll',
      t_start_us: 8_000_000,
      t_end_us: 12_000_000,
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: 'm-1' } as any,
    }

    const proj = makeMockProject({
      tracks: [
        {
          id: 't-aroll',
          label: 'A-Roll',
          role: 'ARoll',
          locked: false,
          muted: false,
          layers: [clip1, clip2, clip3, clip4],
        },
      ],
    })
    proj.media_pool['m-1'] = {
      metadata: { duration_us: 30_000_000 },
      transcript: {
        segments: [
          {
            words: [{ text: 'Haaland', t_start_us: 1_800_000, t_end_us: 2_200_000 }],
          },
        ],
      },
    } as any

    const mockHost = {
      actor: {
        snapshot: () => proj,
        subscribe: vi.fn(),
      },
    } as any

    const mockVisionSidecar = {
      analyzeAudio: vi.fn().mockResolvedValue({
        ok: true,
        duration_s: 5.0,
        tempo_bpm: 120,
        beat_sync_rate: 0.2, // < 0.35 trigger
        speech_chops: [
          {
            cut_t_us: 2_000_000,
            word: 'Haaland',
            severity: 'critical',
            description: "Cut at 2.00s cuts off speech mid-word on 'Haaland'",
            suggested_action: 'Shift cut boundary',
          },
        ],
        audio_pops: [
          {
            cut_t_us: 2_000_000,
            severity: 'warning',
            description: 'Audible click/pop detected at cut 2.00s',
            suggested_action: 'Apply crossfade',
          },
        ],
        awkward_silences: [],
      }),
    } as any

    const mockRangeRenderer = vi.fn().mockResolvedValue({
      path: '/tmp/test.wav',
      duration_us: 5_000_000,
      has_audio: true,
      cached: true,
    })

    const reviewer = new BackgroundReviewer(mockHost, mockVisionSidecar, 50, mockRangeRenderer, undefined, undefined, { localPerception: () => true })
    const summary = await reviewer.runReview()

    expect(summary.status).toBe('has_issues')
    expect(summary.critical_count).toBe(1)
    expect(summary.issues.some((i) => i.category === 'audio_cutoff' && i.severity === 'critical')).toBe(true)
    expect(summary.issues.some((i) => i.id.startsWith('pop_'))).toBe(true)
    expect(summary.issues.some((i) => i.id === 'beat_misaligned')).toBe(true)
  })

  it('detects cross-modal energy mismatch when audio roar meets static visuals', async () => {
    const proj = makeMockProject({
      tracks: [
        {
          id: 't-aroll',
          label: 'A-Roll',
          role: 'ARoll',
          locked: false,
          muted: false,
          layers: [
            { id: 'c1', label: '1', track_id: 't-aroll', t_start_us: 0, t_end_us: 2_000_000, enabled: true, locked: false, params: { kind: 'VideoClip' } as any } as any,
            { id: 'c2', label: '2', track_id: 't-aroll', t_start_us: 2_000_000, t_end_us: 5_000_000, enabled: true, locked: false, params: { kind: 'VideoClip' } as any } as any,
          ],
        },
      ],
    })

    const mockHost = {
      actor: { snapshot: () => proj, subscribe: vi.fn() },
    } as any

    const mockVisionSidecar = {
      analyzeAudio: vi.fn().mockResolvedValue({
        ok: true,
        duration_s: 5.0,
        tempo_bpm: 120,
        crowd_cheers: [{ start_us: 1_000_000, end_us: 3_000_000, duration_s: 2.0 }],
        speech_chops: [],
        audio_pops: [],
        awkward_silences: [],
      }),
      inspectSequence: vi.fn().mockResolvedValue({
        ok: true,
        raw_critique: 'The frames show a static view of the coach bench with no action taking place.',
      }),
    } as any

    // Mock rangeRenderer that writes dummy files so extractFrameAtTime finds them
    const tmpVideo = '/tmp/mock_test_video.mp4'
    const mockRangeRenderer = vi.fn().mockResolvedValue({
      path: tmpVideo,
      duration_us: 5_000_000,
      has_audio: true,
      cached: true,
    })

    const mockFrameExtractor = vi.fn().mockResolvedValue(true)

    const reviewer = new BackgroundReviewer(mockHost, mockVisionSidecar, 50, mockRangeRenderer, mockFrameExtractor, undefined, { localPerception: () => true })
    const summary = await reviewer.runReview()

    expect(summary.issues.some((i) => i.category === 'energy_mismatch')).toBe(true)
    const mismatch = summary.issues.find((i) => i.category === 'energy_mismatch')
    expect(mismatch?.description).toContain('Stadium crowd roar detected')
    expect(mismatch?.suggested_action).toContain('intentional')
  })
})

describe('Hard Enforcement Gate (server.ts)', () => {
  it('legacy dispatcher no longer forces repair from ungrounded critical warnings', async () => {
    const { handleCallTool } = await import('../../mcp/server.js')
    const end = vi.fn()
    const host = { agent: { end }, actor: { snapshot: () => makeMockProject() } } as any
    const result = await handleCallTool({} as any, () => host, 'end_agent_session', {})
    expect(result).not.toHaveProperty('isError')
    expect(end).toHaveBeenCalledWith('agent')
    // The registered MCP path owns guarded completion; cache severity never chooses an edit.
  })

  it('flags video clips that do not fill the composition canvas (partial screen / corner floating)', async () => {
    const unscaledClip: any = {
      id: 'clip-unscaled',
      label: 'Unscaled 720p',
      track_id: 't-1',
      t_start_us: 0,
      t_end_us: 5_000_000,
      enabled: true,
      locked: false,
      transform: {
        position: { mode: 'XY', x: { mode: 'Static', value: 0 }, y: { mode: 'Static', value: 0 } },
        scale_x: { mode: 'Static', value: 1.0 },
        scale_y: { mode: 'Static', value: 1.0 },
      },
      params: {
        kind: 'VideoClip',
        media: 'media-720p',
      } as any,
    }

    const proj = makeMockProject({
      width: 1080,
      height: 1920,
      tracks: [
        { id: 't-1', label: 'Video', role: 'Custom' as any, locked: false, muted: false, layers: [unscaledClip] },
      ],
      media_pool: {
        'media-720p': {
          id: 'media-720p',
          metadata: {
            video: { width: 1280, height: 720 },
          },
        },
      },
    })

    const mockHost = {
      actor: {
        snapshot: () => proj,
        subscribe: vi.fn(),
      },
    } as any

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50)
    const summary = await reviewer.runReview()

    expect(summary.status).toBe('has_issues')
    expect(summary.warning_count).toBe(1)
    expect(summary.issues[0].category).toBe('visual_framing')
    expect(summary.issues[0].id).toContain('video_coverage')
    expect(summary.issues[0].description).toContain('does not fill the screen')

    // Also verify auditSynchronous returns the exact same critique immediately
    const syncSummary = reviewer.auditSynchronous()
    expect(syncSummary.status).toBe('has_issues')
    expect(syncSummary.warning_count).toBe(1)
    expect(syncSummary.issues[0].id).toContain('video_coverage')
  })
})


describe('Jev Narrative Coherence Audit', () => {
  function makeArollProject(transcriptA: string[], transcriptB: string[]) {
    const makeWords = (words: string[], baseUs: number) =>
      words.map((w, i) => ({
        text: w,
        t_start_us: baseUs + i * 300_000,
        t_end_us: baseUs + i * 300_000 + 250_000,
      }))

    const clip1: any = {
      id: 'clip-a',
      label: 'Clip A',
      track_id: 't-aroll',
      t_start_us: 0,
      t_end_us: 3_000_000,
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: 'media-a', in_point_us: 0 } as any,
    }
    const clip2: any = {
      id: 'clip-b',
      label: 'Clip B',
      track_id: 't-aroll',
      t_start_us: 3_000_000,
      t_end_us: 6_000_000,
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: 'media-b', in_point_us: 0 } as any,
    }

    const proj = makeMockProject({
      tracks: [
        { id: 't-aroll', label: 'A-Roll', role: 'ARoll', locked: false, muted: false, layers: [clip1, clip2] },
      ],
      media_pool: {
        'media-a': {
          id: 'media-a',
          transcript: { segments: [{ words: makeWords(transcriptA, 0) }] },
        },
        'media-b': {
          id: 'media-b',
          transcript: { segments: [{ words: makeWords(transcriptB, 0) }] },
        },
      },
    })
    return proj
  }

  it('flags a broken thought (dangling sentence) via Jev when score >= 0.72', async () => {
    const proj = makeArollProject(
      ['and', 'then', 'if', 'you', 'look', 'at', 'the', 'numbers', 'which', 'show'],
      ['the', 'weather', 'is', 'great', 'today'],
    )

    const mockHost = {
      actor: { snapshot: () => proj, subscribe: vi.fn() },
    } as any

    const mockJev = vi.fn().mockResolvedValue({
      answers: { broken_0: 0.85, whiplash_0: 0.1 },
      id: 'test-jev-1',
      model: 'typesafe/jev-1.13',
      usage: { input_tokens: 50, cost: 0.001 },
      latency_ms: 100,
    })

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50, undefined, undefined, mockJev, { jev: () => true })
    const summary = await reviewer.runReview()

    expect(mockJev).toHaveBeenCalledOnce()
    expect(summary.issues.some((i) => i.id.startsWith('broken_thought_'))).toBe(true)
    const broken = summary.issues.find((i) => i.id.startsWith('broken_thought_'))
    expect(broken?.category).toBe('audio_cutoff')
    expect(broken?.description).toContain('Frankenbite')
    expect(broken?.description).toContain('uncalibrated Jev score 0.85')
  })

  it('flags narrative whiplash (abrupt topic jump) via Jev when score >= 0.72', async () => {
    const proj = makeArollProject(
      ['I', 'love', 'making', 'pasta', 'every', 'weekend'],
      ['the', 'rocket', 'launched', 'at', 'dawn', 'successfully'],
    )

    const mockHost = {
      actor: { snapshot: () => proj, subscribe: vi.fn() },
    } as any

    const mockJev = vi.fn().mockResolvedValue({
      answers: { broken_0: 0.1, whiplash_0: 0.9 },
      id: 'test-jev-2',
      model: 'typesafe/jev-1.13',
      usage: { input_tokens: 60, cost: 0.001 },
      latency_ms: 120,
    })

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50, undefined, undefined, mockJev, { jev: () => true })
    const summary = await reviewer.runReview()

    expect(summary.issues.some((i) => i.id.startsWith('narrative_whiplash_'))).toBe(true)
    const whiplash = summary.issues.find((i) => i.id.startsWith('narrative_whiplash_'))
    expect(whiplash?.category).toBe('pacing')
    expect(whiplash?.description).toContain('whiplash')
    expect(whiplash?.description).toContain('uncalibrated Jev score 0.90')
  })

  it('does not flag anything when both Jev scores are below threshold', async () => {
    const proj = makeArollProject(
      ['The', 'battery', 'lasts', 'all', 'day'],
      ['It', 'also', 'charges', 'super', 'fast'],
    )

    const mockHost = {
      actor: { snapshot: () => proj, subscribe: vi.fn() },
    } as any

    const mockJev = vi.fn().mockResolvedValue({
      answers: { broken_0: 0.2, whiplash_0: 0.15 },
      id: 'test-jev-3',
      model: 'typesafe/jev-1.13',
      usage: { input_tokens: 40, cost: 0.0005 },
      latency_ms: 80,
    })

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50, undefined, undefined, mockJev, { jev: () => true })
    const summary = await reviewer.runReview()

    expect(
      summary.issues.filter((i) => i.id.startsWith('broken_thought_') || i.id.startsWith('narrative_whiplash_')),
    ).toHaveLength(0)
  })

  it('gracefully skips narrative audit when jevDecide is not provided', async () => {
    const proj = makeArollProject(
      ['and', 'then', 'which', 'means'],
      ['rockets', 'are', 'cool'],
    )

    const mockHost = {
      actor: { snapshot: () => proj, subscribe: vi.fn() },
    } as any

    // No jevDecide passed — should run normally without errors
    const reviewer = new BackgroundReviewer(mockHost, undefined, 50)
    const summary = await reviewer.runReview()

    expect(
      summary.issues.filter((i) => i.id.startsWith('broken_thought_') || i.id.startsWith('narrative_whiplash_')),
    ).toHaveLength(0)
  })

  it('gracefully handles Jev errors without crashing the reviewer', async () => {
    const proj = makeArollProject(
      ['hello', 'world'],
      ['foo', 'bar'],
    )

    const mockHost = {
      actor: { snapshot: () => proj, subscribe: vi.fn() },
    } as any

    const mockJevThatThrows = vi.fn().mockRejectedValue(new Error('Jev provider HTTP 429 (credit/key spending limit)'))

    const reviewer = new BackgroundReviewer(mockHost, undefined, 50, undefined, undefined, mockJevThatThrows, { jev: () => true })
    // Should not throw
    const summary = await reviewer.runReview()

    expect(
      summary.issues.filter((i) => i.id.startsWith('broken_thought_') || i.id.startsWith('narrative_whiplash_')),
    ).toHaveLength(0)
  })
})
