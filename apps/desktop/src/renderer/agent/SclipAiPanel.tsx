import { ReviewStatus } from './ReviewStatus'
import { BackgroundFeedback } from './BackgroundFeedback'
import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import {
  sclipActivateProjectSession,
  sclipCreateProjectSession,
  sclipGetHermesStatus,
  sclipListProjectSessions,
  sclipRestartTerminal,
} from '../ipc/sclip'
import { HermesTerminal } from './HermesTerminal'
import { AgentPanelHeader } from './AgentPanelHeader'
import './sclip.css'

type TerminalState =
  | { kind: 'opening' }
  | { kind: 'ready'; sessionId: string }
  | { kind: 'error'; message: string }

/** A quiet, single-purpose home for the project-bound Hermes terminal. */
export function SclipAiPanel() {
  const projectId = useProjectStore(state => state.summary?.project_id ?? null)
  const [terminal, setTerminal] = useState<TerminalState>({ kind: 'opening' })
  const [restartNonce, setRestartNonce] = useState(0)
  const [isRestarting, setIsRestarting] = useState(false)
  const terminalActions = useRef<{ clear: () => void } | null>(null)

  const handleRestart = async () => {
    if (!projectId) return
    setIsRestarting(true)
    try {
      if (terminal.kind === 'ready') {
        await sclipRestartTerminal(projectId, terminal.sessionId).catch(() => {})
      }
      setRestartNonce(n => n + 1)
    } finally {
      setIsRestarting(false)
    }
  }

  const handleClear = () => {
    terminalActions.current?.clear()
  }

  useEffect(() => {
    const unsubscribe = window.api.on('sclip:hermes_config_changed', () => {
      setRestartNonce(n => n + 1)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    setTerminal({ kind: 'opening' })
    if (!projectId) {
      setTerminal({ kind: 'error', message: 'Open a Sclip project to start Hermes.' })
      return () => { active = false }
    }
    void (async () => {
      try {
        let status = await sclipGetHermesStatus()
        // Retry polling up to 5 times (1.5 seconds total) if Hermes is starting/restarting
        const maxAttempts = 5
        for (let attempt = 1; !status.online && attempt < maxAttempts; attempt++) {
          if (!active) return
          await new Promise(resolve => setTimeout(resolve, 300))
          status = await sclipGetHermesStatus()
        }
        if (!status.online) {
          throw new Error(status.runtimeDetail || 'Hermes is not connected.')
        }
        const sessions = await sclipListProjectSessions(projectId)
        let sessionId = sessions.activeSessionId
        if (!sessionId && sessions.sessions[0]) {
          sessionId = sessions.sessions[0].id
          await sclipActivateProjectSession(projectId, sessionId)
        }
        if (!sessionId) sessionId = (await sclipCreateProjectSession(projectId, 'Terminal')).id
        if (active) setTerminal({ kind: 'ready', sessionId })
      } catch (error) {
        if (active) setTerminal({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })()
    return () => { active = false }
  }, [projectId, restartNonce])

  return (
    <div className="sclip-dock-wrapper">
      <AgentPanelHeader
        onRestartTerminal={projectId ? handleRestart : undefined}
        onClearTerminal={terminal.kind === 'ready' && projectId ? handleClear : undefined}
        isRestarting={isRestarting}
      />
      {projectId && <ReviewStatus projectId={projectId} />}
      {projectId && <BackgroundFeedback projectId={projectId} />}
      <div className="sclip-dock-content">
        {terminal.kind === 'ready' && projectId ? (
          <HermesTerminal
            key={`${terminal.sessionId}-${restartNonce}`}
            projectId={projectId}
            sessionId={terminal.sessionId}
            onTerminalReady={actions => { terminalActions.current = actions }}
          />
        ) : (
          <div className="sclip-terminal-empty" role="status">
            {terminal.kind === 'error' ? (
              <div className="sclip-terminal-error-card">
                <span className="sclip-terminal-error-text">{terminal.message}</span>
                {projectId && (
                  <button
                    type="button"
                    className="sclip-terminal-retry-btn"
                    onClick={handleRestart}
                    disabled={isRestarting}
                  >
                    {isRestarting ? 'Connecting…' : 'Retry Connection'}
                  </button>
                )}
              </div>
            ) : (
              'Starting Hermes terminal…'
            )}
          </div>
        )}
      </div>
    </div>
  )
}
