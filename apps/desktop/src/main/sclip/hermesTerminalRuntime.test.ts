vi.mock('./autonomousReview', () => ({startAutonomousReview: vi.fn(async()=>({url:'http://127.0.0.1:44555/mcp?review_session=synthetic',review_id:'synthetic',editorial_evidence_packet:{identity:{state_version:'synthetic'}}})),initialEditorialEvidence:vi.fn(async()=>({identity:{state_version:'synthetic'}})),stageEditorialEvidence:vi.fn(()=>({name:'synthetic-evidence',cleanup:()=>{}}))}))
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
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
import { stageEditorialEvidence } from './autonomousReview'

describe('HermesTerminalRuntime', () => {
  it('loads chosen creator context through actual launch arguments, isolates native memory, and changes resumed identity after reset', async () => {
    const directory=mkdtempSync(path.join(os.tmpdir(),'creator-terminal-'))
    try {
      const base=path.join(directory,'sclip-hermes'),home=path.join(base,'creators','isolated')
      mkdirSync(path.join(base,'memories'),{recursive:true});writeFileSync(path.join(base,'memories','USER.md'),'Creator A private preference')
      let epoch='creator-b:1'
      const runtime=new HermesTerminalRuntime({isPackaged:false,resourcesPath:'',userDataPath:directory,executableOverride:'/usr/bin/python3',getMcpInfo:()=>({url:'http://127.0.0.1/mcp',bearer_token:'synthetic'}),getProviderEnvironment:()=>({}),assertSession:async()=>{},onOutput:()=>{},onExit:()=>{},getCreatorHome:()=>home,getCreatorContext:()=> 'Creator B: minimal text. Current request overrides.',getCreatorSessionKey:()=>epoch})
      await runtime.ensure('project','session')
      const first=spawnedArgs[spawnedArgs.indexOf('--continue')+1]
      expect(spawnedEnv.HERMES_HOME).toBe(home)
      expect(stageEditorialEvidence).toHaveBeenCalledWith(home,expect.anything(),'Creator B: minimal text. Current request overrides.')
      expect(spawnedArgs[spawnedArgs.indexOf('--skills')+1]).toContain('synthetic-evidence')
      expect(existsSync(path.join(home,'memories','USER.md'))).toBe(false)
      runtime.stopAll();epoch='creator-b:2';await runtime.ensure('project','session')
      expect(spawnedArgs[spawnedArgs.indexOf('--continue')+1]).not.toBe(first)
      runtime.stopAll()
    } finally {rmSync(directory,{recursive:true,force:true})}
  })
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
      getProviderEnvironment: () => ({ OPENROUTER_API_KEY: 'SCLIP_TEST_SECRET_DO_NOT_LEAK_12345' }),
      assertSession: async () => {},
      onOutput: (e) => outputEvents.push(e),
      onExit: (e) => exitEvents.push(e),
    })

    await runtime.ensure('proj-123', 'sess-456')

    expect(spawnedArgs).toContain('chat')
    const toolsetsIdx = spawnedArgs.indexOf('--toolsets')
    expect(toolsetsIdx).toBeGreaterThan(-1)
    expect(spawnedArgs[toolsetsIdx + 1]).toContain('weftcut')
    expect(spawnedArgs[toolsetsIdx + 1].split(',')).toEqual(expect.arrayContaining(['terminal', 'file']))
    expect(spawnedArgs[spawnedArgs.indexOf('--max-turns') + 1]).toBe('100')
    const skillsIdx = spawnedArgs.indexOf('--skills')
    expect(skillsIdx).toBeGreaterThan(-1)
    expect(spawnedArgs[skillsIdx + 1]).toBe('weftcut,synthetic-evidence')

    expect(spawnedEnv.SCLIP_MCP_URL).toBe('http://127.0.0.1:44555/mcp')
    expect(spawnedEnv.SCLIP_MCP_TOKEN).toBe('secret-token-123')
    expect(spawnedEnv.SCLIP_ACTIVE_PROJECT_ID).toBe('proj-123')
    expect(spawnedEnv.SCLIP_PROJECT_ID).toBe('proj-123')
    expect(spawnedEnv.HERMES_TUI_BACKGROUND).toBe('#0b0d12')
    expect(spawnedEnv.OPENROUTER_API_KEY).toBe('SCLIP_TEST_SECRET_DO_NOT_LEAK_12345')
    expect(JSON.stringify(spawnedArgs)).not.toContain('SCLIP_TEST_SECRET_DO_NOT_LEAK_12345')
    onDataCallback!('provider error: SCLIP_TEST_SECRET_DO_NOT_LEAK_12345')
    onExitCallback!({ exitCode: 1 })
    expect(JSON.stringify(outputEvents)).not.toContain('SCLIP_TEST_SECRET_DO_NOT_LEAK_12345')
    expect(JSON.stringify(exitEvents)).not.toContain('SCLIP_TEST_SECRET_DO_NOT_LEAK_12345')
    expect(spawnedArgs).toContain('--provider')
    expect(spawnedArgs).toContain('-m')
    expect(spawnedEnv.HERMES_INFERENCE_MODEL).toBeDefined()
    expect(spawnedEnv.HERMES_PROVIDER).toBeDefined()
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

    expect(await runtime.ensure('proj-123', 'sess-456')).toEqual({ history: '', sequence: 0 })
    expect(onDataCallback).toBeDefined()
    onDataCallback!('Welcome to Hermes\r\n')

    expect(outputEvents.map(e => e.data).join('')).toBe('Welcome to Hermes\r\n')
    expect(outputEvents.map(e => e.sequence)).toEqual([1])
    expect(await runtime.ensure('proj-123', 'sess-456')).toEqual({ history: 'Welcome to Hermes\r\n', sequence: 1 })

    await runtime.input('proj-123', 'sess-456', 'hello\n')
    expect(ptyWriteMock).toHaveBeenCalledWith('hello\n')

    expect(onExitCallback).toBeDefined()
    onExitCallback!({ exitCode: 0 })
    expect(outputEvents.map(e => e.data).join('')).toBe('Welcome to Hermes\r\n')
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

  it('kills previous PTY and spawns a new one on restartSession', async () => {
    ptyKillMock.mockClear()
    const runtime = new HermesTerminalRuntime({
      isPackaged: false,
      resourcesPath: '/test/resources',
      userDataPath: tmpDir,
      executableOverride: '/usr/bin/python3',
      getMcpInfo: () => ({ url: 'http://127.0.0.1:44555/mcp', bearer_token: 'secret-token-123' }),
      getProviderEnvironment: () => ({}),
      assertSession: async () => {},
      onOutput: () => {},
      onExit: () => {},
    })

    await runtime.ensure('proj-1', 'sess-1')
    expect(ptyKillMock).not.toHaveBeenCalled()
    const oldData = onDataCallback!
    const oldExit = onExitCallback!
    await runtime.restartSession('proj-1', 'sess-1')
    expect(ptyKillMock).toHaveBeenCalledTimes(1)
    oldData('stale output')
    oldExit({ exitCode: 1 })
    expect(outputEvents).toEqual([])
    expect(exitEvents).toEqual([])
  })

  it('restarts all active sessions on restartAll', async () => {
    ptyKillMock.mockClear()
    const runtime = new HermesTerminalRuntime({
      isPackaged: false,
      resourcesPath: '/test/resources',
      userDataPath: tmpDir,
      executableOverride: '/usr/bin/python3',
      getMcpInfo: () => ({ url: 'http://127.0.0.1:44555/mcp', bearer_token: 'secret-token-123' }),
      getProviderEnvironment: () => ({}),
      assertSession: async () => {},
      onOutput: () => {},
      onExit: () => {},
    })

    await runtime.ensure('proj-1', 'sess-1')
    await runtime.ensure('proj-2', 'sess-2')
    expect(ptyKillMock).not.toHaveBeenCalled()

    await runtime.restartAll()
    expect(ptyKillMock).toHaveBeenCalledTimes(2)
  })
})
