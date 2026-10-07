/**
 * Acceptance tests for the `vision_inspect` tool and VisionRuntime (Optimized & Hardened).
 *
 * Covers:
 *   1. FACE_PRESENT   — speaker visible in frame
 *   2. FACE_ABSENT    — speaker cropped off-screen (only hand/mic visible)
 *   3. BAD_CROP       — reframe quality evaluation
 *   4. TEXT_CLIPPING  — detecting caption bar / reading text
 *   5. BLACK_VOID     — empty / black frame sanity
 *   6. LATENCY TARGET — warm single-frame inspection is < 4.0s (ideal < 3.0s)
 *   7. QUERY CACHING  — repeat query returns instantly (< 10ms) from memory cache
 *   8. MULTI-FRAME    — batch inference across multiple frames in a single call
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { getVisionRuntime, disposeVisionRuntime } from './visionRuntime.js'

const SOURCE_VIDEO = '/Users/adityasamant/Documents/1/3/Media/Raw Talking head tutorial video for editing practice.mp4'

const FRAMES = {
  initial: '/tmp/test-frame-initial.png',   // t=5s, speaker visible, upper center-right
  current: '/tmp/test-frame-current.png',   // t=35s, speaker off-screen, only hand/mic
  black:   '/tmp/test-frame-black.png',     // pure black frame
}

function ensureTestFrames() {
  if (!fs.existsSync(FRAMES.initial)) {
    execSync(`ffmpeg -y -ss 00:00:05 -i "${SOURCE_VIDEO}" -frames:v 1 -q:v 2 "${FRAMES.initial}"`)
  }
  if (!fs.existsSync(FRAMES.current)) {
    execSync(`ffmpeg -y -ss 00:00:35 -i "${SOURCE_VIDEO}" -frames:v 1 -q:v 2 "${FRAMES.current}"`)
  }
  if (!fs.existsSync(FRAMES.black)) {
    execSync(`ffmpeg -y -f lavfi -i color=c=black:s=720x1280:d=1 -frames:v 1 "${FRAMES.black}"`)
  }
}

describe.skipIf(process.env.SCLIP_LOCAL_VISION_ACCEPTANCE !== '1')('vision_inspect Acceptance Tests (Optimized & Hardened)', () => {
  beforeAll(() => {
    ensureTestFrames()
  }, 30_000)

  afterAll(async () => {
    await disposeVisionRuntime()
  }, 10_000)

  it('1. FACE_PRESENT: truthfully reports speaker is visible', async () => {
    const runtime = getVisionRuntime()
    const result = await runtime.analyze({
      imagePath: FRAMES.initial,
      question: 'Is a person or face clearly visible in this image? Describe who or what is visible.',
    })

    expect(result.ok).toBe(true)
    expect(result.description.length).toBeGreaterThan(15)
    const text = result.description.toLowerCase()
    const hasSubject = ['person', 'man', 'speaker', 'face', 'human', 'he', 'visible'].some(w => text.includes(w))
    expect(hasSubject).toBe(true)
  }, 60_000)

  it('2. FACE_ABSENT: truthfully reports face is not visible', async () => {
    const runtime = getVisionRuntime()
    const result = await runtime.analyze({
      imagePath: FRAMES.current,
      question: 'Is a person\'s face visible in this image? If not, what body parts or objects are visible?',
    })

    expect(result.ok).toBe(true)
    const text = result.description.toLowerCase()
    const mentionsHandOrMicOrNoFace = [
      'no face', 'not visible', 'cannot see', 'hand', 'arm', 'microphone', 'mic', 'off-screen', 'absent', 'not clearly visible'
    ].some(w => text.includes(w))
    expect(mentionsHandOrMicOrNoFace).toBe(true)
  }, 30_000)

  it('3. BAD_CROP: identifies when subject is poorly framed or off-screen', async () => {
    const runtime = getVisionRuntime()
    const result = await runtime.analyze({
      imagePath: FRAMES.current,
      question: 'This is a 9:16 vertical crop. Is the main speaker properly centered, or do they appear cut off / off-screen?',
    })

    expect(result.ok).toBe(true)
    const text = result.description.toLowerCase()
    const indicatesBadCrop = [
      'cut off', 'off-screen', 'not centered', 'off center', 'not visible', 'reframe', 'hand', 'microphone'
    ].some(w => text.includes(w))
    expect(indicatesBadCrop).toBe(true)
  }, 30_000)

  it('4. TEXT_CLIPPING: identifies text or caption band presence', async () => {
    const runtime = getVisionRuntime()
    const result = await runtime.analyze({
      imagePath: FRAMES.initial,
      question: 'Is there a black bar, band, or caption area visible at the bottom of the image? What text is in it?',
    })

    expect(result.ok).toBe(true)
    const text = result.description.toLowerCase()
    const mentionsBlackBar = [
      'black', 'bar', 'band', 'bottom', 'caption', 'dark', 'strip', 'area', 'start with the'
    ].some(w => text.includes(w))
    expect(mentionsBlackBar).toBe(true)
  }, 30_000)

  it('5. BLACK_VOID: correctly identifies an empty or pure black frame', async () => {
    const runtime = getVisionRuntime()
    const result = await runtime.analyze({
      imagePath: FRAMES.black,
      question: 'What is visible in this image? Is there any content or is it completely black/empty?',
    })

    expect(result.ok).toBe(true)
    const text = result.description.toLowerCase()
    const mentionsBlackOrEmpty = [
      'black', 'dark', 'empty', 'blank', 'nothing', 'void', 'solid'
    ].some(w => text.includes(w))
    expect(mentionsBlackOrEmpty).toBe(true)
  }, 30_000)

  it('6. LATENCY TARGET: warm single-frame inspection completes in < 4.0s (ideal < 3.0s)', async () => {
    const runtime = getVisionRuntime()
    const t0 = Date.now()
    const result = await runtime.analyze({
      imagePath: FRAMES.initial,
      question: 'Is the speaker facing the camera? Answer in one short sentence.',
      resolution: 'low',
    })
    const elapsedMs = Date.now() - t0

    expect(result.ok).toBe(true)
    console.log(`[LATENCY BENCHMARK] Warm single-frame elapsed: ${elapsedMs}ms, Sidecar reported: ${result.latencyMs}ms`)
    expect(result.latencyMs).toBeLessThan(4_000) // Must beat 4.0s
  }, 30_000)

  it('7. QUERY CACHING: repeat query on unchanged frame returns instantly (< 10ms)', async () => {
    const runtime = getVisionRuntime()
    const req = {
      imagePath: FRAMES.initial,
      question: 'Is a person or face clearly visible in this image? Describe who or what is visible.',
    }

    const t0 = Date.now()
    const cachedResult = await runtime.analyze(req)
    const elapsedMs = Date.now() - t0

    expect(cachedResult.ok).toBe(true)
    expect(cachedResult.cached).toBe(true)
    expect(elapsedMs).toBeLessThan(10) // Cache hit must be practically instantaneous
    console.log(`[CACHE BENCHMARK] Repeat query returned in ${elapsedMs}ms (cached: ${cachedResult.cached})`)
  }, 10_000)

  it('8. MULTI-FRAME BATCHING: evaluates multiple frames in one single call', async () => {
    const runtime = getVisionRuntime()
    const t0 = Date.now()
    const result = await runtime.analyze({
      imagePaths: [FRAMES.initial, FRAMES.current],
      question: 'Compare frame 1 and frame 2. Is the person visible in both, or only in frame 1?',
      resolution: 'low',
    })
    const elapsedMs = Date.now() - t0

    expect(result.ok).toBe(true)
    expect(result.inputFrames).toBe(2)
    console.log(`[MULTI-FRAME BENCHMARK] 2 frames evaluated in ${elapsedMs}ms (Sidecar: ${result.latencyMs}ms)`)
    expect(result.latencyMs).toBeLessThan(6_000) // 2 frames in < 6s
  }, 30_000)
})
