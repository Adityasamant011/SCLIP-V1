import { describe, it, expect } from 'vitest'
import { validateRoughCutPlan, type RoughCutPlan } from './roughCutPlan.js'

describe('validateRoughCutPlan', () => {
  const validPlan: RoughCutPlan = {
    version: 1,
    brief: {
      goal: 'Create a concise 5-minute tutorial on funnel building',
      audience: 'Beginner online entrepreneurs',
      target_duration_us: 120_000_000,
      tone: ['direct', 'encouraging', 'practical'],
    },
    source_summary: 'Speaker presents an introduction to funnel mindset and gives a concrete case study.',
    editorial_thesis: 'Focus on the single-mentor principle and the Brandon/Kaylin case study while trimming the extended Miyagi tangent.',
    sections: [
      {
        id: 'opening',
        purpose: 'State the core problem: why beginners fail by trying two blueprints',
        clips: [
          {
            media_id: 'media-001',
            source_start_us: 0,
            source_end_us: 45_000_000,
            action: 'keep',
            reason: 'Opening hook clearly establishes the problem and speaker credibility',
          },
        ],
      },
      {
        id: 'case_study',
        purpose: 'Provide proof through the Brandon & Kaylin Poulin story',
        clips: [
          {
            media_id: 'media-001',
            source_start_us: 248_000_000,
            source_end_us: 323_000_000,
            action: 'keep',
            reason: 'Concrete evidence showing exact execution of the first step',
          },
        ],
      },
    ],
    removed_ranges: [
      {
        media_id: 'media-001',
        source_start_us: 45_000_000,
        source_end_us: 100_000_000,
        reason: 'Overly long repetition of puzzle metaphor without new tactical information',
      },
    ],
    estimated_duration_us: 120_000_000, // 45s + 75s = 120s
    uncertainties: ['Verify whether audio in case study section has a click at 270s'],
  }

  const mediaPool = {
    'media-001': { duration_us: 600_000_000 },
  }

  it('passes a fully valid plan', () => {
    const res = validateRoughCutPlan(validPlan, mediaPool)
    expect(res.valid).toBe(true)
    expect(res.errors).toHaveLength(0)
    expect(res.clip_count).toBe(2)
    expect(res.removed_count).toBe(1)
    expect(res.calculated_duration_us).toBe(120_000_000)
  })

  it('rejects non-object or null plan', () => {
    expect(validateRoughCutPlan(null).valid).toBe(false)
    expect(validateRoughCutPlan(undefined).valid).toBe(false)
    expect(validateRoughCutPlan('string').valid).toBe(false)
    expect(validateRoughCutPlan([1, 2, 3]).valid).toBe(false)
  })

  it('rejects unsupported schema version', () => {
    const invalid = { ...validPlan, version: 2 }
    const res = validateRoughCutPlan(invalid)
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('Unsupported plan version: expected 1, got 2')
  })

  it('rejects missing or malformed brief', () => {
    const noGoal = {
      ...validPlan,
      brief: { ...validPlan.brief, goal: '  ' },
    }
    expect(validateRoughCutPlan(noGoal).valid).toBe(false)

    const negDuration = {
      ...validPlan,
      brief: { ...validPlan.brief, target_duration_us: -5 },
    }
    expect(validateRoughCutPlan(negDuration).valid).toBe(false)

    const emptyTone = {
      ...validPlan,
      brief: { ...validPlan.brief, tone: [] },
    }
    expect(validateRoughCutPlan(emptyTone).valid).toBe(false)
  })

  it('rejects missing editorial summary or thesis', () => {
    const noThesis = { ...validPlan, editorial_thesis: '' }
    expect(validateRoughCutPlan(noThesis).valid).toBe(false)
  })

  it('rejects duplicate section IDs', () => {
    const dupSections = {
      ...validPlan,
      sections: [
        validPlan.sections[0],
        { ...validPlan.sections[0], purpose: 'Another section with same ID' },
      ],
      estimated_duration_us: 90_000_000,
    }
    const res = validateRoughCutPlan(dupSections)
    expect(res.valid).toBe(false)
    expect(res.errors.some(e => e.includes('Duplicate section id'))).toBe(true)
  })

  it('rejects unknown media ID when mediaPool is provided', () => {
    const badMedia = {
      ...validPlan,
      sections: [
        {
          ...validPlan.sections[0],
          clips: [
            {
              ...validPlan.sections[0].clips[0],
              media_id: 'ghost-media-999',
            },
          ],
        },
      ],
      estimated_duration_us: 45_000_000,
    }
    const res = validateRoughCutPlan(badMedia, mediaPool)
    expect(res.valid).toBe(false)
    expect(res.errors.some(e => e.includes('ghost-media-999'))).toBe(true)
  })

  it('rejects negative timestamps and inverted ranges (start >= end)', () => {
    const inverted = {
      ...validPlan,
      sections: [
        {
          ...validPlan.sections[0],
          clips: [
            {
              ...validPlan.sections[0].clips[0],
              source_start_us: 50_000_000,
              source_end_us: 20_000_000,
            },
          ],
        },
      ],
      estimated_duration_us: 0,
    }
    const res = validateRoughCutPlan(inverted)
    expect(res.valid).toBe(false)
    expect(res.errors.some(e => e.includes('strictly less than'))).toBe(true)
  })

  it('rejects clip boundaries exceeding source media duration', () => {
    const overDuration = {
      ...validPlan,
      sections: [
        {
          ...validPlan.sections[0],
          clips: [
            {
              ...validPlan.sections[0].clips[0],
              source_start_us: 500_000_000,
              source_end_us: 700_000_000, // media-001 duration is 600s
            },
          ],
        },
      ],
      estimated_duration_us: 200_000_000,
    }
    const res = validateRoughCutPlan(overDuration, mediaPool)
    expect(res.valid).toBe(false)
    expect(res.errors.some(e => e.includes('exceeds media duration'))).toBe(true)
  })

  it('rejects duplicate exact clip spans', () => {
    const dupSpan = {
      ...validPlan,
      sections: [
        {
          id: 's1',
          purpose: 'part 1',
          clips: [validPlan.sections[0].clips[0]],
        },
        {
          id: 's2',
          purpose: 'part 2',
          clips: [validPlan.sections[0].clips[0]], // same clip span
        },
      ],
      estimated_duration_us: 90_000_000,
    }
    const res = validateRoughCutPlan(dupSpan)
    expect(res.valid).toBe(false)
    expect(res.errors.some(e => e.includes('duplicate exact clip span'))).toBe(true)
  })

  it('rejects duration mismatch between estimated_duration_us and sum of clips', () => {
    const wrongMath = {
      ...validPlan,
      estimated_duration_us: 999_999_999, // sum is actually 120s
    }
    const res = validateRoughCutPlan(wrongMath)
    expect(res.valid).toBe(false)
    expect(res.errors.some(e => e.includes('does not match sum of kept clips'))).toBe(true)
  })

  it('is strictly read-only and causes zero mutations', () => {
    const originalJson = JSON.stringify(validPlan)
    const originalMediaPoolJson = JSON.stringify(mediaPool)

    validateRoughCutPlan(validPlan, mediaPool)

    expect(JSON.stringify(validPlan)).toBe(originalJson)
    expect(JSON.stringify(mediaPool)).toBe(originalMediaPoolJson)
  })

  it('validates Benchmark B rough cut plan against real media duration and invariants', () => {
    const mediaId = '64bf989a-d63d-4a94-94c4-77a26bb050f0'
    const vlogMediaPool = {
      [mediaId]: { duration_us: 1314010794 }
    }
    const benchBPlan: RoughCutPlan = {
      version: 1,
      brief: {
        goal: 'Create engaging 8-12 minute YouTube first cut for viewers new to this topic',
        audience: 'New viewers interested in lifestyle, family vlogs, and Future Self brand updates',
        target_duration_us: 600000000,
        tone: ['lifestyle', 'family', 'engaging', 'warm'],
      },
      source_summary: 'Raw 21.9-minute family morning vlog containing domestic chaos, kid play, breakfast making, art appreciation, a major Future Self tracksuit product launch announcement, a greenhouse garden update with chili jam storytelling, and a philosophical Q&A reflection on time and mundane moments.',
      editorial_thesis: 'For new viewers, lead directly with the high-energy, high-substance FS Tracksuit launch as the hook, transition into the charming and authentic greenhouse chili jam story, and conclude with the thoughtful Q&A reflection on cherishing time. Eliminate the ambient domestic noise, repetitive toddler games, and car-travel chatter to deliver a tight 11.6-minute narrative experience.',
      sections: [
        {
          id: 'fs-tracksuits-launch',
          purpose: 'Hook new viewers with the high-stakes product launch announcement, backstory, and detailed colorway showcase',
          clips: [
            {
              media_id: mediaId,
              source_start_us: 617400000,
              source_end_us: 850400000,
              action: 'keep',
              reason: 'Strongest content for new viewers — clear narrative arc from excitement to official announcement, Instagram leak backstory, production lead times, and practical sizing/colorway advice (plum, sky, moss).',
            },
          ],
        },
        {
          id: 'garden-chili-jam',
          purpose: 'Show authentic creator lifestyle through a self-contained, humorous gardening and cooking narrative',
          clips: [
            {
              media_id: mediaId,
              source_start_us: 850400000,
              source_end_us: 1030400000,
              action: 'keep',
              reason: 'Clear narrative arc: chili planting mistake, greenhouse rescue by Zoe’s mom, bountiful harvest, chili jam batching, and heartfelt community gifting.',
            },
          ],
        },
        {
          id: 'qna-setup',
          purpose: 'Introduce the community Q&A question from viewer Taylor regarding the duplicate button and magical skip button',
          clips: [
            {
              media_id: mediaId,
              source_start_us: 1030400000,
              source_end_us: 1119400000,
              action: 'keep',
              reason: 'Frames the core philosophical question about whether life would be better if we could skip mundane waiting periods or duplicate hours.',
            },
          ],
        },
        {
          id: 'time-reflection-and-outro',
          purpose: 'Deliver deep philosophical reflection on value of time followed by upbeat channel sign-off',
          clips: [
            {
              media_id: mediaId,
              source_start_us: 1119400000,
              source_end_us: 1312400000,
              action: 'keep',
              reason: 'Core wisdom: time is our most precious asset, mundane moments make the peaks meaningful, transport/charging skip ideas, and warm outro teaser for next week.',
            },
          ],
        },
      ],
      removed_ranges: [
        {
          media_id: mediaId,
          source_start_us: 0,
          source_end_us: 19780000,
          reason: 'Upbeat music intro and initial greetings — standard vlog opening that adds no information for new viewers.',
        },
        {
          media_id: mediaId,
          source_start_us: 19780000,
          source_end_us: 177400000,
          reason: 'Chaotic family playtime — chain-making, camera balancing, train ride, safari pretend-play with 20+ repetitions of "crocodile" and 15+ of "Mommy". Pure ambient noise with no narrative progress.',
        },
        {
          media_id: mediaId,
          source_start_us: 177400000,
          source_end_us: 250400000,
          reason: 'Breakfast-making segment — Otis making cereal, coffee preparation. Sweet family moment but tangential to the FS tracksuits launch and garden update.',
        },
        {
          media_id: mediaId,
          source_start_us: 250400000,
          source_end_us: 360400000,
          reason: 'Otis art appreciation and name-reading — 1.8 minutes of repetitive name-reading (Zoe, Nanny, Saga, Poppy) that doesn\'t advance narrative for new viewers.',
        },
        {
          media_id: mediaId,
          source_start_us: 360400000,
          source_end_us: 617400000,
          reason: 'Getting-ready-to-leave sequence — layering clothing, foraging stones/feathers, car-entry struggle, food-ordering chatter, and smarties negotiation. 4.3 minutes of mundane vlog padding.',
        },
        {
          media_id: mediaId,
          source_start_us: 1312400000,
          source_end_us: 1314010794,
          reason: 'Camera fumble and trailing dead audio after the closing farewell.',
        },
      ],
      estimated_duration_us: 695000000,
      uncertainties: [
        'Whether cold-opening on the FS Tracksuit launch at 10:17 disorients existing subscribers who expect domestic vlog chronological order, though it strictly optimizes for new viewers per the brief.',
        'Whether a 15-second snippet of Otis table art could be inserted as an emotional b-roll cutaway without breaking the tracksuit launch momentum.',
      ],
    }

    const res = validateRoughCutPlan(benchBPlan, vlogMediaPool)
    expect(res.valid).toBe(true)
    expect(res.errors).toEqual([])
    expect(res.clip_count).toBe(4)
    expect(res.removed_count).toBe(6)
    expect(res.calculated_duration_us).toBe(695000000)
    // 695 seconds = 11.58 minutes -> strictly within 8-12 minute window (480s to 720s)
    expect(res.calculated_duration_us).toBeGreaterThanOrEqual(480000000)
    expect(res.calculated_duration_us).toBeLessThanOrEqual(720000000)
  })
})
