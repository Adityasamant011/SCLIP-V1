import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveVisionPythonBinary, visionWorkerLaunchSpec } from './visionSidecar'

describe('vision worker Python launch contract', () => {
  let dir: string | undefined
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); dir = undefined })

  it('prefers the configured sidecar venv and launches the worker with bytecode writes disabled', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-vision-python-'))
    const configured = path.join(dir, 'bin', 'python3')
    fs.mkdirSync(path.dirname(configured), { recursive: true })
    fs.writeFileSync(configured, 'synthetic executable fixture')
    expect(resolveVisionPythonBinary(dir)).toBe(configured)
    const spec = visionWorkerLaunchSpec(configured, '/sealed/resources/vlm_worker.py', 'synthetic-model', 41234, { PYTHONDONTWRITEBYTECODE: '0' })
    expect(spec.args).toEqual(['-B', '/sealed/resources/vlm_worker.py'])
    expect(spec.env).toMatchObject({ PYTHONDONTWRITEBYTECODE: '1', SCLIP_VLM_MODEL: 'synthetic-model', SCLIP_VLM_PORT: '41234' })
  })

  it('falls back to python3 only when the configured venv binary is absent', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-vision-python-'))
    expect(resolveVisionPythonBinary(dir)).toBe('python3')
  })
})
