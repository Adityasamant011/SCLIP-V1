import { describe, it, expect, vi } from 'vitest'
import { createSourcePassageEvaluator, type Transcript } from './sourcePassageEvaluation'
const id = '00000000-0000-0000-0000-0000000000aa'
const transcript = (): Transcript => ({ status: 'available', source_hash: 'synthetic-source', is_full_source: true, in_us: 0, out_us: 50_000_000,
  segments: Array.from({ length: 12 }, (_, i) => ({ text: `Exact passage ${i}.`, t_start_us: i * 1_000_000, t_end_us: (i + 1) * 1_000_000, words: [{ text: 'not sent' }] })) })
const decide = () => vi.fn(async (_state: unknown, questions: Record<string, unknown>) => ({
  answers: Object.fromEntries(Object.keys(questions).map(k => [k, .5])), id: 'test', model: 'typesafe/jev-1.13', usage: { input_tokens: 400, cost: .00002 }, latency_ms: 2,
}))
describe('read-only source passage evidence', () => {
  it('defaults to generous K without confidence filtering, exposes omission and exact neighboring references', async () => {
    const full = { ...transcript(), segments: Array.from({ length: 60 }, (_, i) => ({ text: `Borderline passage ${i}`, t_start_us: i * 1_000_000, t_end_us: (i + 1) * 1_000_000 })) }
    const evaluate = createSourcePassageEvaluator(async () => full, decide())
    const result = await evaluate({ media_ids: [id], request: 'Find useful evidence' })
    expect(result.passages).toHaveLength(12)
    expect(result.retrieval).toMatchObject({ requested_k: 12, evaluated_count: 15, unreturned_count: 3, confidence_cutoff: null })
    expect(result.passages.every((p: any) => p.judgments.relevance_probability === .5)).toBe(true)
    expect(result.passages[1].context_reference).toBe(`media://${id}/transcript/3000000/9000000`)
    expect(result.uncertainty).toContain('NOT probability-of-correctness')
    const narrow = await evaluate({ media_ids: [id], request: 'Find useful evidence', limit: 2 })
    expect(narrow.cached).toBe(true)
    expect(narrow.retrieval.unreturned_count).toBe(13)
  })
  it('covers all source text, returns exact refs and coalesces/cache without hiding spend', async () => {
    const read = vi.fn(async () => transcript()), call = decide()
    const evaluate = createSourcePassageEvaluator(read, call)
    const args = { media_ids: [id], request: 'Find the explanation', limit: 12 }
    const [a, b] = await Promise.all([evaluate(args), evaluate(args)])
    expect(call).toHaveBeenCalledTimes(1)
    expect(a.candidate_count).toBe(3)
    expect(a.passages.map((p: any) => p.text).join('\n')).toBe(transcript().segments!.map(s => s.text).join('\n'))
    expect(a.coverage[0].is_full_source).toBe(true)
    expect(a.passages[0].reference).toBe(`media://${id}/transcript/0/4000000`)
    expect(JSON.stringify(call.mock.calls)).not.toContain('not sent')
    expect(a.provider_cost_this_call).toBe(.00002)
    expect(b.coalesced).toBe(true)
    expect(b.provider_cost_this_call).toBe(0)
    expect((await evaluate(args)).cached).toBe(true)
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('returns missing and partial coverage honestly', async () => {
    const call = decide()
    const missing = await createSourcePassageEvaluator(async () => ({ status: 'not_generated' }), call)({ media_ids: [id], request: 'Find a point' })
    expect(missing.status).toBe('insufficient_evidence')
    expect(call).not.toHaveBeenCalled()
    const partial = await createSourcePassageEvaluator(async () => ({ ...transcript(), is_full_source: false }), call)({ media_ids: [id], request: 'Find a point' })
    expect(partial.coverage[0].is_full_source).toBe(false)
  })
  it('discards stale results and invalidates cache on transcript change', async () => {
    let source = transcript()
    const read = vi.fn(async () => source)
    const call = decide()
    const evaluate = createSourcePassageEvaluator(read, call)
    const args = { media_ids: [id], request: 'Find a point' }
    await evaluate(args)
    source = { ...source, source_hash: 'changed' }
    await evaluate(args)
    expect(call).toHaveBeenCalledTimes(2)
    const stale = createSourcePassageEvaluator(read, async (state, questions) => {
      source = { ...source, source_hash: 'changed-again' }
      return call(state, questions)
    })
    await expect(stale(args)).rejects.toThrow('stale results discarded')
  })
  it('does not return canceled evidence or mutate/transcribe when provider unavailable', async () => {
    const controller = new AbortController()
    const original = transcript()
    const evaluate = createSourcePassageEvaluator(async () => original, async () => {
      controller.abort(); throw new Error('provider unavailable')
    })
    await expect(evaluate({ media_ids: [id], request: 'Find a point' }, controller.signal)).rejects.toThrow()
    expect(original).toEqual(transcript())
  })
})
