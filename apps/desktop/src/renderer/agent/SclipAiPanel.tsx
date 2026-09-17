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
    if (!projectId || terminal.kind !== 'ready') return
    setIsRestarting(true)
    try {
      await sclipRestartTerminal(projectId, terminal.sessionId)
      setRestartNonce(n => n + 1)
    } finally {
      setIsRestarting(false)
    }
  }

  const handleClear = () => {
    terminalActions.current?.clear()
  }

  useEffect(() => {
    let active = true
    setTerminal({ kind: 'opening' })
    if (!projectId) {
      setTerminal({ kind: 'error', message: 'Open a WeftCut project to start Hermes.' })
      return () => { active = false }
    }
    void (async () => {
      try {
        const status = await sclipGetHermesStatus()
        if (!status.online) throw new Error(status.runtimeDetail || 'Hermes is not connected.')
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
  }, [projectId])

  return (
    <div className="sclip-dock-wrapper">
      <AgentPanelHeader
        onRestartTerminal={terminal.kind === 'ready' && projectId ? handleRestart : undefined}
        onClearTerminal={terminal.kind === 'ready' && projectId ? handleClear : undefined}
        isRestarting={isRestarting}
      />
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
            {terminal.kind === 'error' ? terminal.message : 'Starting Hermes terminal…'}
          </div>
        )}
      </div>
    </div>
  )
}
