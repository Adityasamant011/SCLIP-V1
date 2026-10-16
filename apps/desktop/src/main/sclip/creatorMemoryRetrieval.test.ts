import { describe, expect, it } from 'vitest'
import { readMemory } from './creatorMemoryDocument'
import { selectCreatorMemory } from './creatorMemoryRetrieval'
import { legacyFixture } from './creatorMemory.test-utils'

describe('creator preference retrieval scope precedence', () => {
  it('orders project before series and creator-wide preferences regardless of approval, overlap, or recency', () => {
    const doc = readMemory(JSON.stringify(legacyFixture()))
    const seed = doc.preferences[0]!
    const clone = (id: string, scope: typeof seed.scope, hypothesis: string, updated: string) => ({
      ...seed, id, scope, hypothesis, status: 'active' as const, approved: true,
      updated, support: [...seed.support], counterexamples: [...seed.counterexamples],
    })
    doc.preferences = [
      clone('creator-wide', { kind: 'creator' }, 'Project captions should be very very small', '2099-01-01'),
      clone('series-level', { kind: 'series', id: 'series-a' }, 'Project captions should stay small', '2098-01-01'),
      clone('project-level', { kind: 'project', id: 'first' }, 'Use project caption size', '2020-01-01'),
    ]

    const result = selectCreatorMemory(doc, 'first', 'project caption size', () => true)
    expect(result.all.map(p => p.id)).toEqual(['project-level', 'series-level', 'creator-wide'])
    expect(result.payload.preferences.map(p => p.id)).toEqual(['project-level', 'series-level', 'creator-wide'])
  })
})
