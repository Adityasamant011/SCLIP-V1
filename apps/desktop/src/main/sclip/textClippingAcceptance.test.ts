/**
 * Acceptance Check: Local Vision Text Clipping Perception
 *
 * Ground-truth A/B test between:
 *   Frame A: Good text (1080x1920, centered, safe margins, no clipping)
 *   Frame B: Clipped text (1080x1920, truncated by canvas boundaries)
 *
 * Uses Sclip production stack: VisionRuntime -> MlxVisionBackend -> Sidecar (Qwen3-VL-2B-Instruct-4bit).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import { getVisionRuntime, disposeVisionRuntime } from './visionRuntime.js'

const FRAME_A = '/tmp/test-frame-good-3s.png'
const FRAME_B = '/tmp/test-frame-clipped-10s.png'

const EXACT_QUESTION = `Is any visible text or caption clipped, cut off by the frame boundaries, or extending outside the visible canvas?

Answer:
1. clipped: yes/no
2. which edge, if any
3. briefly describe the visible problem`

describe.skipIf(process.env.SCLIP_LOCAL_VISION_ACCEPTANCE !== '1')('SCLIP Local Vision — Text Clipping Acceptance Suite', () => {
  beforeAll(() => {
    if (!fs.existsSync(FRAME_A)) {
      throw new Error(`Frame A missing: ${FRAME_A}`)
    }
    if (!fs.existsSync(FRAME_B)) {
      throw new Error(`Frame B missing: ${FRAME_B}`)
    }
  })

  afterAll(async () => {
    await disposeVisionRuntime()
  })

  it('runs 3 independent checks on Frame A (Good Text) with cache bypass', async () => {
    const runtime = getVisionRuntime()
    console.log('\n========================================')
    console.log('FRAME A — GOOD TEXT EVALUATION (3 RUNS)')
    console.log('========================================')

    for (let run = 1; run <= 3; run++) {
      runtime.clearCache?.()
      const t0 = Date.now()
      const result = await runtime.analyze({
        imagePath: FRAME_A,
        question: EXACT_QUESTION,
      })
      const wallMs = Date.now() - t0

      console.log(`\n[Frame A - Run ${run}/3]`)
      console.log(`Wall latency: ${wallMs}ms, Sidecar reported: ${result.latencyMs}ms`)
      console.log(`Resolution used: ${result.resolutionUsed}`)
      console.log(`Response:\n${result.description}`)

      expect(result.ok).toBe(true)
      expect(result.resolutionUsed).toBe('auto_672px')
    }
  }, 90_000)

  it('runs 3 independent checks on Frame B (Clipped Text) with cache bypass', async () => {
    const runtime = getVisionRuntime()
    console.log('\n========================================')
    console.log('FRAME B — CLIPPED TEXT EVALUATION (3 RUNS)')
    console.log('========================================')

    for (let run = 1; run <= 3; run++) {
      runtime.clearCache?.()
      const t0 = Date.now()
      const result = await runtime.analyze({
        imagePath: FRAME_B,
        question: EXACT_QUESTION,
      })
      const wallMs = Date.now() - t0

      console.log(`\n[Frame B - Run ${run}/3]`)
      console.log(`Wall latency: ${wallMs}ms, Sidecar reported: ${result.latencyMs}ms`)
      console.log(`Resolution used: ${result.resolutionUsed}`)
      console.log(`Response:\n${result.description}`)

      expect(result.ok).toBe(true)
      expect(result.resolutionUsed).toBe('auto_672px')
    }
  }, 90_000)

  it('verifies query cache hit on repeat call (<10ms)', async () => {
    const runtime = getVisionRuntime()
    console.log('\n========================================')
    console.log('CACHE HIT VERIFICATION')
    console.log('========================================')

    // Frame B was just queried in previous test without clearing cache afterwards
    const t0 = Date.now()
    const result = await runtime.analyze({
      imagePath: FRAME_B,
      question: EXACT_QUESTION,
    })
    const wallMs = Date.now() - t0

    console.log(`Cache hit elapsed: ${wallMs}ms (reported cached: ${result.cached})`)
    expect(result.ok).toBe(true)
    expect(result.cached).toBe(true)
    expect(wallMs).toBeLessThan(10)
  }, 10_000)
})
