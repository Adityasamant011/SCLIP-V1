import { createHash, randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { broadcastEvent } from '../broadcast.js'
import { SclipSessionStore, type SclipSession } from './sessionStore.js'

export function hermesSessionTitle(projectId: string, sessionId: string): string {
  return `sclip-${createHash('sha256').update(`${projectId}\0${sessionId}`).digest('hex').slice(0, 32)}`
}

export interface HermesStatus {
  online: boolean
  version?: string
  gatewayUrl: string
  runtimeState?: 'stopped' | 'starting' | 'ready' | 'failed'
  runtimeDetail?: string
  mcpPort?: number
  mcpTools: number
  mcpResources: number
}

export interface HermesSessionView extends SclipSession {
  messages: Array<{ role: string; content: string; createdAt?: string }>
}

interface BridgeConfig {
  getGatewayUrl: () => string
  getGatewayToken: () => string
  /** Reads the Project Actor's current project, never renderer-owned state. */
  getActiveProjectId: () => Promise<string>
  getRuntimeStatus?: () => { state: 'stopped' | 'starting' | 'ready' | 'failed'; detail?: string }
  getMcpStatus: () => { port?: number; tools: number; resources: number }
  getProfileConfig?: () => { provider: string; model: string }
  getCreatorContext?: (projectId: string) => string
  assertCreatorGateway?: (projectId: string) => void
  getCreatorSessionKey?: (projectId: string) => string
  redactForRenderer?: (text: string) => string
  sessions: SclipSessionStore
}

let config: BridgeConfig | null = null
const activeRuns = new Map<string, { projectId: string; sessionId: string }>()
function remoteSessionId(projectId: string, sessionId: string): string {
  const key = bridge().getCreatorSessionKey?.(projectId)
  return key === undefined ? sessionId : `sclip-style-${createHash('sha256').update(`${projectId}\0${sessionId}\0${key}`).digest('hex').slice(0, 32)}`
}
export async function stopActiveHermesRuns(): Promise<void> {
  for (const id of activeRuns.keys()) {
    const result = await stopHermesRun(id)
    if (!result.ok) throw new Error('Stop the active Hermes run before changing creator memory')
    activeRuns.delete(id)
  }
}

/** Called once by Electron main after its user-data stores are available. */
export function configureHermesBridge(next: BridgeConfig): void {
  config = next
}

function bridge(): BridgeConfig {
  if (!config) throw new Error('Sclip Hermes bridge was not configured')
  return config
}

function headers(json = false): Record<string, string> {
  const token = bridge().getGatewayToken().trim()
  if (!token) throw new Error('Hermes gateway credentials have not been configured')
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const gatewayUrl = bridge().getGatewayUrl().replace(/\/$/, '')
  if (!gatewayUrl) throw new Error('Hermes sidecar is not running')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    return await fetch(`${gatewayUrl}${path}`, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function responseError(response: Response): Promise<string> {
  // Provider and sidecar bodies can echo request headers. Never forward them.
  return `Hermes returned HTTP ${response.status}`
}

function safeText(value: string): string { return bridge().redactForRenderer?.(value) ?? value }
function safeObject<T>(value: T): T { return JSON.parse(safeText(JSON.stringify(value))) as T }

export async function getHermesStatus(): Promise<HermesStatus> {
  const mcp = bridge().getMcpStatus()
  const runtime = bridge().getRuntimeStatus?.()
  let online = false
  let version = ''
  try {
    const response = await request('/health')
    if (response.ok) {
      const data = await response.json() as { status?: string; version?: string }
      online = data.status === 'ok'
      version = data.version ?? ''
    }
  } catch {
    // Offline is a normal, visible state; never fake readiness from config.
  }
  return {
    online, version: safeText(version), gatewayUrl: bridge().getGatewayUrl(),
    ...(runtime ? { runtimeState: runtime.state, ...(runtime.detail ? { runtimeDetail: safeText(runtime.detail) } : {}) } : {}),
    mcpPort: mcp.port, mcpTools: mcp.tools, mcpResources: mcp.resources,
  }
}

export async function listProjectSessions(projectId: string): Promise<{ activeSessionId: string | null; sessions: HermesSessionView[] }> {
  const local = bridge().sessions.list(projectId)
  const sessions = await Promise.all(local.sessions.map(async session => ({ ...session, messages: await sessionMessages(remoteSessionId(projectId, session.id)) })))
  return { activeSessionId: local.activeSessionId, sessions }
}

export async function createProjectSession(projectId: string, name: string): Promise<HermesSessionView> {
  const createdAt = new Date().toISOString()
  const session: SclipSession = {
    id: `sclip-${projectId}-${randomUUID()}`,
    name: name.trim().slice(0, 120) || 'New session',
    createdAt,
    updatedAt: createdAt,
    archived: false,
  }
  const title = hermesSessionTitle(projectId, session.id)
  const profile = config?.getProfileConfig?.()
  const payload: Record<string, unknown> = { id: remoteSessionId(projectId, session.id), title, source: 'sclip' }
  if (profile?.model) payload.model = profile.model
  if (profile?.provider) payload.provider = profile.provider
  const response = await request('/api/sessions', {
    method: 'POST', headers: headers(true), body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await responseError(response))
  bridge().sessions.add(projectId, session)
  return { ...session, messages: [] }
}

export async function activateProjectSession(projectId: string, sessionId: string): Promise<void> {
  bridge().sessions.activate(projectId, sessionId)
}

export async function renameProjectSession(projectId: string, sessionId: string, name: string): Promise<void> {
  if (!bridge().sessions.owns(projectId, sessionId)) throw new Error('Session does not belong to this project')
  bridge().sessions.rename(projectId, sessionId, name)
}

/** Archive locally rather than delete Hermes history; this is recoverable. */
export async function archiveProjectSession(projectId: string, sessionId: string): Promise<void> {
  bridge().sessions.archive(projectId, sessionId)
}

export async function startHermesRun(input: { prompt: string; projectId: string; sessionId: string }): Promise<{ ok: boolean; runId?: string; status?: string; error?: string }> {
  if (!input.prompt.trim() || !input.projectId || !input.sessionId) return { ok: false, error: 'A project, session, and prompt are required' }
  const activeProjectId = await bridge().getActiveProjectId()
  if (!activeProjectId) return { ok: false, error: 'No WeftCut project is currently open' }
  if (activeProjectId !== input.projectId) {
    return { ok: false, error: 'The selected Hermes session is not bound to the currently open project' }
  }
  if (!bridge().sessions.owns(input.projectId, input.sessionId)) {
    return { ok: false, error: 'The selected Hermes session does not belong to the current project' }
  }
  try {
    // Hermes owns conversation identity. WeftCut remains the authority for all video state via MCP.
    bridge().assertCreatorGateway?.(input.projectId)
    const creatorContext = bridge().getCreatorContext?.(input.projectId) ?? ''
    const profile = bridge().getProfileConfig?.()
    const response = await request('/v1/runs', {
      method: 'POST', headers: headers(true), body: JSON.stringify({
        input: creatorContext ? `${input.prompt}\n\n${creatorContext}` : input.prompt, session_id: remoteSessionId(input.projectId, input.sessionId),
        ...(profile?.provider ? { provider: profile.provider } : {}),
        ...(profile?.model ? { model: profile.model } : {}),
      }),
    })
    if (!response.ok) return { ok: false, error: await responseError(response) }
    const data = await response.json() as { run_id: string; status: string }
    activeRuns.set(data.run_id, { projectId: input.projectId, sessionId: input.sessionId })
    void streamRunEvents(data.run_id)
    return { ok: true, runId: data.run_id, status: data.status }
  } catch (error) {
    return { ok: false, error: safeText(error instanceof Error ? error.message : String(error)) }
  }
}

export async function stopHermesRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST', headers: headers() })
    return response.ok ? { ok: true } : { ok: false, error: await responseError(response) }
  } catch (error) {
    return { ok: false, error: safeText(error instanceof Error ? error.message : String(error)) }
  }
}

export async function approveHermesRun(runId: string, choice: 'once' | 'session' | 'always' | 'deny'): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}/approval`, { method: 'POST', headers: headers(true), body: JSON.stringify({ choice }) })
    return response.ok ? { ok: true } : { ok: false, error: await responseError(response) }
  } catch (error) {
    return { ok: false, error: safeText(error instanceof Error ? error.message : String(error)) }
  }
}

export async function getHermesRun(runId: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}`, { headers: headers() })
    return response.ok ? safeObject(await response.json() as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function sessionMessages(sessionId: string): Promise<Array<{ role: string; content: string; createdAt?: string }>> {
  try {
    const response = await request(`/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=500`, { headers: headers() })
    if (!response.ok) return []
    const payload = await response.json() as { data?: Array<{ role?: unknown; content?: unknown; created_at?: unknown }> }
    return (payload.data ?? []).flatMap(message => typeof message.role === 'string' && typeof message.content === 'string'
      ? [{ role: message.role, content: safeText(message.content), ...(typeof message.created_at === 'string' ? { createdAt: message.created_at } : {}) }]
      : [])
  } catch {
    return []
  }
}

async function streamRunEvents(runId: string): Promise<void> {
  const run = activeRuns.get(runId)
  try {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}/events`, { headers: headers() })
    if (!response.ok || !response.body) return
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.split('\n').find(candidate => candidate.startsWith('data: '))
        if (!line) continue
        const raw = line.slice(6).trim()
        if (!raw) continue
        let payload: Record<string, unknown>
        try { payload = JSON.parse(raw) as Record<string, unknown> } catch { payload = { event: 'stream.error', raw } }
        broadcastEvent(BrowserWindow.getAllWindows(), 'sclip:hermes_event', safeObject({ ...payload, projectId: run?.projectId, sessionId: run?.sessionId }))
      }
    }
  } catch (error) {
    broadcastEvent(BrowserWindow.getAllWindows(), 'sclip:hermes_event', { event: 'stream.error', run_id: runId, projectId: run?.projectId, sessionId: run?.sessionId, error: safeText(error instanceof Error ? error.message : String(error)) })
  } finally {
    activeRuns.delete(runId)
  }
}
