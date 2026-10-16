/** Optional local asset generation. No actor writes, provider calls or model downloads. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'

export type GenerationKind = 'image' | 'music'
const GiB = 1024 ** 3
export const GENERATORS = {
  image: { model: 'black-forest-labs/FLUX.2-klein-4B', runtime: 'mflux', license: 'Apache-2.0', workingBytes: 8 * GiB },
  music: { model: 'stabilityai/stable-audio-open-small', runtime: 'stable-audio-tools', license: 'Stability AI Community License', workingBytes: 4 * GiB },
} as const
export interface GenerationRequest { kind: GenerationKind; prompt: string; seed: number; width?: number; height?: number; duration_seconds?: number }
export interface GenerationPack {
  schema: 1; model: string; revision: string; runtime: string; runtime_version: string
  python: string; license_acknowledged: true; files: Record<string, string>
}
export interface GenerationBinding { directory: string; assertCurrent(): void }
export interface GenerationDeps {
  root: string; worker: string; platform?: string; arch?: string
  memory?: () => { total: number; available: number }
  diskFree?: (directory: string) => number
  releaseIdleVision?: () => Promise<void>
  run?: (python: string, worker: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<void>
}
const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
export function validateGenerationRequest(value: Record<string, unknown>, kind: GenerationKind): GenerationRequest {
  const allowed = kind === 'image' ? ['prompt', 'seed', 'width', 'height'] : ['prompt', 'seed', 'duration_seconds']
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Unknown generation argument; inspect the tool schema')
  if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 1000) throw new Error('prompt must contain 1–1000 characters')
  if (!Number.isSafeInteger(value.seed) || Number(value.seed) < 0 || Number(value.seed) > 2147483647) throw new Error('seed must be an integer in 0..2147483647')
  const result: GenerationRequest = { kind, prompt: value.prompt.trim(), seed: Number(value.seed) }
  if (kind === 'image') {
    const width = value.width ?? 512, height = value.height ?? 512
    if (![width, height].every(n => Number.isInteger(n) && Number(n) >= 256 && Number(n) <= 768 && Number(n) % 32 === 0)) throw new Error('Image dimensions must be multiples of 32 in 256..768')
    Object.assign(result, { width, height })
  } else {
    const duration = value.duration_seconds ?? 8
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 1 || duration > 11) throw new Error('duration_seconds must be in 1..11; this model does not generate full songs')
    result.duration_seconds = duration
  }
  return result
}

function readPack(root: string, kind: GenerationKind): { directory: string; pack: GenerationPack; identity: string } {
  const directory = path.join(root, kind)
  const text = fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Generation model manifest is too large')
  const pack = JSON.parse(text) as GenerationPack
  const expected = GENERATORS[kind]
  if (pack.schema !== 1 || pack.model !== expected.model || pack.runtime !== expected.runtime || !/^[a-f0-9]{40}$/.test(pack.revision) ||
      !pack.runtime_version || !path.isAbsolute(pack.python) || !fs.statSync(pack.python).isFile() || pack.license_acknowledged !== true ||
      !pack.files || Array.isArray(pack.files) || !Object.keys(pack.files).length) throw new Error('Invalid generation pack; revision, runtime, files and explicit license acknowledgement are required')
  for (const [name, hash] of Object.entries(pack.files)) {
    const target = path.resolve(directory, 'weights', name), relative = path.relative(path.join(directory, 'weights'), target)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !/^[a-f0-9]{64}$/.test(hash) ||
        !fs.lstatSync(target).isFile() || fs.realpathSync(target) !== target) throw new Error('Unsafe or missing generation pack file')
  }
  return { directory, pack, identity: digest(text) }
}

/** Validate the real file, including cache hits. Metadata alone never certifies an asset. */
export function validateGeneratedAsset(file: string, request: GenerationRequest) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Generated asset is missing or exceeds the output limit')
  const b = fs.readFileSync(file)
  if (request.kind === 'image') {
    if (b.length < 33 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || b.toString('ascii', 12, 16) !== 'IHDR' ||
        b.readUInt32BE(16) !== request.width || b.readUInt32BE(20) !== request.height) throw new Error('Generated PNG dimensions/header do not match the request')
  } else {
    if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' || b.readUInt32LE(4) !== b.length - 8) throw new Error('Generated audio is not a complete WAV')
    let channels = 0, rate = 0, bits = 0, data: Buffer | undefined
    for (let i = 12; i + 8 <= b.length;) {
      const size = b.readUInt32LE(i + 4), end = i + 8 + size
      if (end > b.length) throw new Error('Truncated WAV chunk')
      if (b.toString('ascii', i, i + 4) === 'fmt ') {
        if (size < 16 || b.readUInt16LE(i + 8) !== 1) throw new Error('Expected PCM WAV')
        channels = b.readUInt16LE(i + 10); rate = b.readUInt32LE(i + 12); bits = b.readUInt16LE(i + 22)
      }
      if (b.toString('ascii', i, i + 4) === 'data') data = b.subarray(i + 8, end)
      i = end + (size % 2)
    }
    if (!data?.length || channels !== 2 || rate !== 44100 || bits !== 16 || data.length % 4 ||
        Math.abs(data.length / 4 / rate - request.duration_seconds!) > 0.05) throw new Error('Generated music format/duration does not match the request')
    let peak = 0
    for (let i = 0; i < data.length; i += 2) peak = Math.max(peak, Math.abs(data.readInt16LE(i)))
    if (peak < 2) throw new Error('Generated music is silent; no usable result published')
  }
  return { bytes: b.length, sha256: digest(b) }
}

