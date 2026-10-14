import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { buildSourceUnderstanding, sourceSpeechContext, SOURCE_MAP_LIMITS } from './sourceUnderstanding.js'
import type { CachedTranscriptData } from './timelineContext.js'
import type { MediaItem } from '../state/model.js'
import type { AnalyzeResult, VisionSidecarManager } from './visionSidecar.js'

const execFileAsync = promisify(execFile)
export const SOURCE_OBSERVATION_ANALYSIS_VERSION = 3
const SOURCE_OBSERVATION_ANALYSIS_MODEL = 'vision-sidecar+audio-analyzer+transcript-cache'

export interface SourceObservation {
  source_t_us: number
  kind: 'visual' | 'transcript' | 'audio_measurement'
  description: string
  model: string
  evidence: 'model_observation' | 'transcription' | 'verified_measurement'
  sample_window_us: [number, number]
  generation?: {
    output_tokens: number | null
    max_tokens: number
    output_limit_reached: boolean | null
  }
  confidence?: null
}

export interface SourceObservationIndexResult {
  status: 'available' | 'insufficient_evidence'
  media_id: string
  source_hash: string
  analysis_version: number
  analysis_model: string
  source_duration_us: number | null
  verified_metadata: {
    width: number | null
    height: number | null
    kind: string
  }
  observations: SourceObservation[]
  audio: {
    status: 'available' | 'not_generated'
    reason: 'semantic_audio_model_not_integrated'
    signal_analysis?: {
      tempo_bpm?: number
      beats_us?: number[]
      has_clipping?: boolean
    }
  }
  transcript: {
    status: 'available' | 'not_generated'
  }
  cached: boolean
  analysis_range_us?: [number, number]
}

interface PersistedIndex extends Omit<SourceObservationIndexResult, 'cached'> {
  source_path: string
}

export interface SourceObservationIndexOptions {
  cacheDir: string
  visionSidecar: VisionSidecarManager
  frameExtractor?: (sourcePath: string, timeUs: number, outputPath: string) => Promise<void>
  audioExtractor?: (sourcePath: string, startUs: number, endUs: number, outputPath: string) => Promise<void>
  now?: () => number
  readTranscript?: (media: MediaItem) => Promise<{
    segments?: Array<{ text?: string; t_start_us: number; t_end_us: number }>
    status?: string
  } | null>
}

function sourceHash(media: MediaItem): string {
  if (media.file_hash_blake3) return media.file_hash_blake3
  return createHash('sha256').update(JSON.stringify({
    path: media.path_abs,
    size: media.file_size,
    mtime: media.file_mtime,
  })).digest('hex')
}

async function extractFrame(sourcePath: string, timeUs: number, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', (timeUs / 1_000_000).toFixed(3),
    '-i', sourcePath,
    '-frames:v', '1',
    '-q:v', '3',
    outputPath,
  ])
}

function sampleTimes(startUs: number, endUs: number): number[] {
  const duration = endUs - startUs
  if (duration <= 0) return []
  const count = Math.min(6, Math.max(2, Math.ceil(duration / 20_000_000)))
  return Array.from({ length: count }, (_, i) =>
    startUs + Math.round((duration * (i + 0.5)) / count))
}

export class SourceObservationIndex {
  private readonly frameExtractor: typeof extractFrame
  private readonly audioExtractor: (sourcePath: string, startUs: number, endUs: number, outputPath: string) => Promise<void>

