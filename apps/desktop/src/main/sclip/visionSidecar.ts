/**
 * VisionSidecarManager — TypeScript manager for the Python mlx-vlm sidecar (macOS).
 *
 * Implements:
 *   - Fast execution through Metal GPU & Qwen3-VL-2B
 *   - In-memory bounded LRU query cache (<1ms cache hits)
 *   - Adaptive resolution scaling (auto 512px / 672px / 768px / original)
 *   - Multi-frame batch inference
 *   - Keep-warm 300s (5-minute) idle timeout
 *   - Process isolation and supervisor auto-restart
 */

import { spawn, type ChildProcess } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_MODEL = process.env.SCLIP_VLM_MODEL ?? 'mlx-community/Qwen3-VL-2B-Instruct-4bit'
const IDLE_TIMEOUT_S = 300 // 5 minutes keep-warm
const STARTUP_TIMEOUT_MS = 30_000
const HEALTH_POLL_INTERVAL_MS = 500

const VENV_DIR = path.join(
  process.env.HOME ?? '',
  'Library', 'Application Support', 'Sclip', 'vision-sidecar', 'venv',
)

function resolveWorkerScript(): string {
  // Source tests run from src/main/sclip; electron-vite runs from out/main.
  // In a packaged app the Python worker is an extraResource outside app.asar.
  const source = path.resolve(__dirname, '..', '..', 'vision', 'sidecar', 'vlm_worker.py')
  const built = path.resolve(__dirname, '..', '..', 'src', 'vision', 'sidecar', 'vlm_worker.py')
  const packaged = path.join(process.resourcesPath ?? '', 'vision', 'sidecar', 'vlm_worker.py')
  const relativeToResources = process.resourcesPath ? path.relative(process.resourcesPath, __dirname) : '..'
  if (relativeToResources !== '..' && !relativeToResources.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToResources)) return packaged
  if (path.basename(__dirname) === 'sclip' && path.basename(path.dirname(__dirname)) === 'main') return source
  return built
}

const WORKER_SCRIPT = resolveWorkerScript()

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AnalyzeRequest {
  imagePath?:   string
  imagePaths?:  string[]
  question:     string
  context?:     string
  resolution?:  'auto' | 'low' | 'high' | 'original'
  maxTokens?:   number
}

export interface AnalyzeResult {
  ok:               boolean
  description:      string
  confidence:       'high' | 'medium' | 'low' | null
  latencyMs:        number
  model:            string
  visibleContent:   string[]
  framingOk?:       boolean | null
  subjectVisible?:  boolean | null
  subjectPosition?: string | null
  resolutionUsed?:  string
  inputFrames?:     number
  outputTokens?: number
  outputLimitReached?: boolean | null
  cached?:          boolean
  error?:           string
}

export interface SidecarStatus {
  running:     boolean
  state:       string
  modelLoaded: boolean
  model:       string
  idleS:       number
  port:        number | null
  error?:      string | null
}

// ── LRU Query Cache ───────────────────────────────────────────────────────────
interface CacheEntry {
  key:         string
  result:      AnalyzeResult
  fingerprint: string
  timestamp:   number
}

class BoundedQueryCache {
  private readonly maxEntries = 100
  private cache = new Map<string, CacheEntry>()

  makeKey(req: AnalyzeRequest): string {
    const paths = (req.imagePaths ?? (req.imagePath ? [req.imagePath] : [])).join(',')
    const q = req.question.trim().toLowerCase()
    const ctx = (req.context ?? '').trim().toLowerCase()
    const res = req.resolution ?? 'auto'
    const tok = req.maxTokens ?? 0
    return crypto.createHash('sha256').update(`${paths}::${q}::${ctx}::${res}::${tok}`).digest('hex')
  }

  getFingerprint(paths: string[]): string {
    try {
      const stats = paths.map(p => {
        const st = fs.statSync(p)
        return `${p}:${st.size}:${st.mtimeMs}`
      }).join('|')
      return crypto.createHash('sha256').update(stats).digest('hex')
    } catch {
      return ''
    }
  }

