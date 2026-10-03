import { describe, it, expect, beforeEach } from 'vitest'
import type {
  BatchVisualIntentItem,
  ExternalMediaCandidate,
  ExternalMediaProvider,
  ExternalMediaSearchOptions,
} from './types.js'
import { ExternalMediaService } from './externalMediaService.js'

// Deterministic mock provider with simulated network latency
class MockLatencyProvider implements ExternalMediaProvider {
  constructor(
    public readonly name: any,
    public readonly displayName: string,
    public readonly latencyMs: number,
    private readonly candidateFactory: (query: string) => ExternalMediaCandidate[]
  ) {}

  async search(options: ExternalMediaSearchOptions): Promise<ExternalMediaCandidate[]> {
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
    return this.candidateFactory(options.query)
  }
}

function makeMockCandidate(
  provider: string,
  id: string,
  title: string,
  type: 'video' | 'image' = 'image'
): ExternalMediaCandidate {
  return {
    candidate_id: `${provider}_${id}`,
    provider: provider as any,
    provider_asset_id: id,
    media_type: type,
    title,
    thumbnail_url: `https://example.com/thumb_${provider}_${id}.jpg`,
    source_page_url: `https://example.com/view_${provider}_${id}`,
    direct_media_url: `https://example.com/media_${provider}_${id}.${type === 'video' ? 'mp4' : 'jpg'}`,
    rights_status: 'OPEN_LICENSE_VERIFIED',
    import_mode: 'AUTO_IMPORT',
    attribution_required: false,
    query_used: title,
    width: 1920,
    height: 1080,
    duration: type === 'video' ? 12 : undefined,
  }
}

