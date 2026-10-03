import { spawn } from 'node:child_process'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface LocalTtsArgs {
  text: string
  voice?: string
  speed?: number
}

export interface LocalTtsResult {
  filePath: string
  cached: boolean
  engine: 'kokoro-tts' | 'edge-tts' | 'macos-say'
}

const EDGE_TTS_VOICES: Record<string, string> = {
  alloy: 'en-US-JennyNeural',
  echo: 'en-US-GuyNeural',
  fable: 'en-US-ChristopherNeural',
  onyx: 'en-US-BrianNeural',
  nova: 'en-US-AriaNeural',
  shimmer: 'en-US-AvaNeural',
  default: 'en-US-ChristopherNeural',
}

const MACOS_SAY_VOICES: Record<string, string> = {
  alloy: 'Samantha',
  echo: 'Daniel',
  fable: 'Alex',
  onyx: 'Fred',
  nova: 'Victoria',
  shimmer: 'Karen',
  default: 'Samantha',
}

function resolvePythonBin(): string | null {
  const candidates = [
    path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'Sclip', 'vision-sidecar', 'venv', 'bin', 'python'),
    path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'Sclip', 'vision-sidecar', 'venv', 'bin', 'python3'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function resolveKokoroWorkerScript(): string | null {
  const source = path.resolve(__dirname, '..', '..', 'vision', 'sidecar', 'kokoro_tts_worker.py')
  const built = path.resolve(__dirname, '..', '..', 'src', 'vision', 'sidecar', 'kokoro_tts_worker.py')
  const packaged = path.join(process.resourcesPath ?? '', 'vision', 'sidecar', 'kokoro_tts_worker.py')
  const candidates = [source, built, packaged]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function resolveKokoroModelFiles(): { model: string; voices: string } {
  const home = process.env.HOME ?? ''
  const dir = path.join(home, 'Library', 'Application Support', 'Sclip', 'models', 'kokoro')
  const modelCandidates = [
    path.join(dir, 'kokoro-v1.0.int8.onnx'),
    path.join(dir, 'kokoro-v1.0.onnx'),
    path.join(dir, 'kokoro-v0_19.onnx'),
  ]
  const voicesCandidates = [
    path.join(dir, 'voices-v1.0.bin'),
    path.join(dir, 'voices.bin'),
  ]

  const model = modelCandidates.find((p) => fs.existsSync(p)) ?? path.join(dir, 'kokoro-v1.0.int8.onnx')
  const voices = voicesCandidates.find((p) => fs.existsSync(p)) ?? path.join(dir, 'voices-v1.0.bin')

  return { model, voices }
}

function resolveEdgeTtsBin(): string | null {
  const candidates = [
    '/opt/homebrew/bin/edge-tts',
    '/usr/local/bin/edge-tts',
    path.join(process.env.HOME ?? '', '.local', 'bin', 'edge-tts'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function runCommand(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('exit', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

/**
 * Synthesizes speech locally.
 * Tier 1: Kokoro-82M ONNX (studio-quality natural American & British accents, ultra-compact 88MB).
 * Tier 2: Neural edge-tts if installed.
 * Tier 3: 100% offline macOS `say` + ffmpeg fallback.
 */
export async function synthesizeSpeechLocally(
  args: LocalTtsArgs,
  cacheDir: string,
): Promise<LocalTtsResult> {
  const text = args.text?.trim()
  if (!text) {
    throw new Error('text is empty')
  }

  const voiceArg = (args.voice ?? 'default').toLowerCase()
  const speed = typeof args.speed === 'number' && Number.isFinite(args.speed) ? args.speed : 1.0

  // Deterministic cache key across engines and voices
  const hash = crypto
    .createHash('sha256')
    .update(`local_tts\0${voiceArg}\0${speed}\0${text}`)
    .digest('hex')

  const voiceoverDir = path.join(cacheDir, 'voiceover')
  fs.mkdirSync(voiceoverDir, { recursive: true })
  const destMp3 = path.join(voiceoverDir, `${hash}.mp3`)

  if (fs.existsSync(destMp3)) {
    const stat = fs.statSync(destMp3)
    if (stat.size > 0) {
      return { filePath: destMp3, cached: true, engine: 'kokoro-tts' }
    }
  }

  const pythonBin = resolvePythonBin()

  // ── Tier 1: Kokoro-82M ONNX ──────────────────────────────────────────────
  const kokoroWorker = resolveKokoroWorkerScript()
  const kokoroFiles = resolveKokoroModelFiles()

  if (pythonBin && kokoroWorker) {
    const tmpWav = path.join(os.tmpdir(), `kokoro_tts_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`)
    try {
      const kokoroOk = await runCommand(pythonBin, [
        kokoroWorker,
        '--text', text,
        '--voice', voiceArg,
        '--speed', String(speed),
        '--output', tmpWav,
        '--model', kokoroFiles.model,
        '--voices', kokoroFiles.voices,
      ])

      if (kokoroOk && fs.existsSync(tmpWav)) {
        const ffmpegOk = await runCommand('ffmpeg', [
          '-y',
          '-i', tmpWav,
          '-c:a', 'libmp3lame',
          '-q:a', '2',
          destMp3,
        ])

        if (ffmpegOk && fs.existsSync(destMp3) && fs.statSync(destMp3).size > 0) {
          return { filePath: destMp3, cached: false, engine: 'kokoro-tts' }
        }
      }
    } finally {
      try {
        if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav)
      } catch {}
    }
  }

  // ── Tier 2: Neural edge-tts ──────────────────────────────────────────────
  const edgeTts = resolveEdgeTtsBin()
  if (edgeTts) {
    const edgeVoice = EDGE_TTS_VOICES[voiceArg] ?? (args.voice && args.voice.includes('-') ? args.voice : EDGE_TTS_VOICES.default)
    const ratePercent = Math.round((speed - 1.0) * 100)
    const rateArg = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`

    const edgeArgs = ['--text', text, '--voice', edgeVoice, '--rate', rateArg, '--write-media', destMp3]
    const ok = await runCommand(edgeTts, edgeArgs)
    if (ok && fs.existsSync(destMp3) && fs.statSync(destMp3).size > 0) {
      return { filePath: destMp3, cached: false, engine: 'edge-tts' }
    }
  }

  // ── Tier 3: 100% Offline macOS `say` fallback ─────────────────────────────
  if (process.platform === 'darwin') {
    const sayVoice = MACOS_SAY_VOICES[voiceArg] ?? args.voice ?? MACOS_SAY_VOICES.default
    const wpm = Math.max(80, Math.min(360, Math.round(185 * speed)))
    const tmpWav = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`)

    try {
      const sayOk = await runCommand('/usr/bin/say', [
        '-v', sayVoice,
        '-r', String(wpm),
        '-o', tmpWav,
        '--data-format=LEI16@44100',
        '--',
        text,
      ])

      if (sayOk && fs.existsSync(tmpWav)) {
        const ffmpegOk = await runCommand('ffmpeg', [
          '-y',
          '-i', tmpWav,
          '-c:a', 'libmp3lame',
          '-q:a', '2',
          destMp3,
        ])

        if (ffmpegOk && fs.existsSync(destMp3) && fs.statSync(destMp3).size > 0) {
          return { filePath: destMp3, cached: false, engine: 'macos-say' }
        }
      }
    } finally {
      try {
        if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav)
      } catch {}
    }
  }

  throw new Error('Local speech synthesis failed: neither Kokoro-82M, edge-tts, nor macOS say succeeded.')
}
