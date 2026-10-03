import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { MediaItem } from '../state/model.js'
import type { AnalyzeResult, VisionSidecarManager } from './visionSidecar.js'

const execFileAsync = promisify(execFile)
export const SOURCE_OBSERVATION_ANALYSIS_VERSION = 2
const SOURCE_OBSERVATION_ANALYSIS_MODEL = 'vision-sidecar+audio-analyzer+transcript-cache'

export interface SourceObservation {
  source_t_us: number
  kind: 'visual' | 'transcript' | 'audio_measurement'
  description: string
  model: string
  evidence: 'model_observation' | 'transcription' | 'verified_measurement'
  sample_window_us: [number, number]
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

  private cachePath(media: MediaItem, startUs: number, endUs: number): string {
    return path.join(
      this.options.cacheDir,
      'source-observations',
      `${sourceHash(media)}-v${SOURCE_OBSERVATION_ANALYSIS_VERSION}-${SOURCE_OBSERVATION_ANALYSIS_MODEL}-${startUs}-${endUs}.json`,
    )
  }

  async retrieve(
    media: MediaItem,
    startUs = 0,
    endUs?: number,
    limit = 8,
  ): Promise<SourceObservationIndexResult> {
    const durationUs = media.metadata.duration_us ?? null
    const requestedEnd = Math.min(endUs ?? startUs + 120_000_000, durationUs ?? Number.MAX_SAFE_INTEGER)
    if (!Number.isSafeInteger(startUs) || startUs < 0 || !Number.isSafeInteger(requestedEnd) || requestedEnd <= startUs) {
      throw new Error('Source observation range must be a positive source-time window.')
    }
    if (requestedEnd - startUs > 120_000_000) {
      throw new Error('Source observation requests are limited to 120 seconds.')
    }

    const cache = this.cachePath(media, startUs, requestedEnd)
    try {
      const persisted = JSON.parse(await fs.readFile(cache, 'utf8')) as PersistedIndex
      if (persisted.source_hash === sourceHash(media) &&
          persisted.analysis_version === SOURCE_OBSERVATION_ANALYSIS_VERSION &&
      persisted.analysis_model === SOURCE_OBSERVATION_ANALYSIS_MODEL &&
      persisted.source_path === media.path_abs) {
        return this.select(persisted, startUs, requestedEnd, limit, true)
      }
    } catch {
      // Cache misses and stale/corrupt entries are recomputed below.
    }

    const times = sampleTimes(startUs, requestedEnd)
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
            const halfWindow = Math.max(250_000, Math.round((requestedEnd - startUs) / times.length / 2))
            observations.push({
              source_t_us: timeUs,
              kind: 'visual',
              description: result.description.trim(),
              model: result.model,
              evidence: 'model_observation',
              sample_window_us: [
                Math.max(startUs, timeUs - halfWindow),
                Math.min(requestedEnd, timeUs + halfWindow),
              ],
            })
          }
          if (!audioAttempted) {
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
        .slice(0, limit),
      cached,
    }
  }
}
