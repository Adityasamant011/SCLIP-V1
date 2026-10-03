import { describe, it, expect, vi } from 'vitest'
import { createJevClient, type JevQuestion } from './jevClient'

const questions: Record<string, JevQuestion> = { q: { type: 'noul', instructions: 'Relevant?', criteria: { true: 'Relevant', false: 'Not relevant' } } }
const valid = () => ({ id: 'gen-test', model: 'typesafe/jev-1.13-20260917', answers: { q: { type: 'noul', noul: .7 } }, usage: { input_tokens: 200, cost: .00001 } })
describe('bounded secure Jev client', () => {
  it('records bounded safe usage once per provider attempt without evidence or credentials', async () => {
    const receipts: unknown[] = []
    await createJevClient(() => 'synthetic-secret', (async () => new Response(JSON.stringify({ ...valid(), id: 'synthetic-secret' }))) as any, r => receipts.push(r))({ text: 'private-source' }, questions)
    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({ status: 'ok', model: valid().model, cost: .00001, id: '' })
    expect(JSON.stringify(receipts)).not.toMatch(/synthetic-secret|private-source/)
    await expect(createJevClient(() => 'secret', (async () => new Response('secret', { status: 403 })) as any, r => receipts.push(r))({}, questions)).rejects.toThrow('HTTP 403')
    expect(receipts[1]).toMatchObject({ status: 'error', cost: null, input_tokens: null, error_code: 'http_403' })
    await expect(createJevClient(() => 'secret', (async () => new Response(JSON.stringify(valid()))) as any, () => { throw new Error('broken diagnostic') })({}, questions)).resolves.toHaveProperty('answers.q', .7)
  })
  it('uses only the explicit Decisions model and reports provider usage', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(valid())))
    const result = await createJevClient(() => 'synthetic-secret', request as any)({ text: 'Source' }, questions)
    expect(result.answers).toEqual({ q: .7 })
    expect(result.usage).toEqual({ input_tokens: 200, cost: .00001 })
    expect(JSON.stringify(result)).not.toContain('synthetic-secret')
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/alpha/decisions')
    expect(JSON.parse(init.body as string).model).toBe('typesafe/jev-1.13')
  })
  it.each([
    { ...valid(), model: 'other/model' },
    { ...valid(), answers: {} },
    { ...valid(), answers: { q: { type: 'noul', noul: 2 } } },
    { ...valid(), answers: { q: { type: 'noul', noul: -.1 } } },
    { ...valid(), answers: { q: { type: 'noul', noul: null } } },
    { ...valid(), answers: { q: { type: 'choice', choice: 'yes' } } },
    { ...valid(), answers: { q: { type: 'noul', noul: .2, choice: 'yes' } } },
    { ...valid(), answers: { ...valid().answers, extra: { type: 'noul', noul: .4 } } },
  ])('rejects invalid model/IDs/typed answers without fallback', async body => {
    const request = vi.fn(async () => new Response(JSON.stringify(body)))
    await expect(createJevClient(() => 'secret', request as any)({}, questions)).rejects.toThrow('Invalid Jev response:')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('withholds raw provider/transport errors and never retries', async () => {
    for (const request of [vi.fn(async () => new Response('secret payload', { status: 402 })), vi.fn(async () => { throw new Error('secret payload') })]) {
      const error = await createJevClient(() => 'secret', request as any)({}, questions).catch(e => e)
      expect(error.message).not.toContain('secret')
      expect(request).toHaveBeenCalledTimes(1)
    }
  })
  it('classifies a spending denial without exposing provider prose', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Key limit exceeded: synthetic-secret' } }), { status: 403 }))
    await expect(createJevClient(() => 'synthetic-secret', request as any)({}, questions)).rejects.toThrow('HTTP 403 (credit/key spending limit)')
    const error = await createJevClient(() => 'synthetic-secret', request as any)({}, questions).catch(e => e)
    expect(error.message).not.toContain('synthetic-secret')
  })
  it('does not treat missing usage as zero', async () => {
    const result = await createJevClient(() => 'secret', (async () => new Response(JSON.stringify({ ...valid(), usage: undefined }))) as any)({}, questions)
    expect(result.usage).toEqual({ input_tokens: null, cost: null })
  })
  it('bounds input before credential access and rejects missing credentials', async () => {
    const key = vi.fn(() => '')
    const request = vi.fn()
    const client = createJevClient(key, request as any)
    await expect(client({ text: 'x'.repeat(31000) }, questions)).rejects.toThrow('bounded input')
    expect(key).not.toHaveBeenCalled()
    await expect(client({}, questions)).rejects.toThrow('credential')
    expect(request).not.toHaveBeenCalled()
  })
  it('cancellation remains explicit and makes no retry', async () => {
    const controller = new AbortController()
    controller.abort()
    const request = vi.fn(async () => { throw new Error('aborted') })
    await expect(createJevClient(() => 'secret', request as any)({}, questions, controller.signal)).rejects.toThrow('canceled')
    expect(request).toHaveBeenCalledTimes(1)
  })
})
