import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createLocalGeneration, memoryHeadroomFromQuery, validateGeneratedAsset, validateGenerationRequest } from './localGeneration'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })))
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const request = validateGenerationRequest({ prompt: 'Synthetic test', seed: 1, duration_seconds: 1 }, 'music')
const GiB = 1024 ** 3
function wav() {
  const b = Buffer.alloc(44 + 44100 * 4)
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(176400, 28)
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40)
  for (let i = 44; i < b.length; i += 2) b.writeInt16LE(Math.round(Math.sin(i / 80) * 1000), i)
  return b
}
function fixture() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-generation-test-'))); dirs.push(dir)
  const root = path.join(dir, 'models'), music = path.join(root, 'music'), weights = path.join(music, 'weights')
  const revision = 'b'.repeat(40), snapshot = `hub/models--t5-base/snapshots/${revision}`
  const files: Record<string, string> = {}
  for (const [name, content] of Object.entries({ 'model_config.json': '{}', 'model.safetensors': 'fixture',
    'hub/version.txt': '1',
    'hub/models--t5-base/refs/main': revision, [`${snapshot}/config.json`]: '{}',
    [`${snapshot}/model.safetensors`]: 'fixture', [`${snapshot}/spiece.model`]: 'fixture' })) {
    const target = path.join(weights, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content)
    files[name] = hash(Buffer.from(content))
  }
  fs.writeFileSync(path.join(music, 'manifest.json'), JSON.stringify({ schema: 1, model: 'stabilityai/stable-audio-open-small',
    revision: 'a'.repeat(40), runtime: 'stable-audio-tools', runtime_version: '0.0.19', text_revision: revision,
    runtime_versions: { 'stable-audio-tools': '0.0.19' }, python: process.execPath, license_acknowledged: true, files }))
  const worker = path.join(dir, 'worker.py'); fs.writeFileSync(worker, '# synthetic worker fixture')
  const run = vi.fn(async (_python, _worker, input: Record<string, unknown>) => { fs.writeFileSync(String(input.output), wav()) })
  const deps = { root, worker, platform: 'darwin', arch: 'arm64', memory: () => ({ total: 24 * GiB, available: 16 * GiB }), diskFree: () => 10 * GiB, run }
  const binding = { directory: dir, assertCurrent: vi.fn() }
  return { dir, root, weights, run, deps, binding, service: createLocalGeneration(deps) }
}
describe('optional local music admission and publication (synthetic worker)', () => {
  it('uses bounded system headroom percentages and rejects malformed samples', () => {
    expect(memoryHeadroomFromQuery('System-wide memory free percentage: 64%', 16 * GiB)).toBe(Math.floor(16 * GiB * .64))
    expect(memoryHeadroomFromQuery('System-wide memory free percentage: 101%', 16 * GiB)).toBeNull()
    expect(memoryHeadroomFromQuery('unavailable', 16 * GiB)).toBeNull()
  })
  it('releases idle vision before memory admission and rechecks headroom after model hashing', async () => {
    const f = fixture(); let released = false
    const memory = vi.fn(() => ({ total: 24 * GiB, available: released ? 16 * GiB : GiB }))
    const service = createLocalGeneration({ ...f.deps, memory, releaseIdleVision: async () => { released = true } })
    await service.generate(request, f.binding)
    expect(memory).toHaveBeenCalledTimes(2)
    expect(f.run).toHaveBeenCalledTimes(1)
  })
  it('reports missing packs without running a worker', () => {
    const f = fixture(); fs.rmSync(f.root, { recursive: true })
    expect(f.service.status().models.every(model => model.state === 'not_configured')).toBe(true)
    expect(f.run).not.toHaveBeenCalled()
  })
  it('publishes a validated WAV and revalidates a cache hit', async () => {
    const f = fixture(), first = await f.service.generate(request, f.binding)
    expect(first.cached).toBe(false); expect(first.provider_calls).toBe(0)
    expect((await f.service.generate(request, f.binding)).cached).toBe(true)
    expect(f.run).toHaveBeenCalledTimes(1)
    fs.writeFileSync(first.file_path, 'broken')
    await expect(f.service.generate(request, f.binding)).rejects.toThrow('invalid generated cache')
  })
  it('does not execute with corrupted model files', async () => {
    const f = fixture(); fs.writeFileSync(path.join(f.weights, 'model.safetensors'), 'modified')
    await expect(f.service.generate(request, f.binding)).rejects.toThrow('integrity check failed')
    expect(f.run).not.toHaveBeenCalled()
  })
  it('rejects unlisted config files and symlinks', async () => {
    const f = fixture(); fs.writeFileSync(path.join(f.weights, 'unlisted.json'), '{}')
    await expect(f.service.generate(request, f.binding)).rejects.toThrow('Unverified file')
    fs.rmSync(path.join(f.weights, 'unlisted.json')); fs.symlinkSync(f.deps.worker, path.join(f.weights, 'extra.py'))
    await expect(f.service.generate(request, f.binding)).rejects.toThrow('Unverified file')
    expect(f.run).not.toHaveBeenCalled()
  })
  it('requires memory and disk headroom before loading a model', async () => {
    const f = fixture()
    await expect(createLocalGeneration({ ...f.deps, memory: () => ({ total: 16 * GiB, available: GiB }) }).generate(request, f.binding)).rejects.toThrow('memory headroom')
    await expect(createLocalGeneration({ ...f.deps, diskFree: () => 0 }).generate(request, f.binding)).rejects.toThrow('free output space')
    expect(f.run).not.toHaveBeenCalled()
  })
  it('cleans staged output when project authority changes during inference', async () => {
    const f = fixture()
    f.run.mockImplementation(async (_python, _worker, input) => {
      fs.writeFileSync(String(input.output), wav()); f.binding.assertCurrent.mockImplementation(() => { throw new Error('stale opening') })
    })
    await expect(f.service.generate(request, f.binding)).rejects.toThrow('stale opening')
    expect(fs.readdirSync(path.join(f.dir, 'Media/Generated'))).toEqual([])
    expect(f.service.status().busy).toBe(false)
  })
  it('never publishes a cancelled result', async () => {
    const f = fixture(), controller = new AbortController()
    f.run.mockImplementation(async (_python, _worker, input) => { fs.writeFileSync(String(input.output), wav()); controller.abort() })
    await expect(f.service.generate(request, f.binding, controller.signal)).rejects.toThrow()
    expect(fs.readdirSync(path.join(f.dir, 'Media/Generated'))).toEqual([])
  })
  it('rejects silence and limits Small to its supported duration', () => {
    const f = fixture(), file = path.join(f.dir, 'silent.wav'), b = wav(); b.fill(0, 44); fs.writeFileSync(file, b)
    expect(() => validateGeneratedAsset(file, request)).toThrow('silent')
    expect(() => validateGenerationRequest({ prompt: 'test', seed: 1, duration_seconds: 12 }, 'music')).toThrow('1..11')
  })
})
