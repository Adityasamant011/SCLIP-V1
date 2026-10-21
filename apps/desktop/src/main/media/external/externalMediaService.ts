import { runtimeScheduler } from '../../sclip/runtimeScheduler.js'
import type {
  BatchVisualIntentItem,
  BatchVisualIntentResult,
  ExternalMediaCandidate,
  ExternalMediaProvider,
  ExternalMediaProviderName,
  ExternalMediaSearchOptions,
  ExternalMediaSearchResult,
  ResolveVisualIntentsResponse,
  ResolveVisualIntentsTelemetry,
} from './types.js'
import { CONCURRENCY_LIMITS } from './types.js'
import { PexelsProvider } from './providers/pexels.js'
import { PixabayProvider } from './providers/pixabay.js'
import { WikimediaProvider } from './providers/wikimedia.js'
import { OpenverseProvider } from './providers/openverse.js'
import { YouTubeProvider } from './providers/youtube.js'
import { cheapFilterCandidates } from './cheapFilter.js'
import {
  evaluateVisualCandidates,
  clearJudgmentCache,
  Semaphore,
} from './visualIntelligence.js'

export class ExternalMediaService {
  private readonly providers: Map<ExternalMediaProviderName, ExternalMediaProvider> = new Map()
  private readonly candidateCache: Map<string, ExternalMediaCandidate> = new Map()
  private readonly searchResultCache: Map<
    string,
    { candidates: ExternalMediaCandidate[]; timestamp: number }
  > = new Map()
  private readonly searchProgress: Map<
    string,
    { seen: Set<string>; stalled: number; updated: number }
  > = new Map()
  private readonly searchSemaphore = new Semaphore(CONCURRENCY_LIMITS.MAX_CONCURRENT_API_SEARCHES)


  constructor(private readonly stockOnly = false) {
    this.registerProvider(new PexelsProvider())
    this.registerProvider(new PixabayProvider())
    if (!stockOnly) {
      this.registerProvider(new WikimediaProvider())
      this.registerProvider(new OpenverseProvider())
      this.registerProvider(new YouTubeProvider())
    }
  }

  registerProvider(provider: ExternalMediaProvider): void {
    this.providers.set(provider.name, provider)
  }

  getProvider(name: ExternalMediaProviderName): ExternalMediaProvider | undefined {
    return this.providers.get(name)
  }

  getAvailableProviders(): ExternalMediaProviderName[] {
    return Array.from(this.providers.keys())
  }

  getCandidate(candidateId: string): ExternalMediaCandidate | undefined {
    return this.candidateCache.get(candidateId)
  }

  cacheCandidates(candidates: ExternalMediaCandidate[]): void {
    for (const c of candidates) {
      this.candidateCache.set(c.candidate_id, c)
      if (this.candidateCache.size > 500) {
        const firstKey = this.candidateCache.keys().next().value
        if (firstKey) this.candidateCache.delete(firstKey)
      }
    }
  }

  clearCaches(): void {
    this.candidateCache.clear()
    this.searchProgress.clear()
    this.searchResultCache.clear()
    clearJudgmentCache()
  }

  clearProviders(): void {
    this.providers.clear()
  }

