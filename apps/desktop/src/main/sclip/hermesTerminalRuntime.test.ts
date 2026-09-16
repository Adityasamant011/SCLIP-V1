import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let spawnedArgs: any[] = []
let spawnedEnv: Record<string, string> = {}
let ptyWriteMock = vi.fn()
let ptyResizeMock = vi.fn()
let ptyKillMock = vi.fn()
let onDataCallback: ((data: string) => void) | null = null
let onExitCallback: ((event: { exitCode: number }) => void) | null = null

vi.mock('node-pty', () => ({
  spawn: (command: string, args: string[], options: any) => {
    spawnedArgs = [command, ...args]
    spawnedEnv = options.env
    return {
      write: ptyWriteMock,
      resize: ptyResizeMock,
      kill: ptyKillMock,
      onData: (cb: (data: string) => void) => { onDataCallback = cb },
      onExit: (cb: (event: { exitCode: number }) => void) => { onExitCallback = cb },
    }
  },
}))

import { HermesTerminalRuntime } from './hermesTerminalRuntime'

describe('HermesTerminalRuntime', () => {
  let tmpDir: string
  let outputEvents: any[]
  let exitEvents: any[]

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sclip-hermes-term-test-'))
    outputEvents = []
    exitEvents = []
    spawnedArgs = []
    spawnedEnv = {}
    ptyWriteMock.mockClear()
    ptyResizeMock.mockClear()
    ptyKillMock.mockClear()
    onDataCallback = null
    onExitCallback = null
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('spawns Hermes CLI with explicit weftcut toolset and MCP connection env vars', async () => {
    const runtime = new HermesTerminalRuntime({
      isPackaged: false,
      resourcesPath: '/test/resources',
      userDataPath: tmpDir,
      executableOverride: '/usr/bin/python3',
      getMcpInfo: () => ({ url: 'http://127.0.0.1:44555/mcp', bearer_token: 'secret-token-123' }),
      getProviderEnvironment: () => ({ OPENROUTER_API_KEY: 'sk-test-key' }),
      assertSession: async () => {},
      onOutput: (e) => outputEvents.push(e),
      onExit: (e) => exitEvents.push(e),
    })

    await runtime.ensure('proj-123', 'sess-456')

    expect(spawnedArgs).toContain('chat')
    const toolsetsIdx = spawnedArgs.indexOf('--toolsets')
    expect(toolsetsIdx).toBeGreaterThan(-1)
    expect(spawnedArgs[toolsetsIdx + 1]).toContain('weftcut')

    expect(spawnedEnv.SCLIP_MCP_URL).toBe('http://127.0.0.1:44555/mcp')
    expect(spawnedEnv.SCLIP_MCP_TOKEN).toBe('secret-token-123')
    expect(spawnedEnv.SCLIP_ACTIVE_PROJECT_ID).toBe('proj-123')
    expect(spawnedEnv.SCLIP_PROJECT_ID).toBe('proj-123')
    expect(spawnedEnv.OPENROUTER_API_KEY).toBe('sk-test-key')
  })

  it('routes terminal input to the active pty and handles output events', async () => {
    const runtime = new HermesTerminalRuntime({
      isPackaged: false,
      resourcesPath: '/test/resources',
      userDataPath: tmpDir,
      executableOverride: '/usr/bin/python3',
      getMcpInfo: () => ({ url: 'http://127.0.0.1:44555/mcp', bearer_token: 'secret-token-123' }),
      getProviderEnvironment: () => ({}),
      assertSession: async () => {},
      onOutput: (e) => outputEvents.push(e),
      onExit: (e) => exitEvents.push(e),
    })

    await runtime.ensure('proj-123', 'sess-456')
    expect(onDataCallback).toBeDefined()
    onDataCallback!('Welcome to Hermes\r\n')

    expect(outputEvents).toEqual([
      { projectId: 'proj-123', sessionId: 'sess-456', data: 'Welcome to Hermes\r\n' },
    ])

    await runtime.input('proj-123', 'sess-456', 'hello\n')
    expect(ptyWriteMock).toHaveBeenCalledWith('hello\n')

    expect(onExitCallback).toBeDefined()
    onExitCallback!({ exitCode: 0 })
    expect(exitEvents).toEqual([
      { projectId: 'proj-123', sessionId: 'sess-456', code: 0 },
    ])
  })

  it('enforces session assertion before spawning or sending input', async () => {
    const runtime = new HermesTerminalRuntime({
      isPackaged: false,
      resourcesPath: '/test/resources',
      userDataPath: tmpDir,
      executableOverride: '/usr/bin/python3',
      getMcpInfo: () => ({ url: 'http://127.0.0.1:44555/mcp', bearer_token: 'secret-token-123' }),
      getProviderEnvironment: () => ({}),
      assertSession: async (projId) => {
        if (projId === 'forbidden-proj') throw new Error('Session does not belong to active project')
      },
      onOutput: () => {},
      onExit: () => {},
    })

    await expect(runtime.ensure('forbidden-proj', 'sess-1')).rejects.toThrow('Session does not belong')
    await expect(runtime.input('forbidden-proj', 'sess-1', 'hi')).rejects.toThrow('Session does not belong')
  })
})