  get(req: AnalyzeRequest): AnalyzeResult | null {
    const key = this.makeKey(req)
    const entry = this.cache.get(key)
    if (!entry) return null

    const paths = req.imagePaths ?? (req.imagePath ? [req.imagePath] : [])
    const currentFp = this.getFingerprint(paths)
    if (!currentFp || currentFp !== entry.fingerprint) {
      this.cache.delete(key)
      return null
    }

    // Refresh LRU order
    this.cache.delete(key)
    this.cache.set(key, entry)
    return { ...entry.result, cached: true, latencyMs: 0 }
  }

  set(req: AnalyzeRequest, result: AnalyzeResult): void {
    if (!result.ok) return
    const key = this.makeKey(req)
    const paths = req.imagePaths ?? (req.imagePath ? [req.imagePath] : [])
    const fp = this.getFingerprint(paths)
    if (!fp) return

    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      key,
      result,
      fingerprint: fp,
      timestamp: Date.now(),
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

async function httpPost(url: string, body: unknown): Promise<unknown> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text}`)
  }
  return resp.json()
}

async function httpGet(url: string): Promise<unknown> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

// ── Main class ────────────────────────────────────────────────────────────────
export class VisionSidecarManager {
  private proc:         ChildProcess | null = null
  private port:         number | null = null
  private startPromise: Promise<void> | null = null
  private restartCount  = 0
  private readonly maxRestarts = 1
  private readonly model: string
  private readonly queryCache = new BoundedQueryCache()

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model
  }

  /** Invalidate visual cache (e.g. after timeline mutations). */
  clearCache(): void {
    this.queryCache.clear()
  }

  /** Analyze an image frame and answer a visual question. */
  async analyze(req: AnalyzeRequest): Promise<AnalyzeResult> {
    // Check in-memory query cache (<1ms response)
    const cached = this.queryCache.get(req)
    if (cached) return cached

    // Ensure sidecar is running
    try {
      await this.ensureRunning()
    } catch (e) {
      return {
        ok: false,
        description: '',
        confidence: 'low',
        latencyMs: 0,
        model: this.model,
        visibleContent: [],
        error: `Sidecar failed to start: ${e instanceof Error ? e.message : String(e)}`,
      }
    }

    if (!this.port) {
      return {
        ok: false,
        description: '',
        confidence: 'low',
        latencyMs: 0,
        model: this.model,
        visibleContent: [],
        error: 'Sidecar port unknown',
      }
    }

    try {
      const url = `http://127.0.0.1:${this.port}/analyze`
      const payload = {
        image_path:   req.imagePath ?? null,
        image_paths:  req.imagePaths ?? null,
        question:     req.question,
        context:      req.context ?? null,
        resolution:   req.resolution ?? 'auto',
        max_tokens:   req.maxTokens ?? null,
      }

      const response = await httpPost(url, payload) as Record<string, unknown>

      const result: AnalyzeResult = {
        ok:               true,
        description:      String(response.description ?? ''),
        // Qwen prose is not calibrated confidence, including older workers.
        confidence:       null,
        latencyMs:        Number(response.latency_ms ?? 0),
        model:            String(response.model ?? this.model),
        visibleContent:   Array.isArray(response.visible_content) ? response.visible_content as string[] : [],
        framingOk:        response.framing_ok as boolean | null | undefined,
        subjectVisible:   response.subject_visible as boolean | null | undefined,
        subjectPosition:  response.subject_position as string | null | undefined,
        resolutionUsed:   response.resolution_used as string | undefined,
        inputFrames:      Number(response.input_frames ?? 1),
        outputTokens: typeof response.output_tokens === 'number' ? response.output_tokens : undefined,
        outputLimitReached: typeof response.output_limit_reached === 'boolean' ? response.output_limit_reached : null,
        cached:           false,
      }

      // Cache successful response
      this.queryCache.set(req, result)
      return result
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[vision-sidecar] analyze failed:', err)

