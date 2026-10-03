import { invoke } from '@/bridge/ipc'

export const sclipRestartHermes = () => invoke('sclip_restart_hermes')

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

export interface HermesSession {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  archived: boolean
  messages: Array<{ role: string; content: string; createdAt?: string }>
}

export interface HermesProjectSessions {
  activeSessionId: string | null
  sessions: HermesSession[]
}

export interface HermesRunResult {
  ok: boolean
  runId?: string
  status?: string
  error?: string
}

export async function sclipGetHermesStatus(): Promise<HermesStatus> {
  return invoke<HermesStatus>('sclip_get_hermes_status')
}

export async function sclipStartRun(prompt: string, projectId: string, sessionId: string): Promise<HermesRunResult> {
  return invoke<HermesRunResult>('sclip_start_hermes_run', { prompt, projectId, sessionId })
}

export async function sclipStopRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  return invoke<{ ok: boolean; error?: string }>('sclip_stop_hermes_run', { runId })
}

export async function sclipGetRun(runId: string): Promise<Record<string, unknown> | null> {
  return invoke<Record<string, unknown> | null>('sclip_get_run_status', { runId })
}

export async function sclipApproveRun(runId: string, choice: 'once' | 'session' | 'always' | 'deny'): Promise<{ ok: boolean; error?: string }> {
  return invoke<{ ok: boolean; error?: string }>('sclip_approve_hermes_run', { runId, choice })
}

export async function sclipListProjectSessions(projectId: string): Promise<HermesProjectSessions> {
  return invoke<HermesProjectSessions>('sclip_list_project_sessions', { projectId })
}

export async function sclipCreateProjectSession(projectId: string, name: string): Promise<HermesSession> {
  return invoke<HermesSession>('sclip_create_project_session', { projectId, name })
}

export async function sclipActivateProjectSession(projectId: string, sessionId: string): Promise<void> {
  return invoke<void>('sclip_activate_project_session', { projectId, sessionId })
}

export async function sclipRenameProjectSession(projectId: string, sessionId: string, name: string): Promise<void> {
  return invoke<void>('sclip_rename_project_session', { projectId, sessionId, name })
}

export async function sclipArchiveProjectSession(projectId: string, sessionId: string): Promise<void> {
  return invoke<void>('sclip_archive_project_session', { projectId, sessionId })
}

/** Opens the project-scoped interactive Hermes PTY and returns a replay snapshot. */
export interface SclipTerminalSnapshot { history: string; sequence: number }

export async function sclipOpenTerminal(projectId: string, sessionId: string, cols: number, rows: number): Promise<SclipTerminalSnapshot> {
  return invoke<SclipTerminalSnapshot>('sclip_open_terminal', { projectId, sessionId, cols, rows })
}

export async function sclipTerminalInput(projectId: string, sessionId: string, data: string): Promise<void> {
  return invoke<void>('sclip_terminal_input', { projectId, sessionId, data })
}

export async function sclipTerminalResize(projectId: string, sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke<void>('sclip_terminal_resize', { projectId, sessionId, cols, rows })
}

export interface HermesConfigView {
  provider: string
  model: string
  customBaseUrl?: string
  maxIterations: number
  configuredKeys: {
    anthropic: boolean
    openai: boolean
    'openai-api'?: boolean
    openrouter: boolean
    groq: boolean
    deepseek: boolean
    gemini: boolean
    custom?: boolean
  }
}

export interface HermesConfigUpdate {
  provider?: string | undefined
  model?: string | undefined
  customBaseUrl?: string | undefined
  maxIterations?: number | undefined
  apiKey?: string | undefined
}

export async function sclipGetHermesConfig(): Promise<HermesConfigView> {
  return invoke<HermesConfigView>('sclip_get_hermes_config')
}

export async function sclipSetHermesConfig(update: HermesConfigUpdate): Promise<{ ok: boolean }> {
  return invoke<{ ok: boolean }>('sclip_set_hermes_config', update as unknown as Record<string, unknown>)
}

export async function sclipRemoveHermesKey(provider: string): Promise<{ ok: boolean }> {
  return invoke<{ ok: boolean }>('sclip_remove_hermes_key', { provider })
}

export async function sclipTestHermesConnection(selection: { provider: string; model: string; customBaseUrl?: string }): Promise<{ ok: boolean; message: string }> {
  return invoke<{ ok: boolean; message: string }>('sclip_test_hermes_connection', selection)
}

export async function sclipRestartTerminal(projectId: string, sessionId: string, cols = 100, rows = 30): Promise<SclipTerminalSnapshot> {
  return invoke<SclipTerminalSnapshot>('sclip_restart_terminal', { projectId, sessionId, cols, rows })
}

export function openSclipSettings(category = 'agent'): void {
  window.dispatchEvent(new CustomEvent('sclip:open_settings', { detail: { category } }))
}
