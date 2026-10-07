import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { Composition, Layer, Project } from '../state/model.js'

/** Resource bound, never a requested output duration or genre assumption. */
export function reviewRangeLimitUs(value = process.env.SCLIP_REVIEW_MAX_SECONDS): number {
  const seconds = value === undefined ? 120 : Number(value)
  return (Number.isFinite(seconds) && seconds >= 1 ? Math.min(300, seconds) : 120) * 1_000_000
}
export const MAX_RANGE_RENDER_DURATION_US = reviewRangeLimitUs()

export interface RangeRenderOptions {
  start_us: number
  end_us: number
  composition_id?: string
  projectDir?: string
  resourcesPath?: string
  signal?: AbortSignal
  /** Evidence/export modality only; does not change authored timeline state. */
  audioOnly?: boolean
}

export interface RangeRenderResult {
  path: string
  duration_us: number
  has_audio: boolean
  cached: boolean
}

/** Calls the app's existing range-capable export flow in its live renderer.
 *  A fresh output path per request deliberately disables the old layer-only
 *  cache: transforms, effects, captions, Motifs and audio can no longer return
 *  a stale or raw-source QA artifact. */
export async function exportThroughLiveCompositor(
  project: Project,
  window: { isDestroyed(): boolean; webContents: { executeJavaScript(code: string): Promise<unknown> } } | null,
  request: { outputPath: string; startUs: number; endUs: number; resolutionHeight?: number; fps?: number; audioOnly?: boolean },
): Promise<void> {
  if (!window || window.isDestroyed()) throw new Error('Composed export requires an open Sclip desktop window')
  const code = `window.__sclipExportRange ? window.__sclipExportRange(${JSON.stringify({
    projectId: project.project_id,
    outputPath: request.outputPath,
    startUs: request.startUs,
    endUs: request.endUs,
    resolutionHeight: request.resolutionHeight,
    fps: request.fps,
    audioOnly: request.audioOnly,
  })}) : Promise.reject(new Error('Sclip export surface is not ready'))`
  await window.webContents.executeJavaScript(code)
  const stat = fs.statSync(request.outputPath, { throwIfNoEntry: false })
  if (!stat || stat.size <= 1024) throw new Error('The production export flow did not produce a media file')
}

/** Hermes's short QA range: actual production video compositor and audio mix. */
export async function renderComposedTimelineRange(
  project: Project,
  options: RangeRenderOptions & { getActiveWindow: () => { isDestroyed(): boolean; webContents: { executeJavaScript(code: string): Promise<unknown> } } | null },
): Promise<RangeRenderResult> {
  const { start_us, end_us } = options
  const compId = options.composition_id ?? project.root_id
  const comp = project.compositions[compId]
  if (!comp) throw new Error(`Composition not found: ${compId}`)
  if (compId !== project.root_id) throw new Error('Composed range export currently renders the root composition only')
  if (!Number.isInteger(start_us) || !Number.isInteger(end_us) || start_us < 0 || end_us <= start_us || end_us > comp.duration_us || end_us - start_us > MAX_RANGE_RENDER_DURATION_US) {
    throw new Error(`Composed range must be within the timeline and at most ${MAX_RANGE_RENDER_DURATION_US / 1_000_000} seconds`)
  }
  options.signal?.throwIfAborted()
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-composed-qa-'))
  const outputPath = path.join(outputDir, `${randomUUID()}.${options.audioOnly ? 'm4a' : 'mp4'}`)
  try {
    await exportThroughLiveCompositor(project, options.getActiveWindow(), { outputPath, startUs: start_us, endUs: end_us, audioOnly: options.audioOnly })
    options.signal?.throwIfAborted()
  } catch (error) {
    fs.rmSync(outputDir, { recursive: true, force: true })
    throw error
  }
  return { path: outputPath, duration_us: end_us - start_us,
    has_audio: project.compositions[compId].tracks.some(t => t.layers.some(l => l.params.kind === 'Audio' && l.t_end_us > start_us && l.t_start_us < end_us)),
    cached: false }
}

