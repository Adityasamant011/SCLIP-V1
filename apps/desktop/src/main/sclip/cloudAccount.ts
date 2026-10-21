import { createServer, type Server } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { CloudAccountView } from '../../shared/cloud-account'

type Session = { access_token: string; refresh_token: string; expires_at: number }
type PublicConfig = { supabaseUrl: string; supabaseAnonKey: string; managedEnabled: boolean; sharedStockEnabled: boolean }
interface Options {
  gatewayUrl?: string
  enforcePayment: boolean
  readSecret: () => string | undefined
  writeSecret: (value: string) => void
  clearSecret: () => void
  request?: typeof fetch
  onUsage?: () => void
}
export function validateCloudOrigin(value: string): string {
  const u = new URL(value)
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Sclip account gateway must be an HTTPS origin.')
  return u.origin
}
/** Sessions are main-process only and persisted through OS encrypted storage. */
export class CloudAccount {
  readonly configured: boolean
  readonly gatewayUrl: string
  private readonly request: typeof fetch
  private config: PublicConfig | null = null
  private refreshing: Promise<Session> | null = null
  private sessionEpoch = 0
  private server: Server | null = null
  private proxyToken = randomBytes(32).toString('hex')
  private proxyUrl = ''
  private leaseUntil = 0
  private lease: CloudAccountView | null = null
  constructor(private options: Options) {
    this.gatewayUrl = options.gatewayUrl ? validateCloudOrigin(options.gatewayUrl) : ''
    this.configured = !!this.gatewayUrl
    this.request = options.request ?? fetch
  }
  private async publicConfig(): Promise<PublicConfig> {
    if (!this.configured) throw new Error('The account service is not available in this build.')
    if (!this.config) {
      const response = await this.request(`${this.gatewayUrl}/v1/config`, { signal: AbortSignal.timeout(10_000), redirect: 'error' })
      if (!response.ok) throw new Error('Sclip account service is unavailable.')
      const data = await response.json() as PublicConfig
      validateCloudOrigin(data.supabaseUrl)
      if (typeof data.supabaseAnonKey !== 'string' || !data.supabaseAnonKey) throw new Error('Account service configuration is incomplete.')
      this.config = data
    }
    return this.config
  }
  private stored(): Session | null {
    try {
      const value = JSON.parse(this.options.readSecret() ?? 'null') as Session | null
      return value?.access_token && value.refresh_token && Number.isFinite(value.expires_at) ? value : null
    } catch { return null }
  }
  private async auth(route: string, body: unknown): Promise<Session | null> {
    const epoch = this.sessionEpoch
    const cfg = await this.publicConfig()
    const response = await this.request(`${cfg.supabaseUrl}/auth/v1/${route}`, {
      method: 'POST', headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error',
    })
    if (!response.ok) throw new Error('Sign-in failed. Check your email, password and email verification.')
    const data = await response.json() as Session & { expires_in?: number }
    if (!data.access_token) return null // email confirmation required after signup
    if (!data.refresh_token) throw new Error('Account service returned an invalid session.')
    const session = { access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now()/1000) + (data.expires_in ?? 3600) }
    if (epoch !== this.sessionEpoch) throw new Error('Account changed during sign-in.')
    this.options.writeSecret(JSON.stringify(session)); this.leaseUntil = 0
    return session
  }
  async signIn(email: string, password: string, signup = false): Promise<{ confirmationRequired: boolean }> {
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 256) throw new Error('Enter an email and a password of at least eight characters.')
    const result = await this.auth(signup ? 'signup' : 'token?grant_type=password', { email: email.trim(), password })
    return { confirmationRequired: !result }
  }
  async token(): Promise<string> {
    if (!this.configured) throw new Error('The account service is not available in this build.')
    const session = this.stored()
    if (!session) throw new Error('Sign in to Sclip before using AI.')
    if (session.expires_at > Date.now()/1000 + 60) return session.access_token
    if (!this.refreshing) this.refreshing = this.auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(value => { if (!value) throw new Error('Sign in again.'); return value }).finally(() => { this.refreshing = null })
    return (await this.refreshing).access_token
  }
  async api<T>(route: string, body?: unknown): Promise<T> {
    const token = await this.token()
    const response = await this.request(`${this.gatewayUrl}${route}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000), redirect: 'error',
    })
    const data = await response.json() as T & { error?: { message?: string } }
    if (!response.ok) throw new Error(data.error?.message?.slice(0,300) || 'Sclip account service is unavailable.')
    return data
  }
  async view(): Promise<CloudAccountView> {
    const epoch = this.sessionEpoch
    if (!this.configured) return { configured: false, signedIn: false }
    if (!this.stored()) {
      const cfg = await this.publicConfig()
      return { configured: true, signedIn: false, managedEnabled: cfg.managedEnabled, sharedStockEnabled: cfg.sharedStockEnabled }
    }
    const result = await this.api<Omit<CloudAccountView,'configured'|'signedIn'>>('/v1/account')
    if (epoch !== this.sessionEpoch) throw new Error('Account changed while loading. Refresh your account.')
    this.lease = { ...result, configured: true, signedIn: true }; this.leaseUntil = Date.now() + 60_000
    return this.lease
  }
  async assertAiAccess(managed = false): Promise<void> {
    if (!this.configured && !this.options.enforcePayment) return // development only
    if (!this.configured) throw new Error('Sclip accounts are not enabled in this build. Manual editing and export remain available.')
    if (!this.stored()) throw new Error('Sign in to Sclip before using AI.')
    const view = this.lease && Date.now() < this.leaseUntil ? this.lease : await this.view()
    if (!view.signedIn || !view.active || view.blocked) throw new Error('Choose a paid Sclip plan in Account and billing before using AI.')
    if (managed && (view.plan !== 'managed' || !view.managedEnabled)) throw new Error('Sclip AI requires an active, funded managed plan. Your own AI connections remain available.')
  }
  async billingLink(plan?: 'byok'|'managed'): Promise<string> {
    const result = await this.api<{ url: string }>(plan ? '/v1/checkout' : '/v1/portal', plan ? { plan } : {})
    const u = new URL(result.url)
    if (u.protocol !== 'https:' || !['checkout.stripe.com','billing.stripe.com'].includes(u.hostname) || u.username || u.password) throw new Error('Billing returned an invalid URL.')
    return u.href
  }
  async resetPassword(email: string): Promise<void> {
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || email.length>254) throw new Error('Enter your account email.')
    const cfg = await this.publicConfig()
    const response = await this.request(`${cfg.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(`${this.gatewayUrl}/account/recovery`)}`, {
      method:'POST', headers:{ apikey:cfg.supabaseAnonKey,'Content-Type':'application/json' },
      body:JSON.stringify({ email:email.trim() }),signal:AbortSignal.timeout(10_000),redirect:'error',
    })
    if (!response.ok) throw new Error('Could not send a reset email. Try again later.')
  }
  async signOut(): Promise<void> {
    const token = this.stored()?.access_token
    this.sessionEpoch++; this.options.clearSecret(); this.lease = null; this.leaseUntil = 0
    if (token && this.config) await this.request(`${this.config.supabaseUrl}/auth/v1/logout`, { method: 'POST',
      headers: { apikey: this.config.supabaseAnonKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000), redirect: 'error' }).catch(() => {})
  }
  async startProxy(): Promise<string> {
    if (this.proxyUrl) return this.proxyUrl
    const server = createServer(async (req, res) => {
      try {
        const auth = Buffer.from(req.headers.authorization ?? '')
        const expected = Buffer.from(`Bearer ${this.proxyToken}`)
        if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) { res.writeHead(401); res.end(); return }
        if (!['/v1/models','/v1/chat/completions','/v1/decisions'].includes(req.url ?? '') ||
            (req.url === '/v1/models' ? req.method !== 'GET' : req.method !== 'POST')) { res.writeHead(404); res.end(); return }
        await this.assertAiAccess(true)
        const chunks: Buffer[] = []; let size = 0
        for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 160_000) throw new Error('AI request is too large.'); chunks.push(Buffer.from(chunk)) }
        const response = await this.request(`${this.gatewayUrl}${req.url}`, { method: req.method,
          headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
          ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}), signal: AbortSignal.timeout(125_000), redirect: 'error' })
        res.writeHead(response.status, { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' })
        if (response.body) {
          const reader = response.body.getReader()
          try { while (true) { const part = await reader.read(); if (part.done) break; if (!res.destroyed) res.write(part.value) } }
          finally { reader.releaseLock() }
        }
        res.end()
        this.leaseUntil = 0
        this.options.onUsage?.()
      } catch {
        if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Sclip AI is unavailable. Check Account and billing.' } }))
      }
    })
    server.requestTimeout = 130_000; server.maxConnections = 8
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0,'127.0.0.1',resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Could not start Sclip AI connection.')
    this.server = server; this.proxyUrl = `http://127.0.0.1:${address.port}/v1`
    return this.proxyUrl
  }
  managedEnvironment(): Record<string,string> { return { OPENAI_API_KEY: this.proxyToken } }
  managedEndpoint(): string { return this.proxyUrl }
  close(): void { this.server?.closeAllConnections(); this.server?.close(); this.server = null; this.proxyUrl = '' }
}