  private resolveProviders(options: ExternalMediaSearchOptions): ExternalMediaProvider[] {
    const { provider = 'auto', media_type = 'either', query, visual_intent } = options

    if (this.stockOnly) {
      if (provider === 'auto') return Array.from(this.providers.values())
      const selected = this.providers.get(provider)
      if (!selected) throw new Error('This build supports Pexels and Pixabay stock. Choose auto, pexels or pixabay.')
      return [selected]
    }

    if (provider !== 'auto') {
      const p = this.providers.get(provider)
      return p ? [p] : []
    }

    const q = query.toLowerCase()
    const isAuthenticIntent =
      visual_intent?.authenticity === 'required' ||
      visual_intent?.authenticity === 'preferred' ||
      visual_intent?.specificity === 'exact' ||
      visual_intent?.specificity === 'specific'

    const authenticKeywordPattern = /\b(keynote|interview|speech|president|history|historical|documentary|launch|event|19\d\d|200\d|201\d|steve jobs|messi|world cup|nasa|apollo|olympics|senate|court)\b/i
    const isAuthenticQuery = isAuthenticIntent || authenticKeywordPattern.test(q)

    const genericKeywordPattern = /\b(typing|laptop|office|nature|sunset|timelapse|coffee|workout|gym|running|walking|coding|developer|meeting|city|abstract|background|ambient)\b/i
    const isGenericQuery = !isAuthenticIntent && genericKeywordPattern.test(q)

    const resolved: ExternalMediaProviderName[] = []

    if (isAuthenticQuery) {
      if (visual_intent?.specificity === 'exact') {
        // Specific factual event: authentic providers only, do NOT masquerade generic stock as the event
        if (media_type === 'video') {
          resolved.push('youtube', 'wikimedia')
        } else if (media_type === 'image') {
          resolved.push('wikimedia', 'openverse')
        } else {
          resolved.push('youtube', 'wikimedia', 'openverse')
        }
      } else {
        if (media_type === 'video') {
          resolved.push('youtube', 'wikimedia', 'pexels', 'pixabay')
        } else if (media_type === 'image') {
          resolved.push('wikimedia', 'openverse', 'pexels', 'pixabay')
        } else {
          resolved.push('youtube', 'wikimedia', 'openverse', 'pexels', 'pixabay')
        }
      }
    } else if (isGenericQuery) {
      if (media_type === 'video') {
        resolved.push('pexels', 'pixabay', 'wikimedia')
      } else if (media_type === 'image') {
        resolved.push('pexels', 'pixabay', 'openverse', 'wikimedia')
      } else {
        resolved.push('pexels', 'pixabay', 'openverse', 'wikimedia')
      }
    } else {
      if (media_type === 'video') {
        resolved.push('pexels', 'pixabay', 'youtube', 'wikimedia')
      } else if (media_type === 'image') {
        resolved.push('pexels', 'pixabay', 'wikimedia', 'openverse')
      } else {
        resolved.push('pexels', 'pixabay', 'wikimedia', 'openverse', 'youtube')
      }
    }

    const result: ExternalMediaProvider[] = []
    for (const name of resolved) {
      const p = this.providers.get(name)
      if (p) result.push(p)
    }
    return result
  }

