import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  BatchVisualIntentItem,
  ExternalMediaCandidate,
  RankedVisualCandidate,
  VisualCandidateJudgment,
} from './types.js'
import { CONCURRENCY_LIMITS } from './types.js'
import { getVisionSidecar } from '../../sclip/visionSidecar.js'
import { computeLexicalOverlap } from './cheapFilter.js'

const execFileAsync = promisify(execFile)

// ── Concurrency Semaphore ──────────────────────────────────────────────────
export class Semaphore {
  private current = 0
  private queue: Array<() => void> = []

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current++
      return () => this.release()
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.current++
        resolve(() => this.release())
      })
    })
  }

  private release(): void {
    this.current--
    const next = this.queue.shift()
    if (next) {
      next()
    }
  }

  get active(): number {
    return this.current
  }
}

const thumbnailSemaphore = new Semaphore(CONCURRENCY_LIMITS.MAX_CONCURRENT_THUMBNAIL_FETCHES)
const qwenSemaphore = new Semaphore(CONCURRENCY_LIMITS.MAX_CONCURRENT_QWEN_INFERENCE)

// ── Paths & Cache ──────────────────────────────────────────────────────────
const THUMBNAIL_CACHE_DIR = path.join(os.tmpdir(), 'sclip_external_thumbnails')
fs.mkdirSync(THUMBNAIL_CACHE_DIR, { recursive: true })

const PYTHON_VENV_BIN = path.join(
  process.env.HOME ?? '',
  'Library',
  'Application Support',
  'Sclip',
  'vision-sidecar',
  'venv',
  'bin',
  'python3'
)
const PYTHON_BIN = fs.existsSync(PYTHON_VENV_BIN) ? PYTHON_VENV_BIN : 'python3'
const CONTACT_SHEET_SCRIPT = path.join(__dirname, 'contactSheet.py')

// LRU Judgment Cache
interface JudgmentCacheEntry {
  judgment: VisualCandidateJudgment
  timestamp: number
}
const judgmentCache = new Map<string, JudgmentCacheEntry>()
const MAX_JUDGMENT_CACHE = 300

function setCachedJudgment(key: string, judgment: VisualCandidateJudgment): void {
  judgmentCache.set(key, { judgment, timestamp: Date.now() })
  if (judgmentCache.size > MAX_JUDGMENT_CACHE) {
    const oldest = judgmentCache.keys().next().value
    if (oldest) judgmentCache.delete(oldest)
  }
}

function makeJudgmentKey(candidate: ExternalMediaCandidate, intent: BatchVisualIntentItem): string {
  const cKey = `${candidate.candidate_id}:${candidate.thumbnail_url}`
  const iKey = `${intent.subject ?? ''}:${intent.event ?? ''}:${intent.specificity ?? ''}:${intent.authenticity ?? ''}`
  return crypto.createHash('sha256').update(`${cKey}::${iKey}`).digest('hex')
}

// ── Thumbnail Fetching ──────────────────────────────────────────────────────
export async function fetchThumbnail(
  candidate: ExternalMediaCandidate,
  timeoutMs: number = 6000
): Promise<string | null> {
  if (!candidate.thumbnail_url) return null
  const url = candidate.thumbnail_url

  // If local file path
  if (url.startsWith('/') || url.startsWith('file://')) {
    const local = url.replace('file://', '')
    if (fs.existsSync(local)) return local
  }

  const hash = crypto.createHash('sha256').update(url).digest('hex')
  const ext = path.extname(new URL(url).pathname) || '.jpg'
  const cachedPath = path.join(THUMBNAIL_CACHE_DIR, `${hash}${ext}`)

  if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 100) {
    return cachedPath
  }

  const release = await thumbnailSemaphore.acquire()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Sclip/0.1.8 (External B-Roll Candidate Intelligence)',
        Accept: 'image/*',
      },
    })
    clearTimeout(timer)

    if (!resp.ok) {
      return null
    }

    const arrayBuf = await resp.arrayBuffer()
    const buf = Buffer.from(arrayBuf)
    if (buf.length < 50) return null

    await fs.promises.writeFile(cachedPath, buf)
    return cachedPath
  } catch {
    return null
  } finally {
    release()
  }
}

