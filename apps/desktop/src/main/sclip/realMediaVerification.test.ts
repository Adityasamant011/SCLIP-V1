import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import { BackgroundReviewer } from './reviewer/backgroundReviewer.js'
import { handleCallTool } from '../mcp/server.js'

describe('End-to-End Real Media & Prompt Editing Test', () => {
  const mediaPath = '/Users/adityasamant/Documents/1/Mega test/Media/Raw Talking head tutorial video for editing practice.mp4'
  const transcriptPath = '/Users/adityasamant/Documents/1/Mega test/Cache/transcripts/c92f4e2dba7eb0f69227db8819cea743674b4c37063d60a326182772d6368a5f.json'

  const realTranscript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'))
  const mediaId = 'real-media-talking-head'

  function makeProjectWithMedia(tracks: any[] = []): any {
    const rootComp: any = {
      id: 'root-comp-id',
      label: 'Root Vertical Short',
      width: 1080,
      height: 1920,
      fps: { num: 30, den: 1 },
      sample_rate: 48000,
      channels: 2,
      color_space: 'SRgb',
      duration_us: 40_000_000,
      background: { r: 0, g: 0, b: 0, a: 1 },
      tracks,
      markers: [],
      transitions: [],
      links: [],
    }

    return {
      project_id: 'real-media-test-project',
      root_id: 'root-comp-id',
      active_composition_id: 'root-comp-id',
      compositions: { 'root-comp-id': rootComp },
      media_pool: {
        [mediaId]: {
          id: mediaId,
          label: 'Raw Talking Head Tutorial',
          path_abs: mediaPath,
          kind: 'Video',
          metadata: {
            duration_us: realTranscript.source_duration_us,
            video: { width: 1280, height: 720 },
          },
          transcript: realTranscript,
        },
      },
      links: {},
      groups: {},
      history: { entries: [{ id: 'commit_test_1' }] },
    }
  }

  it('SCENARIO 1 (Naive Unassisted Edit): Catches visual pillarboxing, mid-word speech chops, and off-screen captions; blocks session completion via Hard Gate', async () => {
    // 1. Raw 16:9 video placed in 9:16 vertical canvas without cover scale (maxScale = 1.0)
    // 2. Cut placed blindly at t = 15.20s (right inside the word 'succeed', which runs from 15.05s to 15.54s)
    const clip1: any = {
      id: 'clip-bad-1',
      label: 'Clip 1',
      track_id: 't-aroll',
      t_start_us: 0,
      t_end_us: 15_200_000,
      enabled: true,
      locked: false,
      params: {
        kind: 'VideoClip',
        media: mediaId,
        transform: {
          scale: { x: 1.0, y: 1.0 }, // Not reframed for vertical short!
          position: { x: 0, y: 0 },
        },
      } as any,
    }

    const clip2: any = {
      id: 'clip-bad-2',
      label: 'Clip 2',
      track_id: 't-aroll',
      t_start_us: 15_200_000,
      t_end_us: 35_000_000,
      enabled: true,
      locked: false,
      params: {
        kind: 'VideoClip',
        media: mediaId,
        transform: {
          scale: { x: 1.0, y: 1.0 },
          position: { x: 0, y: 0 },
        },
      } as any,
    }

    // 3. Captions placed off-screen at bottom with tiny font
    const badCaption: any = {
      id: 'cap-bad-1',
      label: 'Off-screen Caption',
      track_id: 't-captions',
      t_start_us: 0,
      t_end_us: 5_000_000,
      enabled: true,
      locked: false,
      transform: {
        position: { x: 0, y: 1200 }, // Center is 960 -> 960 + 1200 = 2160 > 1920 (OFF-SCREEN)
      },
      params: {
        kind: 'Text',
        font_size: 22, // Too small for mobile (< 36px threshold)
        text: 'The number one reason why people fail',
      } as any,
    }

    const project = makeProjectWithMedia([
      {
        id: 't-aroll',
        label: 'A-Roll',
        role: 'ARoll',
        locked: false,
        muted: false,
        layers: [clip1, clip2],
      },
      {
        id: 't-captions',
        label: 'Captions',
        role: 'Caption',
        locked: false,
        muted: false,
        layers: [badCaption],
      },
    ])

    const mockHost = {
      actor: { snapshot: () => project, subscribe: vi.fn() },
      agent: { begin: vi.fn(), end: vi.fn(), lock: vi.fn(), unlock: vi.fn() },
    } as any

    const mockVisionSidecar = {
      analyzeAudio: vi.fn().mockImplementation(async (req) => {
        // Find if any cuts slice through word boundaries
        const chops = []
        const cutTimestamps = req.cutTimestampsUs ?? req.cut_timestamps_us ?? []
        for (const cutUs of cutTimestamps) {
          for (const seg of realTranscript.segments) {
            for (const w of seg.words) {
              if (cutUs > w.t_start_us && cutUs < w.t_end_us) {
                chops.push({
                  cut_t_us: cutUs,
                  word: w.text,
                  severity: 'critical',
                  description: `Cut at ${(cutUs / 1e6).toFixed(2)}s cuts off speech mid-word on '${w.text}'`,
                  suggested_action: `Shift cut boundary by ${((w.t_end_us - cutUs) / 1000).toFixed(0)}ms`,
                })
              }
            }
          }
        }
        return {
          ok: true,
          duration_s: 35.0,
          tempo_bpm: 110,
          speech_chops: chops,
          audio_pops: [],
          awkward_silences: [],
        }
      }),
      inspectSequence: vi.fn().mockResolvedValue({ ok: true, raw_critique: 'Horizontal video has black bars' }),
    } as any

    const mockRangeRenderer = vi.fn().mockResolvedValue({
      path: '/tmp/test_bad_audio.wav',
      duration_us: 35_000_000,
      has_audio: true,
      cached: true,
    })

    const reviewer = new BackgroundReviewer(mockHost, mockVisionSidecar, 50, mockRangeRenderer)
    const review = await reviewer.runReview()

    // VERIFY: The systems caught every single flaw!
    expect(review.status).toBe('has_issues')
    expect(review.critical_count).toBe(2) // 1. Off-screen caption, 2. Mid-word speech chop on 'succeed'
    expect(review.warning_count).toBe(1)  // 1. Font size 22px too small for mobile
    expect(review.suggestion_count).toBe(2) // 2. Video clips scaled at 1.0x leaving black pillarboxes

    const chopIssue = review.issues.find((i) => i.category === 'audio_cutoff')
    expect(chopIssue?.description).toContain("cuts off speech mid-word on 'succeed")

    const offscreenIssue = review.issues.find((i) => i.id === 'text_offscreen_cap-bad-1')
    expect(offscreenIssue?.description).toContain('rendering it below the bottom edge')

    const smallFontIssue = review.issues.find((i) => i.id === 'text_font_small_cap-bad-1')
    expect(smallFontIssue?.description).toContain('too small for mobile')

    const pillarboxIssue = review.issues.find((i) => i.category === 'visual_framing')
    expect(pillarboxIssue?.description).toContain('leaves large black pillarboxes')

    // VERIFY: Hard Enforcement Gate refuses to let Hermes complete this session!
    const finishAttempt = await handleCallTool(
      {} as any,
      () => mockHost,
      'end_agent_session',
      { session_id: 's_test_1', project_id: 'real-media-test-project', status: 'finished' },
      () => null,
      undefined,
      undefined,
      () => null,
      () => reviewer.getSummary(),
    )

    expect((finishAttempt as any).isError).toBe(true)
    expect((finishAttempt as any).content[0].text).toContain('Background AI Reviewer detected 2 critical issue(s)')
  })

  it('SCENARIO 2 (Sclip Multi-Sensory Assisted Edit): Reframes 2.67x cover, aligns cuts to speech silence pauses, applies high-taste 72px captions, passes all audits and unlocks Hard Gate', async () => {
    // 1. Precise cut selections on natural silence boundaries:
    //    - Clip 1: 0.0s to 7.30s (Intro hook: "Alright, so I want to spend a few minutes talking about the number one reason why people fail, okay?")
    //    - Clip 2: 10.18s to 15.54s (Question: "what are the reasons why people don't succeed?")
    //    - Clip 3: 136.32s to 143.92s (Payoff: "they jump from thing to thing... They're not following a step-by-step process to the end.")
    const coverTransform = {
      scale: { x: 2.667, y: 2.667 }, // Cover fit for 1280x720 in 1080x1920 (no black bars!)
      position: { x: 0, y: 0 },
      rotation: 0,
      opacity: 1,
    }

    const c1: any = {
      id: 'c-clean-1',
      label: 'Hook',
      track_id: 't-aroll',
      t_start_us: 0,
      t_end_us: 7_300_000,
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: mediaId, transform: coverTransform } as any,
    }

    const c2: any = {
      id: 'c-clean-2',
      label: 'Core Question',
      track_id: 't-aroll',
      t_start_us: 7_300_000,
      t_end_us: 12_660_000, // 5.36s duration
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: mediaId, transform: coverTransform } as any,
    }

    const c3: any = {
      id: 'c-clean-3',
      label: 'Payoff',
      track_id: 't-aroll',
      t_start_us: 12_660_000,
      t_end_us: 20_260_000, // 7.60s duration
      enabled: true,
      locked: false,
      params: { kind: 'VideoClip', media: mediaId, transform: coverTransform } as any,
    }

    // 2. High-taste vertical captions: 72px bold, lower third Y=-220, dark outline
    const styledCaption: any = {
      id: 'cap-styled-1',
      label: 'Hook Caption',
      track_id: 't-captions',
      t_start_us: 0,
      t_end_us: 7_300_000,
      enabled: true,
      locked: false,
      transform: {
        position: { x: 0, y: -220 }, // Safe lower third zone
      },
      params: {
        kind: 'Text',
        font_size: 72, // High mobile readability
        text: 'The #1 Reason People Fail',
      } as any,
    }

    const project = makeProjectWithMedia([
      {
        id: 't-aroll',
        label: 'A-Roll',
        role: 'ARoll',
        locked: false,
        muted: false,
        layers: [c1, c2, c3],
      },
      {
        id: 't-captions',
        label: 'Captions',
        role: 'Caption',
        locked: false,
        muted: false,
        layers: [styledCaption],
      },
    ])

    const mockHost = {
      actor: { snapshot: () => project, subscribe: vi.fn() },
      agent: {
        begin: vi.fn(),
        end: vi.fn().mockReturnValue({ session_id: 's_test_clean', status: 'finished' }),
        lock: vi.fn(),
        unlock: vi.fn(),
      },
    } as any

    const mockVisionSidecar = {
      analyzeAudio: vi.fn().mockResolvedValue({
        ok: true,
        duration_s: 20.26,
        tempo_bpm: 118,
        speech_chops: [], // Zero speech chops!
        audio_pops: [],
        awkward_silences: [],
      }),
      inspectSequence: vi.fn().mockResolvedValue({
        ok: true,
        raw_critique: 'Speaker is well-centered in vertical framing, stable composition and clear focus.',
      }),
    } as any

    const mockRangeRenderer = vi.fn().mockResolvedValue({
      path: '/tmp/test_clean_audio.wav',
      duration_us: 20_260_000,
      has_audio: true,
      cached: true,
    })

    const reviewer = new BackgroundReviewer(mockHost, mockVisionSidecar, 50, mockRangeRenderer)
    const review = await reviewer.runReview()

    // VERIFY: Pristine review summary
    expect(review.status).toBe('clean')
    expect(review.critical_count).toBe(0)
    expect(review.warning_count).toBe(0)
    expect(review.total_issues).toBe(0)

    // VERIFY: Hard Enforcement Gate opens and successfully ends session!
    const finishAttempt = await handleCallTool(
      {} as any,
      () => mockHost,
      'end_agent_session',
      { session_id: 's_test_clean', project_id: 'real-media-test-project', status: 'finished' },
      () => null,
      undefined,
      undefined,
      () => null,
      () => reviewer.getSummary(),
    )

    expect((finishAttempt as any).isError).toBeFalsy()
    expect(mockHost.agent.end).toHaveBeenCalledWith('agent')
  })

  it('SCENARIO 3 (Audio-Visual Cross-Modal Alignment in Action): Detects energy mismatch when high-energy audio meets static visuals, and resolves when dynamic action is applied', async () => {
    const project = makeProjectWithMedia([
      {
        id: 't-aroll',
        label: 'A-Roll',
        role: 'ARoll',
        locked: false,
        muted: false,
        layers: [
          {
            id: 'c-static',
            label: 'Static Clip',
            track_id: 't-aroll',
            t_start_us: 0,
            t_end_us: 5_000_000,
            enabled: true,
            locked: false,
            params: { kind: 'VideoClip', media: mediaId, transform: { scale: { x: 2.667, y: 2.667 } } } as any,
          },
          {
            id: 'c-cont',
            label: 'Next Clip',
            track_id: 't-aroll',
            t_start_us: 5_000_000,
            t_end_us: 10_000_000,
            enabled: true,
            locked: false,
            params: { kind: 'VideoClip', media: mediaId, transform: { scale: { x: 2.667, y: 2.667 } } } as any,
          },
        ],
      },
    ])

    const mockHost = {
      actor: { snapshot: () => project, subscribe: vi.fn() },
    } as any

    // 1. Audio has intense stadium cheer from 1.0s to 3.0s, but VLM reports static frame
    const mockVisionSidecarMismatched = {
      analyzeAudio: vi.fn().mockResolvedValue({
        ok: true,
        duration_s: 10.0,
        tempo_bpm: 124,
        crowd_cheers: [{ start_us: 1_000_000, end_us: 3_000_000, duration_s: 2.0 }],
        speech_chops: [],
        audio_pops: [],
        awkward_silences: [],
      }),
      inspectSequence: vi.fn().mockResolvedValue({
        ok: true,
        raw_critique: 'The footage shows a completely motionless, static view of a microphone on a desk.',
      }),
    } as any

    const mockRangeRenderer = vi.fn().mockResolvedValue({
      path: '/tmp/test_crossmodal.mp4',
      duration_us: 10_000_000,
      has_audio: true,
      cached: true,
    })

    const mockFrameExtractor = vi.fn().mockResolvedValue(true)

    const reviewerMismatched = new BackgroundReviewer(
      mockHost,
      mockVisionSidecarMismatched,
      50,
      mockRangeRenderer,
      mockFrameExtractor,
    )
    const reviewMismatched = await reviewerMismatched.runReview()

    // VERIFY: Cross-modal engine flags energy mismatch!
    expect(reviewMismatched.issues.some((i) => i.category === 'energy_mismatch')).toBe(true)
    const issue = reviewMismatched.issues.find((i) => i.category === 'energy_mismatch')
    expect(issue?.description).toContain('Stadium crowd roar detected')
    expect(issue?.suggested_action).toContain('dynamic action B-roll')

    // 2. Now simulate editor fixing the issue by placing dynamic action B-roll during the surge:
    const mockVisionSidecarResolved = {
      analyzeAudio: vi.fn().mockResolvedValue({
        ok: true,
        duration_s: 10.0,
        tempo_bpm: 124,
        crowd_cheers: [{ start_us: 1_000_000, end_us: 3_000_000, duration_s: 2.0 }],
        speech_chops: [],
        audio_pops: [],
        awkward_silences: [],
      }),
      inspectSequence: vi.fn().mockResolvedValue({
        ok: true,
        raw_critique: 'Fast-paced, dynamic action footage with high motion and cheering crowd visible.',
      }),
    } as any

    const reviewerResolved = new BackgroundReviewer(
      mockHost,
      mockVisionSidecarResolved,
      50,
      mockRangeRenderer,
      mockFrameExtractor,
    )
    const reviewResolved = await reviewerResolved.runReview()

    // VERIFY: The issue is resolved when visuals match the audio energy!
    expect(reviewResolved.issues.some((i) => i.category === 'energy_mismatch')).toBe(false)
  })
})
