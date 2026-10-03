/** Thin OpenRouter Decisions client. No fallback, retries, editor or secrets store. */
export const JEV_MODEL = 'typesafe/jev-1.13'
export type JevQuestion = { type: 'noul'; instructions: string; criteria: { true: string; false: string } }
export interface JevResult {
  answers: Record<string, number>
  id: string
  model: string
  usage: { input_tokens: number | null; cost: number | null }
  latency_ms: number
}
export type JevDecide = (state: unknown, questions: Record<string, JevQuestion>, signal?: AbortSignal) => Promise<JevResult>
export type JevReceipt = { model: string; id: string; input_tokens: number | null; cost: number | null; latency_ms: number; status: 'ok' | 'error'; error_code?: string }

export function createJevClient(getCredential: () => string, request: typeof fetch = fetch, onReceipt?: (receipt: JevReceipt) => void): JevDecide {
  return async (state, questions, signal) => {
    const body = JSON.stringify({ model: JEV_MODEL, state, questions })
    // Conservative byte bound <= token budget, including questions. No truncation.
    if (Buffer.byteLength(body) > 30_000) throw new Error('Jev evidence request exceeds bounded input size; narrow the source range.')
    const key = getCredential()
    if (!key) throw new Error('Jev requires the existing OpenRouter credential in Sclip Settings.')
    const started = Date.now()
    const record = (receipt: JevReceipt) => { try { onReceipt?.(receipt) } catch { /* diagnostics cannot change evidence */ } }
    const timeout = AbortSignal.timeout(30_000)
    try {
      const response = await request('https://openrouter.ai/api/alpha/decisions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error',
      })
      if (!response.ok) {
        let reason = ''
        const reader = response.body?.getReader()
        if (reader) {
          try {
            const part = await reader.read()
            const error = JSON.parse(new TextDecoder().decode(part.value?.subarray(0, 2048)))
            const message = typeof error.error?.message === 'string' ? error.error.message.toLowerCase() : ''
            // Whitelisted classifications only; never echo arbitrary provider prose.
            if (/key limit exceeded|insufficient credits|spending limit|quota exceeded/.test(message)) reason = ' (credit/key spending limit)'
            else if (/management key|permission|not authorized|not permitted/.test(message)) reason = ' (endpoint permission denied)'
            else if (/data policy|privacy|data sharing/.test(message)) reason = ' (provider data-policy restriction)'
          } catch { /* Unknown reason stays unknown. */ }
          finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
        }
        // Never echo the provider body: it can contain input or credentials.
        throw new Error(`Jev provider HTTP ${response.status}${reason}; no model fallback occurred.`)
      }
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Invalid Jev response: missing body.')
      const chunks: Uint8Array[] = []
      let bytes = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          bytes += next.value.byteLength
          if (bytes > 1_000_000) throw new Error('Invalid Jev response: body too large.')
          chunks.push(next.value)
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (typeof data.model !== 'string' || !/^typesafe\/jev-1\.13(?:-\d{8})?$/.test(data.model)) throw new Error('Invalid Jev response: unexpected model; no fallback accepted.')
      const expected = Object.keys(questions).sort()
      if (!data.answers || JSON.stringify(Object.keys(data.answers).sort()) !== JSON.stringify(expected)) throw new Error('Invalid Jev response: answer IDs do not match.')
      const answers: Record<string, number> = {}
      for (const id of expected) {
        const answer = data.answers[id]
        if (answer?.type !== 'noul' || Object.keys(answer).some(k => !['type', 'noul'].includes(k)) ||
            typeof answer.noul !== 'number' || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) throw new Error('Invalid Jev response: expected a finite Noul probability.')
        answers[id] = answer.noul
      }
      const nonnegative = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
      const result = { answers, id: typeof data.id === 'string' && /^[\w-]{1,200}$/.test(data.id) && !data.id.includes(key) ? data.id : '', model: data.model,
        usage: { input_tokens: nonnegative(data.usage?.input_tokens), cost: nonnegative(data.usage?.cost) }, latency_ms: Date.now() - started }
      record({ model: result.model, id: result.id, input_tokens: result.usage.input_tokens, cost: result.usage.cost, latency_ms: result.latency_ms, status: 'ok' })
      return result
    } catch (error) {
      const http = error instanceof Error ? error.message.match(/^Jev provider HTTP (\d{3})/) : null
      record({ model: JEV_MODEL, id: '', input_tokens: null, cost: null, latency_ms: Date.now() - started, status: 'error',
        error_code: signal?.aborted ? 'canceled' : timeout.aborted ? 'timeout' : http ? `http_${http[1]}` : error instanceof Error && error.message.startsWith('Invalid Jev response:') ? 'invalid_response' : 'transport' })
      if (signal?.aborted) throw new Error('Jev evidence request canceled.')
      if (timeout.aborted) throw new Error('Jev evidence request timed out; no retry or fallback occurred.')
      if (error instanceof Error && /^(Invalid Jev response:|Jev provider HTTP)/.test(error.message)) throw error
      throw new Error('Jev request failed; provider response and credentials withheld. No retry or fallback occurred.')
    }
  }
}
