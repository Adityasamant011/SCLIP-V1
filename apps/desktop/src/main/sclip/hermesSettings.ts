import type { HermesProfileConfig } from './hermesRuntime.js'

export type HermesProvider = 'openrouter' | 'openai-api' | 'anthropic' | 'deepseek' | 'groq' | 'gemini' | 'ollama' | 'lmstudio' | 'custom'

interface ProviderCredential {
  tags: readonly string[]
  env: string
  required: boolean
}

const CREDENTIALS: Partial<Record<HermesProvider, ProviderCredential>> = {
  openrouter: { tags: ['sclip_openrouter', 'openrouter'], env: 'OPENROUTER_API_KEY', required: true },
  'openai-api': { tags: ['openai', 'openai-api'], env: 'OPENAI_API_KEY', required: true },
  anthropic: { tags: ['anthropic'], env: 'ANTHROPIC_API_KEY', required: true },
  deepseek: { tags: ['deepseek'], env: 'DEEPSEEK_API_KEY', required: true },
  groq: { tags: ['groq'], env: 'GROQ_API_KEY', required: true },
  gemini: { tags: ['gemini'], env: 'GEMINI_API_KEY', required: true },
  custom: { tags: ['sclip_hermes_custom'], env: 'OPENAI_API_KEY', required: false },
}
export const HERMES_PROVIDERS: readonly HermesProvider[] = ['openrouter', 'openai-api', 'anthropic', 'deepseek', 'groq', 'gemini', 'ollama', 'lmstudio', 'custom']

export function validateHermesProfile(update: Partial<HermesProfileConfig>): void {
  if (update.provider !== undefined && !HERMES_PROVIDERS.includes(update.provider as HermesProvider)) throw new Error('Unsupported Hermes provider')
  if (update.model !== undefined && !/^[^\s'"\x00-\x1f]{1,200}$/.test(update.model)) throw new Error('Enter a valid model ID')
  if (update.maxIterations !== undefined && (!Number.isInteger(update.maxIterations) || update.maxIterations < 5 || update.maxIterations > 100)) throw new Error('Max agent steps must be between 5 and 100')
  if (update.customBaseUrl !== undefined && update.customBaseUrl !== '') {
    let url: URL
    try { url = new URL(update.customBaseUrl) } catch { throw new Error('Enter a valid base URL') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[\r\n]/.test(update.customBaseUrl)) {
      throw new Error('Base URL must be an HTTP(S) endpoint without credentials or query parameters')
    }
  }
}

export function credentialTags(provider: string): readonly string[] {
  return CREDENTIALS[provider as HermesProvider]?.tags ?? []
}

export function configuredHermesKeys(readKey: (tag: string) => string | undefined): Record<string, boolean> {
  return Object.fromEntries(HERMES_PROVIDERS.filter((provider) => CREDENTIALS[provider]).map((provider) => [provider,
    credentialTags(provider).some((tag) => !!readKey(tag)),
  ]))
}

/** Secure store wins; process environment is development/CI fallback only. Never return this to renderer IPC. */
export function resolveHermesProviderEnvironment(
  profile: HermesProfileConfig,
  readKey: (tag: string) => string | undefined,
  fallback: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  validateHermesProfile(profile)
  const credential = CREDENTIALS[profile.provider as HermesProvider]
  if (!credential) return {}
  const secret = credential.tags.map(readKey).find((value) => !!value?.trim())?.trim() || fallback[credential.env]?.trim()
  if (!secret) {
    if (credential.required) throw new Error(`${providerLabel(profile.provider)} API key is not configured. Open Settings → Hermes to configure it.`)
    return {}
  }
  return { [credential.env]: secret }
}

function providerLabel(provider: string): string {
  return ({ openrouter: 'OpenRouter', 'openai-api': 'OpenAI', anthropic: 'Anthropic', deepseek: 'DeepSeek', groq: 'Groq', gemini: 'Gemini', custom: 'Custom provider' } as Record<string, string>)[provider] ?? 'Provider'
}

export type ConnectionResult = { ok: true; message: 'Connected successfully.' } | { ok: false; message: string }

/** Backend-only, read-only model availability probe. Never passes through raw provider response text. */
export async function testHermesConnection(
  profile: HermesProfileConfig,
  readKey: (tag: string) => string | undefined,
  fallback: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Promise<ConnectionResult> {
  try {
    const env = resolveHermesProviderEnvironment(profile, readKey, fallback)
    const provider = profile.provider as HermesProvider
    const urls: Record<string, string> = {
      openrouter: 'https://openrouter.ai/api/v1/models',
      'openai-api': 'https://api.openai.com/v1/models',
      anthropic: 'https://api.anthropic.com/v1/models',
      deepseek: 'https://api.deepseek.com/models',
      groq: 'https://api.groq.com/openai/v1/models',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    }
    const base = profile.customBaseUrl || (provider === 'ollama' ? 'http://localhost:11434/v1' : provider === 'lmstudio' ? 'http://localhost:1234/v1' : '')
    const url = base ? `${base.replace(/\/$/, '')}/models` : urls[provider]
    const key = Object.values(env)[0]
    const headers: Record<string, string> = {}
    if (key) {
      if (provider === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01' }
      else if (provider === 'gemini') headers['x-goog-api-key'] = key
      else headers.Authorization = `Bearer ${key}`
    }
    // OpenRouter's model catalog can be read with an invalid bearer token.
    // Verify the credential against its authenticated, read-only key endpoint
    // before treating a catalog response as a successful connection test.
    if (provider === 'openrouter') {
      const auth = await request('https://openrouter.ai/api/v1/key', { headers, signal: AbortSignal.timeout(8_000) })
      if (auth.status === 401 || auth.status === 403) return { ok: false, message: 'Provider authentication failed.' }
      if (!auth.ok) return { ok: false, message: `Provider connection failed (HTTP ${auth.status}).` }
    }
    const response = await request(url, { headers, signal: AbortSignal.timeout(8_000) })
    if (response.status === 401 || response.status === 403) return { ok: false, message: 'Provider authentication failed.' }
    if (!response.ok) return { ok: false, message: `Provider connection failed (HTTP ${response.status}).` }
    const body = await response.json() as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> }
    const modelIds = (body.data ?? []).map((model) => model.id).concat((body.models ?? []).map((model) => model.name?.replace(/^models\//, ''))).filter(Boolean)
    if (modelIds.length && !modelIds.includes(profile.model)) return { ok: false, message: 'Selected model is unavailable for this provider.' }
    return { ok: true, message: 'Connected successfully.' }
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key is not configured')) return { ok: false, message: error.message }
    return { ok: false, message: 'Provider connection failed.' }
  }
}
