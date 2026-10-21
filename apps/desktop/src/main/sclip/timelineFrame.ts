import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { validateEvidenceTime } from './evidenceCoordinates.js'
import type { Composition, Project } from '../state/model.js'

export interface TimelineFrameOptions {
  t_us?: number
  composition_id?: string
  format?: 'base64' | 'data_url'
  getActiveWindow?: () => any | null
  /** MCP must not present the reduced FFmpeg fallback as a composed frame. */
  requireLiveCompositor?: boolean
  passive?: boolean
  resourcesPath?: string
}

export interface TimelineFrameResult {
  pngBase64: string
  dataUrl: string
  t_us: number
  coordinate_space: 'timeline'
  timeline_t_us: number
  composition_id: string
  width: number
  height: number
  source: 'live_compositor' | 'headless_compositor'
  textCrops?: Array<{layerId:string;bounds:unknown;pngBase64:string}>
  factualEvidence?: unknown
}

function resolveFfmpegPath(resourcesPath?: string): string {
  const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  if (resourcesPath) {
    const candidate = path.join(resourcesPath, 'ffmpeg', platform, binary)
    if (fs.existsSync(candidate)) return candidate
  }
  const devPath = path.resolve(__dirname, '../../../resources/ffmpeg', platform, binary)
  if (fs.existsSync(devPath)) return devPath
  const cwdPath = path.resolve(process.cwd(), 'apps/desktop/resources/ffmpeg', platform, binary)
  if (fs.existsSync(cwdPath)) return cwdPath
  return 'ffmpeg'
}

/**
 * Captures a single composed frame of the real timeline at `t_us` (or active playhead if t_us omitted).
 *
 * In live desktop app: delegates to PixiPreview compositor over renderer bridge,
 * preserving playhead position with zero mutations.
 * In headless / tests: offers only a reduced FFmpeg fallback. Callers asking
 * for composition-faithful evidence must require the live compositor.
 */