      if (!this.isAlive() && this.restartCount < this.maxRestarts) {
        console.warn('[vision-sidecar] process died, attempting restart...')
        this.proc = null
        this.port = null
        this.startPromise = null
        this.restartCount++
        return this.analyze(req)
      }

      return {
        ok: false,
        description: '',
        confidence: 'low',
        latencyMs: 0,
        model: this.model,
        visibleContent: [],
        error: `Inference failed: ${err}`,
      }
    }
  }

  /** Analyzes an audio file for musical beats, speech chops, and awkward silence. */
  async analyzeAudio(req: {
    audioPath: string
    cutTimestampsUs?: number[]
    wordBoundaries?: Array<{ word?: string; text?: string; t_start_us: number; t_end_us: number }>
  }): Promise<{
    ok: boolean
    duration_s?: number
    duration_us?: number
    tempo_bpm?: number
    beats_us?: number[]
    speech_chops?: Array<{
      cut_t_us: number
      word: string
      word_start_us: number
      word_end_us: number
      severity: string
      description: string
      suggested_action: string
    }>
    awkward_silences?: Array<{
      start_us: number
      end_us: number
      duration_s: number
    }>
    has_clipping?: boolean
    error?: string
  }> {
    try {
      await this.ensureRunning()
      if (!this.port) throw new Error('Sidecar has no active port')
      const url = `http://127.0.0.1:${this.port}/audio/analyze`
      const payload = {
        audio_path: req.audioPath,
        cut_timestamps_us: req.cutTimestampsUs,
        word_boundaries: req.wordBoundaries,
      }
      const response = (await httpPost(url, payload)) as Record<string, unknown>
      return {
        ok: true,
        duration_s: Number(response.duration_s ?? 0),
        duration_us: Number(response.duration_us ?? 0),
        tempo_bpm: Number(response.tempo_bpm ?? 0),
        beats_us: Array.isArray(response.beats_us) ? (response.beats_us as number[]) : [],
        speech_chops: Array.isArray(response.speech_chops) ? (response.speech_chops as any[]) : [],
        awkward_silences: Array.isArray(response.awkward_silences) ? (response.awkward_silences as any[]) : [],
        has_clipping: Boolean(response.has_clipping),
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[vision-sidecar] audio analyze failed:', err)
      return { ok: false, error: err }
    }
  }

  /** Evaluates a multi-frame sequence for visual jump-cuts, framing defects, and action continuity. */
  async inspectSequence(req: {
    imagePaths: string[]
    timestampsS?: number[]
    focus?: string
    maxTokens?: number
  }): Promise<{
    ok: boolean
    raw_critique?: string
    jump_cut_detected?: boolean
    framing_defects_detected?: boolean
    latency_ms?: number
    frame_count?: number
    error?: string
  }> {
    try {
      await this.ensureRunning()
      if (!this.port) throw new Error('Sidecar has no active port')
      const url = `http://127.0.0.1:${this.port}/sequence/inspect`
      const payload = {
        image_paths: req.imagePaths,
        timestamps_s: req.timestampsS,
        focus: req.focus ?? 'continuity_and_framing',
        max_tokens: req.maxTokens ?? 128,
      }
      const response = (await httpPost(url, payload)) as Record<string, unknown>
      return {
        ok: true,
        raw_critique: String(response.raw_critique ?? ''),
        jump_cut_detected: Boolean(response.jump_cut_detected),
        framing_defects_detected: Boolean(response.framing_defects_detected),
        latency_ms: Number(response.latency_ms ?? 0),
        frame_count: Number(response.frame_count ?? req.imagePaths.length),
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[vision-sidecar] sequence inspect failed:', err)
      return { ok: false, error: err }
    }
  }

  /** Returns current sidecar status for diagnostics. */
  async status(): Promise<SidecarStatus> {
    if (!this.port || !this.isAlive()) {
      return { running: false, state: 'stopped', modelLoaded: false, model: this.model, idleS: 0, port: null }
    }
    try {
      const health = await httpGet(`http://127.0.0.1:${this.port}/health`) as Record<string, unknown>
      return {
        running:     true,
        state:       String(health.state ?? 'ready'),
        modelLoaded: Boolean(health.model_loaded),
        model:       String(health.model ?? this.model),
        idleS:       Number(health.idle_s ?? 0),
        port:        this.port,
        error:       health.error as string | null | undefined,
      }
    } catch {
      return { running: this.isAlive(), state: 'unreachable', modelLoaded: false, model: this.model, idleS: 0, port: this.port }
    }
  }

  /** Unload the model (keeps sidecar running, frees GPU memory). */
  async unloadModel(): Promise<void> {
    if (!this.port || !this.isAlive()) return
    try {
      await httpPost(`http://127.0.0.1:${this.port}/unload`, {})
    } catch { /* ignore */ }
  }

  /** Shut down the sidecar process. */
  async dispose(): Promise<void> {
    if (this.proc) {
      console.log('[vision-sidecar] shutting down...')
      this.proc.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => { this.proc?.kill('SIGKILL'); resolve() }, 3000)
        this.proc?.on('exit', () => { clearTimeout(t); resolve() })
      })
      this.proc = null
      this.port = null
      this.startPromise = null
      this.queryCache.clear()
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private isAlive(): boolean {
    return this.proc !== null && this.proc.exitCode === null && !this.proc.killed
  }

  private async ensureRunning(): Promise<void> {
    if (this.isAlive() && this.port !== null) return
    if (this.startPromise) return this.startPromise
    this.startPromise = this.start().finally(() => {
      if (!this.isAlive()) this.startPromise = null
    })
    return this.startPromise
  }

  private async start(): Promise<void> {
    if (!fs.existsSync(WORKER_SCRIPT)) {
      throw new Error(`Vision worker not found: ${WORKER_SCRIPT}`)
    }

    const pythonBin = fs.existsSync(path.join(VENV_DIR, 'bin', 'python3'))
      ? path.join(VENV_DIR, 'bin', 'python3')
      : 'python3'

    const port = await findFreePort()
    console.log(`[vision-sidecar] spawning on port ${port}, model=${this.model}`)

    this.proc = spawn(pythonBin, [WORKER_SCRIPT], {
      env: {
        ...process.env,
        SCLIP_VLM_MODEL:        this.model,
        SCLIP_VLM_PORT:         String(port),
        SCLIP_VLM_IDLE_TIMEOUT: String(IDLE_TIMEOUT_S),
        PYTHONUNBUFFERED:       '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) console.log(`[vision-sidecar-py] ${line}`)
    })

    this.proc.on('exit', (code, signal) => {
      console.warn(`[vision-sidecar] process exited: code=${code} signal=${signal}`)
      this.proc = null
      this.port = null
      this.startPromise = null
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Sidecar startup timeout'))
      }, STARTUP_TIMEOUT_MS)

      let buf = ''
      this.proc!.stdout?.on('data', (chunk: Buffer) => {
        buf += chunk.toString()
        const match = /SCLIP_VLM_PORT=(\d+)/.exec(buf)
        if (match) {
          const announcedPort = parseInt(match[1], 10)
          this.port = announcedPort
          clearTimeout(timer)
          console.log(`[vision-sidecar] ready on port ${announcedPort}`)
          resolve()
        }
      })

      this.proc!.on('exit', () => {
        clearTimeout(timer)
        reject(new Error('Sidecar exited before announcing port'))
      })
    })

    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      try {
        await httpGet(`http://127.0.0.1:${this.port}/health`)
        return
      } catch {
        await new Promise(r => setTimeout(r, HEALTH_POLL_INTERVAL_MS))
      }
    }
    throw new Error('Sidecar health check timed out')
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
let _singleton: VisionSidecarManager | null = null

export function getVisionSidecar(): VisionSidecarManager {
  if (!_singleton) {
    _singleton = new VisionSidecarManager(DEFAULT_MODEL)
  }
  return _singleton
}

export async function disposeVisionSidecar(): Promise<void> {
  if (_singleton) {
    await _singleton.dispose()
    _singleton = null
  }
}
