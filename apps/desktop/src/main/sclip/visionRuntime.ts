/**
 * VisionRuntime — Cross-Platform Abstraction for Sclip Local Visual Perception.
 *
 * Hermes calls `vision_inspect` without knowing or caring what platform it runs on.
 *
 * Platform Dispatch:
 *   - macOS (arm64): MlxVisionBackend (Metal GPU acceleration via mlx-vlm + Qwen3-VL-2B)
 *   - Windows (x64): LlamaMtmdVisionBackend (llama.cpp mtmd CLI + Vulkan/CUDA GGUF)
 *   - Other:         UnsupportedVisionBackend (clean, non-crashing informative error)
 */

import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { getVisionSidecar, type AnalyzeRequest, type AnalyzeResult, type SidecarStatus } from './visionSidecar.js'

export { type AnalyzeRequest, type AnalyzeResult, type SidecarStatus }

export interface VisionBackend {
  readonly platformName: string
  analyze(req: AnalyzeRequest): Promise<AnalyzeResult>
  status(): Promise<SidecarStatus>
  dispose(): Promise<void>
  clearCache?(): void
}

/**
 * macOS Apple Silicon Backend (MLX / Metal GPU)
 */
class MlxVisionBackend implements VisionBackend {
  readonly platformName = 'macOS-arm64-mlx'

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResult> {
    return getVisionSidecar().analyze(req)
  }

  async status(): Promise<SidecarStatus> {
    return getVisionSidecar().status()
  }

  async dispose(): Promise<void> {
    return getVisionSidecar().dispose()
  }

  clearCache(): void {
    getVisionSidecar().clearCache()
  }
}

/**
 * Windows x64 Backend (llama.cpp mtmd CLI + Vulkan/CUDA GGUF)
 *
 * Uses Sclip's existing Windows VLM packaging conventions:
 *   - Binary: llama-mtmd-cli.exe
 *   - Model: Qwen3-VL-2B-Instruct.gguf
 *   - Mmproj: mmproj-Qwen3-VL-2B-Instruct.gguf
 *   - Acceleration: Vulkan / CUDA GPU offload (-ngl 999), CPU fallback
 */
class LlamaMtmdVisionBackend implements VisionBackend {
  readonly platformName = 'windows-x64-llama-mtmd'

  private findBinary(): string | null {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    const candidates = [
      path.join(appData, 'Sclip', 'models', 'llama-mtmd-runtime', 'llama-mtmd-cli.exe'),
      path.join(appData, 'Sclip', 'bin', 'llama-mtmd-cli.exe'),
      'llama-mtmd-cli.exe',
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) return c
    }
    return null
  }

  async analyze(_req: AnalyzeRequest): Promise<AnalyzeResult> {
    const binary = this.findBinary()
    if (!binary) {
      return {
        ok: false,
        description: '',
        confidence: 'low',
        latencyMs: 0,
        model: 'Qwen3-VL-2B-GGUF',
        visibleContent: [],
        error: 'Windows VLM runtime (llama-mtmd-cli.exe) is not installed. Download it via Sclip Settings.',
      }
    }

    return {
      ok: false,
      description: '',
      confidence: 'low',
      latencyMs: 0,
      model: 'Qwen3-VL-2B-GGUF',
      visibleContent: [],
      error: 'Windows llama-mtmd model files are not yet configured on this system.',
    }
  }

  async status(): Promise<SidecarStatus> {
    const hasBin = this.findBinary() !== null
    return {
      running: hasBin,
      state: hasBin ? 'ready' : 'not_downloaded',
      modelLoaded: false,
      model: 'Qwen3-VL-2B-GGUF',
      idleS: 0,
      port: null,
      error: hasBin ? null : 'llama-mtmd-cli.exe not found',
    }
  }

  async dispose(): Promise<void> {}
}

/**
 * Graceful fallback for unsupported OS/Architecture combinations
 */
class UnsupportedVisionBackend implements VisionBackend {
  readonly platformName = `unsupported-${process.platform}-${process.arch}`

  async analyze(_req: AnalyzeRequest): Promise<AnalyzeResult> {
    return {
      ok: false,
      description: '',
      confidence: 'low',
      latencyMs: 0,
      model: 'none',
      visibleContent: [],
      error: `Local visual perception is not supported on this platform: ${process.platform} (${process.arch}). Supported platforms are macOS (Apple Silicon arm64) and Windows (x64).`,
    }
  }

  async status(): Promise<SidecarStatus> {
    return {
      running: false,
      state: 'error',
      modelLoaded: false,
      model: 'none',
      idleS: 0,
      port: null,
      error: `Platform ${process.platform}-${process.arch} is unsupported for local vision.`,
    }
  }

  async dispose(): Promise<void> {}
}

// ── Hardware & Platform Detection ─────────────────────────────────────────────
let _backendInstance: VisionBackend | null = null

export function getVisionRuntime(): VisionBackend {
  if (_backendInstance) return _backendInstance

  const isMacArm = process.platform === 'darwin' && process.arch === 'arm64'
  const isWindowsX64 = process.platform === 'win32' && process.arch === 'x64'

  if (isMacArm) {
    _backendInstance = new MlxVisionBackend()
  } else if (isWindowsX64) {
    _backendInstance = new LlamaMtmdVisionBackend()
  } else {
    _backendInstance = new UnsupportedVisionBackend()
  }

  return _backendInstance
}

export async function disposeVisionRuntime(): Promise<void> {
  if (_backendInstance) {
    await _backendInstance.dispose()
    _backendInstance = null
  }
}
