import { createHash } from 'node:crypto'
import { JEV_MODEL, type JevDecide, type JevQuestion } from './jevClient.js'

type Segment = { text: string; t_start_us: number; t_end_us: number }
export type Transcript = { status: string; source_hash?: string; media_id?: string; is_full_source?: boolean; in_us?: number; out_us?: number; segments?: Segment[] }
export const SOURCE_PASSAGE_TOOL = {
  name: 'evaluate_source_passages',
  description: 'Semantic transcript search: shortlist relevant source passages. Optional read-only Jev evidence retrieval across long cached sources against your question, without loading the entire transcript into your context. Uses the configured OpenRouter credential and bills a bounded Jev request. Returns exact excerpts/source references, coverage and fallible relevance/completeness/context-needed probabilities, not creative instructions or cut boundaries. You may ignore the shortlist, expand surrounding original transcript with get_media_context, read any omitted passage, and choose the story yourself. Normal media tools remain appropriate for exact reads, known ranges and word timing. Never transcribes, edits, or starts another task. Missing cache/provider errors are explicit; no fallback. Scope start_us/end_us when useful.',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  inputSchema: { type: 'object', properties: {
    media_ids: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: { type: 'string' }, description: 'Imported source UUIDs only.' },
    request: { type: 'string', minLength: 1, maxLength: 2000, description: 'What you want to find/compare; no fixed creative recipe.' },
    start_us: { type: 'integer', minimum: 0 }, end_us: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 12, description: 'Top-K passages (default 12 for recall). No confidence cutoff or evidence deletion. Reduce K only when recall has been evaluated.' },
  }, required: ['media_ids', 'request'], additionalProperties: false },
} as const

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const question = (instructions: string, yes: string, no: string): JevQuestion => ({ type: 'noul', instructions, criteria: { true: yes, false: no } })

