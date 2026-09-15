import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { broadcastEvent } from '../broadcast.js'
import { SclipSessionStore, type SclipSession } from './sessionStore.js'

export interface HermesStatus {
  online: boolean
  version?: string
  gatewayUrl: string
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
  getMcpStatus: () => { port?: number; tools: number; resources: number }
  sessions: SclipSessionStore
}

let config: BridgeConfig | null = null
const activeRuns = new Map<string, { projectId: string; sessionId: string }>()

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
  const text = await response.text().catch(() => '')
  return `Hermes returned HTTP ${response.status}${text ? `: ${text.slice(0, 500)}` : ''}`
}

export async function getHermesStatus(): Promise<HermesStatus> {
  const mcp = bridge().getMcpStatus()
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
  return { online, version, gatewayUrl: bridge().getGatewayUrl(), mcpPort: mcp.port, mcpTools: mcp.tools, mcpResources: mcp.resources }
}

export async function listProjectSessions(projectId: string): Promise<{ activeSessionId: string | null; sessions: HermesSessionView[] }> {
  const local = bridge().sessions.list(projectId)
  const sessions = await Promise.all(local.sessions.map(async session => ({ ...session, messages: await sessionMessages(session.id) })))
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
  const response = await request('/api/sessions', {
    method: 'POST', headers: headers(true), body: JSON.stringify({ id: session.id, title: session.name, source: 'sclip' }),
  })
  if (!response.ok) throw new Error(await responseError(response))
  bridge().sessions.add(projectId, session)
  return { ...session, messages: [] }
}

export async function activateProjectSession(projectId: string, sessionId: string): Promise<void> {
  bridge().sessions.activate(projectId, sessionId)
}

export async function renameProjectSession(projectId: string, sessionId: string, name: string): Promise<void> {
  bridge().sessions.rename(projectId, sessionId, name)
  const response = await request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH', headers: headers(true), body: JSON.stringify({ title: name.trim().slice(0, 120) }),
  })
  if (!response.ok) throw new Error(await responseError(response))
}

/** Archive locally rather than delete Hermes history; this is recoverable. */
export async function archiveProjectSession(projectId: string, sessionId: string): Promise<void> {
  bridge().sessions.archive(projectId, sessionId)
}

export async function startHermesRun(input: { prompt: string; projectId: string; sessionId: string }): Promise<{ ok: boolean; runId?: string; status?: string; error?: string }> {
  if (!input.prompt.trim() || !input.projectId || !input.sessionId) return { ok: false, error: 'A project, session, and prompt are required' }
  try {
    // Hermes owns conversation identity. WeftCut remains the authority for all video state via MCP.
    const response = await request('/v1/runs', {
      method: 'POST', headers: headers(true), body: JSON.stringify({ input: input.prompt, session_id: input.sessionId }),
    })
    if (!response.ok) return { ok: false, error: await responseError(response) }
    const data = await response.json() as { run_id: string; status: string }
    activeRuns.set(data.run_id, { projectId: input.projectId, sessionId: input.sessionId })
    void streamRunEvents(data.run_id)
    return { ok: true, runId: data.run_id, status: data.status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function stopHermesRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST', headers: headers() })
    return response.ok ? { ok: true } : { ok: false, error: await responseError(response) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function approveHermesRun(runId: string, choice: 'once' | 'session' | 'always' | 'deny'): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}/approval`, { method: 'POST', headers: headers(true), body: JSON.stringify({ choice }) })
    return response.ok ? { ok: true } : { ok: false, error: await responseError(response) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function getHermesRun(runId: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await request(`/v1/runs/${encodeURIComponent(runId)}`, { headers: headers() })
    return response.ok ? await response.json() as Record<string, unknown> : null
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
      ? [{ role: message.role, content: message.content, ...(typeof message.created_at === 'string' ? { createdAt: message.created_at } : {}) }]
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
        broadcastEvent(BrowserWindow.getAllWindows(), 'sclip:hermes_event', { ...payload, projectId: run?.projectId, sessionId: run?.sessionId })
      }
    }
  } catch (error) {
    broadcastEvent(BrowserWindow.getAllWindows(), 'sclip:hermes_event', { event: 'stream.error', run_id: runId, projectId: run?.projectId, sessionId: run?.sessionId, error: error instanceof Error ? error.message : String(error) })
  } finally {
    activeRuns.delete(runId)
  }
}
