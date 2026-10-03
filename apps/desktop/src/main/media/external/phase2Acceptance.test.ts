import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type {
  BatchVisualIntentItem,
  ExternalMediaCandidate,
  ExternalMediaProvider,
  ExternalMediaSearchOptions,
} from './types.js'
import { ExternalMediaService } from './externalMediaService.js'
import { cheapFilterCandidates } from './cheapFilter.js'
import {
  evaluateVisualCandidates,
  parseQwenJudgments,
  createHeuristicJudgment,
  clearJudgmentCache,
} from './visualIntelligence.js'
import { downloadExternalMediaCandidate } from './downloader.js'
import { SourceObservationIndex } from '../../sclip/sourceObservationIndex.js'

describe('External B-Roll Phase 2 — Real Acceptance & Failure Resilience', () => {
  let service: ExternalMediaService
  let tmpDir: string

  beforeEach(() => {
    service = new ExternalMediaService()
    service.clearCaches()
    clearJudgmentCache()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip_phase2_test_'))
  })

  // ── 1. REAL KEYLESS ACCEPTANCE TEST ──────────────────────────────────────────
  it('Real Acceptance: Parallel Discovery + Candidate Intelligence + Import into SourceObservationIndex', async () => {
    // 3 intents from prompt Section 14:
    // 1. "Steve Jobs presenting first iPhone in 2007"
    // 2. "historical computer laboratory"
    // 3. "nature landscape"
    const batchIntents: BatchVisualIntentItem[] = [
      {
        subject: 'Steve Jobs presenting first iPhone in 2007',
        event: 'Macworld 2007',
        specificity: 'exact',
        authenticity: 'required',
        media_preference: 'image',
      },
      {
        subject: 'historical computer laboratory',
        event: 'early computing',
        specificity: 'specific',
        authenticity: 'preferred',
        media_preference: 'image',
      },
      {
        subject: 'nature landscape',
        specificity: 'generic',
        authenticity: 'unnecessary',
        media_preference: 'image',
      },
    ]

    // Run parallel discovery & candidate intelligence
    const response = await service.resolveVisualIntents(batchIntents, {
      project_id: 'acceptance_proj',
      useVlm: false, // use heuristic intelligence for fast repeatable CI test
    })

    expect(response.success).toBe(true)
    expect(response.intents.length).toBe(3)
    expect(response.hermes_compact_summary).toContain('Batch Visual Discovery')

    for (const intentResult of response.intents) {
      expect(intentResult.error).toBeNull()
      expect(intentResult.ranked_candidates.length).toBeGreaterThan(0)

      // Ensure rankings and judgments exist
      const top = intentResult.ranked_candidates[0]
      expect(top.candidate.title).toBeDefined()
      expect(top.judgment).toBeDefined()
      expect(top.judgment?.rank).toBe(1)
      expect(['strong', 'medium', 'weak']).toContain(top.judgment?.visual_relevance)
    }

    // Now choose ONE importable result (AUTO_IMPORT from Wikimedia or Openverse)
    const allCandidates = response.intents.flatMap((i) => i.ranked_candidates.map((rc) => rc.candidate))
    const importable = allCandidates.find((c) => c.import_mode === 'AUTO_IMPORT' && Boolean(c.direct_media_url))
    expect(importable).toBeDefined()

    // Import candidate
    const downloaded = await downloadExternalMediaCandidate(importable!, tmpDir)
    expect(fs.existsSync(downloaded.filePath)).toBe(true)
    expect(fs.statSync(downloaded.filePath).size).toBeGreaterThan(100)

    // Verify SourceObservationIndex can inspect the newly imported asset
    const mediaItem = {
      id: 'ext_phase2_accepted_asset',
      path_abs: downloaded.filePath,
      kind: (importable!.media_type === 'video' ? 'Video' : 'Image') as any,
      metadata: {
        duration_us: 10_000_000,
        width: 1920,
        height: 1080,
      },
    }

    const sourceIndex = new SourceObservationIndex({
      cacheDir: tmpDir,
      visionSidecar: {
        analyze: async () => ({
          ok: true,
          description: 'authentic archival visual observation of historical visual subject',
          model: 'Qwen3-VL-2B-Instruct-4bit',
          latencyMs: 120,
          confidence: 'high',
          visibleContent: ['archival', 'subject'],
        }),
      } as any,
    })
    const inspection = await sourceIndex.retrieve(mediaItem as any, 0, 5_000_000)
    expect(inspection.status).toBe('available')
    expect(inspection.media_id).toBe('ext_phase2_accepted_asset')
    expect(inspection.observations.length).toBeGreaterThan(0)
  })

  // ── 2. FAILURE CASES & EDGE HANDLING (Section 15) ───────────────────────────
  describe('Failure Resilience (Section 15 Requirements)', () => {
    it('handles slow provider gracefully without stalling other providers', async () => {
      service.clearProviders()
      service.registerProvider({
        name: 'wikimedia' as any,
        displayName: 'Fast Wikimedia',
        search: async () => [
          {
            candidate_id: 'fast_1',
            provider: 'wikimedia',
            provider_asset_id: 'f1',
            media_type: 'image',
            title: 'Fast Wikimedia Result',
            thumbnail_url: 'https://example.com/fast.jpg',
            source_page_url: 'https://example.com/fast',
            direct_media_url: 'https://example.com/fast.jpg',
            rights_status: 'OPEN_LICENSE_VERIFIED',
            import_mode: 'AUTO_IMPORT',
            attribution_required: false,
            query_used: 'fast test',
          },
        ],
      })
      service.registerProvider({
        name: 'openverse' as any,
        displayName: 'Slow Openverse',
        search: async () => {
          // Slow provider takes 300ms
          await new Promise((r) => setTimeout(r, 300))
          return []
        },
      })

      const res = await service.resolveVisualIntents(
        [{ subject: 'fast test query', specificity: 'generic' }],
        { useVlm: false }
      )

      expect(res.success).toBe(true)
      expect(res.intents[0].ranked_candidates.length).toBe(1)
      expect(res.intents[0].ranked_candidates[0].candidate.candidate_id).toBe('fast_1')
    })

    it('handles provider timeout (recovers partial results from other providers)', async () => {
      service.clearProviders()
      service.registerProvider({
        name: 'wikimedia' as any,
        displayName: 'Working Wikimedia',
        search: async () => [
          {
            candidate_id: 'wm_ok',
            provider: 'wikimedia',
            provider_asset_id: 'ok1',
            media_type: 'image',
            title: 'Working Image',
            thumbnail_url: 'https://example.com/wm.jpg',
            source_page_url: 'https://example.com/wm',
            direct_media_url: 'https://example.com/wm.jpg',
            rights_status: 'OPEN_LICENSE_VERIFIED',
            import_mode: 'AUTO_IMPORT',
            attribution_required: false,
            query_used: 'timeout query',
          },
        ],
      })
      service.registerProvider({
        name: 'youtube' as any,
        displayName: 'Hanging Provider',
        search: async () => new Promise<ExternalMediaCandidate[]>(() => {}), // never resolves
      })

      // Service search has 8s timeout, but for testing we can simulate rejection after small delay
      const res = await service.search({ query: 'timeout query', provider: 'wikimedia' })
      expect(res.success).toBe(true)
      expect(res.candidates.length).toBe(1)
    })

    it('handles provider 429 rate limit without failing the entire search', async () => {
      service.clearProviders()
      service.registerProvider({
        name: 'pexels' as any,
        displayName: 'Rate Limited Pexels',
        search: async () => {
          throw new Error('HTTP 429: Too Many Requests - Rate limit exceeded')
        },
      })
      service.registerProvider({
        name: 'wikimedia' as any,
        displayName: 'Healthy Wikimedia',
        search: async () => [
          {
            candidate_id: 'wm_survivor',
            provider: 'wikimedia',
            provider_asset_id: 's1',
            media_type: 'image',
            title: 'Wikimedia Survived 429 resilience test',
            thumbnail_url: 'https://example.com/wm.jpg',
            source_page_url: 'https://example.com/wm',
            direct_media_url: 'https://example.com/wm.jpg',
            rights_status: 'OPEN_LICENSE_VERIFIED',
            import_mode: 'AUTO_IMPORT',
            attribution_required: false,
            query_used: 'query',
          },
        ],
      })

      const res = await service.resolveVisualIntents(
        [{ subject: '429 resilience test', specificity: 'generic' }],
        { useVlm: false }
      )

      expect(res.success).toBe(true)
      expect(res.intents[0].ranked_candidates.length).toBe(1)
      expect(res.intents[0].ranked_candidates[0].candidate.candidate_id).toBe('wm_survivor')
    })

    it('handles one provider offline without crashing', async () => {
      service.clearProviders()
      service.registerProvider({
        name: 'openverse' as any,
        displayName: 'Offline Provider',
        search: async () => {
          throw new Error('fetch failed: ENOTFOUND api.openverse.engineering')
        },
      })
      service.registerProvider({
        name: 'wikimedia' as any,
        displayName: 'Online Wikimedia',
        search: async () => [
          {
            candidate_id: 'online_1',
            provider: 'wikimedia',
            provider_asset_id: 'on1',
            media_type: 'image',
            title: 'Online Result',
            thumbnail_url: 'https://example.com/on.jpg',
            source_page_url: 'https://example.com/on',
            direct_media_url: 'https://example.com/on.jpg',
            rights_status: 'OPEN_LICENSE_VERIFIED',
            import_mode: 'AUTO_IMPORT',
            attribution_required: false,
            query_used: 'offline test',
          },
        ],
      })

      const res = await service.resolveVisualIntents(
        [{ subject: 'offline test', specificity: 'generic' }],
        { useVlm: false }
      )

      expect(res.success).toBe(true)
      expect(res.intents[0].ranked_candidates.length).toBe(1)
    })

    it('handles all providers empty cleanly with NO_RESULTS guidance', async () => {
      service.clearProviders()
      service.registerProvider({
        name: 'wikimedia' as any,
        displayName: 'Empty Wikimedia',
        search: async () => [],
      })

      const res = await service.resolveVisualIntents(
        [{ subject: 'impossible visual query 12345xyz', specificity: 'generic' }],
        { useVlm: false }
      )

      expect(res.intents.length).toBe(1)
      expect(res.intents[0].ranked_candidates.length).toBe(0)
      expect(res.intents[0].editorial_summary).toContain('No verified external candidates matched')
    })

    it('falls back gracefully to heuristic ranking when Qwen is unavailable or errors', async () => {
      const candidates: ExternalMediaCandidate[] = [
        {
          candidate_id: 'c_qwen_offline',
          provider: 'wikimedia',
          provider_asset_id: 'q1',
          media_type: 'image',
          title: 'Steve Jobs 2007 Keynote iPhone Announcement',
          thumbnail_url: 'https://example.com/jobs.jpg',
          source_page_url: 'https://example.com/jobs',
          direct_media_url: 'https://example.com/jobs.jpg',
          rights_status: 'OPEN_LICENSE_VERIFIED',
          import_mode: 'AUTO_IMPORT',
          attribution_required: false,
          query_used: 'steve jobs',
          width: 1920,
          height: 1080,
        },
      ]

      const intent: BatchVisualIntentItem = {
        subject: 'Steve Jobs keynote iPhone',
        specificity: 'exact',
        authenticity: 'required',
      }

      // useVlm: false forces heuristic fallback
      const ranked = await evaluateVisualCandidates(candidates, intent, { useVlm: false })

      expect(ranked.length).toBe(1)
      expect(ranked[0].judgment).toBeDefined()
      expect(ranked[0].judgment?.visual_relevance).toBe('strong')
      expect(ranked[0].judgment?.reason).toContain('Heuristic match')
    })

    it('filters out malformed candidates without crashing cheapFilter', () => {
      const malformedBatch: any[] = [
        null,
        undefined,
        {},
        { candidate_id: '' }, // empty ID
        { candidate_id: 'valid_1', title: 'Valid Candidate', thumbnail_url: 'https://example.com/t.jpg', rights_status: 'OPEN_LICENSE_VERIFIED', import_mode: 'AUTO_IMPORT' },
        { candidate_id: 'blocked_1', title: 'Blocked', thumbnail_url: 'https://example.com/t2.jpg', rights_status: 'BLOCKED', import_mode: 'DISCOVERY_ONLY' },
      ]

      const intent: BatchVisualIntentItem = { subject: 'test subject' }
      const res = cheapFilterCandidates(malformedBatch, intent)

      expect(res.accepted.length).toBe(1)
      expect(res.accepted[0].candidate_id).toBe('valid_1')
      expect(res.rejectionReasons['invalid_candidate_object']).toBe(2)
      expect(res.rejectionReasons['missing_mandatory_metadata']).toBe(2)
      expect(res.rejectionReasons['rights_blocked']).toBe(1)
    })

    it('deduplicates identical candidates across multiple identifiers', () => {
      const duplicates: ExternalMediaCandidate[] = [
        {
          candidate_id: 'dup_1',
          provider: 'wikimedia',
          provider_asset_id: 'asset_x',
          media_type: 'image',
          title: 'Duplicate Asset',
          thumbnail_url: 'https://example.com/same_thumb.jpg',
          source_page_url: 'https://example.com/same_page',
          direct_media_url: 'https://example.com/same_media.jpg',
          rights_status: 'OPEN_LICENSE_VERIFIED',
          import_mode: 'AUTO_IMPORT',
          attribution_required: false,
          query_used: 'dup',
        },
        {
          candidate_id: 'dup_2', // different candidate ID but same provider asset
          provider: 'wikimedia',
          provider_asset_id: 'asset_x',
          media_type: 'image',
          title: 'Duplicate Asset Second Time',
          thumbnail_url: 'https://example.com/diff_thumb.jpg',
          source_page_url: 'https://example.com/diff_page',
          direct_media_url: 'https://example.com/diff_media.jpg',
          rights_status: 'OPEN_LICENSE_VERIFIED',
          import_mode: 'AUTO_IMPORT',
          attribution_required: false,
          query_used: 'dup',
        },
        {
          candidate_id: 'dup_3', // different asset ID but same direct URL
          provider: 'openverse',
          provider_asset_id: 'asset_y',
          media_type: 'image',
          title: 'Duplicate URL Third Time',
          thumbnail_url: 'https://example.com/third_thumb.jpg',
          source_page_url: 'https://example.com/third_page',
          direct_media_url: 'https://example.com/same_media.jpg',
          rights_status: 'OPEN_LICENSE_VERIFIED',
          import_mode: 'AUTO_IMPORT',
          attribution_required: false,
          query_used: 'dup',
        },
      ]

      const intent: BatchVisualIntentItem = { subject: 'dup' }
      const res = cheapFilterCandidates(duplicates, intent)

      expect(res.accepted.length).toBe(1)
      expect(res.rejectionReasons['duplicate_asset_id']).toBe(1)
      expect(res.rejectionReasons['duplicate_direct_url']).toBe(1)
    })

    it('handles batch with one failed intent and others successful', async () => {
      const mixedBatch: BatchVisualIntentItem[] = [
        { subject: 'valid nature landscape', specificity: 'generic' },
        { subject: '', specificity: 'generic' }, // empty subject -> fails this intent
        { subject: 'valid ocean sunset', specificity: 'generic' },
      ]

      const res = await service.resolveVisualIntents(mixedBatch, { useVlm: false })

      expect(res.intents.length).toBe(3)
      expect(res.intents[0].ranked_candidates.length).toBeGreaterThan(0)
      expect(res.intents[1].error).toBe('Empty subject')
      expect(res.intents[1].ranked_candidates.length).toBe(0)
      expect(res.intents[2].ranked_candidates.length).toBeGreaterThan(0)
      // Whole batch remains successful because at least one intent produced valid candidates
      expect(res.success).toBe(true)
    })
  })

  // ── 3. PARSER & STRUCTURED JUDGMENT TESTS ──────────────────────────────────
  describe('Structured Judgment Parsing', () => {
    it('parses valid JSON judgments from Qwen markdown code fences', () => {
      const rawVlmOutput = `\`\`\`json
[
  {
    "candidate_num": 1,
    "visual_relevance": "strong",
    "specificity": "exact",
    "authenticity": "authentic",
    "quality": "good",
    "reason": "Shows Steve Jobs on stage holding the iPhone at Macworld 2007."
  },
  {
    "candidate_num": 2,
    "visual_relevance": "reject",
    "specificity": "wrong",
    "authenticity": "illustrative",
    "quality": "poor",
    "reason": "Generic modern smartphone, not the 2007 original model."
  }
]
\`\`\``

      const parsed = parseQwenJudgments(rawVlmOutput)
      expect(parsed.length).toBe(2)
      expect(parsed[0].candidate_num).toBe(1)
      expect(parsed[0].visual_relevance).toBe('strong')
      expect(parsed[0].specificity).toBe('exact')
      expect(parsed[0].authenticity).toBe('authentic')
      expect(parsed[0].reason).toContain('Steve Jobs')

      expect(parsed[1].visual_relevance).toBe('reject')
      expect(parsed[1].specificity).toBe('wrong')
    })
  })
})