/** Own-process watchdog. A cancelled result is not published; wait for resource release. */
export function runGenerationWorker(python: string, worker: string, input: Record<string, unknown>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-I', '-B', worker], {
      stdio: ['pipe', 'ignore', 'pipe'],
      env: { PATH: '/usr/bin:/bin', HOME: os.homedir(), PYTHONDONTWRITEBYTECODE: '1', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1',
        HF_DATASETS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', OMP_NUM_THREADS: '2', TOKENIZERS_PARALLELISM: 'false' },
    })
    let error: Error | undefined, stderr = '', checking = false
    const stop = (reason: Error) => { error ??= reason; child.kill('SIGKILL') }
    const abort = () => stop(new DOMException('Generation cancelled', 'AbortError'))
    const timeout = setTimeout(() => stop(new Error('Generation exceeded the 5-minute execution limit')), 300_000)
    const monitor = setInterval(() => {
      if (checking || !child.pid) return
      if (os.freemem() < 2 * GiB) { stop(new Error('Generation stopped to preserve system memory')); return }
      checking = true
      execFile('/bin/ps', ['-o', 'rss=', '-p', String(child.pid)], { timeout: 1000, maxBuffer: 1024 }, (_err, stdout) => {
        checking = false
        const rss = Number(stdout.trim()) * 1024
        if (Number.isFinite(rss) && rss > Number(input.working_bytes)) stop(new Error('Generation exceeded its process memory budget'))
      })
    }, 1000)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    child.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-2000) })
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(input))
    child.once('error', e => { error ??= e })
    child.once('close', code => {
      clearTimeout(timeout); clearInterval(monitor); signal.removeEventListener('abort', abort)
      if (signal.aborted) error = new DOMException('Generation cancelled', 'AbortError')
      if (error) reject(error)
      else if (code !== 0) reject(new Error(`Local generator failed (${code}): ${stderr}`))
      else resolve()
    })
  })
}

