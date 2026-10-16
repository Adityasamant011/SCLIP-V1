import { describe, expect, it } from 'vitest'
import { pythonArgsWithoutBytecode, pythonEnvWithoutBytecode } from './pythonRuntime'

describe('Python sidecar launch contract', () => {
  it('puts -B before the script/worker arguments', () => {
    expect(pythonArgsWithoutBytecode(['worker.py', '--mode', 'inspect'])).toEqual(['-B', 'worker.py', '--mode', 'inspect'])
  })
  it('overrides inherited bytecode settings for every launched child', () => {
    expect(pythonEnvWithoutBytecode({ PYTHONDONTWRITEBYTECODE: '0', SAFE: 'yes' })).toEqual({ PYTHONDONTWRITEBYTECODE: '1', SAFE: 'yes' })
  })
})
