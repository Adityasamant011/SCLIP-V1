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
  sclipRestartHermes,
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
  const cancelStartup = useRef<(() => void) | null>(null)
  const terminalActions = useRef<{ clear: () => void } | null>(null)

  const handleRestart = async () => {
    if (!projectId) return
    setIsRestarting(true)
    try {
      const status = await sclipGetHermesStatus()
      if (!status.online) await sclipRestartHermes()
      else if (terminal.kind === 'ready') await sclipRestartTerminal(projectId, terminal.sessionId)
      setRestartNonce(n => n + 1)
    } catch (error) {
      setTerminal({ kind: 'error', message: error instanceof Error ? error.message : 'Could not reconnect Sclip AI.' })
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
    const runtimeUnsubscribe = window.api.on('sclip:hermes_runtime', payload => {
      const event = payload as { state?: string; detail?: string }
      if (event.state === 'ready') setRestartNonce(n => n + 1)
      else if (event.state === 'failed' || event.state === 'stopped') {
        cancelStartup.current?.()
        setTerminal({ kind:'error', message:event.detail || 'Sclip AI stopped. Retry the connection.' })
      }
    })
    return () => { unsubscribe(); runtimeUnsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    let expired = false
    const timeout = setTimeout(() => {
      expired = true
      if (active) setTerminal({ kind:'error', message:'Sclip AI took too long to open this project. Retry the connection.' })
    }, 30_000)
    const cancel = () => { active = false; clearTimeout(timeout) }
    cancelStartup.current = cancel
    setTerminal({ kind: 'opening' })
    if (!projectId) {
      setTerminal({ kind: 'error', message: 'Open a Sclip project to start Sclip AI.' })
      clearTimeout(timeout)
      return () => { active = false }
    }
    void (async () => {
      try {
        let status = await sclipGetHermesStatus()
        // Gateway startup can take several seconds on older projects. Bound
        // the complete startup, and also react when the runtime becomes ready.
        for (let attempt = 1; !status.online && attempt < 100; attempt++) {
          if (!active || expired) return
          if (status.runtimeState === 'failed' || status.runtimeState === 'stopped') break
          await new Promise(resolve => setTimeout(resolve, 300))
          status = await sclipGetHermesStatus()
        }
        if (!active || expired) return
        if (!status.online) {
          throw new Error(status.runtimeDetail || 'Sclip AI is not connected.')
        }
        // Opening the PTY needs session IDs, not a network fetch of every
        // historical conversation. Hermes restores the selected session itself.
        const sessions = await sclipListProjectSessions(projectId, false)
        if (!active || expired) return
        let sessionId = sessions.activeSessionId
        if (!sessionId && sessions.sessions[0]) {
          sessionId = sessions.sessions[0].id
          await sclipActivateProjectSession(projectId, sessionId)
        }
        if (!sessionId) sessionId = (await sclipCreateProjectSession(projectId, 'Terminal')).id
        if (active && !expired) setTerminal({ kind: 'ready', sessionId })
      } catch (error) {
        if (active && !expired) setTerminal({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      } finally { clearTimeout(timeout) }
    })()
    return () => { cancel(); if (cancelStartup.current === cancel) cancelStartup.current = null }
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
            onRetry={handleRestart}
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
              'Starting Sclip AI terminal…'
            )}
          </div>
        )}
      </div>
    </div>
  )
}
