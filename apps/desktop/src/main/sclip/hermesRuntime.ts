import { createServer } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { hermesBaseEnvironment, redactHermesSecrets } from './hermesSecrets.js'
import { validateHermesProfile } from './hermesSettings.js'

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
  getProviderEnvironment: (profile: HermesProfileConfig) => Record<string, string>
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
  private secretValues: string[] = []

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
      const profile = readHermesProfile(home)
      const providerEnv = this.options.getProviderEnvironment(profile)
      const mcp = this.options.getMcpInfo()
      const token = this.options.getGatewayToken()
      if (!token) throw new Error('Hermes gateway credential is unavailable from secure storage')
      this.secretValues = [...Object.values(providerEnv), token, mcp.bearer_token]
      const env: Record<string, string | undefined> = {
        ...hermesBaseEnvironment(),
        ...providerEnv,
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
      child.stderr?.resume()
      child.once('error', error => {
        console.error('[hermesRuntime] child error:', redactHermesSecrets(error.message, this.secretValues))
        if (this.child === child) this.child = null
        this.childFailed(`Could not start Hermes: ${redactHermesSecrets(error.message, this.secretValues)}`)
      })
      child.once('exit', (code, signal) => {
        if (this.child !== child) return
        this.child = null
        console.log(`[hermesRuntime] child exit: code=${code}, signal=${signal}`)
        if (!this.stopping) this.childFailed(`Hermes exited (${signal ?? code ?? 'unknown'})`)
      })
      await this.waitForHealth(gatewayUrl, token)
      if (this.child !== child) throw new Error('Hermes stopped during startup')
      this.publish({ state: 'ready', gatewayUrl })
      console.log(`[hermesRuntime] Hermes gateway is ready at ${gatewayUrl}`)
    } catch (error) {
      const safeError = redactHermesSecrets(error instanceof Error ? error.message : String(error), this.secretValues)
      console.error('[hermesRuntime] start failed:', safeError)
      await this.stopOwned()
      this.publish({ state: 'failed', gatewayUrl, detail: safeError })
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
      return { command: explicit, args: ['gateway', 'run', '--external-supervisor', '--replace'], cwd: path.dirname(explicit) }
    }
    if (this.options.isPackaged) {
      const executable = path.join(this.options.resourcesPath, 'hermes', process.platform === 'win32' ? 'hermes.exe' : 'hermes')
      if (fs.existsSync(executable)) {
        return { command: executable, args: ['gateway', 'run', '--external-supervisor', '--replace'], cwd: path.dirname(executable) }
      }
    }
    const source = this.options.sourceOverride?.trim()
    if (!source) {
      if (this.options.isPackaged) throw new Error('Bundled Hermes runtime is missing')
      throw new Error('Set SCLIP_HERMES_SOURCE or SCLIP_HERMES_EXECUTABLE to run Hermes in development')
    }
    const python = path.join(source, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python')
    if (!fs.existsSync(python)) {
      if (this.options.isPackaged) throw new Error('Bundled Hermes runtime is missing')
      throw new Error('Hermes development virtual environment is missing')
    }
    return { command: python, args: ['-m', 'hermes_cli.main', 'gateway', 'run', '--external-supervisor', '--replace'], cwd: source }
  }

  getPort(): number { return this.port }

  private writeProfile(home: string): void {
    writeHermesProfile(home, this.port)
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

export interface HermesProfileConfig {
  provider: string
  model: string
  customBaseUrl?: string
  maxIterations: number
}

export function readHermesProfile(home: string): HermesProfileConfig {
  const target = path.join(home, 'config.yaml')
  let provider = 'openrouter'
  let model = 'dots-studio/dots-3-note-preview:free'
  let customBaseUrl: string | undefined = undefined
  let maxIterations = 100
  if (fs.existsSync(target)) {
    try {
      const existing = fs.readFileSync(target, 'utf8')
      const providerMatch = existing.match(/^\s*provider:\s*([^\s#]+)/m)
      const defaultMatch = existing.match(/^\s*default:\s*([^\s#]+)/m)
      const baseUrlMatch = existing.match(/^\s*base_url:\s*["']?([^"'\s#]+)["']?/m)
      const maxIterMatch = existing.match(/^\s*max_turns:\s*(\d+)/m) ?? existing.match(/^\s*max_iterations:\s*(\d+)/m)
      if (providerMatch?.[1]) provider = providerMatch[1].trim()
      if (defaultMatch?.[1]) model = defaultMatch[1].trim()
      if (baseUrlMatch?.[1]) {
        const candidate = baseUrlMatch[1].trim()
        try { validateHermesProfile({ customBaseUrl: candidate }); customBaseUrl = candidate }
        catch { /* Do not return legacy credential-bearing URLs to renderer settings. */ }
      }
      if (maxIterMatch?.[1]) {
        maxIterations = parseInt(maxIterMatch[1], 10)
        // Migrate only the old Sclip defaults, not an explicitly saved modern
        // max_turns value or a different user-selected ceiling.
        if (!/^\s*max_turns:/m.test(existing) && (maxIterations === 30 || maxIterations === 60)) maxIterations = 100
      }
    } catch { /* use defaults on read error */ }
  }
  return { provider, model, customBaseUrl, maxIterations }
}

export function writeHermesProfile(
  home: string,
  port: number,
  params?: Partial<HermesProfileConfig>
): void {
  const current = readHermesProfile(home)
  const provider = params?.provider ?? current.provider
  const model = params?.model ?? current.model
  const customBaseUrl = params?.customBaseUrl !== undefined ? params.customBaseUrl : current.customBaseUrl
  const maxIterations = params?.maxIterations ?? current.maxIterations
  validateHermesProfile({ provider, model, customBaseUrl, maxIterations })

  // Rebuild from the small non-secret Sclip profile each time. In particular,
  // do not inherit legacy `disabled_toolsets` or `tool_search: false` from an
  // old development profile: Hermes's defaults supply its normal tools and
  // permissions, while Sclip adds only the WeftCut MCP server.
  const target = path.join(home, 'config.yaml')
  let previous: any = {}
  try { previous = parseYaml(fs.readFileSync(target, 'utf8')) ?? {} } catch { /* New or legacy profile. */ }
  const capabilityGuidance = 'Capability reporting: describe something as AVAILABLE NOW only when the current session tool definitions or current deferred tool_search/tool_describe catalog expose it and its prerequisites are configured. Requested toolset names and installed skills are not proof of availability. Distinguish OPTIONAL / NOT CONFIGURED and NOT AVAILABLE IN THIS SESSION when appropriate. Before listing all tools, inspect the current catalog; do not invent names or counts, count skills as callable tools, or confuse server tools with protocol methods. Hermes-generated MCP utility wrappers are callable only when explicitly present in the current tool catalog; distinguish them from server-registered editing tools. Generic terminal/API access does not establish that a specific web search or authenticated service is configured. If configuration has not been checked, say it is unverified.'
  const previousPrompt = typeof previous.agent?.system_prompt === 'string' ? previous.agent.system_prompt : ''
  const systemPrompt = previousPrompt.includes(capabilityGuidance) ? previousPrompt : [previousPrompt, capabilityGuidance].filter(Boolean).join('\n\n')
  const terminalCwd = typeof previous.terminal?.cwd === 'string' ? previous.terminal.cwd : '.'

  const modelLines = [
    'model:',
    `  provider: ${provider}`,
    `  default: ${model}`,
  ]
  if (customBaseUrl) {
    modelLines.push(`  base_url: "${customBaseUrl}"`)
  }

  const config = [
    ...modelLines,
    'platforms:',
    '  api_server:',
    '    enabled: true',
    '    extra:',
    '      host: "127.0.0.1"',
    `      port: ${port}`,
    'mcp_servers:',
    '  weftcut:',
    '    url: "${SCLIP_MCP_URL}"',
    '    headers:',
    '      Authorization: "Bearer ${SCLIP_MCP_TOKEN}"',
    '    timeout: 120',
    'terminal:',
    `  cwd: ${JSON.stringify(terminalCwd)}`,
    'tools:',
    '  tool_search: true',
    'agent:',
    `  system_prompt: ${JSON.stringify(systemPrompt)}`,
    `  max_turns: ${maxIterations}`,
    '',
  ].join('\n')

  fs.writeFileSync(`${target}.tmp`, config, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(`${target}.tmp`, target)
  try { fs.chmodSync(target, 0o600) } catch { /* Windows lacks POSIX modes. */ }
}
