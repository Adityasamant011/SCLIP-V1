/**
 * Electron-main entrypoint for the real-Hermes benchmark. It is bundled to a
 * temporary script by the test harness, decrypts the same Sclip credential as
 * the product runtime, and injects it only into the Hermes child environment.
 * No provider key crosses stdout, IPC, command-line arguments, or a temp file.
 */
import { app } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { encryptionAvailable, loadAllKeys } from '../keys.js'
import { readHermesProfile } from './hermesRuntime.js'
import { resolveHermesProviderEnvironment, testHermesConnection } from './hermesSettings.js'
import { createHermesOutputRedactor, hermesBaseEnvironment } from './hermesSecrets.js'
import { installSkills, refreshHermesWeftcutSkill } from '../mcp/skillsInstall.js'
import { startAutonomousReview } from './autonomousReview.js'
import { DESKTOP_PRODUCT_NAME } from '../appIdentity.js'

// Set identity before awaiting stdin or Electron readiness: macOS safeStorage
// selects its Keychain entry from the application name at initialization.
app.setName(DESKTOP_PRODUCT_NAME)

interface Request {
  userDataPath: string
  python: string
  cwd: string
  mcpUrl: string
  mcpToken: string
  projectId: string
  prompt: string
  maxTurns?: number
  transcriptsDir: string
  mode?: 'edit' | 'review'
  probeOnly?: boolean
  toolsets?: string
}

function readRequest(): Promise<Request> {
  return new Promise((resolve, reject) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => { raw += chunk; if (raw.length > 100_000) reject(new Error('Benchmark request is too large')) })
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(raw) as Request) } catch { reject(new Error('Invalid benchmark request')) }
    })
  })
}

async function main(): Promise<void> {
  const request = await readRequest()
  app.setPath('userData', request.userDataPath)
  await app.whenReady()
  if (!encryptionAvailable()) throw new Error('Secure OS key storage is unavailable for Hermes benchmark')
  const home = path.join(request.userDataPath, 'sclip-hermes')
  const builtSkills = path.join(request.cwd, 'apps', 'desktop', 'out', 'skills')
  const staged = installSkills({ resourcesSkills: builtSkills, devSkills: builtSkills,
    isPackaged: false, userDataDir: request.userDataPath })
  if (staged.state !== 'installed' || !refreshHermesWeftcutSkill(request.userDataPath)) {
    throw new Error('Current Sclip skill is unavailable to Hermes benchmark')
  }
  const profile = readHermesProfile(home)
  const maxTurns = request.maxTurns ?? profile.maxIterations
  const keys = loadAllKeys()
  const providerEnv = resolveHermesProviderEnvironment(profile, tag => keys[tag], {})
  if (request.probeOnly) {
    const result = await testHermesConnection(profile, tag => keys[tag], {})
    process.stdout.write(`${result.message}\n`)
    app.exit(result.ok ? 0 : 1)
    return
  }
  const review = request.mode === 'review' ? await startAutonomousReview({ url: request.mcpUrl, bearer_token: request.mcpToken }, request.projectId) : null
  if (review) process.stdout.write(`REVIEW_INITIALIZED ${JSON.stringify({ review_id: review.review_id, lifecycle: 'DIAGNOSING' })}\n`)
  const env = {
    ...hermesBaseEnvironment(), ...providerEnv,
    HERMES_HOME: home,
    SCLIP_MCP_URL: review?.url ?? request.mcpUrl,
    SCLIP_MCP_TOKEN: request.mcpToken,
    SCLIP_ACTIVE_PROJECT_ID: request.projectId,
    SCLIP_PROJECT_ID: request.projectId,
    SCLIP_TRANSCRIPTS_DIR: request.transcriptsDir,
  }
  const args = [
    '-m', 'hermes_cli.main', 'chat', '--toolsets', request.toolsets ?? 'terminal,file,web,vision,skills,todo,memory,clarify,weftcut',
    '--skills', 'weftcut',
    '--provider', profile.provider, '-m', profile.model,
    '--yolo', '--max-turns', String(maxTurns), '-q', request.prompt,
  ]
  process.stdout.write(`HERMES_RESOLVED ${JSON.stringify({ provider: profile.provider, model: profile.model, maxTurns })}\n`)
  const child = spawn(request.python, args, { cwd: request.cwd, env: env as NodeJS.ProcessEnv })
  const secrets = [...Object.values(providerEnv), request.mcpToken]
  const stdout = createHermesOutputRedactor(secrets)
  const stderr = createHermesOutputRedactor(secrets)
  child.stdout?.on('data', chunk => { const safe = stdout.push(String(chunk)); if (safe) process.stdout.write(safe) })
  child.stderr?.on('data', chunk => { const safe = stderr.push(String(chunk)); if (safe) process.stderr.write(safe) })
  const shutdown = () => { try { child.kill('SIGTERM') } catch {} }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  const code = await new Promise<number>((resolve) => child.once('exit', code => resolve(code ?? 1)))
  process.stdout.write(stdout.flush())
  process.stderr.write(stderr.flush())
  app.exit(code)
}

void main().catch(error => {
  // Errors from key resolution are deliberately generic and never contain the key.
  process.stderr.write(error instanceof Error && error.message.includes('API key is not configured')
    ? `${error.message}\n` : 'Secure Hermes benchmark launch failed.\n')
  app.exit(1)
})
