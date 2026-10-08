import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { readMemory, validateMemory, memoryDigest, type CreatorMemoryDocument } from './creatorMemoryDocument'
import { retainMemory } from './creatorMemoryRetention'

/** Creator-owned durable records only; not a cold archive of editing events. */
export function protectedKnowledge(doc:CreatorMemoryDocument):CreatorMemoryDocument {
 const out=structuredClone(doc)
 out.preferences=out.preferences.filter(p=>p.approved)
 out.capsules=out.capsules.filter(c=>out.preferences.some(p=>p.id===c.preferenceId))
 out.evidence=out.evidence.filter(e=>e.kind==='explicit_instruction' && out.preferences.some(p=>[...p.support,...p.counterexamples,...p.history!.flatMap(v=>[...v.support,...v.counterexamples])].includes(e.id)))
 out.proposals=[]
 validateMemory(out)
 return out
}
/** Explicit offline recovery only. Never called automatically on parse failure.
 * Latest creator controls win over every snapshot; no empty initialization. */
export function recoverCreatorMemory(directory:string,commit=false) {
 const file=path.join(directory,'creator-style.json'),floorPath=path.join(directory,'creator-style-control-floor.json')
 const floor=JSON.parse(fs.readFileSync(floorPath,'utf8'))
 if(floor.schema!==2 || !Number.isSafeInteger(floor.generation) || !Array.isArray(floor.controls))throw Error('Invalid control floor; recovery requires creator review')
 const knowledge=floor.knowledge ? readMemory(JSON.stringify(floor.knowledge)) : null
 if(knowledge && (knowledge.generation!==floor.generation || memoryDigest(knowledge.controls)!==memoryDigest(floor.controls)))throw Error('Protected knowledge/control mismatch; existing memory preserved')
 const checkpoint=readMemory(fs.readFileSync(path.join(directory,'creator-style.last-good.json'),'utf8'))
 const next=structuredClone(checkpoint)
 if(knowledge && (knowledge.revision>checkpoint.revision || floor.generation>checkpoint.generation)){
  next.creators=knowledge.creators;next.bindings=knowledge.bindings
  const protectedIds=new Set(knowledge.preferences.map(p=>p.id))
  next.preferences=next.preferences.filter(p=>!p.approved && !protectedIds.has(p.id)).concat(knowledge.preferences)
  next.capsules=next.capsules.filter(c=>!protectedIds.has(c.preferenceId)).concat(knowledge.capsules)
  for(const e of knowledge.evidence)next.evidence=next.evidence.filter(old=>old.id!==e.id).concat(e)
 }
 next.controls=structuredClone(floor.controls);next.generation=Math.max(next.generation,floor.generation)
 next.revision=Math.max(next.revision,knowledge?.revision??0)+1
 for(const c of next.controls){
  const ids=new Set([c.id,...c.aliases])
  if(c.kind==='forgotten')next.preferences=next.preferences.filter(p=>!ids.has(p.id))
  else for(const p of next.preferences)if(ids.has(p.id))p.status='disabled'
  for(const e of [...next.evidence,...next.capsules.flatMap(c=>c.samples)])if(c.evidenceIds.includes(e.id)||e.claims?.some(v=>ids.has(v.preferenceId)))e.suppressed=true
 }
 next.capsules=next.capsules.filter(c=>next.preferences.some(p=>p.id===c.preferenceId))
 retainMemory(next);validateMemory(next)
 const bytes=JSON.stringify(next)
 if(commit){
  const original=fs.existsSync(file)?fs.readFileSync(file):null,temp=`${file}.${randomUUID()}.tmp`
  // One explicitly requested recovery backup, not an unlimited raw archive.
  if(original)fs.writeFileSync(path.join(directory,'creator-style.pre-recovery.backup'),original,{mode:0o600})
  try{fs.writeFileSync(temp,bytes,{mode:0o600});fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}
 }
 return {document:next,bytes,committed:commit,limitations:'Uncheckpointed transient observations may be lost. Current creator controls and protected knowledge take precedence.'}
}
