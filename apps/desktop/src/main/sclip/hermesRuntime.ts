import { createServer } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface HermesRuntimeStatus {
  state: 'stopped' | 'starting' | 'ready' | 'failed'
  gatewayUrl: string
  detail?: string
}

export interface HermesRuntimeOptions {
  isPackaged: boolean
  resourcesPath: string
  userDataPath: string
  /** A development override only; packaged builds resolve their bundled runtime. */
  executableOverride?: string
  sourceOverride?: string
  getGatewayToken: () => string
  getMcpInfo: () => { url: string; bearer_token: string }
  getProviderEnvironment: () => Record<string, string>
  onStatus?: (status: HermesRuntimeStatus) => void
}

interface LaunchSpec { command: string; args: string[]; cwd: string }

/**
 * Owns one child gateway for this Electron process. The generated profile is
 * intentionally non-secret: gateway and MCP credentials exist only in the
 * sidecar's environment, backed by Electron safeStorage in the parent.
 */
export class HermesRuntime {
  private child: ChildProcess | null = null
  private status: HermesRuntimeStatus = { state: 'stopped', gatewayUrl: '' }
  private stopping = false
  private operations: Promise<unknown> = Promise.resolve()
  private port = 0

  constructor(private readonly options: HermesRuntimeOptions) {}

  snapshot(): HermesRuntimeStatus { return { ...this.status } }

  start(): Promise<HermesRuntimeStatus> {
    return this.enqueue(() => this.startOwned())
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.operations.then(action, action)
    this.operations = operation.catch(() => {})
    return operation
  }

