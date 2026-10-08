import { createHash } from 'node:crypto'
import type { CreatorBinding, CreatorEvidence, CreatorIdentity, CreatorPreference, CreatorMemoryControl, CreatorMemoryStats, CreatorEvidenceCapsule, StyleScope } from '../../shared/creator-style'
import { controlKey, emptyFilter, filterAdd, validFilter } from './creatorMemoryKeys'

export interface CreatorProposal { creatorId: string; projectId: string; layerId: string; opId: string; valueHash: string }
export interface CreatorMemoryDocument {
  version: 2; generation: number; revision: number
  creators: CreatorIdentity[]; bindings: Record<string, CreatorBinding>
  evidence: CreatorEvidence[]; preferences: CreatorPreference[]; proposals: CreatorProposal[]
  controls: CreatorMemoryControl[]; capsules: CreatorEvidenceCapsule[]
  stats: Record<string, CreatorMemoryStats>
  maintenance?: Array<{id:string;creatorId:string;digest:string;revision:number;operations:number;at:string}>
  migration?: { sourceSha256: string; evidence: number; preferences: number; creators: number }
}
export const memoryDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const requireThat: (ok: unknown, detail: string) => asserts ok = (ok, detail) => { if (!ok) throw new Error(`Invalid creator memory: ${detail}; existing file preserved`) }
const string = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const scopeValid = (s: StyleScope) => s && (s.kind === 'creator' || ['series', 'project'].includes(s.kind) && string((s as { id: string }).id))
export const emptyStats = (): CreatorMemoryStats => ({ admittedObservations: 0, groupedOperations: 0, evictedObservations: 0, evictedOperations: 0, compactedObservations: 0 })
export const emptyMemory = (): CreatorMemoryDocument => ({ version: 2, generation: 0, revision: 0, creators: [{ id: 'local', label: 'Local creator', enabled: true }], bindings: {}, evidence: [], preferences: [], proposals: [], controls: [], capsules: [], stats: {} })

