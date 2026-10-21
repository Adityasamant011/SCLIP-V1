// @vitest-environment jsdom
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const terminal = vi.hoisted(() => ({
  writes: [] as string[],
  onData: null as ((data: string) => void) | null,
  exit: null as ((event: unknown) => void) | null,
  output: null as ((event: unknown) => void) | null,
  replayDone: null as (() => void) | null,
  asyncWrite: false,
  handlers: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
  instance: null as null | { cols: number; rows: number },
  resize: null as null | (() => void),
}))
const ipc = vi.hoisted(() => ({
  sclipOpenTerminal: vi.fn(),
  sclipTerminalInput: vi.fn(),
  sclipTerminalResize: vi.fn(),
}))

vi.mock('@xterm/xterm', () => ({ Terminal: class {
  constructor() { terminal.instance = this }
  cols = 80
  rows = 24
  loadAddon() {}
  open() {}
  parser = {
    registerOscHandler: vi.fn(() => { const h = { dispose: vi.fn() }; terminal.handlers.push(h); return h }),
    registerCsiHandler: vi.fn(() => { const h = { dispose: vi.fn() }; terminal.handlers.push(h); return h }),
  }
  write(data: string, done?: () => void) {
    terminal.writes.push(data)
    if (terminal.asyncWrite && done) terminal.replayDone = done
    else done?.()
  }
  onData(callback: (data: string) => void) { terminal.onData = callback; return { dispose() {} } }
  scrollToBottom() {}
  clear() {}
  dispose() {}
} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('../ipc/sclip', () => ipc)

import { HermesTerminal } from './HermesTerminal'

beforeEach(() => {
  terminal.writes = []
  terminal.onData = null
  terminal.output = null
  terminal.exit = null
  terminal.replayDone = null
  terminal.asyncWrite = false
  terminal.handlers = []
  vi.clearAllMocks()
  ipc.sclipTerminalInput.mockResolvedValue(undefined)
  ipc.sclipTerminalResize.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', { configurable: true, value: {
    on: (channel: string, callback: (event: unknown) => void) => {
      if (channel === 'sclip:terminal_exit') { terminal.exit = callback; return () => { terminal.exit = null } }
      terminal.output = callback
      return () => { terminal.output = null }
    },
  } })
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { terminal.resize = callback }
    observe() {}; disconnect() {}
  })
})

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('HermesTerminal startup and typing', () => {
  it('sends the latest panel dimensions after asynchronous PTY startup, before typing', async () => {
    let resolveOpen!: (value: { history: string; sequence: number }) => void
    ipc.sclipOpenTerminal.mockImplementation(() => new Promise(resolve => { resolveOpen = resolve }))
    render(<HermesTerminal projectId="project" sessionId="session" />)
    act(() => {
      terminal.instance!.cols = 42
      terminal.instance!.rows = 18
      terminal.resize?.()
    })
    expect(ipc.sclipTerminalResize).not.toHaveBeenCalled()
    await act(async () => { resolveOpen({ history: '', sequence: 0 }) })
    await waitFor(() => expect(ipc.sclipTerminalResize).toHaveBeenLastCalledWith('project', 'session', 42, 18))
    act(() => terminal.onData?.('long input'))
    await waitFor(() => expect(ipc.sclipTerminalInput).toHaveBeenCalled())
    expect(ipc.sclipTerminalResize.mock.invocationCallOrder[0]).toBeLessThan(ipc.sclipTerminalInput.mock.invocationCallOrder[0]!)
  })
  it('rebrands the complete banner without leaving a Framework suffix', async () => {
    ipc.sclipOpenTerminal.mockResolvedValue({ history: '⚕ NOUS HERMES - AI Agent Framework\r\n', sequence: 1 })
    render(<HermesTerminal projectId="project" sessionId="session" />)
    await waitFor(() => expect(terminal.writes.join('')).toContain('SCLIP - Video Editor Agent'))
    expect(terminal.writes.join('')).not.toContain('Agentework')
    expect(terminal.writes.join('')).not.toContain('Framework')
  })
  it('keeps live output queued until asynchronous history parsing completes', async () => {
    terminal.asyncWrite = true
    ipc.sclipOpenTerminal.mockResolvedValue({ history: '\x1b]11;?\x07\x1b[c', sequence: 1 })
    render(<HermesTerminal projectId="project" sessionId="session" />)
    await waitFor(() => expect(terminal.replayDone).not.toBeNull())
    act(() => {
      terminal.output?.({ projectId: 'project', sessionId: 'session', sequence: 2, data: '\x1b]11;?\x07' })
      terminal.onData?.('你好\x1b[200~paste\x1b[201~')
    })
    expect(terminal.writes).toHaveLength(1)
    expect(terminal.handlers.every(h => h.dispose.mock.calls.length === 0)).toBe(true)
    act(() => terminal.replayDone?.())
    expect(terminal.handlers.every(h => h.dispose.mock.calls.length === 1)).toBe(true)
    expect(terminal.writes).toHaveLength(2)
    await waitFor(() => expect(ipc.sclipTerminalInput).toHaveBeenCalledWith('project', 'session', '你好\x1b[200~paste\x1b[201~'))
  })

  it('paints the startup snapshot once, then only newer live output', async () => {
    let resolveOpen!: (value: { history: string; sequence: number }) => void
    ipc.sclipOpenTerminal.mockImplementation(() => new Promise(resolve => { resolveOpen = resolve }))
    render(<HermesTerminal projectId="project" sessionId="session" />)

    act(() => {
      terminal.output?.({ projectId: 'project', sessionId: 'session', sequence: 1, data: 'banner' })
      terminal.output?.({ projectId: 'project', sessionId: 'session', sequence: 2, data: 'prompt> ' })
    })
    await act(async () => { resolveOpen({ history: 'banner', sequence: 1 }) })
    expect(terminal.writes.join('')).toBe('bannerprompt> ')
    act(() => {
      terminal.output?.({ projectId: 'project', sessionId: 'session', sequence: 2, data: 'prompt> ' })
      terminal.output?.({ projectId: 'project', sessionId: 'session', sequence: 3, data: 'ready' })
    })
    expect(terminal.writes.join('')).toBe('bannerprompt> ready')
  })

  it('waits for startup and sends rapid keystrokes to the PTY in order', async () => {
    let resolveOpen!: (value: { history: string; sequence: number }) => void
    ipc.sclipOpenTerminal.mockImplementation(() => new Promise(resolve => { resolveOpen = resolve }))
    const sent: string[] = []
    const releases: Array<() => void> = []
    ipc.sclipTerminalInput.mockImplementation((_project: string, _session: string, data: string) => {
      sent.push(data)
      return new Promise<void>(resolve => { releases.push(resolve) })
    })
    render(<HermesTerminal projectId="project" sessionId="session" />)
    act(() => { terminal.onData?.('a'); terminal.onData?.('b'); terminal.onData?.('c') })
    expect(sent).toEqual([])
    await act(async () => { resolveOpen({ history: '', sequence: 0 }) })
    await waitFor(() => expect(sent).toEqual(['a']))
    await act(async () => { releases.shift()?.() })
    await waitFor(() => expect(sent).toEqual(['a', 'b']))
    await act(async () => { releases.shift()?.() })
    await waitFor(() => expect(sent).toEqual(['a', 'b', 'c']))
    await act(async () => { releases.shift()?.() })
  })
})