export function resolveFfmpegPath(resourcesPath?: string): string {
  const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  if (resourcesPath) {
    const candidate = path.join(resourcesPath, 'ffmpeg', platform, binary)
    if (fs.existsSync(candidate)) return candidate
  }
  // Try standard repo dev paths
  const devPath = path.resolve(__dirname, '../../../resources/ffmpeg', platform, binary)
  if (fs.existsSync(devPath)) return devPath
  const cwdPath = path.resolve(process.cwd(), 'apps/desktop/resources/ffmpeg', platform, binary)
  if (fs.existsSync(cwdPath)) return cwdPath
  return 'ffmpeg'
}

function computeLayersFingerprint(layers: Layer[]): string {
  return layers
    .map((l) => {
      const p = l.params as any
      return `${l.id}:${l.t_start_us}:${l.t_end_us}:${p.kind}:${p.media ?? ''}:${p.src_in_us ?? ''}:${p.src_out_us ?? ''}`
    })
    .join('|')
}

export function computeRangeCacheKey(
  compositionId: string,
  startUs: number,
  endUs: number,
  layers: Layer[],
): string {
  const fp = computeLayersFingerprint(layers)
  return createHash('sha256')
    .update(`${compositionId}:${startUs}:${endUs}:${fp}`)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Renders a short QA preview range of the timeline with video and mixed audio.
 * Mechanical resource constraint: configured review ceiling (default 120s, hard maximum 300s).
 * Strictly read-only: 0 ProjectActor mutations, 0 history entries.
 * Stores temporary artifacts under <cache>/qa_renders/ without polluting project media.
 */
export async function renderTimelineRange(
  project: Project,
  options: RangeRenderOptions,
): Promise<RangeRenderResult> {
  const { start_us, end_us } = options
  const compId = options.composition_id ?? project.root_id
  const comp: Composition | undefined = project.compositions[compId]
  if (!comp) {
    throw new Error(`Composition not found: ${compId}`)
  }

  if (typeof start_us !== 'number' || typeof end_us !== 'number') {
    throw new Error('start_us and end_us must be numbers')
  }

  if (start_us < 0) {
    throw new Error(`start_us cannot be negative (${start_us})`)
  }

  if (end_us <= start_us) {
    throw new Error(`end_us (${end_us}) must be greater than start_us (${start_us})`)
  }

  const durationUs = end_us - start_us
  if (durationUs > MAX_RANGE_RENDER_DURATION_US) {
    throw new Error(
      `Range duration ${Math.round(durationUs / 1_000_000)}s exceeds maximum allowed preview range of ${MAX_RANGE_RENDER_DURATION_US / 1_000_000}s. Use progressive inspection with shorter ranges (e.g. 5s-15s).`,
    )
  }

  // Determine cache directory
  let cacheDir: string
  if (options.projectDir && fs.existsSync(options.projectDir)) {
    cacheDir = path.join(options.projectDir, 'Cache', 'qa_renders')
  } else {
    cacheDir = path.join(os.tmpdir(), 'weftcut-qa-renders')
  }
  fs.mkdirSync(cacheDir, { recursive: true })

  // Find all layers in the composition active in [start_us, end_us)
  const activeLayers: Layer[] = []
  for (const track of comp.tracks) {
    for (const layer of track.layers) {
      if (layer.t_end_us > start_us && layer.t_start_us < end_us) {
        activeLayers.push(layer)
      }
    }
  }
  activeLayers.sort((a, b) => a.t_start_us - b.t_start_us)

  const cacheKey = computeRangeCacheKey(compId, start_us, end_us, activeLayers)
  const outputPath = path.join(cacheDir, `qa_${cacheKey}.mp4`)

  // Check cache hit
  if (fs.existsSync(outputPath)) {
    try {
      const stat = fs.statSync(outputPath)
      if (stat.size > 1024) {
        return {
          path: outputPath,
          duration_us: durationUs,
          has_audio: true,
          cached: true,
        }
      }
    } catch {
      // Re-render on corrupt cache entry
    }
  }

  // Render range using ffmpeg
  const ffmpeg = resolveFfmpegPath(options.resourcesPath)

  // Find video clips intersecting range
  const videoClips = activeLayers.filter((l) => l.params.kind === 'VideoClip')

  if (videoClips.length === 0) {
    // Generate black frame with silent audio
    await new Promise<void>((resolve, reject) => {
      const durSec = (durationUs / 1_000_000).toFixed(3)
      const child = spawn(
        ffmpeg,
        [
          '-y',
          '-f', 'lavfi', '-i', `color=c=black:s=${comp.width}x${comp.height}:r=${comp.fps.num / comp.fps.den}`,
          '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
          '-t', durSec,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          outputPath,
        ],
        { stdio: 'ignore' },
      )
      child.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg color generator exited with code ${code}`))
      })
      child.on('error', reject)
    })

    return {
      path: outputPath,
      duration_us: durationUs,
      has_audio: true,
      cached: false,
    }
  }

  if (videoClips.length === 1) {
    const vc = videoClips[0]
    const p = vc.params as any
    const mediaItem = project.media_pool[p.media]
    const srcPath = mediaItem?.path_abs

    if (srcPath && fs.existsSync(srcPath)) {
      // Compute source offset
      const offsetIntoClipUs = Math.max(0, start_us - vc.t_start_us)
      const srcCutStartUs = (p.src_in_us ?? 0) + offsetIntoClipUs
      const startSec = (srcCutStartUs / 1_000_000).toFixed(3)
      const durSec = (durationUs / 1_000_000).toFixed(3)

      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          ffmpeg,
          [
            '-y',
            '-ss', startSec,
            '-i', srcPath,
            '-t', durSec,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            outputPath,
          ],
          { stdio: 'ignore' },
        )
        child.on('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`ffmpeg clip render exited with code ${code}`))
        })
        child.on('error', reject)
      })

      return {
        path: outputPath,
        duration_us: durationUs,
        has_audio: true,
        cached: false,
      }
    }
  }

  // Multi-clip cut transition rendering:
  // Render sub-segments and concat them
  const tempFiles: string[] = []
  try {
    for (let i = 0; i < videoClips.length; i++) {
      const vc = videoClips[i]
      const p = vc.params as any
      const mediaItem = project.media_pool[p.media]
      const srcPath = mediaItem?.path_abs
      if (!srcPath || !fs.existsSync(srcPath)) continue

      const segStartUs = Math.max(start_us, vc.t_start_us)
      const segEndUs = Math.min(end_us, vc.t_end_us)
      const segDurUs = segEndUs - segStartUs
      if (segDurUs <= 0) continue

      const offsetIntoClipUs = segStartUs - vc.t_start_us
      const srcCutStartUs = (p.src_in_us ?? 0) + offsetIntoClipUs
      const startSec = (srcCutStartUs / 1_000_000).toFixed(3)
      const durSec = (segDurUs / 1_000_000).toFixed(3)

      const segOutPath = path.join(cacheDir, `seg_${cacheKey}_${i}.ts`)
      tempFiles.push(segOutPath)

      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          ffmpeg,
          [
            '-y',
            '-ss', startSec,
            '-i', srcPath,
            '-t', durSec,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-f', 'mpegts',
            segOutPath,
          ],
          { stdio: 'ignore' },
        )
        child.on('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`ffmpeg segment render exited with code ${code}`))
        })
        child.on('error', reject)
      })
    }

    if (tempFiles.length > 0) {
      // Concat all segments into the final output
      const concatList = tempFiles.join('|')
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          ffmpeg,
          [
            '-y',
            '-i', `concat:${concatList}`,
            '-c', 'copy',
            outputPath,
          ],
          { stdio: 'ignore' },
        )
        child.on('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`ffmpeg concat exited with code ${code}`))
        })
        child.on('error', reject)
      })

      return {
        path: outputPath,
        duration_us: durationUs,
        has_audio: true,
        cached: false,
      }
    }
  } finally {
    // Cleanup segment files
    for (const tf of tempFiles) {
      try {
        if (fs.existsSync(tf)) fs.unlinkSync(tf)
      } catch {}
    }
  }

  throw new Error('Unable to render range: no valid media sources found for active clips')
}
