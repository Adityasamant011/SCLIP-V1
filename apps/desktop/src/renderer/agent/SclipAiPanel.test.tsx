// @vitest-environment jsdom
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockIpc = vi.hoisted(() => ({
  sclipGetHermesStatus: vi.fn(),
  sclipListProjectSessions: vi.fn(),
  sclipActivateProjectSession: vi.fn(),
  sclipCreateProjectSession: vi.fn(),
  sclipRestartTerminal: vi.fn(),
  sclipRestartHermes: vi.fn(),
  sclipGetHermesConfig: vi.fn(),
  openSclipSettings: vi.fn(),
}))

const mockStore = vi.hoisted(() => ({
  projectId: 'test-project-123',
}))

vi.mock('../ipc/sclip', () => mockIpc)
vi.mock('../state/projectStore', () => ({
  useProjectStore: (selector: (state: { summary: { project_id: string } | null }) => unknown) =>
    selector({ summary: mockStore.projectId ? { project_id: mockStore.projectId } : null }),
}))
vi.mock('./HermesTerminal', () => ({
  HermesTerminal: ({ projectId, sessionId }: { projectId: string; sessionId: string }) => (
    <div data-testid="hermes-terminal">{`terminal:${projectId}:${sessionId}`}</div>
  ),
}))
vi.mock('./AgentPanelHeader', () => ({
  AgentPanelHeader: ({ onRestartTerminal, isRestarting }: { onRestartTerminal?: () => void; isRestarting?: boolean }) => (
    <div data-testid="agent-header">
      {onRestartTerminal && (
        <button data-testid="header-restart-btn" onClick={onRestartTerminal} disabled={isRestarting}>
          Restart
        </button>
      )}
    </div>
  ),
}))

import { SclipAiPanel } from './SclipAiPanel'

let runtimeCallback: ((payload: unknown) => void) | null = null
let configChangedCallback: (() => void) | null = null

beforeEach(() => {
  vi.clearAllMocks()
  configChangedCallback = null
  runtimeCallback = null
  mockStore.projectId = 'test-project-123'
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      on: (channel: string, callback: (payload?: unknown) => void) => {
        if (channel === 'sclip:hermes_config_changed') {
          configChangedCallback = callback
        }
        if (channel === 'sclip:hermes_runtime') runtimeCallback = callback
        return () => {
          if (channel === 'sclip:hermes_config_changed') configChangedCallback = null
          if (channel === 'sclip:hermes_runtime') runtimeCallback = null
        }
      },
    },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SclipAiPanel resilience & lifecycle', () => {
  it('retries connection if Hermes is initially offline and connects when it becomes ready', async () => {
    let callCount = 0
    mockIpc.sclipGetHermesStatus.mockImplementation(async () => {
      callCount++
      if (callCount < 3) {
        return { online: false, runtimeState: 'starting' }
      }
      return { online: true, runtimeState: 'ready' }
    })
    mockIpc.sclipListProjectSessions.mockResolvedValue({
      activeSessionId: 'sess-1',
      sessions: [{ id: 'sess-1', name: 'Terminal' }],
    })

    render(<SclipAiPanel />)

    // Should poll and eventually become ready without permanently showing error
    await waitFor(() => {
      expect(screen.getByTestId('hermes-terminal')).toBeTruthy()
    }, { timeout: 3000 })
    expect(screen.getByText('terminal:test-project-123:sess-1')).toBeTruthy()
    expect(callCount).toBeGreaterThanOrEqual(3)
  })

  it('shows error card with Retry Connection button when Hermes remains offline', async () => {
    mockIpc.sclipGetHermesStatus.mockResolvedValue({
      online: false,
      runtimeState: 'failed',
      runtimeDetail: 'Hermes exited (1)',
    })

    render(<SclipAiPanel />)

    await waitFor(() => {
      expect(screen.getByText('Hermes exited (1)')).toBeTruthy()
    }, { timeout: 3000 })

    const retryBtn = screen.getByRole('button', { name: 'Retry Connection' })
    expect(retryBtn).toBeTruthy()
  })

  it('recovers when config change event is received or user clicks Retry Connection', async () => {
    // Start in failed state
    mockIpc.sclipGetHermesStatus.mockResolvedValue({
      online: false,
      runtimeState: 'failed',
      runtimeDetail: 'Hermes exited (1)',
    })

    render(<SclipAiPanel />)

    await waitFor(() => {
      expect(screen.getByText('Hermes exited (1)')).toBeTruthy()
    }, { timeout: 3000 })

    // Now Hermes comes online after model change
    mockIpc.sclipGetHermesStatus.mockResolvedValue({
      online: true,
      runtimeState: 'ready',
    })
    mockIpc.sclipListProjectSessions.mockResolvedValue({
      activeSessionId: null,
      sessions: [],
    })
    mockIpc.sclipCreateProjectSession.mockResolvedValue({
      id: 'sess-created-2',
      name: 'Terminal',
    })

    // Trigger config change event (simulating setting model to nemotron)
    act(() => {
      configChangedCallback?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('hermes-terminal')).toBeTruthy()
    }, { timeout: 3000 })
    expect(screen.getByText('terminal:test-project-123:sess-created-2')).toBeTruthy()
  })
})