async function inspectTimelineFrameOwned(
  project: Project,
  options: TimelineFrameOptions,
): Promise<TimelineFrameResult> {
  let { t_us } = options
  const compId = options.composition_id ?? project.root_id
  const comp: Composition | undefined = project.compositions[compId]
  if (!comp) {
    throw new Error(`Composition not found: ${compId}`)
  }

  if (t_us === undefined) {
    const window = options.getActiveWindow?.()
    if (window && !window.isDestroyed()) t_us = await window.webContents.executeJavaScript('window.__weftcutPreview?.getPlayheadUs?.()')
    if (t_us === undefined || t_us === null) t_us = 0
  }
  validateEvidenceTime('timeline', t_us, comp.duration_us, { composition_id: compId })

  // 1. Try live renderer bridge if active BrowserWindow is available
  const win = options.getActiveWindow?.()
  let liveCaptureError: string | undefined
  if (win && !win.isDestroyed()) {
    try {
      const code = `(async()=>{const deadline=Date.now()+1500;while(typeof window.__weftcutPreview?.captureFrameAt!=='function' && Date.now()<deadline)await new Promise(r=>setTimeout(r,30));return window.__weftcutPreview?.captureFrameAt ? window.__weftcutPreview.captureFrameAt(${typeof t_us === 'number' && Number.isFinite(t_us) ? Math.trunc(t_us) : 'undefined'}, ${JSON.stringify(compId)}, ${options.passive === true}) : null})()`
      const capture = await win.webContents.executeJavaScript(code)
      if (capture && typeof capture.pngBase64 === 'string') {
        const base64 = capture.pngBase64
        return {
          pngBase64: base64,
          dataUrl: `data:image/png;base64,${base64}`,
          t_us: typeof capture.tUs === 'number' ? capture.tUs : (t_us ?? 0),
          composition_id: compId,
          width: capture.width || comp.width,
          height: capture.height || comp.height,
          source: 'live_compositor',
          coordinate_space: 'timeline', timeline_t_us: t_us!,
          factualEvidence: capture.factualEvidence,
          textCrops: capture.textCrops,
        }
      }
    } catch (error) {
      liveCaptureError = error instanceof Error ? error.message : String(error)
    }
  }

  if (options.requireLiveCompositor) {
    throw new Error(`CURRENT_FRAME_UNAVAILABLE: requested exact compositor frame was unavailable; check the specific hidden-preview, raster, decode or interruption detail${liveCaptureError ? ` (${liveCaptureError})` : ''}`)
  }

  if (typeof t_us !== 'number' || t_us < 0) {
    t_us = 0
  }

  // 2. Headless compositor fallback:
  // Find visible layers active at t_us
  const activeLayers: any[] = []
  for (const track of comp.tracks) {
    for (const layer of track.layers) {
      if (layer.t_start_us <= t_us && t_us < layer.t_end_us) {
        activeLayers.push(layer)
      }
    }
  }

  const ffmpeg = resolveFfmpegPath(options.resourcesPath)
  const videoLayer = activeLayers.find((l) => l.params.kind === 'VideoClip')

  let pngBuffer: Buffer | null = null

  if (videoLayer) {
    const p = videoLayer.params
    const mediaItem = project.media_pool[p.media]
    const srcPath = mediaItem?.path_abs

    if (srcPath && fs.existsSync(srcPath)) {
      const offsetUs = t_us - videoLayer.t_start_us
      const srcPtsUs = (p.src_in_us ?? 0) + offsetUs
      const startSec = (srcPtsUs / 1_000_000).toFixed(4)

      const filters: string[] = []
      const scaleX = typeof p.scale_x === 'object' && p.scale_x !== null ? p.scale_x.value : p.scale_x
      const scaleY = typeof p.scale_y === 'object' && p.scale_y !== null ? p.scale_y.value : p.scale_y
      if (typeof scaleX === 'number' && typeof scaleY === 'number' && (scaleX !== 1 || scaleY !== 1)) {
        filters.push(`scale=iw*${scaleX}:ih*${scaleY}`)
      }

      const textLayers = activeLayers.filter((l) => l.params.kind === 'Text')
      for (const tl of textLayers) {
        const tp = tl.params as any
        const text = (tp.content || '').replace(/[:\\']/g, '\\$&')
        if (text) {
          const fontSize = tp.font_size_px || 36
          filters.push(`drawtext=text='${text}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`)
        }
      }

      const ffmpegArgs = [
        '-y',
        '-ss', startSec,
        '-i', srcPath,
        ...(filters.length > 0 ? ['-vf', filters.join(',')] : []),
        '-vframes', '1',
        '-f', 'image2',
        '-c:v', 'png',
        'pipe:1',
      ]

      pngBuffer = await new Promise<Buffer>((resolve, reject) => {
        const child = spawn(ffmpeg, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] })
        const chunks: Buffer[] = []
        child.stdout.on('data', (c) => chunks.push(c))
        child.on('exit', (code) => {
          if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
          else reject(new Error(`ffmpeg frame extraction exited with code ${code}`))
        })
        child.on('error', reject)
      }).catch(() => null)
    }
  }

  const colorLayer = activeLayers.find((l) => l.params.kind === 'Color')
  const textLayers = activeLayers.filter((l) => l.params.kind === 'Text')

  if (!pngBuffer && (colorLayer || textLayers.length > 0)) {
    const cp = colorLayer?.params as any
    const r = cp?.color?.r ?? 0
    const g = cp?.color?.g ?? 0
    const b = cp?.color?.b ?? 0
    const hex = `0x${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`

    const filters: string[] = []
    for (const tl of textLayers) {
      const tp = tl.params as any
      const text = (tp.content || '').replace(/[:\\']/g, '\\$&')
      if (text) {
        const fontSize = tp.font_size_px || 36
        filters.push(`drawtext=text='${text}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`)
      }
    }

    const ffmpegArgs = [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=${hex}:s=${comp.width}x${comp.height}:r=30`,
      ...(filters.length > 0 ? ['-vf', filters.join(',')] : []),
      '-vframes', '1',
      '-f', 'image2',
      '-c:v', 'png',
      'pipe:1',
    ]

    pngBuffer = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(ffmpeg, ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] })
      const chunks: Buffer[] = []
      child.stdout.on('data', (c) => chunks.push(c))
      child.on('exit', (code) => {
        if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
        else reject(new Error(`ffmpeg color/text frame generator exited with code ${code}`))
      })
      child.on('error', reject)
    }).catch(() => null)
  }

  if (!pngBuffer) {
    // Generate black frame with composition dimensions
    pngBuffer = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        ffmpeg,
        [
          '-y',
          '-f', 'lavfi',
          '-i', `color=c=black:s=${comp.width}x${comp.height}:r=30`,
          '-vframes', '1',
          '-f', 'image2',
          '-c:v', 'png',
          'pipe:1',
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )
      const chunks: Buffer[] = []
      child.stdout.on('data', (c) => chunks.push(c))
      child.on('exit', (code) => {
        if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks))
        else reject(new Error(`ffmpeg black frame generator exited with code ${code}`))
      })
      child.on('error', reject)
    })
  }

  const base64 = pngBuffer.toString('base64')
  return {
    pngBase64: base64,
    dataUrl: `data:image/png;base64,${base64}`,
    t_us,
    composition_id: compId,
    width: comp.width,
    height: comp.height,
    source: 'headless_compositor',
    coordinate_space: 'timeline', timeline_t_us: t_us,
  }
}

const inspectionQueues=new WeakMap<object,Promise<unknown>>()
/** One live playhead: serialize acquisition and restore before the next seek. */
export async function inspectTimelineFrame(project:Project,options:TimelineFrameOptions):Promise<TimelineFrameResult>{
 const win=options.getActiveWindow?.();if(!win)return inspectTimelineFrameOwned(project,options)
 const work=(inspectionQueues.get(win)??Promise.resolve()).catch(()=>{}).then(()=>inspectTimelineFrameOwned(project,options))
 inspectionQueues.set(win,work)
 try{return await work}finally{if(inspectionQueues.get(win)===work)inspectionQueues.delete(win)}
}