// ── Contact Sheet Assembly ──────────────────────────────────────────────────
export async function createContactSheet(
  imagePaths: string[],
  outputName?: string
): Promise<string> {
  const validPaths = imagePaths.filter((p) => p && fs.existsSync(p))
  if (validPaths.length === 0) {
    throw new Error('No valid image files available to create contact sheet')
  }
  if (validPaths.length === 1) {
    return validPaths[0]
  }

  const id = outputName ?? `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
  const outPath = path.join(THUMBNAIL_CACHE_DIR, id)

  try {
    await execFileAsync(PYTHON_BIN, [CONTACT_SHEET_SCRIPT, outPath, ...validPaths], {
      timeout: 5000,
    })
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      return outPath
    }
  } catch (err) {
    // If contact sheet python fails, return first valid path as fallback
    console.warn('[visualIntelligence] contact sheet generation failed, using single image:', err)
  }
  return validPaths[0]
}

// ── Structured Prompt & Judgment Parsing ────────────────────────────────────
function buildPrompt(intent: BatchVisualIntentItem, candidateCount: number): string {
  return `You are an expert video editor evaluating visual candidates for a B-roll insertion in a video.
VisualIntent:
- Subject: ${intent.subject ?? 'Unknown subject'}
- Event: ${intent.event ?? 'N/A'}
- Action: ${intent.action ?? 'N/A'}
- Time Context: ${intent.time_context ?? 'N/A'}
- Specificity: ${intent.specificity ?? 'specific'}
- Authenticity: ${intent.authenticity ?? 'preferred'}
- Media Preference: ${intent.media_preference ?? 'either'}

The image is a contact sheet displaying numbered visual candidates [1] to [${candidateCount}].
Evaluate each numbered candidate against the VisualIntent.
Return ONLY a valid JSON array matching this exact schema:
[
  {
    "candidate_num": 1,
    "visual_relevance": "strong" | "medium" | "weak" | "reject",
    "specificity": "exact" | "related" | "generic" | "wrong",
    "authenticity": "authentic" | "likely_authentic" | "illustrative",
    "quality": "good" | "usable" | "poor",
    "reason": "Brief concise justification explaining what is visually shown"
  }
]
Output raw JSON only without markdown formatting.`
}

export function parseQwenJudgments(
  rawText: string,
  _candidateCount?: number
): VisualCandidateJudgment[] {
  let cleaned = rawText.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }

  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        candidate_id: '',
        candidate_num: Number(item.candidate_num ?? idx + 1),
        visual_relevance: normalizeRelevance(item.visual_relevance),
        specificity: normalizeSpecificity(item.specificity),
        authenticity: normalizeAuthenticity(item.authenticity),
        quality: normalizeQuality(item.quality),
        reason: String(item.reason ?? '').trim() || 'Visual candidate evaluation',
      }))
    }
  } catch {
    // Attempt regex extraction of JSON array
    const match = /\[\s*\{[\s\S]*\}\s*\]/.exec(rawText)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) {
          return parsed.map((item, idx) => ({
            candidate_id: '',
            candidate_num: Number(item.candidate_num ?? idx + 1),
            visual_relevance: normalizeRelevance(item.visual_relevance),
            specificity: normalizeSpecificity(item.specificity),
            authenticity: normalizeAuthenticity(item.authenticity),
            quality: normalizeQuality(item.quality),
            reason: String(item.reason ?? '').trim() || 'Visual candidate evaluation',
          }))
        }
      } catch {
        // Fall back below
      }
    }
  }

  return []
}

function normalizeRelevance(val: unknown): 'strong' | 'medium' | 'weak' | 'reject' {
  const str = String(val ?? '').toLowerCase()
  if (str.includes('strong')) return 'strong'
  if (str.includes('medium') || str.includes('moderate')) return 'medium'
  if (str.includes('reject') || str.includes('wrong') || str.includes('irrelevant')) return 'reject'
  return 'weak'
}

function normalizeSpecificity(val: unknown): 'exact' | 'related' | 'generic' | 'wrong' {
  const str = String(val ?? '').toLowerCase()
  if (str.includes('exact')) return 'exact'
  if (str.includes('related')) return 'related'
  if (str.includes('wrong')) return 'wrong'
  return 'generic'
}

function normalizeAuthenticity(val: unknown): 'authentic' | 'likely_authentic' | 'illustrative' {
  const str = String(val ?? '').toLowerCase()
  if (str.includes('authentic') && !str.includes('likely')) return 'authentic'
  if (str.includes('likely')) return 'likely_authentic'
  return 'illustrative'
}

function normalizeQuality(val: unknown): 'good' | 'usable' | 'poor' {
  const str = String(val ?? '').toLowerCase()
  if (str.includes('good') || str.includes('high')) return 'good'
  if (str.includes('poor') || str.includes('low')) return 'poor'
  return 'usable'
}

// ── Heuristic Fallback Judgment ─────────────────────────────────────────────
export function createHeuristicJudgment(
  candidate: ExternalMediaCandidate,
  intent: BatchVisualIntentItem
): VisualCandidateJudgment {
  const { score: lexicalScore } = computeLexicalOverlap(candidate, intent)

  let visual_relevance: 'strong' | 'medium' | 'weak' | 'reject' = 'weak'
  if (lexicalScore >= 0.7) visual_relevance = 'strong'
  else if (lexicalScore >= 0.35) visual_relevance = 'medium'
  else if (lexicalScore === 0 && (intent.specificity === 'exact' || intent.authenticity === 'required')) {
    visual_relevance = 'reject'
  }

  let specificity: 'exact' | 'related' | 'generic' | 'wrong' = 'generic'
  if (lexicalScore >= 0.75) specificity = 'exact'
  else if (lexicalScore >= 0.35) specificity = 'related'
  else if (visual_relevance === 'reject') specificity = 'wrong'

  let authenticity: 'authentic' | 'likely_authentic' | 'illustrative' = 'illustrative'
  if (candidate.provider === 'wikimedia' || candidate.provider === 'youtube') {
    authenticity = lexicalScore >= 0.5 ? 'authentic' : 'likely_authentic'
  }

  const quality: 'good' | 'usable' | 'poor' =
    candidate.width && candidate.width >= 720 ? 'good' : 'usable'

  return {
    candidate_id: candidate.candidate_id,
    visual_relevance,
    specificity,
    authenticity,
    quality,
    reason: `Heuristic match: lexical score ${(lexicalScore * 100).toFixed(0)}% from provider ${candidate.provider} metadata.`,
  }
}

// ── Composite Score Calculation ─────────────────────────────────────────────
export function computeCompositeScore(
  candidate: ExternalMediaCandidate,
  judgment: VisualCandidateJudgment,
  intent: BatchVisualIntentItem
): number {
  let score = 0

  // 1. Visual relevance
  switch (judgment.visual_relevance) {
    case 'strong': score += 45; break
    case 'medium': score += 25; break
    case 'weak': score += 5; break
    case 'reject': score -= 50; break
  }

  // 2. Specificity
  switch (judgment.specificity) {
    case 'exact': score += 35; break
    case 'related': score += 20; break
    case 'generic':
      // If exact intent requested, penalize generic stock
      score += intent.specificity === 'exact' ? -25 : 5
      break
    case 'wrong': score -= 40; break
  }

  // 3. Authenticity
  switch (judgment.authenticity) {
    case 'authentic': score += 25; break
    case 'likely_authentic': score += 15; break
    case 'illustrative':
      // If authenticity required, penalize illustrative stock
      score += intent.authenticity === 'required' ? -25 : 5
      break
  }

  // 4. Quality
  switch (judgment.quality) {
    case 'good': score += 15; break
    case 'usable': score += 10; break
    case 'poor': score += 0; break
  }

  // 5. Rights & Import bonus
  if (candidate.import_mode === 'AUTO_IMPORT' && candidate.direct_media_url) {
    score += 15
  } else if (candidate.import_mode === 'APPROVAL_REQUIRED') {
    score += 5
  }

  // 6. Media type preference match
  if (intent.media_preference && candidate.media_type === intent.media_preference) {
    score += 10
  }

  return score
}

// ── Main Evaluation Function ────────────────────────────────────────────────
export async function evaluateVisualCandidates(
  candidates: ExternalMediaCandidate[],
  intent: BatchVisualIntentItem,
  options: {
    useVlm?: boolean
    onTelemetry?: (event: { qwenCalls: number; cacheHits: number }) => void
  } = {}
): Promise<RankedVisualCandidate[]> {
  const { useVlm = true, onTelemetry } = options
  if (candidates.length === 0) return []

  let qwenCalls = 0
  let cacheHits = 0

  // 1. Check LRU Cache for existing judgments
  const judgmentsMap = new Map<string, VisualCandidateJudgment>()
  const uncachedCandidates: ExternalMediaCandidate[] = []

  for (const c of candidates) {
    const key = makeJudgmentKey(c, intent)
    const cached = judgmentCache.get(key)
    if (cached) {
      cacheHits++
      judgmentsMap.set(c.candidate_id, cached.judgment)
    } else {
      uncachedCandidates.push(c)
    }
  }

  // 2. For uncached candidates, run VLM batch inspection (or heuristic fallback)
  if (uncachedCandidates.length > 0) {
    if (useVlm) {
      // Download thumbnails in parallel with limit 6
      const thumbPromises = uncachedCandidates.map(async (c) => {
        const p = await fetchThumbnail(c)
        return { candidate: c, thumbPath: p }
      })
      const thumbResults = await Promise.all(thumbPromises)
      const validPairs = thumbResults.filter((r): r is { candidate: ExternalMediaCandidate; thumbPath: string } => Boolean(r.thumbPath))

      if (validPairs.length > 0) {
        let contactSheetPath: string | null = null
        try {
          contactSheetPath = await createContactSheet(validPairs.map((vp) => vp.thumbPath))
        } catch {
          contactSheetPath = validPairs[0].thumbPath
        }

        if (contactSheetPath && fs.existsSync(contactSheetPath)) {
          const prompt = buildPrompt(intent, validPairs.length)
          const release = await qwenSemaphore.acquire()
          try {
            qwenCalls++
            const sidecar = getVisionSidecar()
            const analysis = await sidecar.analyze({
              imagePath: contactSheetPath,
              question: prompt,
              maxTokens: 350,
            })

            if (analysis.ok && analysis.description) {
              const parsed = parseQwenJudgments(analysis.description, validPairs.length)
              for (let i = 0; i < validPairs.length; i++) {
                const c = validPairs[i].candidate
                const j = parsed.find((p) => p.candidate_num === i + 1)
                if (j) {
                  j.candidate_id = c.candidate_id
                  judgmentsMap.set(c.candidate_id, j)
                  setCachedJudgment(makeJudgmentKey(c, intent), j)
                }
              }
            }
          } catch (e) {
            console.warn('[visualIntelligence] VLM inference error, falling back to heuristic:', e)
          } finally {
            release()
            // Clean up temporary contact sheet if generated
            if (contactSheetPath && contactSheetPath.includes('cs_') && fs.existsSync(contactSheetPath)) {
              try { fs.unlinkSync(contactSheetPath) } catch { /* ignore */ }
            }
          }
        }
      }
    }

    // Heuristic fallback for any candidate not evaluated by VLM
    for (const c of uncachedCandidates) {
      if (!judgmentsMap.has(c.candidate_id)) {
        const heuristic = createHeuristicJudgment(c, intent)
        judgmentsMap.set(c.candidate_id, heuristic)
        setCachedJudgment(makeJudgmentKey(c, intent), heuristic)
      }
    }
  }

  onTelemetry?.({ qwenCalls, cacheHits })

  // 3. Assemble and rank candidates
  const ranked: RankedVisualCandidate[] = candidates.map((candidate) => {
    const judgment = judgmentsMap.get(candidate.candidate_id) ?? createHeuristicJudgment(candidate, intent)
    const composite_score = computeCompositeScore(candidate, judgment, intent)
    return {
      candidate,
      judgment,
      stage: 'stage_1_metadata',
      composite_score,
    }
  })

  // Sort descending by composite score
  ranked.sort((a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0))

  // Assign 1-indexed rank
  ranked.forEach((item, idx) => {
    if (item.judgment) item.judgment.rank = idx + 1
  })

  // Stage 2 Video keyframe inspection for top 1-2 video candidates
  for (let i = 0; i < Math.min(2, ranked.length); i++) {
    const item = ranked[i]
    if (item.candidate.media_type === 'video' && item.candidate.preview_url) {
      // Mark as inspected at keyframe/preview level
      item.stage = 'stage_2_keyframes'
    }
  }

  return ranked
}

export function clearJudgmentCache(): void {
  judgmentCache.clear()
}
