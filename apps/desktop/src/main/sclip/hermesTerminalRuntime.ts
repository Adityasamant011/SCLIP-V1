import path from 'node:path'
import { startAutonomousReview, initialEditorialEvidence, stageEditorialEvidence } from './autonomousReview.js'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import * as pty from 'node-pty'
import { readHermesProfile, writeHermesProfile, initializeCreatorHermesControls, assertForegroundHermesConfiguration } from './hermesRuntime.js'
import { createHermesOutputRedactor, hermesBaseEnvironment } from './hermesSecrets.js'
import type { HermesProfileConfig } from './hermesRuntime.js'

// The WeftCut editor tools arrive through the authenticated MCP server in the
// generated Hermes profile. In Hermes CLI, passing the configured MCP server name
// `weftcut` matches CLI_CONFIG.mcp_servers and dynamically aliases to `mcp-weftcut`,
// ensuring all 93 WeftCut tools are enabled without triggering startup warnings.
const EDITOR_TOOLSETS = 'terminal,file,web,vision,skills,todo,memory,clarify,weftcut'
const MAX_HISTORY_BYTES = 256 * 1024
const MAX_INPUT_BYTES = 64 * 1024

export interface HermesTerminalOptions {
  isPackaged: boolean
  resourcesPath: string
  userDataPath: string
  executableOverride?: string
  sourceOverride?: string
  getMcpInfo: () => { url: string; bearer_token: string }
  getProviderEnvironment: (profile: HermesProfileConfig) => Record<string, string>
  /** Reject stale renderer/project/session combinations before a PTY is created. */
  assertSession: (projectId: string, sessionId: string) => Promise<void>
  getCreatorContext?: (projectId: string) => string
  getCreatorHome?: (baseHome: string, projectId: string) => string
  getCreatorSessionKey?: (projectId: string) => string
  onOutput: (event: { projectId: string; sessionId: string; sequence: number; data: string }) => void
  onExit: (event: { projectId: string; sessionId: string; code: number }) => void
}

interface TerminalSession {
  mode: 'edit' | 'review'
  pty: pty.IPty
  history: string
  sequence: number
}

export interface TerminalSnapshot { history: string; sequence: number }

interface LaunchSpec { command: string; args: string[]; cwd: string }

/**
 * Owns interactive Hermes CLI sessions. This is deliberately not a system
 * shell: each PTY runs the isolated Hermes profile with only the WeftCut MCP
 * toolset enabled. Session keys include both project and Sclip session ids so
 * one project's terminal cannot attach to another project's conversation.
 */
export class HermesTerminalRuntime {
  private readonly sessions = new Map<string, TerminalSession>()

  constructor(private readonly options: HermesTerminalOptions) {}

  async ensure(projectId: string, sessionId: string, cols = 100, rows = 30, mode: 'edit' | 'review' = 'edit'): Promise<TerminalSnapshot> {
    await this.options.assertSession(projectId, sessionId)
    const key = this.key(projectId, sessionId)
    const existing = this.sessions.get(key)
    if (existing) {
      if (existing.mode !== mode) throw new Error('Use a new session ID or restart explicitly when changing editing/review intent')
      return { history: existing.history, sequence: existing.sequence }
    }
    const launch = this.resolveLaunch()
    const baseHome = path.join(this.options.userDataPath, 'sclip-hermes')
    const home = this.options.getCreatorHome?.(baseHome, projectId) ?? baseHome
    const creatorKey = this.options.getCreatorSessionKey?.(projectId)
    fs.mkdirSync(home, { recursive: true, mode: 0o700 })
    const mcp = this.options.getMcpInfo()
    const review = mode === 'review' ? await startAutonomousReview(mcp, projectId) : null
    const packet=review?.editorial_evidence_packet ?? await initialEditorialEvidence(mcp,projectId)
    const configPath = path.join(home, 'config.yaml')
    if (home !== baseHome) {
      initializeCreatorHermesControls(baseHome, home)
      writeHermesProfile(home, 0, readHermesProfile(baseHome))
      // Ship tools/skill knowledge, never another creator's learned memories or sessions.
      const skill = path.join(baseHome, 'skills', 'weftcut')
      if (fs.existsSync(skill)) fs.cpSync(skill, path.join(home, 'skills', 'weftcut'), { recursive: true })
    } else if (!fs.existsSync(configPath)) writeHermesProfile(home, 0)
    assertForegroundHermesConfiguration(home)
    await this.options.assertSession(projectId, sessionId)
    if (creatorKey !== this.options.getCreatorSessionKey?.(projectId)) throw new Error('Creator context changed while opening Hermes; open the terminal again')
    const profile = readHermesProfile(home)
    const providerEnv = this.options.getProviderEnvironment(profile)
    const stagedEvidence=stageEditorialEvidence(home,packet,this.options.getCreatorContext?.(projectId) ?? '')
    const env: Record<string, string | undefined> = {
      ...hermesBaseEnvironment(),
      ...providerEnv,
      HERMES_HOME: home,
      HERMES_INFERENCE_MODEL: profile.model,
      HERMES_PROVIDER: profile.provider,
      ...(profile.customBaseUrl ? { OPENAI_BASE_URL: profile.customBaseUrl } : {}),
      ...(profile.provider === 'openrouter' ? { OPENROUTER_MODEL: profile.model } : {}),
      SCLIP_ACTIVE_PROJECT_ID: projectId,
      SCLIP_PROJECT_ID: projectId,
      SCLIP_MCP_URL: review?.url ?? mcp.url,
      SCLIP_MCP_TOKEN: mcp.bearer_token,
      TERM: 'xterm-256color',
      // Hermes already supports this hint; avoid a startup OSC query whose
      // delayed response can land in the editable prompt. Matches xterm theme.
      HERMES_TUI_BACKGROUND: '#0b0d12',
    }
    delete env.TERMINAL_CWD
    const chatArgs = [
      ...launch.args,
      'chat',
      '--toolsets', EDITOR_TOOLSETS,
      '--skills', `weftcut,${stagedEvidence.name}`,
      '--provider', profile.provider,
      '-m', profile.model,
      // Hermes limits session titles to 100 chars; renderer-generated project
      // and session ids can be longer than that. Hash the ownership pair into
      // a stable, opaque title instead of leaking ids or failing to start.
      '--continue', this.hermesSessionTitle(projectId, sessionId),
      '--create-if-missing',
      '--no-restore-cwd',
      '--ignore-rules',
      '--source', 'tool',
      '--cli',
    ]
    if (profile.maxIterations) {
      chatArgs.push('--max-turns', String(profile.maxIterations))
    }
    const terminal = pty.spawn(launch.command, chatArgs, {
      name: 'xterm-256color',
      cols: this.dimension(cols, 100),
      rows: this.dimension(rows, 30),
      cwd: launch.cwd,
      env: env as Record<string, string>,
    })
    const session: TerminalSession = { pty: terminal, mode, history: '', sequence: 0 }
    this.sessions.set(key, session)
    const redactor = createHermesOutputRedactor([...Object.values(providerEnv), mcp.bearer_token])
    terminal.onData(data => {
      if (this.sessions.get(key) !== session) return
      data = redactor.push(data)
      if (!data) return
      // Keep a bounded in-memory replay buffer. It is never persisted because
      // output may contain sensitive project material.
      session.history = `${session.history}${data}`.slice(-MAX_HISTORY_BYTES)
      this.options.onOutput({ projectId, sessionId, sequence: ++session.sequence, data })
    })
    terminal.onExit(({ exitCode }) => {
      stagedEvidence.cleanup()
      if (this.sessions.get(key) !== session) return
      const tail = redactor.flush()
      if (tail) {
        session.history = `${session.history}${tail}`.slice(-MAX_HISTORY_BYTES)
        this.options.onOutput({ projectId, sessionId, sequence: ++session.sequence, data: tail })
      }
      this.sessions.delete(key)
      this.options.onExit({ projectId, sessionId, code: exitCode })
    })
    return { history: session.history, sequence: session.sequence }
  }

