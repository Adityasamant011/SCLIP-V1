import { randomUUID } from 'node:crypto'
import type { CreatorEvidence, CreatorPreference } from '../../shared/creator-style'
import type { CreatorMemoryDocument } from './creatorMemoryDocument'
import { emptyStats } from './creatorMemoryDocument'
import { emptyFilter, filterAdd, filterHas } from './creatorMemoryKeys'
import { summarizeCreatorEvidence } from './creatorEvidence'

export const CREATOR_MEMORY_LIMITS = { recent: 600, recentBytes: 2_000_000, inferred: 100, inferredBytes: 2_000_000, priorVersions: 2, aliases: 8, roleSamples: 3, sampleBytes: 2_000, projects: 128, proposals: 200 } as const
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value))
export const statsFor = (doc: CreatorMemoryDocument, creator: string) => doc.stats[creator] ??= emptyStats()
const operationCount = (e: CreatorEvidence) => Math.max(1, Number(e.data.operationCount) || 1)

function sample(e: CreatorEvidence): CreatorEvidence {
  if (size(e) <= CREATOR_MEMORY_LIMITS.sampleBytes) return structuredClone(e)
  const summary = summarizeCreatorEvidence(e)
  const data: Record<string, unknown> = { actor:e.data.actor, opId:e.data.opId, beforeState:e.data.beforeState, afterState:e.data.afterState,
    relationship:e.data.relationship, operationCount:operationCount(e), intention:e.data.intention,
    changes:summary.changes.slice(0,2).map(c=>({...c,properties:(c.properties as string[] | undefined)?.slice(0,2),values:c.values.slice(0,2)})),
    ...(e.kind==='explicit_instruction'?{quote:e.data.quote}:{}),
    ...(e.kind==='reference'?{reference:summary.reference}:{}),
    detailCompacted:true, originalBytes:size(e), limitations:'Bounded factual sample; omitted detail is not recoverable from a hash.' }
  const out = {...e, data, claims:undefined}
  // Mechanical trimming only. No interpretation or textual style summary.
  if (size(out)>CREATOR_MEMORY_LIMITS.sampleBytes) { data.changes=[]; data.omittedChanges=summary.changes.length }
  if (size(out)>CREATOR_MEMORY_LIMITS.sampleBytes && e.kind!=='explicit_instruction') { delete data.reference; data.omittedReference=true }
  if (size(out)>CREATOR_MEMORY_LIMITS.sampleBytes) throw new Error('Evidence sample exceeds technical budget; nothing changed')
  return out
}

/** The caller has already supplied the semantic claim and relevant evidence.
 * This function records only provenance/coverage, never preference certainty. */
export function attachEvidence(doc: CreatorMemoryDocument, p: CreatorPreference, evidence: CreatorEvidence, role: 'support' | 'counterexample') {
  let c=doc.capsules.find(c=>c.preferenceId===p.id && c.version===p.version && c.role===role)
  if(!c) {
    c={id:randomUUID(),creatorId:p.creatorId,preferenceId:p.id,version:p.version!,scope:structuredClone(p.scope),role,observations:0,operations:0,projects:[],projectCountIsLowerBound:false,
      seenFilter:emptyFilter(),samples:[],firstObserved:evidence.at,lastObserved:evidence.at,omittedSamples:0,countIsLowerBound:true}
    doc.capsules.push(c)
  }
  // Bounded membership can undercount via false positives; never overcount a
  // replay as a fresh confirmation. Report the lower-bound nature explicitly.
  if(!filterHas(c.seenFilter,evidence.id)) {
    c.seenFilter=filterAdd(c.seenFilter,evidence.id);c.observations++;c.operations+=operationCount(evidence)
    if(!c.projects.includes(evidence.projectId)) {
      if(c.projects.length<CREATOR_MEMORY_LIMITS.projects)c.projects.push(evidence.projectId)
      else c.projectCountIsLowerBound=true
    }
    c.firstObserved=[c.firstObserved,evidence.at].sort()[0]!;c.lastObserved=[c.lastObserved,evidence.at].sort().at(-1)!
    c.samples.push(sample(evidence))
    if(c.samples.length>CREATOR_MEMORY_LIMITS.roleSamples)c.samples.splice(1,1) // first + latest samples
    c.omittedSamples=c.observations-c.samples.length
    if(doc.evidence.includes(evidence)) {
      evidence.claims=[...evidence.claims??[]]
      if(!evidence.claims.some(v=>v.preferenceId===p.id && v.version===p.version))evidence.claims.push({preferenceId:p.id,version:p.version!})
    }
  }
  const field=role==='support'?'support':'counterexamples'
  p[field]=c.samples.map(e=>e.id)
}