/** Validate before migration or writing; do not silently discard malformed rows. */
export function validateMemory(value: unknown): void {
  const d = value as CreatorMemoryDocument
  requireThat(d && [1, 2].includes(d.version) && Number.isSafeInteger(d.generation) && d.generation >= 0, 'schema/generation')
  requireThat(Array.isArray(d.creators) && d.creators.length && d.bindings && typeof d.bindings === 'object' && !Array.isArray(d.bindings), 'creators/bindings')
  for (const key of ['evidence', 'preferences', 'proposals'] as const) requireThat(Array.isArray(d[key]), key)
  const creators = new Set(d.creators.map(c => c.id))
  requireThat(creators.size === d.creators.length, 'duplicate creator')
  for (const c of d.creators) requireThat(string(c.id) && string(c.label) && typeof c.enabled === 'boolean', 'creator identity')
  for (const b of Object.values(d.bindings)) requireThat(b && creators.has(b.creatorId) && (b.seriesId === undefined || string(b.seriesId)) && (b.learningEnabled === undefined || typeof b.learningEnabled === 'boolean'), 'binding ownership')
  const evidenceIds = new Set<string>(), preferenceIds = new Set<string>()
  for (const e of d.evidence) {
    requireThat(e && string(e.id) && !evidenceIds.has(e.id) && creators.has(e.creatorId) && string(e.projectId) && string(e.at) && e.data && typeof e.data === 'object' && !Array.isArray(e.data), 'evidence identity/data')
    requireThat(['explicit_instruction', 'correction', 'manual_edit', 'undo', 'reference'].includes(e.kind) && ['creator_statement', 'ProjectActor', 'source_metadata_and_local_observations'].includes(e.authority), 'evidence provenance')
    requireThat(!e.scope || scopeValid(e.scope), 'evidence scope')
    evidenceIds.add(e.id)
  }
  if (d.version === 2) {
    requireThat(Number.isSafeInteger(d.revision) && d.revision >= 0 && Array.isArray(d.controls) && Array.isArray(d.capsules) && d.stats && typeof d.stats === 'object', 'v2 envelope')
    for (const c of d.controls) requireThat(c && string(c.id) && creators.has(c.creatorId) && scopeValid(c.scope) && ['disabled', 'forgotten'].includes(c.kind) && validFilter(c.keyFilter) && Array.isArray(c.aliases) && Array.isArray(c.evidenceIds), 'control')
    for (const c of d.capsules) {
      requireThat(c && string(c.id) && creators.has(c.creatorId) && scopeValid(c.scope) && Number.isSafeInteger(c.version) && c.version > 0 && ['support', 'counterexample'].includes(c.role) && validFilter(c.seenFilter) && Array.isArray(c.samples) && Array.isArray(c.projects), 'capsule')
      for (const e of c.samples) { requireThat(e.creatorId === c.creatorId && string(e.id), 'capsule evidence ownership'); evidenceIds.add(e.id) }
    }
  }
  const allEvidence = [...d.evidence, ...(d.capsules ?? []).flatMap(c => c.samples)]
  for (const p of d.preferences) {
    requireThat(p && string(p.id) && !preferenceIds.has(p.id) && creators.has(p.creatorId) && scopeValid(p.scope) && string(p.hypothesis) && string(p.dimension), 'preference identity/scope')
    requireThat(['explicit', 'inferred'].includes(p.origin) && ['active', 'candidate', 'disabled', 'disputed', 'superseded'].includes(p.status) && ['explicit', 'tentative', 'supported'].includes(p.confidence) && Array.isArray(p.support) && Array.isArray(p.counterexamples), 'preference authority')
    for (const id of [...p.support, ...p.counterexamples]) requireThat(allEvidence.some(e => e.id === id && e.creatorId === p.creatorId), 'missing/cross-creator support')
    if (d.version === 2) requireThat(Number.isSafeInteger(p.version) && p.version! > 0 && typeof p.approved === 'boolean' && Array.isArray(p.history) && Array.isArray(p.aliases) && validFilter(p.lineageFilter), 'preference version')
    preferenceIds.add(p.id)
  }
  for (const c of d.capsules ?? []) {
    const p=d.preferences.find(p=>p.id===c.preferenceId)
    requireThat(p && p.creatorId===c.creatorId && (p.version===c.version || p.history?.some(v=>v.version===c.version)), 'orphan/cross-creator capsule version')
    for(const n of [c.observations,c.operations,c.omittedSamples])requireThat(Number.isSafeInteger(n)&&n>=0,'capsule counts')
    requireThat(c.samples.length<=3 && c.projects.length<=128,'capsule detail budget')
  }
  for(const p of d.preferences)for(const v of p.history??[]){
    requireThat(Number.isSafeInteger(v.version)&&v.version<p.version! && scopeValid(v.scope)&&string(v.hypothesis)&&string(v.dimension)&&Array.isArray(v.support)&&Array.isArray(v.counterexamples),'historical version')
    for(const id of [...v.support,...v.counterexamples])requireThat(allEvidence.some(e=>e.id===id&&e.creatorId===p.creatorId),'historical provenance')
  }
  for(const [creator,stats] of Object.entries(d.stats??{}))requireThat(creators.has(creator)&&Object.values(stats).every(n=>Number.isSafeInteger(n)&&n>=0),'retention statistics')
  for(const r of d.maintenance??[])requireThat(creators.has(r.creatorId)&&string(r.id)&&string(r.digest)&&Number.isSafeInteger(r.revision)&&r.operations>0&&r.operations<=8,'maintenance receipt')
  for (const p of d.proposals) requireThat(p && creators.has(p.creatorId) && string(p.projectId) && string(p.layerId) && string(p.opId) && string(p.valueHash), 'proposal')
}

/** Pure, reversible inventory/migration; source bytes are not changed here. */
export function readMemory(bytes: string): CreatorMemoryDocument {
  const parsed = JSON.parse(bytes)
  validateMemory(parsed)
  if (parsed.version === 2) return parsed
  const migrated: CreatorMemoryDocument = { ...parsed, version: 2, revision: 0, controls: [], capsules: [], stats: {}, migration: {
    sourceSha256: createHash('sha256').update(bytes).digest('hex'), evidence: parsed.evidence.length, preferences: parsed.preferences.length, creators: parsed.creators.length,
  } }
  for (const p of migrated.preferences) {
    p.version = 1; p.history = []; p.aliases = []
    p.approved = p.origin === 'explicit' || migrated.evidence.some(e => e.creatorId === p.creatorId && e.data.approvalOf === p.id)
    p.lineageFilter = filterAdd(emptyFilter(), controlKey(p.scope, p.hypothesis))
    // Preserve the existing display status/authority/confidence exactly. Future
    // inferred writes use tentative + factual coverage, never count promotion.
    if (p.confidence === 'supported') p.legacyConfidence = 'supported'
    if (p.status === 'disabled') migrated.controls.push({ id: p.id, creatorId: p.creatorId, scope: p.scope, kind: 'disabled', aliases: [], keyFilter: p.lineageFilter, evidenceIds: [...p.support, ...p.counterexamples], at: p.updated })
  }
  validateMemory(migrated)
  return migrated
}