  private async startOwned(): Promise<HermesRuntimeStatus> {
    if (this.child && !this.child.killed) return this.snapshot()
    this.stopping = false
    let gatewayUrl = ''
    try {
      this.port = await this.choosePort()
      gatewayUrl = `http://127.0.0.1:${this.port}`
      this.publish({ state: 'starting', gatewayUrl })
      const launch = this.resolveLaunch()
      const home = path.join(this.options.userDataPath, 'sclip-hermes')
      fs.mkdirSync(home, { recursive: true, mode: 0o700 })
      this.writeProfile(home)
      const mcp = this.options.getMcpInfo()
      const token = this.options.getGatewayToken()
      if (!token) throw new Error('Hermes gateway credential is unavailable from secure storage')
      const env: Record<string, string | undefined> = {
        ...process.env,
        ...this.options.getProviderEnvironment(),
        HERMES_HOME: home,
        API_SERVER_ENABLED: '1',
        API_SERVER_HOST: '127.0.0.1',
        API_SERVER_PORT: String(this.port),
        API_SERVER_KEY: token,
        SCLIP_MCP_URL: mcp.url,
        SCLIP_MCP_TOKEN: mcp.bearer_token,
      }
      delete env.TERMINAL_CWD
      const child = spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env as NodeJS.ProcessEnv,
      })
      this.child = child
      // Drain output without forwarding possible secrets to app/debug logs.
      child.stdout?.resume()
      let stderr = ''
      child.stderr?.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-1500) })
      child.once('error', error => {
        if (this.child === child) this.child = null
        this.childFailed(`Could not start Hermes: ${error.message}`)
      })
      child.once('exit', (code, signal) => {
        if (this.child !== child) return
        this.child = null
        if (!this.stopping) this.childFailed(`Hermes exited (${signal ?? code ?? 'unknown'})${stderr ? ': see sidecar diagnostics' : ''}`)
      })
      await this.waitForHealth(gatewayUrl, token)
      if (this.child !== child) throw new Error('Hermes stopped during startup')
      this.publish({ state: 'ready', gatewayUrl })
    } catch (error) {
      await this.stopOwned()
      this.publish({ state: 'failed', gatewayUrl, detail: error instanceof Error ? error.message : String(error) })
    }
    return this.snapshot()
  }

  /** Rebuilds the sidecar with the current MCP endpoint/token after host rotation. */
  async restart(): Promise<HermesRuntimeStatus> {
    return this.enqueue(async () => {
      await this.stopOwned()
      return this.startOwned()
    })
  }

  stop(): Promise<void> { return this.enqueue(() => this.stopOwned()) }

  private async stopOwned(): Promise<void> {
    const child = this.child
    this.stopping = true
    this.child = null
    if (child && child.exitCode === null && child.signalCode === null && child.pid) {
      await new Promise<void>(resolve => {
        const force = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 4_000)
        child.once('exit', () => { clearTimeout(force); resolve() })
        try { child.kill('SIGTERM') } catch { clearTimeout(force); resolve() }
      })
    }
    this.publish({ state: 'stopped', gatewayUrl: this.status.gatewayUrl })
  }

  private resolveLaunch(): LaunchSpec {
    const explicit = this.options.executableOverride?.trim()
    if (explicit) {
      if (!fs.existsSync(explicit)) throw new Error('Configured Hermes executable does not exist')
      return { command: explicit, args: ['gateway', 'run', '--external-supervisor'], cwd: path.dirname(explicit) }
    }
    if (this.options.isPackaged) {
      const executable = path.join(this.options.resourcesPath, 'hermes', process.platform === 'win32' ? 'hermes.exe' : 'hermes')
      if (!fs.existsSync(executable)) throw new Error('Bundled Hermes runtime is missing')
      return { command: executable, args: ['gateway', 'run', '--external-supervisor'], cwd: path.dirname(executable) }
    }
    const source = this.options.sourceOverride?.trim()
    if (!source) throw new Error('Set SCLIP_HERMES_SOURCE or SCLIP_HERMES_EXECUTABLE to run Hermes in development')
    const python = path.join(source, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')
    if (!fs.existsSync(python)) throw new Error('Hermes development virtual environment is missing')
    return { command: python, args: ['-m', 'hermes_cli.main', 'gateway', 'run', '--external-supervisor'], cwd: source }
  }

  private writeProfile(home: string): void {
    const config = [
      'model:', '  provider: openrouter', '  default: dots-studio/dots-3-note-preview:free',
      'platforms:', '  api_server:', '    enabled: true', '    extra:', '      host: "127.0.0.1"', `      port: ${this.port}`,
      'mcp_servers:', '  weftcut:', '    url: "${SCLIP_MCP_URL}"', '    headers:', '      Authorization: "Bearer ${SCLIP_MCP_TOKEN}"', '    timeout: 120',
      'terminal:', '  cwd: "."',
      'agent:', '  max_iterations: 30', '',
    ].join('\n')
    const target = path.join(home, 'config.yaml')
    fs.writeFileSync(`${target}.tmp`, config, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(`${target}.tmp`, target)
    try { fs.chmodSync(target, 0o600) } catch { /* Windows lacks POSIX modes. */ }
  }

  private async choosePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') { server.close(); reject(new Error('Could not allocate gateway port')); return }
        server.close(error => error ? reject(error) : resolve(address.port))
      })
    })
  }

  private async waitForHealth(url: string, token: string): Promise<void> {
    const deadline = Date.now() + 45_000
    let last = 'Hermes did not become healthy'
    while (Date.now() < deadline) {
      if (!this.child) throw new Error(this.status.detail ?? 'Hermes exited during startup')
      try {
        // /health is public. Authenticate against the session API to avoid
        // accepting a different process that wins the port allocation race.
        const response = await fetch(`${url}/api/sessions?limit=1`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1_000) })
        if (response.ok) return
        last = `Hermes health check returned HTTP ${response.status}`
      } catch (error) { last = error instanceof Error ? error.message : String(error) }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error(last)
  }

  private childFailed(detail: string): void { this.publish({ state: 'failed', gatewayUrl: this.status.gatewayUrl, detail }) }
  private publish(status: HermesRuntimeStatus): void { this.status = status; this.options.onStatus?.(this.snapshot()) }
}
