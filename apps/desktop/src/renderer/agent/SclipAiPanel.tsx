import { useEffect, useState } from 'react'
import { useProjectStore } from '../state/projectStore'
import { sclipActivateProjectSession, sclipCreateProjectSession, sclipGetHermesStatus, sclipListProjectSessions } from '../ipc/sclip'
import { HermesTerminal } from './HermesTerminal'
import './sclip.css'

type TerminalState =
  | { kind: 'opening' }
  | { kind: 'ready'; sessionId: string }
  | { kind: 'error'; message: string }

/** A quiet, single-purpose home for the project-bound Hermes terminal. */
export function SclipAiPanel() {
  const projectId = useProjectStore(state => state.summary?.project_id ?? null)
  const [terminal, setTerminal] = useState<TerminalState>({ kind: 'opening' })

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

  if (terminal.kind === 'ready' && projectId) return <HermesTerminal projectId={projectId} sessionId={terminal.sessionId} />
  return <div className="sclip-terminal-empty" role="status">{terminal.kind === 'error' ? terminal.message : 'Starting Hermes terminal…'}</div>
}
