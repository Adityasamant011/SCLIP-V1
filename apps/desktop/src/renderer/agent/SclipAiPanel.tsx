import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Bot, Bookmark, CheckCircle2, Cpu, Loader2, Pencil, Play, Plus, RefreshCw, Redo2, ShieldCheck, Sparkles, Square, Undo2 } from 'lucide-react'
import {
  sclipActivateProjectSession,
  sclipApproveRun,
  sclipArchiveProjectSession,
  sclipCreateProjectSession,
  sclipGetHermesStatus,
  sclipListProjectSessions,
  sclipRenameProjectSession,
  sclipStartRun,
  sclipStopRun,
  sclipRestartHermes,
  sclipSetOpenRouterKey,
  type HermesProjectSessions,
  type HermesStatus,
} from '../ipc/sclip'
import { projectCreateCheckpoint, projectRedo, projectUndo } from '../ipc'
import { tryMutate } from '../errors/tryMutate'
import { useProjectStore } from '../state/projectStore'
import { HermesTerminal } from './HermesTerminal'
import './sclip.css'

interface SclipEvent {
  id: string
  title: string
  detail?: string | undefined
  status: 'info' | 'success' | 'error' | 'running'
  approval?: { runId: string; choices: Array<'once' | 'session' | 'always' | 'deny'> } | undefined
}

type SclipView = 'chat' | 'terminal' | 'activity'

const PRESET_PROMPTS = ['Inspect the current timeline and describe what is here.', 'Create a checkpoint before making changes.', 'Find pauses in the active composition.', 'Explain the next safe edit to make.']

function eventFromPayload(payload: Record<string, unknown>): SclipEvent {
  const event = String(payload.event ?? 'run.event')
  if (event === 'run.completed') return { id: crypto.randomUUID(), title: 'Hermes completed the run', detail: typeof payload.output === 'string' ? payload.output : undefined, status: 'success' }
  if (event === 'run.failed' || event === 'stream.error') return { id: crypto.randomUUID(), title: 'Hermes could not complete the run', detail: String(payload.error ?? 'Unknown error'), status: 'error' }
  if (event === 'approval.request') {
    const choices: Array<'once' | 'session' | 'always' | 'deny'> = Array.isArray(payload.choices) ? payload.choices.filter((choice): choice is 'once' | 'session' | 'always' | 'deny' => choice === 'once' || choice === 'session' || choice === 'always' || choice === 'deny') : ['deny']
    return { id: crypto.randomUUID(), title: 'Approval required', detail: typeof payload.description === 'string' ? payload.description : 'Hermes needs your permission to continue.', status: 'running', approval: { runId: String(payload.run_id ?? ''), choices } }
  }
  if (event.includes('tool')) return { id: crypto.randomUUID(), title: `Hermes ${event.includes('completed') ? 'completed' : 'is using'} ${String(payload.tool ?? 'a WeftCut tool')}`, status: event.includes('completed') ? 'success' : 'running' }
  return { id: crypto.randomUUID(), title: event.replaceAll('.', ' '), detail: typeof payload.delta === 'string' ? payload.delta : undefined, status: 'info' }
}

