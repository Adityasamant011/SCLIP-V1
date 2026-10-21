const PROVIDER_SECRET_ENV_NAMES = [
  'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY',
] as const

/** Start Hermes with only the selected provider credential, not every key in the parent's environment. */
export function hermesBaseEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const base = { ...source }
  for (const name of PROVIDER_SECRET_ENV_NAMES) delete base[name]
  // Account/billing infrastructure belongs to the gateway, never an agent's
  // inherited shell environment, including when developing the two together.
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','OPENROUTER_MANAGEMENT_KEY']) delete base[name]
  return base
}

/** Use at logging/IPC boundaries. Never log a raw provider response or environment dump. */
export function redactHermesSecrets(text: string, values: Iterable<string>): string {
  let redacted = text
  for (const value of values) {
    if (value && value.length >= 4) redacted = redacted.split(value).join('[REDACTED]')
  }
  return redacted
    .replace(/(\bauthorization\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?[^\s,"'}]+/gi, '$1[REDACTED]')
    .replace(/(\bBearer\s+)[^\s,"'}]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|OPENROUTER_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|GROQ_API_KEY|GEMINI_API_KEY)\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]')
}

/**
 * Stream-safe redaction for an interactive PTY. Keep only suffixes that could
 * become a secret or a credential label; holding a whole key's length makes
 * ordinary keyboard echo appear frozen until dozens of later characters arrive.
 */
export function createHermesOutputRedactor(values: readonly string[]) {
  const secrets = values.filter(value => value.length >= 4)
  const labels = [
    'authorization', 'bearer', 'api_key', 'api-key', 'apikey',
    'access_token', 'access-token', 'accesstoken', 'token',
    ...PROVIDER_SECRET_ENV_NAMES.map(name => name.toLowerCase()),
  ]
  const credentialPrefix = /\b(?:authorization\s*[:=]\s*|bearer\s+|(?:api[_-]?key|access[_-]?token|token|OPENROUTER_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|GROQ_API_KEY|GEMINI_API_KEY)\s*[:=]\s*)/gi
  let pending = ''
  let masking: 'authorization' | 'value' | null = null
  let valueStarted = false
  let quote: '"' | "'" | null = null

  const possibleSuffixLength = (): number => {
    const lower = pending.toLowerCase()
    const genericTail = lower.match(/(?:authorization|bearer|api[_-]?key|access[_-]?token|token|openrouter_api_key|openai_api_key|anthropic_api_key|deepseek_api_key|groq_api_key|gemini_api_key)\s*(?::|=)?\s*$/)
    if (genericTail) return genericTail[0].length
    const limit = Math.min(pending.length, Math.max(24, ...secrets.map(value => value.length)))
    for (let length = limit; length > 0; length--) {
      const suffix = pending.slice(-length)
      if (secrets.some(secret => length < secret.length && secret.startsWith(suffix))) return length
      const word = lower.slice(-length)
      if (labels.some(label => label.startsWith(word) ||
        (word.startsWith(label) && (label === 'bearer'
          ? /^\s*$/.test(word.slice(label.length))
          : /^\s*(?:[:=]\s*)?$/.test(word.slice(label.length)))))) return length
    }
    return 0
  }

  const drain = (final: boolean): string => {
    let safe = ''
    while (pending.length) {
      if (masking === 'authorization') {
        const end = pending.search(/[\r\n]/)
        if (end < 0) { pending = ''; break }
        safe += pending[end]
        pending = pending.slice(end + 1)
        masking = null
        continue
      }
      if (masking === 'value') {
        if (!valueStarted) {
          const prefix = pending.match(/^[ \t]*/)?.[0] ?? ''
          safe += prefix
          pending = pending.slice(prefix.length)
          if (!pending.length) break
          if (pending[0] === '\r' || pending[0] === '\n') {
            safe += pending[0]
            pending = pending.slice(1)
            masking = null
            continue
          }
          if (pending[0] === '"' || pending[0] === "'") {
            quote = pending[0] as '"' | "'"
            safe += quote
            pending = pending.slice(1)
          }
          if (!pending.length) break
          if (!quote && /[\s,"'}]/.test(pending[0])) {
            masking = null
            continue
          }
          safe += '[REDACTED]'
          valueStarted = true
        }
        const end = quote ? pending.indexOf(quote) : pending.search(/[\s,"'}]/)
        if (end < 0) { pending = ''; break }
        safe += pending[end]
        pending = pending.slice(end + 1)
        masking = null
        valueStarted = false
        quote = null
        continue
      }

      credentialPrefix.lastIndex = 0
      const marker = credentialPrefix.exec(pending)
      const exact = secrets.map(secret => ({ secret, at: pending.indexOf(secret) }))
        .filter(hit => hit.at >= 0).sort((a, b) => a.at - b.at)[0]
      const holdAt = pending.length - possibleSuffixLength()
      const markerAt = marker?.index ?? Infinity
      const exactAt = exact?.at ?? Infinity
      const nextAt = Math.min(markerAt, exactAt)
      if (nextAt === Infinity || nextAt > holdAt) {
        safe += pending.slice(0, holdAt)
        pending = pending.slice(holdAt)
        if (final && pending) { safe += '[REDACTED]'; pending = '' }
        break
      }
      safe += pending.slice(0, nextAt)
      if (exactAt <= markerAt && exact) {
        safe += '[REDACTED]'
        pending = pending.slice(exactAt + exact.secret.length)
      } else if (marker) {
        safe += marker[0]
        pending = pending.slice(markerAt + marker[0].length)
        masking = /^authorization/i.test(marker[0]) ? 'authorization' : 'value'
        valueStarted = false
        quote = null
        if (masking === 'authorization') safe += '[REDACTED]'
      }
    }
    if (final && pending) {
      // A process can exit mid-credential. Never flush a possible prefix raw.
      safe += possibleSuffixLength() ? '[REDACTED]' : pending
      pending = ''
    }
    return redactHermesSecrets(safe, secrets)
  }
  return {
    push(chunk: string): string {
      pending += chunk
      return drain(false)
    },
    flush(): string {
      return drain(true)
    },
  }
}
