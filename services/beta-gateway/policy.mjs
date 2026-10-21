export const DEFAULT_MODEL = 'z-ai/glm-5.3-flash'
export const ALLOWANCE_MICRO_USD = 12_000_000
export class Refusal extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}
export const refuse = (status, code, message) => { throw new Refusal(status, code, message) }
export function paid(account, now = Date.now()) {
  return ['byok', 'managed'].includes(account?.plan) && Date.parse(account?.paid_until) > now && !account?.blocked
}
export function prepareCompletion(input) {
  if (!input || input.model !== DEFAULT_MODEL) refuse(400, 'model_unavailable', 'Choose GLM 5.3 Flash for Sclip AI.')
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > 300) refuse(400, 'invalid_messages', 'A bounded conversation is required.')
  // Local video/audio tools return text evidence. Remote media inputs need a
  // separate priced token bound before they can be enabled on a managed key.
  for (const m of input.messages) {
    if (!m || !['system', 'developer', 'user', 'assistant', 'tool'].includes(m.role) ||
        (m.content !== null && m.content !== undefined && typeof m.content !== 'string')) refuse(400, 'unsupported_content', 'Use local media understanding tools before sending text evidence to Sclip AI.')
  }
  const maxTokens = input.max_tokens ?? 4096
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) refuse(400, 'output_limit', 'Output must be between 1 and 8192 tokens.')
  const messages = input.messages.map(m => Object.fromEntries(['role','content','name','tool_call_id','tool_calls','reasoning_details'].filter(k => m[k] !== undefined).map(k => [k,m[k]])))
  if (input.tools !== undefined && (!Array.isArray(input.tools) || input.tools.length>160 || input.tools.some(t => t?.type !== 'function' || typeof t.function?.name !== 'string'))) refuse(400,'tool_limit','Only bounded function tools are supported.')
  const body = { model: DEFAULT_MODEL, messages, max_tokens: maxTokens,
    stream: input.stream === true, usage: { include: true },
    provider: { allow_fallbacks: false, max_price: { prompt: 1, completion: 4, request: 0, image: 0 } } }
  for (const key of ['tools', 'tool_choice', 'temperature', 'top_p', 'parallel_tool_calls', 'reasoning']) {
    if (input[key] !== undefined) body[key] = input[key]
  }
  // Lock output-token conditioning; callers cannot replace it via reasoning.
  if (body.reasoning && (typeof body.reasoning !== 'object' || body.reasoning.max_tokens > maxTokens)) refuse(400, 'reasoning_limit', 'Reasoning must fit the output budget.')
  if (body.stream) body.stream_options = { include_usage: true }
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length
  if (bytes > 128_000) refuse(413, 'context_limit', 'Narrow the source range or start a new conversation.')
  // UTF-8 bytes conservatively bound text tokens (including tool definitions).
  // Prices are capped at $1/M prompt and $4/M completion; reserve in micro USD.
  return { body, reserve: bytes + 4096 + maxTokens * 4 }
}
export async function verifyStripe(raw, header, secret, now = Date.now()) {
  if (!secret || !header) return false
  const fields = header.split(',').map(s => s.trim().split('='))
  const t = fields.find(([key]) => key === 't')?.[1]
  if (!/^\d+$/.test(t ?? '') || Math.abs(now / 1000 - Number(t)) > 300) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  for (const [, signature] of fields.filter(([name]) => name === 'v1')) {
    if (!/^[a-f0-9]{64}$/i.test(signature ?? '')) continue
    const bytes = Uint8Array.from(signature.match(/../g), h => parseInt(h, 16))
    if (await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${t}.${raw}`))) return true
  }
  return false
}
export function usageCost(data, reserved) {
  const value = data?.usage?.cost
  // Missing receipts leave the reservation held for reconciliation. Never
  // invent a zero cost after a timeout, cancellation or malformed response.
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  const actual = Math.ceil(value * 1_000_000)
  return { actual, exceedsReservation: actual > reserved }
}
export function prepareDecision(input) {
  if (input?.model !== 'typesafe/jev-1.13' || !input.questions || typeof input.questions !== 'object' || Array.isArray(input.questions)) refuse(400,'decision_model','A bounded Jev request is required.')
  const questions = Object.values(input.questions)
  if (!questions.length || questions.length > 16 || questions.some(q => q?.type !== 'noul' || typeof q.instructions !== 'string' || typeof q.criteria?.true !== 'string' || typeof q.criteria?.false !== 'string')) refuse(400,'decision_questions','Use up to sixteen Noul questions.')
  const body = { model:'typesafe/jev-1.13', state:input.state, questions:input.questions }
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length
  if (bytes>30_000) refuse(413,'decision_limit','Narrow the evidence range.')
  return { body, reserve: bytes + 4096 }
}