it('waits beyond the old 1.2s cutoff and opens only session metadata', async () => {
  vi.useFakeTimers()
  let calls=0
  mockIpc.sclipGetHermesStatus.mockImplementation(async()=>({ online:++calls>10,runtimeState:'starting' }))
  mockIpc.sclipListProjectSessions.mockResolvedValue({activeSessionId:'old-session',sessions:[{id:'old-session'}]})
  render(<SclipAiPanel />)
  await act(async()=>{await vi.advanceTimersByTimeAsync(3500)})
  expect(screen.getByText('terminal:test-project-123:old-session')).toBeTruthy()
  expect(mockIpc.sclipListProjectSessions).toHaveBeenCalledWith('test-project-123',false)
})

it('reports a stalled session lookup and ignores its late result', async () => {
  vi.useFakeTimers()
  mockIpc.sclipGetHermesStatus.mockResolvedValue({online:true,runtimeState:'ready'})
  let resolve!: (value:unknown)=>void
  mockIpc.sclipListProjectSessions.mockImplementation(()=>new Promise(r=>{resolve=r}))
  render(<SclipAiPanel />)
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_000)})
  expect(screen.getByText(/took too long/)).toBeTruthy()
  await act(async()=>{resolve({activeSessionId:'late',sessions:[]})})
  expect(screen.queryByTestId('hermes-terminal')).toBeNull()
})

it('cancels pending startup when the runtime fails, and recovers on ready', async () => {
  mockIpc.sclipGetHermesStatus.mockResolvedValue({online:true,runtimeState:'ready'})
  let resolve!: (value:unknown)=>void
  mockIpc.sclipListProjectSessions.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
  render(<SclipAiPanel />)
  await waitFor(()=>expect(mockIpc.sclipListProjectSessions).toHaveBeenCalled())
  act(()=>runtimeCallback?.({state:'failed',detail:'Process stopped'}))
  await act(async()=>{resolve({activeSessionId:'stale',sessions:[]})})
  expect(screen.getByText('Process stopped')).toBeTruthy()
  expect(screen.queryByTestId('hermes-terminal')).toBeNull()
  mockIpc.sclipListProjectSessions.mockResolvedValue({activeSessionId:'restored',sessions:[]})
  act(()=>runtimeCallback?.({state:'ready'}))
  await waitFor(()=>expect(screen.getByText('terminal:test-project-123:restored')).toBeTruthy())
})

it('restarts an offline gateway when Retry Connection is clicked', async () => {
  mockIpc.sclipGetHermesStatus.mockResolvedValue({online:false,runtimeState:'failed',runtimeDetail:'Offline'})
  mockIpc.sclipRestartHermes.mockImplementation(async()=>{
    mockIpc.sclipGetHermesStatus.mockResolvedValue({online:true,runtimeState:'ready'})
  })
  mockIpc.sclipListProjectSessions.mockResolvedValue({activeSessionId:'restored',sessions:[]})
  render(<SclipAiPanel />)
  await waitFor(()=>expect(screen.getByText('Offline')).toBeTruthy())
  fireEvent.click(screen.getByRole('button',{name:'Retry Connection'}))
  await waitFor(()=>expect(screen.getByText('terminal:test-project-123:restored')).toBeTruthy())
  expect(mockIpc.sclipRestartHermes).toHaveBeenCalledOnce()
})