  async search(options: ExternalMediaSearchOptions): Promise<ExternalMediaSearchResult> {
    const { query, provider = 'auto', media_type = 'either', limit = 10, project_id = 'default' } = options

    if (provider !== 'auto' && !this.providers.has(provider)) {
      return {
        success: false,
        query,
        total_found: 0,
        returned_count: 0,
        providers_queried: [],
        candidates: [],
        search_status: 'ERROR',
        workflow_guidance: `External media provider "${provider}" is not recognized. Available providers: ${this.getAvailableProviders().join(', ')}.`,
      }
    }

    const targetProviders = this.resolveProviders(options)
    if (targetProviders.length === 0) {
      return {
        success: false,
        query,
        total_found: 0,
        returned_count: 0,
        providers_queried: [],
        candidates: [],
        search_status: 'NO_RESULTS',
        workflow_guidance: `No matching providers available for media type "${media_type}".`,
      }
    }

    // Stalled search protection with query recovery
    const progressKey = `${project_id}:${provider}:${media_type}`
    const previous = this.searchProgress.get(progressKey) as
      | { seen: Set<string>; stalled: number; updated: number; lastQuery?: string }
      | undefined
    const progress =
      previous && Date.now() - previous.updated < 180000
        ? previous
        : { seen: new Set<string>(), stalled: 0, updated: Date.now(), lastQuery: '' }

    const normQuery = query.trim().toLowerCase()
    const isSimilarQuery =
      progress.lastQuery &&
      (progress.lastQuery === normQuery ||
        progress.lastQuery.includes(normQuery) ||
        normQuery.includes(progress.lastQuery))

    if (!isSimilarQuery && progress.stalled >= 3) {
      // Query topic changed meaningfully: reset stalled counter for new search direction
      progress.stalled = 0
    } else if (progress.stalled >= 3 && isSimilarQuery) {
      return {
        success: false,
        query,
        total_found: 0,
        returned_count: 0,
        providers_queried: targetProviders.map((p) => p.name),
        candidates: [],
        search_status: 'EXHAUSTED',
        progress: {
          new_candidate_count: 0,
          consecutive_no_progress: progress.stalled,
          action: 'change_strategy',
        },
        workflow_guidance:
          'Repeated searches for this topic returned no new candidates. This search route is exhausted. Choose a different provider or media type, use local project footage, request licensed media from the user, or skip B-roll for this moment. Do not loop searches.',
      }
    }

    // Query providers concurrently with 8s individual timeout
    const queryPromises = targetProviders.map(async (p) => {
      let timeoutId: NodeJS.Timeout | undefined
      try {
        const candidates = await Promise.race([
          p.search(options),
          new Promise<ExternalMediaCandidate[]>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error(`${p.name} search timed out after 8000ms`)),
              8000,
            )
          }),
        ])
        return { provider: p.name, candidates, error: null as string | null }
      } catch (error) {
        return {
          provider: p.name,
          candidates: [] as ExternalMediaCandidate[],
          error: error instanceof Error ? error.message : String(error),
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
      }
    })

    const rawResults = await Promise.all(queryPromises)
    const candidates: ExternalMediaCandidate[] = []
    const seenUrls = new Set<string>()
    const seenAssetKeys = new Set<string>()

    for (const { candidates: batch } of rawResults) {
      for (const candidate of batch) {
        if (!candidate || typeof candidate !== 'object') continue
        // Validate required candidate fields to reject malformed metadata
        if (!candidate.candidate_id?.trim() || !candidate.title?.trim() || !candidate.provider) continue
        if (candidate.media_type !== 'video' && candidate.media_type !== 'image') continue
        if (!candidate.rights_status || !candidate.import_mode) continue

        if (media_type !== 'either' && candidate.media_type !== media_type) {
          continue
        }

        const assetKey = `${candidate.provider}:${candidate.provider_asset_id}`
        if (seenAssetKeys.has(assetKey) || seenAssetKeys.has(candidate.candidate_id)) {
          continue
        }

        const dedupeUrl =
          candidate.direct_media_url || candidate.source_page_url || candidate.thumbnail_url
        if (dedupeUrl && seenUrls.has(dedupeUrl)) {
          continue
        }

        if (dedupeUrl) seenUrls.add(dedupeUrl)
        seenAssetKeys.add(assetKey)
        seenAssetKeys.add(candidate.candidate_id)
        candidates.push(candidate)
      }
    }

    // Sort: AUTO_IMPORT with direct media URL first, then other candidates
    candidates.sort((a, b) => {
      const aAuto = a.import_mode === 'AUTO_IMPORT' && Boolean(a.direct_media_url) ? 1 : 0
      const bAuto = b.import_mode === 'AUTO_IMPORT' && Boolean(b.direct_media_url) ? 1 : 0
      return bAuto - aAuto
    })

    const trimmed = candidates.slice(0, limit)
    this.cacheCandidates(trimmed)

    // Stalled search detection
    const newCandidateCount = trimmed.filter(
      (c) => !progress.seen.has(c.direct_media_url || c.source_page_url || c.candidate_id),
    ).length
    for (const c of trimmed) {
      progress.seen.add(c.direct_media_url || c.source_page_url || c.candidate_id)
    }

    if (newCandidateCount > 0) {
      progress.stalled = 0
    } else {
      progress.stalled += 1
    }
    progress.lastQuery = normQuery
    progress.updated = Date.now()
    this.searchProgress.set(progressKey, progress)

    const failedProviders = rawResults.filter((r) => r.error)
    const successfulProviders = rawResults.length - failedProviders.length

    if (progress.stalled >= 3) {
      return {
        success: false,
        query,
        total_found: 0,
        returned_count: 0,
        providers_queried: targetProviders.map((p) => p.name),
        candidates: [],
        search_status: 'EXHAUSTED',
        provider_outcomes: rawResults.map((r) => ({
          provider: r.provider,
          count: r.candidates.length,
          error: r.error,
        })),
        progress: {
          new_candidate_count: 0,
          consecutive_no_progress: progress.stalled,
          action: 'change_strategy',
        },
        workflow_guidance:
          'Repeated searches for this topic returned no new candidates. This search route is exhausted. Choose a different provider or media type, use local project footage, request licensed media from the user, or skip B-roll for this moment. Do not loop searches.',
      }
    }

    let search_status: 'OK' | 'PARTIAL' | 'EXHAUSTED' | 'NO_RESULTS' | 'ERROR' = 'OK'
    if (successfulProviders === 0) {
      search_status = 'ERROR'
    } else if (failedProviders.length > 0) {
      search_status = 'PARTIAL'
    } else if (trimmed.length === 0) {
      search_status = 'NO_RESULTS'
    }

    let workflow_guidance: string
    if (successfulProviders === 0) {
      workflow_guidance = `No external provider completed the search: ${failedProviders.map((r) => `${r.provider}: ${r.error}`).join('; ')}`
    } else if (trimmed.length === 0) {
      workflow_guidance =
        'No verified external media matched this request. Do not invent a fake asset; refine search terms, use local creator media, or skip B-roll.'
    } else if (progress.stalled >= 1) {
      workflow_guidance =
        'No new candidates found in this search. Do NOT loop retrying; inspect existing candidates, use local project footage, or proceed with timeline editing.'
    } else if (trimmed.every((c) => c.import_mode !== 'AUTO_IMPORT')) {
      workflow_guidance =
        'All discovered candidates require manual licensing or user import (USER_IMPORT / DISCOVERY_ONLY). Automatic direct download is prohibited. Present links to user or check local footage.'
    } else {
      workflow_guidance =
        'Inspect candidate metadata and licensing before import. Once imported, use get_source_observations to verify visual contents and select the exact useful range.'
    }

    return {
      success: successfulProviders > 0,
      query,
      total_found: candidates.length,
      returned_count: trimmed.length,
      providers_queried: targetProviders.map((p) => p.name),
      candidates: trimmed,
      search_status,
      provider_outcomes: rawResults.map((r) => ({
        provider: r.provider,
        count: r.candidates.length,
        error: r.error,
      })),
      progress: {
        new_candidate_count: newCandidateCount,
        consecutive_no_progress: progress.stalled,
        action: progress.stalled >= 2 ? 'change_strategy' : 'continue',
      },
      workflow_guidance,
    }
  }

  async resolveVisualIntents(
    intents: BatchVisualIntentItem[],
    options: {
      useVlm?: boolean
      project_id?: string
      maxCandidatesPerIntent?: number
    } = {}
  ): Promise<ResolveVisualIntentsResponse> {
    const startTime = Date.now()
    const boundedIntents = intents.slice(0, 6)

    const telemetry: ResolveVisualIntentsTelemetry = {
      providers_queried: 0,
      raw_candidates_found: 0,
      candidates_after_cheap_filter: 0,
      qwen_inference_calls: 0,
      cache_hits: 0,
    }

    const intentPromises = boundedIntents.map(async (intent, index): Promise<BatchVisualIntentResult> => {
      const intent_id = intent.intent_id || `intent_${index + 1}`
      const subject = (intent.subject ?? '').trim()
      const media_preference = intent.media_preference || 'either'

      if (!subject) {
        return {
          intent_id,
          subject: subject || 'Untitled intent',
          timeline_start_us: intent.timeline_start_us,
          timeline_end_us: intent.timeline_end_us,
          media_preference,
          candidates_found: 0,
          candidates_evaluated: 0,
          ranked_candidates: [],
          editorial_summary: 'VisualIntent has no subject or search criteria.',
          error: 'Empty subject',
        }
      }

      try {
        // 1. Determine providers based on intent specificity and authenticity
        const isExactFactual =
          intent.specificity === 'exact' || intent.authenticity === 'required'

        const effectiveQuery =
          intent.search_terms && intent.search_terms.length > 0
            ? intent.search_terms[0]
            : subject

        const searchOptions: ExternalMediaSearchOptions = {
          query: effectiveQuery,
          media_type: media_preference,
          visual_intent: intent,
          project_id: options.project_id ?? 'default',
        }

        const targetProviders = this.resolveProviders(searchOptions)
        const filteredProviders = isExactFactual
          ? targetProviders.filter((p) => p.name !== 'pexels' && p.name !== 'pixabay')
          : targetProviders

        // 2. Query target providers in parallel with bounded searchSemaphore (max 6)
        const providerPromises = filteredProviders.map(async (provider) => {
          const normQuery = effectiveQuery.toLowerCase()
          const cacheKey = `${provider.name}:${media_preference}:${normQuery}`
          const cached = this.searchResultCache.get(cacheKey)

          if (cached && Date.now() - cached.timestamp < 600_000) {
            telemetry.cache_hits++
            return { provider: provider.name, candidates: cached.candidates, fromCache: true }
          }

          const release = await this.searchSemaphore.acquire()
          try {
            telemetry.providers_queried++
            let timeoutId: NodeJS.Timeout | undefined
            const candidates = await Promise.race([
              runtimeScheduler.run('stock_search',['network'],()=>provider.search(searchOptions)),
              new Promise<ExternalMediaCandidate[]>((_, reject) => {
                timeoutId = setTimeout(
                  () => reject(new Error(`${provider.name} search timed out after 8000ms`)),
                  8000
                )
              }),
            ])
            if (timeoutId) clearTimeout(timeoutId)

            this.searchResultCache.set(cacheKey, { candidates, timestamp: Date.now() })
            return { provider: provider.name, candidates, fromCache: false }
          } catch (e) {
            console.warn(`[externalMediaService] Provider ${provider.name} search failed:`, e)
            return { provider: provider.name, candidates: [] as ExternalMediaCandidate[], fromCache: false }
          } finally {
            release()
          }
        })

        const providerResults = await Promise.all(providerPromises)
        let rawCandidates: ExternalMediaCandidate[] = []
        for (const res of providerResults) {
          rawCandidates.push(...res.candidates)
        }

        // If natural language query yielded 0 results, retry with simplified core keywords
        if (rawCandidates.length === 0 && subject.split(/\s+/).length > 3) {
          const simplified = subject
            .replace(/\b(presenting|unveiling|first|the|a|an|in|at|on|of|with|holding|showing|standing)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
          if (simplified && simplified.toLowerCase() !== effectiveQuery.toLowerCase()) {
            const fallbackPromises = filteredProviders.map(async (provider) => {
              const release = await this.searchSemaphore.acquire()
              try {
                return await runtimeScheduler.run('stock_search',['network'],()=>provider.search({ ...searchOptions, query: simplified }))
              } catch {
                return []
              } finally {
                release()
              }
            })
            const fallbackResults = await Promise.all(fallbackPromises)
            for (const list of fallbackResults) {
              rawCandidates.push(...list)
            }
          }
        }
        telemetry.raw_candidates_found += rawCandidates.length

        // 3. Cheap Filter First (metadata, rights, dimensions, lexical overlap, deduplication)
        const cheapResult = cheapFilterCandidates(rawCandidates, intent, {
          maxCandidates: options.maxCandidatesPerIntent ?? 6,
        })
        telemetry.candidates_after_cheap_filter += cheapResult.accepted.length

        // 4. Batch Qwen Candidate Inspection (contact sheet + structured parsing)
        const ranked = await evaluateVisualCandidates(cheapResult.accepted, intent, {
          useVlm: options.useVlm !== false,
          onTelemetry: (t) => {
            telemetry.qwen_inference_calls += t.qwenCalls
            telemetry.cache_hits += t.cacheHits
          },
        })

        // Cache all candidates so they can be imported by candidate_id
        this.cacheCandidates(rawCandidates)
        this.cacheCandidates(ranked.map((r) => r.candidate))

        // 5. Editorial summary
        let editorial_summary: string
        if (ranked.length === 0) {
          editorial_summary =
            'No verified external candidates matched this request. Do not fake an asset; consider local footage or skip B-roll.'
        } else {
          const top = ranked[0]
          editorial_summary = `Top recommendation: [${top.candidate.provider.toUpperCase()}] ${top.candidate.media_type} "${top.candidate.title}" (${top.judgment?.visual_relevance ?? 'usable'}). Rights: ${top.candidate.import_mode}.`
        }

        return {
          intent_id,
          subject,
          timeline_start_us: intent.timeline_start_us,
          timeline_end_us: intent.timeline_end_us,
          media_preference,
          candidates_found: rawCandidates.length,
          candidates_evaluated: ranked.length,
          ranked_candidates: ranked,
          editorial_summary,
          error: null,
        }
      } catch (err) {
        return {
          intent_id,
          subject,
          timeline_start_us: intent.timeline_start_us,
          timeline_end_us: intent.timeline_end_us,
          media_preference,
          candidates_found: 0,
          candidates_evaluated: 0,
          ranked_candidates: [],
          editorial_summary: `Failed to resolve intent: ${err instanceof Error ? err.message : String(err)}`,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })

    const settled = await Promise.allSettled(intentPromises)
    const intentResults: BatchVisualIntentResult[] = settled.map((s, idx) => {
      if (s.status === 'fulfilled') return s.value
      return {
        intent_id: boundedIntents[idx]?.intent_id || `intent_${idx + 1}`,
        subject: boundedIntents[idx]?.subject || 'Unknown',
        media_preference: boundedIntents[idx]?.media_preference || 'either',
        candidates_found: 0,
        candidates_evaluated: 0,
        ranked_candidates: [],
        editorial_summary: 'Unexpected failure in intent resolution.',
        error: String(s.reason),
      }
    })

    const total_wall_clock_ms = Date.now() - startTime
    const hermes_compact_summary = formatHermesCompactSummary(intentResults, total_wall_clock_ms)

    return {
      success: intentResults.some((r) => !r.error && r.ranked_candidates.length > 0),
      intents: intentResults,
      total_wall_clock_ms,
      hermes_compact_summary,
      telemetry,
    }
  }
}

export function formatHermesCompactSummary(
  results: BatchVisualIntentResult[],
  totalMs: number
): string {
  const lines: string[] = []
  lines.push(`### Batch Visual Discovery & Candidate Intelligence (${totalMs}ms)\n`)
  for (const res of results) {
    lines.push(`VisualIntent: "${res.subject}"`)
    if (res.timeline_start_us !== undefined && res.timeline_end_us !== undefined) {
      lines.push(
        `Moment: ${(res.timeline_start_us / 1e6).toFixed(1)}s - ${(res.timeline_end_us / 1e6).toFixed(1)}s | Preference: ${res.media_preference}`
      )
    }
    if (res.error) {
      lines.push(`Status: Error (${res.error})\n`)
      continue
    }
    if (res.ranked_candidates.length === 0) {
      lines.push(`Candidates: No candidates passed visual/rights filtering.\nEditorial Advice: ${res.editorial_summary}\n`)
      continue
    }
    lines.push('Candidates:')
    res.ranked_candidates.slice(0, 4).forEach((rc, i) => {
      const c = rc.candidate
      const j = rc.judgment
      const qwenSummary = j
        ? `Qwen: ${j.visual_relevance.toUpperCase()} / ${j.authenticity} / ${j.specificity} — ${j.reason}`
        : 'Metadata evaluated'
      lines.push(`${i + 1}. [${c.provider.toUpperCase()}] ${c.media_type} — "${c.title}"`)
      lines.push(`   ${qwenSummary}`)
      lines.push(`   Rights: ${c.import_mode} (${c.rights_status}) | Candidate ID: ${c.candidate_id}`)
    })
    lines.push(`Editorial Guidance: ${res.editorial_summary}\n`)
  }
  return lines.join('\n')
}

export const externalMediaService = new ExternalMediaService()