  constructor(private readonly options: SourceObservationIndexOptions) {
    this.frameExtractor = options.frameExtractor ?? extractFrame
    this.audioExtractor = options.audioExtractor ?? (async (sourcePath, startUs, endUs, outputPath) => {
      await execFileAsync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', (startUs / 1_000_000).toFixed(3),
        '-t', ((endUs - startUs) / 1_000_000).toFixed(3),
        '-i', sourcePath, '-vn', '-ac', '1', '-ar', '16000', outputPath,
      ])
    })
  }

  private cachePath(media: MediaItem, startUs: number, endUs: number, single = false): string {
    return path.join(
      this.options.cacheDir,
      'source-observations',
      `${sourceHash(media)}-v${SOURCE_OBSERVATION_ANALYSIS_VERSION}-${SOURCE_OBSERVATION_ANALYSIS_MODEL}-${startUs}-${endUs}${single ? "-coarse" : ""}.json`,
    )
  }

  async retrieve(
    media: MediaItem,
    startUs = 0,
    endUs?: number,
    limit = 8,
    singleSample = false,
  ): Promise<SourceObservationIndexResult> {
    const durationUs = media.metadata.duration_us ?? null
    const requestedEnd = Math.min(endUs ?? startUs + 120_000_000, durationUs ?? Number.MAX_SAFE_INTEGER)
    if (!Number.isSafeInteger(startUs) || startUs < 0 || !Number.isSafeInteger(requestedEnd) || requestedEnd <= startUs) {
      throw new Error('Source observation range must be a positive source-time window.')
    }
    if (requestedEnd - startUs > 120_000_000) {
      throw new Error('Source observation requests are limited to 120 seconds.')
    }

    const cache = this.cachePath(media, startUs, requestedEnd, singleSample)
    try {
      const persisted = JSON.parse(await fs.readFile(cache, 'utf8')) as PersistedIndex
      if (persisted.source_hash === sourceHash(media) &&
          persisted.analysis_version === SOURCE_OBSERVATION_ANALYSIS_VERSION &&
      persisted.analysis_model === SOURCE_OBSERVATION_ANALYSIS_MODEL &&
      persisted.source_path === media.path_abs &&
      // A transient missing model must not become permanent cached absence.
      (media.kind !== 'Video' || persisted.observations.some(o => o.kind === 'visual'))) {
        return this.select(persisted, startUs, requestedEnd, limit, true)
      }
    } catch {
      // Cache misses and stale/corrupt entries are recomputed below.
    }

    const times = singleSample ? [Math.floor((startUs + requestedEnd) / 2)] : sampleTimes(startUs, requestedEnd)
    const observations: SourceObservation[] = []
    let signalAnalysis: Awaited<ReturnType<VisionSidecarManager['analyzeAudio']>> | undefined
    let audioAttempted = false
    let transcriptLoaded = false
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sclip-source-observations-'))
    try {
      for (const timeUs of times) {
        const framePath = path.join(tempDir, `${timeUs}.jpg`)
        try {
          await this.frameExtractor(media.path_abs, timeUs, framePath)
          const result: AnalyzeResult = await this.options.visionSidecar.analyze({
            imagePath: framePath,
            question: 'Describe only the visible scene, people, objects, actions, and meaningful visual changes. Do not infer sound or unseen events. Give concise factual evidence.',
            resolution: 'low',
            maxTokens: 96,
          })
          if (result.ok && result.description.trim()) {
            const halfWindow = 0 // A still does not observe surrounding time.
            observations.push({
              source_t_us: timeUs,
              kind: 'visual',
              description: result.description.trim(),
              model: result.model,
              evidence: 'model_observation',
              generation: {
                output_tokens: result.outputTokens ?? null,
                max_tokens: 96,
                output_limit_reached: result.outputLimitReached ?? null,
              },
              // Local model descriptions are observations, not calibrated confidence.
              confidence: null,
              sample_window_us: [
                Math.max(startUs, timeUs - halfWindow),
                Math.min(requestedEnd, timeUs + halfWindow),
              ],
            })
          }
          if (!audioAttempted && !singleSample) {
            audioAttempted = true
            const audioPath = path.join(tempDir, 'source-audio.wav')
            try {
              await this.audioExtractor(media.path_abs, startUs, requestedEnd, audioPath)
              signalAnalysis = await this.options.visionSidecar.analyzeAudio({ audioPath })
              for (const silence of signalAnalysis.awkward_silences ?? []) {
                const tUs = startUs + silence.start_us
                observations.push({
                  source_t_us: tUs,
                  kind: 'audio_measurement',
                  description: `Measured silence from ${(tUs / 1e6).toFixed(2)}s to ${((startUs + silence.end_us) / 1e6).toFixed(2)}s (${silence.duration_s.toFixed(2)}s).`,
                  model: 'audio_analyzer',
                  evidence: 'verified_measurement',
                  sample_window_us: [tUs, Math.min(requestedEnd, startUs + silence.end_us)],
                })
              }
            } catch {
              // Signal analysis is optional evidence; visual/transcript evidence remains usable.
            }
          }

          if (this.options.readTranscript && !transcriptLoaded) {
            transcriptLoaded = true
            try {
              const transcript = await this.options.readTranscript(media)
              for (const segment of transcript?.segments ?? []) {
                if (segment.t_end_us <= startUs || segment.t_start_us >= requestedEnd || !segment.text?.trim()) continue
                const tUs = Math.max(startUs, segment.t_start_us)
                observations.push({
                  source_t_us: tUs,
                  kind: 'transcript',
                  description: segment.text.trim(),
                  model: 'whisper_transcript_cache',
                  evidence: 'transcription',
                  sample_window_us: [
                    Math.max(startUs, segment.t_start_us),
                    Math.min(requestedEnd, segment.t_end_us),
                  ],
                })
              }
            } catch {
              // Missing transcript cache is a normal partial-evidence state.
            }
          }
        } catch {
          // One failed sample must not discard observations from other frames.
        }
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }

    const persisted: PersistedIndex = {
      status: observations.length ? 'available' : 'insufficient_evidence',
      media_id: media.id,
      source_hash: sourceHash(media),
      analysis_version: SOURCE_OBSERVATION_ANALYSIS_VERSION,
      analysis_model: SOURCE_OBSERVATION_ANALYSIS_MODEL,
      source_duration_us: durationUs,
      analysis_range_us: [startUs,requestedEnd],
      verified_metadata: {
        width: media.metadata.video?.width ?? null,
        height: media.metadata.video?.height ?? null,
        kind: media.kind,
      },
      observations,
      audio: {
        status: signalAnalysis?.ok ? 'available' : 'not_generated',
        reason: 'semantic_audio_model_not_integrated',
        ...(signalAnalysis?.ok ? {
          signal_analysis: {
            tempo_bpm: signalAnalysis.tempo_bpm,
            beats_us: signalAnalysis.beats_us,
            has_clipping: signalAnalysis.has_clipping,
          },
        } : {}),
      },
      transcript: {
        status: observations.some((observation) => observation.evidence === 'transcription') ? 'available' : 'not_generated',
      },
      source_path: media.path_abs,
    }
    await fs.mkdir(path.dirname(cache), { recursive: true })
    const tempCache = `${cache}.${this.options.now?.() ?? Date.now()}.tmp`
    await fs.writeFile(tempCache, JSON.stringify(persisted, null, 2), 'utf8')
    await fs.rename(tempCache, cache)
    return this.select(persisted, startUs, requestedEnd, limit, false)
  }

  async cachedUnderstanding(media: MediaItem) {
    const indexes: SourceObservationIndexResult[] = []
    let entriesTotal=0
    try {
      const dir = path.join(this.options.cacheDir, 'source-observations')
      const candidates=(await fs.readdir(dir)).filter(f => f.startsWith(`${sourceHash(media)}-v${SOURCE_OBSERVATION_ANALYSIS_VERSION}-`)).sort()
      entriesTotal=candidates.length
      const files=candidates.slice(0,64)
      for (const file of files) {
        try {
          const data = JSON.parse(await fs.readFile(path.join(dir,file),'utf8')) as PersistedIndex
          if(data.source_hash===sourceHash(media) && data.source_path===media.path_abs && data.analysis_model===SOURCE_OBSERVATION_ANALYSIS_MODEL) indexes.push({...data,media_id:media.id,cached:true})
        } catch {}
      }
    } catch {}
    const transcript = await this.options.readTranscript?.(media).catch(()=>null) ?? null
    const overview = {...buildSourceUnderstanding(media,indexes,transcript as CachedTranscriptData|null),cache_scan:{entries_total:entriesTotal,entries_loaded:indexes.length,entry_read_limit:64,entries_omitted:Math.max(0,entriesTotal-64),coverage_scope:'Only represented cache entries; omitted observations are not certified by this map'}}
    while (Buffer.byteLength(JSON.stringify(overview)) > SOURCE_MAP_LIMITS.bytes && overview.observations.length) {
      overview.observations.pop()
      overview.truncation.observations_omitted++
      overview.truncation.size_limited = true
    }
    if (Buffer.byteLength(JSON.stringify(overview)) > SOURCE_MAP_LIMITS.bytes) throw new Error('SOURCE_MAP_SIZE_LIMIT')
    return overview
  }

  async coarseUnderstanding(media: MediaItem) {
    const duration=media.metadata.duration_us??0
    if(!Number.isSafeInteger(duration)||duration<1)throw new Error('Known positive source duration required')
    // A fixed local work ceiling, independent of source duration or semantic content.
    let fresh=false
    for(let i=0;i<SOURCE_MAP_LIMITS.coarse_samples;i++) {
      const t=Math.min(duration-1,Math.floor(duration*(i+0.5)/SOURCE_MAP_LIMITS.coarse_samples))
      const result=await this.retrieve(media,t,Math.min(duration,t+1),1,true)
      fresh ||= !result.cached
    }
    const overview=await this.cachedUnderstanding(media)
    overview.acquisition.cached=!fresh
    return overview
  }

  async speechContext(media:MediaItem,start:number,end:number,before?:number,after?:number) {
    const transcript=await this.options.readTranscript?.(media).catch(()=>null)??null
    return sourceSpeechContext(media,transcript as CachedTranscriptData|null,start,end,before,after)
  }

  private select(
    persisted: PersistedIndex,
    startUs: number,
    endUs: number,
    limit: number,
    cached: boolean,
  ): SourceObservationIndexResult {
    if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error('limit must be between 1 and 12.')
    return {
      ...persisted,
      observations: persisted.observations
        .filter((observation) => observation.source_t_us >= startUs && observation.source_t_us < endUs)
        .sort((a, b) => a.source_t_us - b.source_t_us)
        .slice(0, limit)
        .map(o=>o.kind==='visual' ? {...o,sample_window_us:[o.source_t_us,o.source_t_us] as [number,number]} : o),
      cached,
    }
  }
}
