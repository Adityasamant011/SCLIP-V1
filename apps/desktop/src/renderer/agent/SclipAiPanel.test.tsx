// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockIpc = vi.hoisted(() => ({
  sclipGetHermesStatus: vi.fn(),
  sclipListProjectSessions: vi.fn(),
  sclipActivateProjectSession: vi.fn(),
  sclipCreateProjectSession: vi.fn(),
  sclipRestartTerminal: vi.fn(),
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

let configChangedCallback: (() => void) | null = null

beforeEach(() => {
  vi.clearAllMocks()
  configChangedCallback = null
  mockStore.projectId = 'test-project-123'
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      on: (channel: string, callback: () => void) => {
        if (channel === 'sclip:hermes_config_changed') {
          configChangedCallback = callback
        }
        return () => {
          configChangedCallback = null
        }
      },
    },
  })
})

afterEach(() => {
  cleanup()
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