export function createLocalGeneration(deps: GenerationDeps) {
  let busy = false
  const memory = deps.memory ?? (() => ({ total: os.totalmem(), available: os.freemem() }))
  const diskFree = deps.diskFree ?? (dir => { const s = fs.statfsSync(dir); return s.bavail * s.bsize })
  function status() {
    return { local_only: true, busy, model_root: deps.root, provider_calls: 0, timeline_mutations: false,
      models: (['image', 'music'] as const).map(kind => {
        try { const { pack } = readPack(deps.root, kind); return { kind, ...GENERATORS[kind], state: 'configured_unverified', revision: pack.revision, runtime_version: pack.runtime_version } }
        catch { return { kind, ...GENERATORS[kind], state: 'not_configured', setup: 'Install a verified optional model pack; generation never downloads weights or accepts provider terms.' } }
      }), limitation: 'Resource admission/watchdog reduce risk, not an OS-wide hard memory guarantee. Other existing model integrations retain their own limits. Musical quality and absence of vocals are not certified.' }
  }
  async function generate(request: GenerationRequest, binding: GenerationBinding, signal = new AbortController().signal) {
    signal.throwIfAborted(); binding.assertCurrent()
    if ((deps.platform ?? process.platform) !== 'darwin' || (deps.arch ?? process.arch) !== 'arm64') throw new Error('Optional generation currently supports macOS Apple Silicon only')
    if (busy) throw new Error('Another local generation is running; wait or cancel that owned request')
    busy = true
    let temp: string | undefined
    try {
      const model = readPack(deps.root, request.kind)
      const target = path.resolve(binding.directory)
      if (!fs.statSync(target).isDirectory()) throw new Error('Save the project before generating assets')
      const key = digest(JSON.stringify({ request, pack: model.identity, worker: digest(fs.readFileSync(deps.worker)) }))
      const directory = path.join(target, 'Media', 'Generated'), ext = request.kind === 'image' ? 'png' : 'wav'
      const file = path.join(directory, `${key}.${ext}`), provenance = `${file}.json`
      const result = (cached: boolean, asset: ReturnType<typeof validateGeneratedAsset>) => ({ file_path: file, kind: request.kind, cached, ...asset,
        model: model.pack.model, model_revision: model.pack.revision, seed: request.seed, request, provider_calls: 0,
        next_step: 'Generated asset only. Hermes/user decides whether to import_media and place it with add_media_layer. No timeline edits or review evidence were created.' })
      if (fs.existsSync(file) && fs.existsSync(provenance)) {
        try {
          const saved = JSON.parse(fs.readFileSync(provenance, 'utf8')), asset = validateGeneratedAsset(file, request)
          if (saved.sha256 === asset.sha256 && saved.cache_key === key) { binding.assertCurrent(); signal.throwIfAborted(); return result(true, asset) }
        } catch { /* Corrupt/unverified assets are preserved, not credited as cache hits. */ }
        throw new Error('An invalid generated cache entry exists; preserve it for diagnosis or choose another seed')
      }
      const m = memory(), required = GENERATORS[request.kind].workingBytes
      if (m.total < 16 * GiB || m.available < required + 4 * GiB) throw new Error('Insufficient memory headroom for this generator; close other heavy apps and retry. No model was loaded.')
      if (diskFree(target) < 2 * GiB) throw new Error('Generation requires at least 2 GiB free output space; no model was loaded')
      // Verify complete local weights/config files before any package/model execution.
      for (const [name, hash] of Object.entries(model.pack.files)) {
        signal.throwIfAborted(); binding.assertCurrent()
        if (await hashFile(path.join(model.directory, 'weights', name), signal) !== hash) throw new Error(`Generation pack integrity check failed: ${name}`)
      }
      await deps.releaseIdleVision?.()
      signal.throwIfAborted(); binding.assertCurrent()
      const after = memory()
      if (after.available < required + 4 * GiB) throw new Error('Memory headroom changed before generation; no model was loaded')
      fs.mkdirSync(directory, { recursive: true })
      temp = fs.mkdtempSync(path.join(directory, '.generation-'))
      const staged = path.join(temp, `asset.${ext}`)
      await (deps.run ?? runGenerationWorker)(model.pack.python, deps.worker, { ...request, output: staged, weights: path.join(model.directory, 'weights'),
        runtime_version: model.pack.runtime_version, working_bytes: required }, signal)
      signal.throwIfAborted(); binding.assertCurrent()
      const asset = validateGeneratedAsset(staged, request)
      const saved = { cache_key: key, ...result(false, asset), runtime: model.pack.runtime, runtime_version: model.pack.runtime_version,
        license: GENERATORS[request.kind].license, model_manifest_sha256: model.identity }
      fs.writeFileSync(path.join(temp, 'provenance.json'), JSON.stringify(saved, null, 2), { flag: 'wx' })
      signal.throwIfAborted(); binding.assertCurrent()
      // Never overwrite an unrelated file, even on a concurrent process/cache race.
      fs.linkSync(staged, file)
      try { fs.linkSync(path.join(temp, 'provenance.json'), provenance) }
      catch (error) { fs.unlinkSync(file); throw error }
      return result(false, asset)
    } finally { if (temp) fs.rmSync(temp, { recursive: true, force: true }); busy = false }
  }
  return { status, generate }
}
async function hashFile(file: string, signal: AbortSignal) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(file, { signal })) hash.update(chunk)
  return hash.digest('hex')
}
export type LocalGeneration = ReturnType<typeof createLocalGeneration>
