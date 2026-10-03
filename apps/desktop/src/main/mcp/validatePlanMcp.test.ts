import { describe, it, expect, beforeAll } from 'vitest'
import { createActor } from '../state/actor.js'
import { uuidV7Gen } from '../state/ids.js'
import { blankProject } from '../state/model.js'
import { handleCallTool } from './server.js'
import type { TsActorHost } from '../state/ts-actor-host.js'
import type { RoughCutPlan } from '../sclip/roughCutPlan.js'
import { initEval } from '../../renderer/eval/index.js'

describe('MCP tool: validate_rough_cut_plan', () => {
  let actor: ReturnType<typeof createActor>
  let tsHost: TsActorHost
  const mediaId = 'media-talking-head-001'

  beforeAll(async () => {
    await initEval()
    const gen = uuidV7Gen()
    actor = createActor({ initial: blankProject(gen, 'test-project'), idGen: gen })
    actor.dispatch('add_media_item', {
      media: {
        id: mediaId,
        name: 'talking_head.mp4',
        path: '/path/to/talking_head.mp4',
        duration_us: 600_000_000,
        width: 1920,
        height: 1080,
        fps: { num: 30, den: 1 },
        audio_channels: 2,
        audio_sample_rate: 48000,
        file_hash_blake3: 'abc123hash',
      },
    })
    const validationHost: Pick<TsActorHost, 'actor' | 'mcpCall' | 'hybridDeps' | 'motifTool'> = {
      actor,
      mcpCall: (name, argsJson) => actor.mcpCall(name, JSON.parse(argsJson)),
      hybridDeps: {} as TsActorHost['hybridDeps'],
      motifTool: () => ({} as ReturnType<TsActorHost['motifTool']>),
    }
    tsHost = validationHost as TsActorHost
  })

  const validPlan: RoughCutPlan = {
    version: 1,
    brief: {
      goal: 'Concise tutorial',
      audience: 'Beginner developers',
      target_duration_us: 90_000_000,
      tone: ['direct', 'natural'],
    },
    source_summary: 'Tutorial on state management',
    editorial_thesis: 'Focus on core principles',
    sections: [
      {
        id: 'intro',
        purpose: 'Establish problem',
        clips: [
          {
            media_id: mediaId,
            source_start_us: 0,
            source_end_us: 90_000_000,
            action: 'keep',
            reason: 'Clear introduction without fluff',
          },
        ],
      },
    ],
    removed_ranges: [
      {
        media_id: mediaId,
        source_start_us: 90_000_000,
        source_end_us: 150_000_000,
        reason: 'Tangential rambling',
      },
    ],
    estimated_duration_us: 90_000_000,
    uncertainties: [],
  }

  it('validates plan object and reports success', async () => {
    const backend = {} as any
    const res = await handleCallTool(
      backend,
      () => tsHost,
      'validate_rough_cut_plan',
      { plan: validPlan }
    )

    if (!('content' in res) || !Array.isArray(res.content) || res.content[0]?.type !== 'text') throw new Error('Expected text tool result')
    expect(res.isError).toBeFalsy()
    const parsed = JSON.parse(res.content[0].text)
    expect(parsed.valid).toBe(true)
    expect(parsed.errors).toHaveLength(0)
    expect(parsed.calculated_duration_us).toBe(90_000_000)
    expect(parsed.clip_count).toBe(1)
  })

  it('validates stringified JSON plan', async () => {
    const backend = {} as any
    const res = await handleCallTool(
      backend,
      () => tsHost,
      'validate_rough_cut_plan',
      { plan: JSON.stringify(validPlan) }
    )

    if (!('content' in res) || !Array.isArray(res.content) || res.content[0]?.type !== 'text') throw new Error('Expected text tool result')
    const parsed = JSON.parse(res.content[0].text)
    expect(parsed.valid).toBe(true)
    expect(parsed.errors).toHaveLength(0)
  })

  it('reports errors for invalid ranges and does not mutate actor state', async () => {
    const backend = {} as any
    const preSnapshot = JSON.stringify(actor.snapshot())

    const invalidPlan = {
      ...validPlan,
      sections: [
        {
          id: 'intro',
          purpose: 'Broken',
          clips: [
            {
              media_id: mediaId,
              source_start_us: 100_000_000,
              source_end_us: 50_000_000, // inverted
              action: 'keep',
              reason: 'broken',
            },
          ],
        },
      ],
      estimated_duration_us: 50_000_000,
    }

    const res = await handleCallTool(
      backend,
      () => tsHost,
      'validate_rough_cut_plan',
      { plan: invalidPlan }
    )

    if (!('content' in res) || !Array.isArray(res.content) || res.content[0]?.type !== 'text') throw new Error('Expected text tool result')
    const parsed = JSON.parse(res.content[0].text)
    expect(parsed.valid).toBe(false)
    expect(parsed.errors.length).toBeGreaterThan(0)

    // Verify actor state is completely unmodified
    const postSnapshot = JSON.stringify(actor.snapshot())
    expect(postSnapshot).toBe(preSnapshot)
  })
})