/** Import already-declared references into capsules. No semantic extraction. */
export function ensureCapsules(doc: CreatorMemoryDocument) {
  for(const p of doc.preferences) {
    for(const v of [...p.history??[],p]) for(const [role,ids] of [['support',v.support],['counterexample',v.counterexamples]] as const) {
      const proxy={...p,...v}
      for(const id of ids) {
        const e=doc.evidence.find(e=>e.id===id) ?? doc.capsules.flatMap(c=>c.samples).find(e=>e.id===id)
        if(e)attachEvidence(doc,proxy,e,role)
      }
      v[role==='support'?'support':'counterexamples']=proxy[role==='support'?'support':'counterexamples']
    }
  }
}

const lane = (e: CreatorEvidence) => JSON.stringify([e.projectId,e.seriesId,e.kind,
  ((e.data.deltas ?? []) as Array<{properties?:string[]}>).flatMap(d=>d.properties??[]).sort()])
export function retainMemory(doc: CreatorMemoryDocument) {
  ensureCapsules(doc)
  for(const p of doc.preferences) {
    if(!p.approved) p.history=p.history!.slice(-CREATOR_MEMORY_LIMITS.priorVersions)
    p.aliases=p.aliases!.slice(-CREATOR_MEMORY_LIMITS.aliases)
  }
  doc.capsules=doc.capsules.filter(c=>{
    const p=doc.preferences.find(p=>p.id===c.preferenceId)
    return !!p && (p.version===c.version || p.history!.some(v=>v.version===c.version))
  })
  for(const e of doc.evidence) if(e.claims) e.claims=e.claims.filter(v=>doc.capsules.some(c=>c.preferenceId===v.preferenceId && c.version===v.version))
  for(const creator of doc.creators) {
    const inferred=doc.preferences.filter(p=>p.creatorId===creator.id && !p.approved)
    if(inferred.length>CREATOR_MEMORY_LIMITS.inferred || size([inferred,doc.capsules.filter(c=>inferred.some(p=>p.id===c.preferenceId))])>CREATOR_MEMORY_LIMITS.inferredBytes) throw new Error('Inferred memory budget full; use one atomic maintenance batch to consolidate/compact or supersede candidates. Creator-approved knowledge is preserved.')
    const protectedQuotes=new Set(doc.preferences.filter(p=>p.creatorId===creator.id && p.approved).flatMap(p=>[...p.support,...p.counterexamples,...p.history!.flatMap(v=>[...v.support,...v.counterexamples])]))
    let recent=doc.evidence.filter(e=>e.creatorId===creator.id && !(e.kind==='explicit_instruction' && protectedQuotes.has(e.id)))
    while(recent.length>CREATOR_MEMORY_LIMITS.recent || size(recent)>CREATOR_MEMORY_LIMITS.recentBytes) {
      // Retain factual coverage rather than letting one property/project flood
      // the buffer. Counts select an eviction lane, never a creative issue.
      const counts=new Map<string,number>();for(const e of recent)counts.set(lane(e),(counts.get(lane(e))??0)+1)
      const largest=[...counts].sort((a,b)=>b[1]-a[1])[0]![0]
      const evicted=recent.find(e=>lane(e)===largest)!,i=doc.evidence.indexOf(evicted)
      doc.evidence.splice(i,1)
      const claimed=evicted.claims?.some(v=>doc.capsules.some(c=>c.preferenceId===v.preferenceId && c.version===v.version))
      const stats=statsFor(doc,creator.id)
      if(claimed)stats.compactedObservations++
      else {stats.evictedObservations++;stats.evictedOperations+=operationCount(evicted)}
      recent=recent.filter(e=>e!==evicted)
    }
    const proposals=doc.proposals.filter(p=>p.creatorId===creator.id).slice(-CREATOR_MEMORY_LIMITS.proposals)
    doc.proposals=doc.proposals.filter(p=>p.creatorId!==creator.id).concat(proposals)
  }
  doc.maintenance=(doc.maintenance??[]).filter((r,_i,a)=>a.filter(v=>v.creatorId===r.creatorId).slice(-32).includes(r))
  // Referenced rows may have rotated. References now point only to retained
  // samples; full counts/time coverage stay in the bounded capsule.
}