export function SclipAiPanel() {
  const summary = useProjectStore(state => state.summary)
  const projectId = summary?.project_id ?? null
  const [status, setStatus] = useState<HermesStatus | null>(null)
  const [sessions, setSessions] = useState<HermesProjectSessions>({ activeSessionId: null, sessions: [] })
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<SclipEvent[]>([])
  const [view, setView] = useState<SclipView>('chat')
  const [apiKey, setApiKey] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const eventsListRef = useRef<HTMLDivElement>(null)
  const activeSession = sessions.sessions.find(session => session.id === sessions.activeSessionId) ?? null

  const refreshStatus = useCallback(async () => {
    try { setStatus(await sclipGetHermesStatus()) } catch { setStatus(null) }
  }, [])
  const refreshSessions = useCallback(async () => {
    if (!projectId) { setSessions({ activeSessionId: null, sessions: [] }); setEvents([]); return }
    try {
      const next = await sclipListProjectSessions(projectId)
      setSessions(next)
      const current = next.sessions.find(session => session.id === next.activeSessionId)
      setEvents((current?.messages ?? []).map(message => ({
        id: crypto.randomUUID(),
        title: message.role === 'user' ? 'You' : 'Hermes',
        detail: message.content,
        status: 'info' as const,
      })))
    } catch {
      setSessions({ activeSessionId: null, sessions: [] })
    }
  }, [projectId])

  useEffect(() => {
    void refreshStatus()
    const timer = setInterval(() => void refreshStatus(), 4_000)
    return () => clearInterval(timer)
  }, [refreshStatus])
  useEffect(() => { void refreshSessions() }, [refreshSessions])
  // Scroll only the transcript. `scrollIntoView` walks every scroll ancestor,
  // which can move the whole editor below the viewport when this panel is in a
  // docked workspace.
  useEffect(() => {
    const list = eventsListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [events])

  useEffect(() => {
    if (typeof window.api?.on !== 'function') return undefined
    return window.api.on('sclip:hermes_event', (unknown: unknown) => {
      const payload = unknown as Record<string, unknown>
      if (payload.projectId !== projectId || payload.sessionId !== sessions.activeSessionId) return
      const event = eventFromPayload(payload)
      setEvents(previous => [...previous, event])
      if (payload.event === 'run.completed' || payload.event === 'run.failed' || payload.event === 'run.cancelled') {
        setRunning(false)
        setCurrentRunId(null)
        void refreshSessions()
      }
    })
  }, [projectId, refreshSessions, sessions.activeSessionId])

  const createSession = async () => {
    if (!projectId || !status?.online) return
    setBusyAction('session')
    try {
      await sclipCreateProjectSession(projectId, `Session ${sessions.sessions.length + 1}`)
      await refreshSessions()
    } finally { setBusyAction(null) }
  }
  const changeSession = async (sessionId: string) => {
    if (!projectId || running) return
    await sclipActivateProjectSession(projectId, sessionId)
    await refreshSessions()
  }
  const renameSession = async () => {
    if (!projectId || !activeSession) return
    const name = window.prompt('Session name', activeSession.name)
    if (!name?.trim()) return
    await sclipRenameProjectSession(projectId, activeSession.id, name)
    await refreshSessions()
  }
  const archiveSession = async () => {
    if (!projectId || !activeSession || running) return
    await sclipArchiveProjectSession(projectId, activeSession.id)
    await refreshSessions()
  }
  const startRun = async () => {
    if (!projectId || !activeSession || !prompt.trim() || running) return
    const input = prompt.trim()
    setRunning(true)
    setEvents(previous => [...previous, { id: crypto.randomUUID(), title: 'You', detail: input, status: 'running' }])
    const result = await sclipStartRun(input, projectId, activeSession.id)
    if (result.ok && result.runId) {
      setCurrentRunId(result.runId)
      setPrompt('')
    } else {
      setRunning(false)
      setEvents(previous => [...previous, { id: crypto.randomUUID(), title: 'Could not start Hermes', detail: result.error, status: 'error' }])
    }
  }
  const stopRun = async () => {
    if (!currentRunId) return
    const result = await sclipStopRun(currentRunId)
    if (result.ok) { setRunning(false); setCurrentRunId(null) }
    else setEvents(previous => [...previous, { id: crypto.randomUUID(), title: 'Could not stop Hermes', detail: result.error, status: 'error' }])
  }
  const resolveApproval = async (event: SclipEvent, choice: 'once' | 'session' | 'always' | 'deny') => {
    if (!event.approval?.runId) return
    const result = await sclipApproveRun(event.approval.runId, choice)
    setEvents(previous => previous.map(candidate => candidate.id === event.id
      ? { ...candidate, title: result.ok ? `Approval ${choice === 'deny' ? 'denied' : 'granted'}` : 'Approval failed', detail: result.error, approval: undefined, status: result.ok ? 'success' : 'error' }
      : candidate))
  }
  const editorAction = async (key: string, action: () => Promise<unknown>) => {
    setBusyAction(key)
    try { await tryMutate(action, key) } finally { setBusyAction(null) }
  }
  const configure = async (save: boolean) => {
    setBusyAction('setup'); setSetupError('')
    try {
      if (save) { await sclipSetOpenRouterKey(apiKey); setApiKey(''); setShowSetup(false) }
      else await sclipRestartHermes()
      await refreshStatus()
    } catch (error) { setSetupError(error instanceof Error ? error.message : String(error)) }
    finally { setBusyAction(null) }
  }

  return <div className="sclip-ai-panel">
    <header className="sclip-header">
      <div className="sclip-title-row"><div className="sclip-title"><Sparkles size={16} color="#818cf8" /><span>Sclip AI</span></div><button type="button" className="sclip-btn-secondary" title="Refresh" onClick={() => { void refreshStatus(); void refreshSessions() }}><RefreshCw size={12} /></button></div>
      <div className="sclip-status-row"><span className="sclip-status-pill" title={status?.runtimeDetail}><i className={`sclip-dot ${status?.online ? 'online' : ''}`} />Hermes: <strong>{status?.online ? 'connected' : status?.runtimeState === 'starting' ? 'starting' : 'offline'}</strong></span><span className="sclip-status-pill"><Cpu size={12} />MCP: <strong>{status?.mcpTools ?? 0} tools · {status?.mcpResources ?? 0} resources</strong></span></div>
      {status?.runtimeDetail && <p className="sclip-runtime-error" role="status">{status.runtimeDetail}</p>}
      <div className="sclip-actions-row">
        <button type="button" className="sclip-btn-secondary" disabled={busyAction !== null || running} onClick={() => void configure(false)}>Reconnect Hermes</button>
        <button type="button" className="sclip-btn-secondary" onClick={() => setShowSetup(!showSetup)}>OpenRouter setup</button>
      </div>
      {showSetup && <div className="sclip-provider-setup"><p>OpenRouter · <code>dots-studio/dots-3-note-preview:free</code></p><label htmlFor="sclip-openrouter-key">OpenRouter API key</label><div><input id="sclip-openrouter-key" aria-label="OpenRouter API key" type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} /><button type="button" className="sclip-btn-primary" disabled={!apiKey.trim() || busyAction !== null} onClick={() => void configure(true)}>Save to Keychain</button></div></div>}
      {setupError && <p className="sclip-runtime-error" role="alert">{setupError}</p>}
      <div className="sclip-session-row"><span title={summary?.name ?? ''}>Project: <strong>{summary?.name ?? 'No project open'}</strong></span><div><select aria-label="Hermes session" value={sessions.activeSessionId ?? ''} disabled={!projectId || running} onChange={event => void changeSession(event.target.value)}><option value="" disabled>{projectId ? 'Create a session' : 'No project'}</option>{sessions.sessions.map(session => <option key={session.id} value={session.id}>{session.name}</option>)}</select><button type="button" className="sclip-icon-button" title="New session" disabled={!status?.online || !projectId || busyAction !== null} onClick={() => void createSession()}><Plus size={13} /></button>{activeSession && <><button type="button" className="sclip-icon-button" title="Rename session" disabled={running} onClick={() => void renameSession()}><Pencil size={12} /></button><button type="button" className="sclip-icon-button" title="Archive session" disabled={running} onClick={() => void archiveSession()}><Archive size={12} /></button></>}</div></div>
    </header>
    <section className="sclip-prompt-section">
      <div className="sclip-chips-row">{PRESET_PROMPTS.map(value => <button key={value} type="button" className="sclip-chip" onClick={() => setPrompt(value)}>{value}</button>)}</div>
      <textarea className="sclip-textarea" rows={3} placeholder={activeSession ? 'Ask Hermes about the current WeftCut project…' : 'Create a Hermes session to begin.'} disabled={!activeSession || !status?.online || running} value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void startRun() } }} />
      <div className="sclip-actions-row"><div>{running ? <button type="button" className="sclip-btn-danger" onClick={() => void stopRun()}><Square size={13} fill="currentColor" />Stop</button> : <button type="button" className="sclip-btn-primary" disabled={!prompt.trim() || !activeSession || !status?.online} onClick={() => void startRun()}><Play size={13} fill="currentColor" />Send</button>}</div><div className="sclip-editor-actions"><button type="button" className="sclip-btn-secondary" disabled={busyAction !== null} onClick={() => void editorAction('checkpoint', () => projectCreateCheckpoint(`Manual checkpoint ${new Date().toLocaleTimeString()}`))}><Bookmark size={12} />Checkpoint</button><button type="button" className="sclip-btn-secondary" disabled={busyAction !== null} title="Undo" onClick={() => void editorAction('undo', projectUndo)}><Undo2 size={12} /></button><button type="button" className="sclip-btn-secondary" disabled={busyAction !== null} title="Redo" onClick={() => void editorAction('redo', projectRedo)}><Redo2 size={12} /></button></div></div>
    </section>
    <div className="sclip-view-tabs" role="tablist" aria-label="Sclip workspace">
      {(['chat', 'terminal', 'activity'] as const).map(key => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{key === 'chat' ? 'Chat' : key === 'terminal' ? 'Terminal' : 'Activity'}</button>)}
    </div>
    <div className="sclip-events-header"><span>{view === 'chat' ? 'Conversation' : view === 'terminal' ? 'Hermes terminal' : 'Structured activity'}</span><span>{activeSession?.name ?? 'No session'}</span></div>
    {view === 'terminal' ? (
      activeSession && projectId
        ? <HermesTerminal projectId={projectId} sessionId={activeSession.id} />
        : <div className="sclip-empty-events"><Bot size={24} /><p>Create a Hermes session before opening its terminal.</p></div>
    ) : <div ref={eventsListRef} className="sclip-events-list">{(() => {
      const visible = view === 'chat'
        ? events.filter(event => event.title === 'You' || event.title === 'Hermes')
        : view === 'activity'
          ? events.filter(event => event.title !== 'You' && event.title !== 'Hermes')
          : events
      if (visible.length === 0) return <div className="sclip-empty-events"><Bot size={24} /><p>{activeSession ? view === 'activity' ? 'No tool activity for this session yet.' : 'This Hermes session has no messages yet.' : 'Choose a project and create a session.'}</p></div>
      return <>{visible.map(event => <article key={event.id} className={`sclip-event-card ${event.status === 'error' ? 'event-failed' : event.status === 'success' ? 'event-success' : ''}`}><div className="sclip-event-meta"><strong>{event.status === 'running' && <Loader2 size={12} className="agent-spin" />} {event.status === 'success' && <CheckCircle2 size={12} />} {event.title}</strong></div>{event.detail && <div className="sclip-event-detail">{event.detail}</div>}{event.approval && <div className="sclip-approval-actions"><ShieldCheck size={13} />{event.approval.choices.map(choice => <button type="button" key={choice} className={choice === 'deny' ? 'sclip-btn-secondary' : 'sclip-btn-primary'} onClick={() => void resolveApproval(event, choice)}>{choice}</button>)}</div>}</article>)}</>
    })()}</div>}
  </div>
}
