import path from 'node:path'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import * as pty from 'node-pty'

// The WeftCut editor tools arrive through the authenticated MCP server in the
// generated Hermes profile. `sclip-editor` was an old-app label, not a Hermes
// toolset, so do not pass it to the CLI (it only produces a startup warning).
const EDITOR_TOOLSETS = 'web,vision,skills,todo,memory,clarify'
const MAX_HISTORY_BYTES = 256 * 1024
const MAX_INPUT_BYTES = 64 * 1024

export interface HermesTerminalOptions {
  isPackaged: boolean
  resourcesPath: string
  userDataPath: string
  executableOverride?: string
  sourceOverride?: string
  getProviderEnvironment: () => Record<string, string>
  /** Reject stale renderer/project/session combinations before a PTY is created. */
  assertSession: (projectId: string, sessionId: string) => Promise<void>
  onOutput: (event: { projectId: string; sessionId: string; data: string }) => void
  onExit: (event: { projectId: string; sessionId: string; code: number }) => void
}

interface TerminalSession {
  pty: pty.IPty
  history: string
}

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

  async ensure(projectId: string, sessionId: string, cols = 100, rows = 30): Promise<string> {
    await this.options.assertSession(projectId, sessionId)
    const key = this.key(projectId, sessionId)
    const existing = this.sessions.get(key)
    if (existing) return existing.history
    const launch = this.resolveLaunch()
    const home = path.join(this.options.userDataPath, 'sclip-hermes')
    fs.mkdirSync(home, { recursive: true, mode: 0o700 })
    const terminal = pty.spawn(launch.command, [
      ...launch.args,
      'chat', '--toolsets', EDITOR_TOOLSETS,
      // Hermes limits session titles to 100 chars; renderer-generated project
      // and session ids can be longer than that. Hash the ownership pair into
      // a stable, opaque title instead of leaking ids or failing to start.
      '--continue', this.hermesSessionTitle(projectId, sessionId),
      '--create-if-missing', '--no-restore-cwd', '--ignore-rules', '--source', 'tool', '--cli',
    ], {
      name: 'xterm-256color',
      cols: this.dimension(cols, 100),
      rows: this.dimension(rows, 30),
      cwd: launch.cwd,
      env: {
        ...process.env,
        ...this.options.getProviderEnvironment(),
        HERMES_HOME: home,
        SCLIP_ACTIVE_PROJECT_ID: projectId,
        SCLIP_PROJECT_ID: projectId,
        TERM: 'xterm-256color',
      },
    })
    const session: TerminalSession = { pty: terminal, history: '' }
    this.sessions.set(key, session)
    terminal.onData(data => {
      // Keep a bounded in-memory replay buffer. It is never persisted because
      // output may contain sensitive project material.
      session.history = `${session.history}${data}`.slice(-MAX_HISTORY_BYTES)
      this.options.onOutput({ projectId, sessionId, data })
    })
    terminal.onExit(({ exitCode }) => {
      if (this.sessions.get(key)?.pty !== terminal) return
      this.sessions.delete(key)
      this.options.onExit({ projectId, sessionId, code: exitCode })
    })
    return session.history
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
    return `sclip-${createHash('sha256').update(this.key(projectId, sessionId)).digest('hex').slice(0, 32)}`
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
      if (!fs.existsSync(executable)) throw new Error('Bundled Hermes runtime is missing')
      return { command: executable, args: [], cwd: path.dirname(executable) }
    }
    const source = this.options.sourceOverride?.trim()
    if (!source) throw new Error('Set SCLIP_HERMES_SOURCE or SCLIP_HERMES_EXECUTABLE to use the Hermes terminal in development')
    const python = path.join(source, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')
    if (!fs.existsSync(python)) throw new Error('Hermes development virtual environment is missing')
    return { command: python, args: ['-m', 'hermes_cli.main'], cwd: source }
  }
}