  async restartSession(projectId: string, sessionId: string, cols = 100, rows = 30, mode: 'edit' | 'review' = 'edit'): Promise<TerminalSnapshot> {
    const key = this.key(projectId, sessionId)
    const existing = this.sessions.get(key)
    if (existing) {
      try { existing.pty.kill() } catch { /* already gone */ }
      this.sessions.delete(key)
    }
    return this.ensure(projectId, sessionId, cols, rows, mode)
  }

  async restartAll(cols = 100, rows = 30): Promise<void> {
    const keys = Array.from(this.sessions.keys())
    for (const key of keys) {
      const [projectId, sessionId] = key.split('\u0000')
      if (projectId && sessionId) {
        await this.restartSession(projectId, sessionId, cols, rows)
      }
    }
  }

  async input(projectId: string, sessionId: string, data: string): Promise<void> {
    await this.options.assertSession(projectId, sessionId)
    if (Buffer.byteLength(data, 'utf8') > MAX_INPUT_BYTES) throw new Error('Terminal input is too large')
    const session = this.sessions.get(this.key(projectId, sessionId))
    if (!session) throw new Error('Open the Hermes terminal before sending input')
    session.pty.write(data)
  }

  async resize(projectId: string, sessionId: string, cols: number, rows: number): Promise<void> {
    await this.options.assertSession(projectId, sessionId)
    const session = this.sessions.get(this.key(projectId, sessionId))
    if (session) session.pty.resize(this.dimension(cols, 100), this.dimension(rows, 30))
  }

  stopAll(): void {
    for (const { pty: terminal } of this.sessions.values()) {
      try { terminal.kill() } catch { /* already gone */ }
    }
    this.sessions.clear()
  }

  private key(projectId: string, sessionId: string): string { return `${projectId}\u0000${sessionId}` }
  private hermesSessionTitle(projectId: string, sessionId: string): string {
    const identity = this.key(projectId, sessionId) + (this.options.getCreatorSessionKey ? `\u0000${this.options.getCreatorSessionKey(projectId)}` : '')
    return `sclip-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
  }
  private dimension(value: number, fallback: number): number {
    return Number.isInteger(value) && value >= 2 && value <= 500 ? value : fallback
  }

  private resolveLaunch(): LaunchSpec {
    const explicit = this.options.executableOverride?.trim()
    if (explicit) {
      if (!fs.existsSync(explicit)) throw new Error('Configured Hermes executable does not exist')
      return { command: explicit, args: [], cwd: path.dirname(explicit) }
    }
    if (this.options.isPackaged) {
      const executable = path.join(this.options.resourcesPath, 'hermes', process.platform === 'win32' ? 'hermes.exe' : 'hermes')
      if (fs.existsSync(executable)) {
        return { command: executable, args: [], cwd: path.dirname(executable) }
      }
    }
    const source = this.options.sourceOverride?.trim()
    if (!source) {
      if (this.options.isPackaged) throw new Error('Bundled Hermes runtime is missing')
      throw new Error('Set SCLIP_HERMES_SOURCE or SCLIP_HERMES_EXECUTABLE to use the Hermes terminal in development')
    }
    const python = path.join(source, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')
    if (!fs.existsSync(python)) {
      if (this.options.isPackaged) throw new Error('Bundled Hermes runtime is missing')
      throw new Error('Hermes development virtual environment is missing')
    }
    return { command: python, args: ['-m', 'hermes_cli.main'], cwd: source }
  }
}