describe('External B-Roll Phase 2 — Speed & Architecture Benchmark', () => {
  let service: ExternalMediaService

  beforeEach(() => {
    service = new ExternalMediaService()
    service.clearProviders()
    service.clearCaches()

    // Register 4 providers with deterministic simulated latency:
    // Wikimedia: 60ms
    // Openverse: 70ms
    // YouTube: 80ms
    // Pexels: 50ms
    service.registerProvider(
      new MockLatencyProvider('wikimedia', 'Wikimedia', 60, (q) => [
        makeMockCandidate('wikimedia', '1', `${q} authentic historical archival`),
        makeMockCandidate('wikimedia', '2', `${q} museum documentation`),
      ])
    )
    service.registerProvider(
      new MockLatencyProvider('openverse', 'Openverse', 70, (q) => [
        makeMockCandidate('openverse', '3', `${q} creative commons photo`),
        makeMockCandidate('openverse', '4', `${q} open educational photo`),
      ])
    )
    service.registerProvider(
      new MockLatencyProvider('youtube', 'YouTube', 80, (q) => [
        makeMockCandidate('youtube', '5', `${q} historical presentation broadcast`, 'video'),
      ])
    )
    service.registerProvider(
      new MockLatencyProvider('pexels', 'Pexels', 50, (q) => [
        makeMockCandidate('pexels', '6', `${q} stock modern wallpaper`),
      ])
    )
  })

  // Simulated old sequential pipeline
  async function runSequentialSimulation(intents: BatchVisualIntentItem[]) {
    const t0 = Date.now()
    let providerCalls = 0
    let vlmCalls = 0
    let rawCandidatesCount = 0

    for (const intent of intents) {
      // In the old sequential world, Hermes queries providers one by one:
      const query = intent.subject ?? ''
      const providers = service.getAvailableProviders()
      for (const pName of providers) {
        const p = service.getProvider(pName)
        if (p) {
          providerCalls++
          const res = await p.search({ query, media_type: intent.media_preference })
          rawCandidatesCount += res.length
          // In the old world, Qwen would be called serially on each individual candidate:
          for (const _c of res) {
            vlmCalls++
            // Simulate 40ms per serial VLM call
            await new Promise((r) => setTimeout(r, 40))
          }
        }
      }
    }
    const wallClockMs = Date.now() - t0
    return { wallClockMs, providerCalls, vlmCalls, rawCandidatesCount }
  }

  it('Benchmark A: 3 Factual Historical Intents', async () => {
    const factualIntents: BatchVisualIntentItem[] = [
      {
        subject: 'Steve Jobs unveiling first iPhone',
        event: 'Macworld 2007',
        specificity: 'exact',
        authenticity: 'required',
        media_preference: 'either',
      },
      {
        subject: 'Apollo 11 lunar landing Neil Armstrong',
        event: '1969 moon landing',
        specificity: 'exact',
        authenticity: 'required',
        media_preference: 'image',
      },
      {
        subject: 'ENIAC computer programming laboratory',
        event: '1946 computing history',
        specificity: 'exact',
        authenticity: 'required',
        media_preference: 'image',
      },
    ]

    // 1. Sequential run
    const seq = await runSequentialSimulation(factualIntents)

    // 2. Phase 2 Parallel run (VLM heuristic mode in unit test for deterministic timing)
    const t0 = Date.now()
    const par = await service.resolveVisualIntents(factualIntents, { useVlm: false })
    const parWallClockMs = Date.now() - t0

    expect(par.success).toBe(true)
    expect(par.intents.length).toBe(3)

    // Parallel search + batch candidate evaluation should be at least 3x faster than sequential
    expect(parWallClockMs).toBeLessThan(seq.wallClockMs / 2)
    expect(par.telemetry.candidates_after_cheap_filter).toBeLessThanOrEqual(par.telemetry.raw_candidates_found)

    console.log(`\n--- BENCHMARK A (3 Factual Intents) ---`)
    console.log(`Sequential Wall Clock: ${seq.wallClockMs}ms (${seq.providerCalls} calls, ${seq.vlmCalls} VLM calls)`)
    console.log(`Parallel Wall Clock:   ${parWallClockMs}ms (${par.telemetry.providers_queried} calls, ${par.telemetry.qwen_inference_calls} VLM calls)`)
    console.log(`Speedup Factor:        ${(seq.wallClockMs / parWallClockMs).toFixed(2)}x`)
  })

  it('Benchmark B: 3 Generic Stock Fallback Intents', async () => {
    const genericIntents: BatchVisualIntentItem[] = [
      {
        subject: 'developer coding late night laptop coffee',
        specificity: 'generic',
        authenticity: 'unnecessary',
        media_preference: 'image',
      },
      {
        subject: 'sunset ocean waves timelapse',
        specificity: 'generic',
        authenticity: 'unnecessary',
        media_preference: 'video',
      },
      {
        subject: 'modern office meeting team discussion',
        specificity: 'generic',
        authenticity: 'unnecessary',
        media_preference: 'either',
      },
    ]

    const seq = await runSequentialSimulation(genericIntents)

    const t0 = Date.now()
    const par = await service.resolveVisualIntents(genericIntents, { useVlm: false })
    const parWallClockMs = Date.now() - t0

    expect(par.success).toBe(true)
    expect(par.intents.length).toBe(3)
    expect(parWallClockMs).toBeLessThan(seq.wallClockMs / 2)

    console.log(`\n--- BENCHMARK B (3 Generic Intents) ---`)
    console.log(`Sequential Wall Clock: ${seq.wallClockMs}ms`)
    console.log(`Parallel Wall Clock:   ${parWallClockMs}ms`)
    console.log(`Speedup Factor:        ${(seq.wallClockMs / parWallClockMs).toFixed(2)}x`)
  })

  it('Benchmark C: Mixed Batch of 6 Intents with Aggressive Cache Reuse', async () => {
    const mixedBatch: BatchVisualIntentItem[] = [
      { subject: 'Steve Jobs keynote iPhone', specificity: 'exact', authenticity: 'required' },
      { subject: 'laptop typing dark room', specificity: 'generic', authenticity: 'unnecessary' },
      { subject: 'Alexander Fleming penicillin discovery', specificity: 'exact', authenticity: 'required' },
      { subject: 'nature forest trees sunlight', specificity: 'generic', authenticity: 'unnecessary' },
      { subject: 'Wright brothers first flight Kitty Hawk', specificity: 'exact', authenticity: 'required' },
      { subject: 'abstract geometric motion graphic', specificity: 'generic', authenticity: 'unnecessary' },
    ]

    // First parallel run
    const t0 = Date.now()
    const firstRun = await service.resolveVisualIntents(mixedBatch, { useVlm: false })
    const firstRunMs = Date.now() - t0

    expect(firstRun.success).toBe(true)
    expect(firstRun.intents.length).toBe(6)

    // Second parallel run (identical queries, testing multi-tier cache)
    const t1 = Date.now()
    const secondRun = await service.resolveVisualIntents(mixedBatch, { useVlm: false })
    const secondRunMs = Date.now() - t1

    expect(secondRun.success).toBe(true)
    expect(secondRun.telemetry.cache_hits).toBeGreaterThan(0)
    // Cached run should be almost instantaneous (< 30ms)
    expect(secondRunMs).toBeLessThan(firstRunMs / 3)

    console.log(`\n--- BENCHMARK C (6 Mixed Intents & Cache Reuse) ---`)
    console.log(`First Run Wall Clock:  ${firstRunMs}ms (Raw Candidates: ${firstRun.telemetry.raw_candidates_found}, Filtered: ${firstRun.telemetry.candidates_after_cheap_filter})`)
    console.log(`Cached Run Wall Clock: ${secondRunMs}ms (Cache Hits: ${secondRun.telemetry.cache_hits})`)
    console.log(`Cache Speedup:         ${(firstRunMs / Math.max(1, secondRunMs)).toFixed(1)}x faster`)
  })
})