describe('terminal failure recovery', () => {
  it('shows loading until visible output, then reports only this terminal exit and offers retry', async () => {
    ipc.sclipOpenTerminal.mockResolvedValue({ history: '', sequence: 0 })
    const retry = vi.fn()
    render(<HermesTerminal projectId="project" sessionId="session" onRetry={retry} />)
    expect(screen.getByText('Opening Sclip terminal…')).toBeTruthy()
    await act(async () => {})
    act(() => terminal.output?.({ projectId:'project',sessionId:'session',sequence:1,data:'Ready> ' }))
    expect(screen.queryByText('Opening Sclip terminal…')).toBeNull()
    act(() => terminal.exit?.({ projectId:'other',sessionId:'session',code:1 }))
    expect(screen.queryByText(/terminal stopped/)).toBeNull()
    act(() => terminal.exit?.({ projectId:'project',sessionId:'session',code:3 }))
    expect(screen.getByText(/terminal stopped.*exit 3/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{ name:'Retry Connection' }))
    expect(retry).toHaveBeenCalledOnce()
    act(() => terminal.onData?.('ignored'))
    await act(async () => {})
    expect(ipc.sclipTerminalInput).not.toHaveBeenCalled()
  })

  it.each([false,true])('bounds a stalled startup (IPC resolves: %s) and ignores a late reply', async resolves => {
    vi.useFakeTimers()
    let resolve!: (snapshot:{ history:string; sequence:number }) => void
    ipc.sclipOpenTerminal.mockImplementation(() => resolves ? Promise.resolve({ history:'\x1b[c',sequence:0 }) : new Promise(r => { resolve=r }))
    render(<HermesTerminal projectId="project" sessionId="session" onRetry={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(screen.getByText(/did not produce output/)).toBeTruthy()
    if (!resolves) await act(async () => { resolve({ history:'late banner', sequence:1 }) })
    expect(terminal.writes.join('')).not.toContain('late banner')
    expect(screen.getByRole('button',{name:'Retry Connection'})).toBeTruthy()
  })

  it('preserves an exit that arrives before terminal open completes', async () => {
    let resolve!: (snapshot:{history:string;sequence:number}) => void
    ipc.sclipOpenTerminal.mockImplementation(() => new Promise(r => { resolve=r }))
    render(<HermesTerminal projectId="project" sessionId="session" onRetry={vi.fn()} />)
    act(() => terminal.exit?.({projectId:'project',sessionId:'session',code:1}))
    await act(async () => { resolve({history:'late banner',sequence:1}) })
    expect(screen.getByText(/terminal stopped.*exit 1/)).toBeTruthy()
    expect(terminal.writes).toEqual([])
  })
})
