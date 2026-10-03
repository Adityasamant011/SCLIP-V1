import type {
  BatchVisualIntentItem,
  ExternalMediaCandidate,
} from './types.js'


const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can\'t', 'cannot', 'could', 'couldn\'t',
  'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here',
  'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
  'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it',
  'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so',
  'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll',
  'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re',
  'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where',
  'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with',
  'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve',
  'your', 'yours', 'yourself', 'yourselves', 'video', 'image', 'photo', 'footage', 'clip'
])

export interface CheapFilterResult {
  accepted: ExternalMediaCandidate[]
  filteredCount: number
  rejectionReasons: Record<string, number>
}

export interface CheapFilterOptions {
  maxCandidates?: number
  minDimension?: number
  checkDuration?: boolean
}

export function extractTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
}

export function computeLexicalOverlap(
  candidate: ExternalMediaCandidate,
  intent: BatchVisualIntentItem
): { score: number; matchedTokens: string[] } {
  const intentText = [
    intent.subject ?? '',
    intent.event ?? '',
    intent.action ?? '',
    intent.location ?? '',
    ...(intent.search_terms ?? []),
  ].join(' ')

  const queryTokens = extractTokens(intentText)
  if (queryTokens.length === 0) {
    return { score: 1, matchedTokens: [] }
  }

  const candidateText = [
    candidate.title,
    candidate.description ?? '',
    candidate.query_used ?? '',
    candidate.creator ?? '',
  ]
    .join(' ')
    .toLowerCase()

  const matched = queryTokens.filter((token) => candidateText.includes(token))
  const score = matched.length / queryTokens.length
  return { score, matchedTokens: matched }
}

/**
 * Filter candidates cheaply before calling VLM.
 * Applies metadata, rights, orientation, duration, lexical overlap, and multi-key deduplication.
 */
export function cheapFilterCandidates(
  candidates: ExternalMediaCandidate[],
  intent: BatchVisualIntentItem,
  options: CheapFilterOptions = {}
): CheapFilterResult {
  const { maxCandidates = 6, minDimension = 150, checkDuration = true } = options
  const rejectionReasons: Record<string, number> = {}

  const reject = (reason: string) => {
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1
  }

  const seenDirectUrls = new Set<string>()
  const seenSourceUrls = new Set<string>()
  const seenThumbnailUrls = new Set<string>()
  const seenAssetKeys = new Set<string>()

  // Tokenize intent for lexical matching
  const intentText = [
    intent.subject ?? '',
    intent.event ?? '',
    intent.action ?? '',
    intent.location ?? '',
    ...(intent.search_terms ?? []),
  ].join(' ')
  const intentTokens = extractTokens(intentText)

  const scoredCandidates: Array<{
    candidate: ExternalMediaCandidate
    lexicalScore: number
  }> = []

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      reject('invalid_candidate_object')
      continue
    }

    // 1. Mandatory metadata validation
    if (!candidate.candidate_id?.trim() || !candidate.title?.trim() || !candidate.thumbnail_url?.trim()) {
      reject('missing_mandatory_metadata')
      continue
    }

    // 2. Rights check: discard BLOCKED assets
    if (candidate.rights_status === 'BLOCKED') {
      reject('rights_blocked')
      continue
    }

    // 3. Media type match
    if (intent.media_preference && intent.media_preference !== 'either') {
      if (candidate.media_type !== intent.media_preference) {
        reject('media_type_mismatch')
        continue
      }
    }

    // 4. Resolution check (discard tiny icons/thumbnails)
    if (candidate.width !== undefined && candidate.height !== undefined) {
      if (candidate.width < minDimension || candidate.height < minDimension) {
        reject('resolution_too_low')
        continue
      }
    }

    // 5. Orientation check (if intent specifies orientation)
    if (candidate.orientation && (intent as any).orientation) {
      const wanted = (intent as any).orientation
      if (wanted !== candidate.orientation) {
        reject('orientation_mismatch')
        continue
      }
    }

    // 6. Video duration check
    if (checkDuration && candidate.media_type === 'video') {
      if (candidate.duration !== undefined && candidate.duration <= 0) {
        reject('video_duration_zero_or_negative')
        continue
      }
      if (intent.duration_needed_us && candidate.duration !== undefined) {
        const neededSec = intent.duration_needed_us / 1_000_000
        // If candidate clip is less than 20% of needed duration (when needed is > 3s), reject
        if (neededSec > 3 && candidate.duration < Math.min(2, neededSec * 0.2)) {
          reject('video_duration_too_short')
          continue
        }
      }
    }

    // 7. Deduplication across multiple identifiers
    const assetKey = `${candidate.provider}:${candidate.provider_asset_id}`
    if (seenAssetKeys.has(assetKey) || seenAssetKeys.has(candidate.candidate_id)) {
      reject('duplicate_asset_id')
      continue
    }

    if (candidate.direct_media_url && seenDirectUrls.has(candidate.direct_media_url)) {
      reject('duplicate_direct_url')
      continue
    }

    if (candidate.source_page_url && seenSourceUrls.has(candidate.source_page_url)) {
      reject('duplicate_source_url')
      continue
    }

    if (candidate.thumbnail_url && seenThumbnailUrls.has(candidate.thumbnail_url)) {
      reject('duplicate_thumbnail_url')
      continue
    }

    // 8. Obvious lexical mismatch
    const { score: lexicalScore } = computeLexicalOverlap(candidate, intent)
    // If we have strong multi-word intent (>2 distinct tokens) and candidate shares 0 tokens, filter out
    if (intentTokens.length >= 3 && lexicalScore === 0) {
      reject('lexical_mismatch')
      continue
    }

    // Register deduplication keys
    seenAssetKeys.add(assetKey)
    seenAssetKeys.add(candidate.candidate_id)
    if (candidate.direct_media_url) seenDirectUrls.add(candidate.direct_media_url)
    if (candidate.source_page_url) seenSourceUrls.add(candidate.source_page_url)
    if (candidate.thumbnail_url) seenThumbnailUrls.add(candidate.thumbnail_url)

    scoredCandidates.push({ candidate, lexicalScore })
  }

  // Rank reasonable candidates before selecting top N for VLM
  scoredCandidates.sort((a, b) => {
    // 1. Lexical overlap score
    if (Math.abs(b.lexicalScore - a.lexicalScore) > 0.1) {
      return b.lexicalScore - a.lexicalScore
    }
    // 2. AUTO_IMPORT preference with direct media url
    const aAuto = a.candidate.import_mode === 'AUTO_IMPORT' && Boolean(a.candidate.direct_media_url) ? 1 : 0
    const bAuto = b.candidate.import_mode === 'AUTO_IMPORT' && Boolean(b.candidate.direct_media_url) ? 1 : 0
    if (bAuto !== aAuto) return bAuto - aAuto

    // 3. Higher resolution preference
    const aRes = (a.candidate.width ?? 0) * (a.candidate.height ?? 0)
    const bRes = (b.candidate.width ?? 0) * (b.candidate.height ?? 0)
    return bRes - aRes
  })

  const topShortlist = scoredCandidates.slice(0, maxCandidates).map((sc) => sc.candidate)

  return {
    accepted: topShortlist,
    filteredCount: candidates.length - topShortlist.length,
    rejectionReasons,
  }
}
