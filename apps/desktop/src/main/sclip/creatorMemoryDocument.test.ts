import { legacyFixture } from './creatorMemory.test-utils'
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readMemory, validateMemory } from './creatorMemoryDocument'



describe('Creator schema inventory and pure reversible migration', () => {
  it('preserves exact approved text, identity, authority, status, scope and evidence, without semantic merges', () => {
    const original = legacyFixture(), bytes = JSON.stringify(original)
    const next = readMemory(bytes), p = next.preferences[0]!
    for (const field of ['id', 'hypothesis', 'origin', 'status', 'confidence', 'scope', 'support', 'counterexamples'] as const) expect(p[field]).toEqual(original.preferences[0]![field])
    expect(next.evidence).toEqual(original.evidence); expect(next.bindings).toEqual(original.bindings)
    expect(p).toMatchObject({ version: 1, approved: true, history: [], aliases: [] })
    expect(next.controls[0]).toMatchObject({ id: 'preference', kind: 'disabled' })
    expect(next.migration).toEqual({ sourceSha256: createHash('sha256').update(bytes).digest('hex'), evidence: 1, preferences: 1, creators: 1 })
    expect(JSON.stringify(original)).toBe(bytes)
    expect(readMemory(JSON.stringify(next))).toEqual(next)
  })
  it('refuses malformed, corrupt, duplicate and cross-creator evidence; never substitutes an empty document', () => {
    expect(() => readMemory('{broken')).toThrow()
    for (const patch of [
      { evidence: [] }, { preferences: [null] }, { bindings: { one: { creatorId: 'missing' } } },
      { evidence: [{ ...legacyFixture().evidence[0], creatorId: 'missing' }] },
      { preferences: [...legacyFixture().preferences, ...legacyFixture().preferences] },
    ]) expect(() => readMemory(JSON.stringify({ ...legacyFixture(), ...patch }))).toThrow('existing file preserved')
  })
  it('validates versioned controls and rejects corrupt membership filters', () => {
    const d = readMemory(JSON.stringify(legacyFixture()))
    d.controls[0]!.keyFilter = 'broken'
    expect(() => validateMemory(d)).toThrow('control')
  })
})