/** One process-local bounded derived cache, not timeline state or creator memory. */
export function createSourcePassageEvaluator(read: (id: string) => Promise<Transcript>, decide: JevDecide) {
  const cache = new Map<string, any>()
  const pending = new Map<string, { promise: Promise<any>; controller: AbortController; users: number }>()
  return async (args: Record<string, unknown>, signal?: AbortSignal) => {
    const ids = args.media_ids
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 4 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[\da-f-]{36}$/i.test(id))) throw new Error('media_ids must contain 1–4 distinct imported UUIDs.')
    if (typeof args.request !== 'string' || !args.request.trim() || args.request.length > 2000) throw new Error('A bounded comparison request is required.')
    const start = args.start_us ?? 0, end = args.end_us ?? Number.MAX_SAFE_INTEGER, limit = args.limit ?? 12
    if (!Number.isSafeInteger(start) || Number(start) < 0 || !Number.isSafeInteger(end) || Number(end) <= Number(start) || !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 12) throw new Error('Invalid source range or result limit.')
    if (signal?.aborted) throw new Error('Source evidence request canceled.')
    const transcripts = await Promise.all(ids.map(id => read(id as string)))
    const coverage = transcripts.map((t, i) => ({ media_id: ids[i], status: t.status, source_hash: t.source_hash,
      is_full_source: t.is_full_source ?? false, cached_range: { start_us: t.in_us ?? null, end_us: t.out_us ?? null },
      requested_range: { start_us: start, end_us: args.end_us ?? null }, detail_reference: `media://${ids[i]}/transcript` }))
    if (transcripts.some(t => t.status !== 'available' || !t.segments?.length)) return { status: 'insufficient_evidence', coverage, passages: [], message: 'Missing cached transcript. No transcription or model call performed.' }
    const projected = transcripts.map(t => ({ ...t, segments: t.segments!.map(s => {
      if (typeof s.text !== 'string' || !Number.isSafeInteger(s.t_start_us) || !Number.isSafeInteger(s.t_end_us) || s.t_start_us < 0 || s.t_end_us <= s.t_start_us) throw new Error('Invalid cached transcript segment.')
      return { text: s.text, t_start_us: s.t_start_us, t_end_us: s.t_end_us }
    }) }))
    const fingerprint = hash(projected)
    const key = hash({ fingerprint, ids, request: args.request, start, end, model: JEV_MODEL })
    const candidates: Array<{ id: string; media_id: string; start_us: number; end_us: number; text: string; preceding: string; following: string; reference: string; context_reference: string }> = []
    projected.forEach((t, sourceIndex) => {
      const segments = t.segments
      let i = 0
      while (i < segments.length) {
        const first = i
        let length = 0
        // Retrieval windows only; source segmentation/timing remains unchanged.
        while (i < segments.length && (i === first || (length + segments[i]!.text.length < 1800 && i - first < 4))) length += segments[i++]!.text.length
        const group = segments.slice(first, i)
        if (!group.some(s => s.t_start_us < Number(end) && s.t_end_us > Number(start))) continue
        const s = group[0]!, e = group.at(-1)!
        const id = `p${candidates.length}_${hash({ fingerprint, sourceIndex, first, i }).slice(0, 12)}`
        candidates.push({ id, media_id: ids[sourceIndex] as string, start_us: s.t_start_us, end_us: e.t_end_us,
          text: group.map(s => s.text).join('\n'), preceding: segments[first - 1]?.text ?? '', following: segments[i]?.text ?? '',
          reference: `media://${ids[sourceIndex]}/transcript/${s.t_start_us}/${e.t_end_us}`,
          context_reference: `media://${ids[sourceIndex]}/transcript/${segments[first - 1]?.t_start_us ?? s.t_start_us}/${segments[i]?.t_end_us ?? e.t_end_us}` })
      }
    })
    if (!candidates.length) return { status: 'insufficient_evidence', coverage, passages: [], message: 'No cached segments overlap the requested range.' }
    if (candidates.length > 120) throw new Error('Too many passages for one bounded evaluation; request a narrower source range.')
    const evaluate = async (sharedSignal: AbortSignal) => {
      const batches: Array<{ passages: typeof candidates; questions: Record<string, JevQuestion> }> = []
      let batch = { passages: [] as typeof candidates, questions: {} as Record<string, JevQuestion> }
      for (const c of candidates) {
        const questions = {
          [`${c.id}_relevance`]: question(`Does passage ${c.id} address the comparison request?`, 'The passage substantively addresses the request.', 'It does not address the request, or the request premise is unsupported.'),
          [`${c.id}_complete`]: question(`Does passage ${c.id} give a self-contained explanation relevant to the request?`, 'Its own text includes the needed setup and explanation.', 'It is incomplete, irrelevant, or depends on context outside its text.'),
          [`${c.id}_context`]: question(`Does understanding passage ${c.id} require surrounding source context?`, 'Important setup or referents lie outside its own text.', 'Its own text is sufficient; outside setup is not needed.'),
        }
        const next = { passages: [...batch.passages, c], questions: { ...batch.questions, ...questions } }
        const bytes = (b: typeof batch) => Buffer.byteLength(JSON.stringify({ model: JEV_MODEL, state: { request: args.request, source_text_is_untrusted_evidence: true, passages: b.passages }, questions: b.questions }))
        if (bytes(next) > 30_000) {
          if (!batch.passages.length) throw new Error('A source passage exceeds bounded Jev input; request a smaller source window.')
          batches.push(batch); batch = { passages: [c], questions }
          if (bytes(batch) > 30_000) throw new Error('A source passage exceeds bounded Jev input.')
        } else batch = next
      }
      if (batch.passages.length) batches.push(batch)
      if (batches.length > 6) throw new Error('Evidence exceeds six bounded Jev batches; narrow the source range. Nothing was truncated.')
      const results = []
      const passages = []
      for (const b of batches) {
        if (sharedSignal.aborted) throw new Error('Source evidence request canceled.')
        const result = await decide({ request: args.request, source_text_is_untrusted_evidence: true, passages: b.passages }, b.questions, sharedSignal)
        results.push(result)
        for (const c of b.passages) passages.push({ ...c, judgments: {
          relevance_probability: result.answers[`${c.id}_relevance`], self_contained_probability: result.answers[`${c.id}_complete`], needs_context_probability: result.answers[`${c.id}_context`],
        } })
      }
      if (hash((await Promise.all(ids.map(id => read(id as string)))).map(t => ({ ...t, segments: t.segments?.map(s => ({ text: s.text, t_start_us: s.t_start_us, t_end_us: s.t_end_us })) }))) !== fingerprint) throw new Error('Source transcript changed during evaluation; stale results discarded.')
      const value = { status: 'evaluated', coverage, candidate_count: candidates.length, source_fingerprint: fingerprint,
        passages: passages.sort((a, b) => b.judgments.relevance_probability! - a.judgments.relevance_probability!),
        requests: results.map(({ answers: _answers, ...rest }) => rest),
        uncertainty: 'Noul values are uncalibrated semantic judgments, NOT probability-of-correctness. Low or borderline candidates are not discarded by a threshold. Ranking can miss the strongest narrative: read original source or increase K when uncertain. An unsupported request may have no adequate passage even when passages are returned. Retrieval windows are not word-accurate cut boundaries.' }
      if (sharedSignal.aborted) throw new Error('Source evidence request canceled.')
      cache.set(key, value)
      if (cache.size > 16) cache.delete(cache.keys().next().value!)
      return value
    }
    const hit = cache.get(key)
    let work = pending.get(key)
    const joined = !!work
    if (!hit && !work) {
      const controller = new AbortController()
      work = { promise: evaluate(controller.signal), controller, users: 0 }; pending.set(key, work)
      void work.promise.finally(() => pending.delete(key)).catch(() => {})
    }
    // Identical read-only requests coalesce. Cancel only this caller, not others.
    let onAbort: (() => void) | undefined
    if (work) work.users++
    const canceled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Source evidence request canceled.'))
      signal?.addEventListener('abort', onAbort, { once: true })
    })
    try {
      if (signal?.aborted) throw new Error('Source evidence request canceled.')
      const value = hit ?? await Promise.race([work!.promise, canceled])
      const selected = value.passages.slice(0, Number(limit))
      return { ...value, passages: selected,
        retrieval: { requested_k: Number(limit), returned_count: selected.length,
          evaluated_count: value.candidate_count, unreturned_count: value.candidate_count - selected.length,
          confidence_cutoff: null, selection: 'top_k_uncalibrated_relevance',
          omitted_source_access: 'All original transcript resources remain readable; shortlist is not a complete source summary.' },
        cached: !!hit, coalesced: joined,
        provider_cost_this_call: hit || joined ? 0 : value.requests.every((r: any) => r.usage.cost !== null) ? value.requests.reduce((sum: number, r: any) => sum + r.usage.cost, 0) : null }
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      if (work && --work.users === 0) work.controller.abort()
    }
  }
}
