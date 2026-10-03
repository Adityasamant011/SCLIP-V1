import { describe, it, expect } from 'vitest'
import { retrievalMetrics } from './retrievalMetrics.testSupport'

describe('shadow winner-recall measurement (no model calls)', () => {
  it('counts full narrative coverage only, merges overlap, and exposes a missing winner', () => {
    const winners = [{ media_id: 'a', start_us: 10, end_us: 30 }, { media_id: 'b', start_us: 0, end_us: 10 }]
    const passages = [{ media_id: 'a', start_us: 5, end_us: 22, following: 'nearby setup' },
      { media_id: 'a', start_us: 20, end_us: 35 }, { media_id: 'b', start_us: 0, end_us: 10 }]
    expect(retrievalMetrics(passages, winners, 1).winner_recall_at_k).toBe(0)
    expect(retrievalMetrics(passages, winners, 2).winner_recall_at_k).toBe(.5)
    expect(retrievalMetrics(passages, winners, 3).winner_recall_at_k).toBe(1)
    expect(retrievalMetrics(passages, winners, 2).winner_coverage[0].covered_us).toBe(20)
    expect(retrievalMetrics(passages, winners, 3).irrelevant_passage_rate).toBeNull()
  })
})
