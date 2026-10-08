import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ChangeEvent } from '../state/actor.js'
import type { Project, Layer } from '../state/model.js'
import type { CreatorBinding, CreatorEvidence, CreatorPreference, CreatorStyleView, StyleScope } from '../../shared/creator-style.js'
import { changedProperties, canGroupAdjustments } from './creatorEvidence.js'
import { emptyMemory, readMemory, validateMemory, memoryDigest, type CreatorMemoryDocument } from './creatorMemoryDocument.js'
import { controlKey, emptyFilter, filterAdd, filterHas, filterUnion, preferenceKey } from './creatorMemoryKeys.js'
import { selectCreatorMemory, creatorPreferenceIsLive } from './creatorMemoryRetrieval.js'
import { protectedKnowledge } from './creatorMemoryRecovery.js'
import { retainMemory, statsFor } from './creatorMemoryRetention.js'

const clean = (value: unknown, name: string, max = 1000): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${name} (1–${max} characters required)`)
  return value.trim()
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const relevantLayer = (layer: Layer) => ({
  id: layer.id, timeline: [layer.t_start_us, layer.t_end_us], params: layer.params, effects: layer.effects, enabled: layer.enabled,
})
function layers(project: Project) {
  return new Map(Object.values(project.compositions).flatMap(c => c.tracks.flatMap(t => t.layers.map((l, index) => [l.id, { ...relevantLayer(l), compositionId: c.id, trackId: t.id, stackIndex: index }] as const))))
}
function structure(project: Project) {
  return { audio_roles: project.audio_roles, compositions: Object.values(project.compositions).map(c => ({ id: c.id, width: c.width, height: c.height, fps: c.fps, transitions: c.transitions, links: c.links, tracks: c.tracks.map(t => ({ id: t.id, enabled: t.enabled, muted: t.muted, solo: t.solo, role: t.role })) })) }
}
function scopeFor(value: unknown, projectId: string, binding: CreatorBinding): StyleScope {
  const scope = value as Partial<StyleScope> | undefined
  if (!scope || scope.kind === 'creator') return { kind: 'creator' }
  if (scope.kind === 'project') return { kind: 'project', id: projectId }
  if (scope.kind === 'series' && binding.seriesId) return { kind: 'series', id: binding.seriesId }
  throw new Error('A series scope requires a current project series binding')
}
/** One app-owned writer. All methods are synchronous and atomic; no inference or timeline calls. */
export class CreatorStyleStore {
  private doc: CreatorMemoryDocument
  private captureWarning = ''
  private sourceBytes: string | null = null
  private diskDigest: string | null = null
  readonly file: string
  constructor(private readonly directory: string) {
    this.file = path.join(directory, 'creator-style.json')
    if (fs.existsSync(this.file)) {
      const bytes = fs.readFileSync(this.file, 'utf8')
      this.doc = readMemory(bytes)
      this.diskDigest = digest(bytes)
      if (JSON.parse(bytes).version === 1) this.sourceBytes = bytes
    } else {
      if (fs.existsSync(path.join(directory, 'creator-style-control-floor.json')) || fs.existsSync(path.join(directory, 'creator-style.last-good.json'))) throw new Error('Creator memory is missing; existing recovery data preserved. Recover explicitly, never initialize empty.')
      this.doc = emptyMemory()
    }
    this.assertControlFloor()
    for (const creator of this.doc.creators) if (!this.doc.stats[creator.id]) {
      const existing = this.doc.evidence.filter(e => e.creatorId === creator.id && e.kind !== 'explicit_instruction')
      this.doc.stats[creator.id] = { admittedObservations: existing.length, groupedOperations: existing.reduce((n,e)=>n+Math.max(0,Number(e.data.operationCount??1)-1),0), evictedObservations:0, evictedOperations:0, compactedObservations:0 }
    }
  }
  private assertControlFloor() {
    const file = path.join(this.directory, 'creator-style-control-floor.json')
    if (!fs.existsSync(file)) {
      if(this.diskDigest!==null && (!this.sourceBytes || fs.existsSync(path.join(this.directory,'creator-style.last-good.json'))))throw Error('Creator control floor missing; existing memory preserved, recall unavailable until explicit recovery')
      return
    }
    const floor = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (floor.schema !== 2 || !Number.isSafeInteger(floor.generation) || !Array.isArray(floor.controls) || this.sourceBytes || this.doc.generation < floor.generation || memoryDigest(this.doc.controls) !== memoryDigest(floor.controls)) throw new Error('Creator memory rollback/control mismatch; existing data preserved. Recover with current creator controls.')
  }
  private writeAtomic(file: string, bytes: string) {
    const temp = `${file}.${randomUUID()}.tmp`
    try { fs.writeFileSync(temp, bytes, { mode: 0o600 }); fs.renameSync(temp, file) }
    finally { fs.rmSync(temp, { force: true }) }
  }
  private mutate<T>(action: (doc: CreatorMemoryDocument) => T): T {
    this.assertControlFloor()
    if (this.diskDigest !== null && (!fs.existsSync(this.file) || digest(fs.readFileSync(this.file, 'utf8')) !== this.diskDigest)) throw new Error('Creator memory changed on disk; reopen with fresh state. Nothing changed.')
    const next = structuredClone(this.doc), result = action(next)
    next.revision++
    retainMemory(next)
    validateMemory(next)
    const bytes = JSON.stringify(next)
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    if (this.sourceBytes) {
      const backup = path.join(this.directory, `creator-style.v1.${next.migration!.sourceSha256}.backup`)
      if (!fs.existsSync(backup)) this.writeAtomic(backup, this.sourceBytes)
      if (fs.readFileSync(backup, 'utf8') !== this.sourceBytes) throw new Error('Migration backup checksum mismatch; existing file preserved')
    }
    const floor = path.join(this.directory, 'creator-style-control-floor.json')
    if (!fs.existsSync(floor) || next.generation !== this.doc.generation || memoryDigest(next.controls) !== memoryDigest(this.doc.controls)) {
      // Restrictive creator intent survives a failed commit or rollback. If the
      // following write fails, recall fails closed until explicit recovery.
      this.writeAtomic(floor, JSON.stringify({ schema: 2, generation: next.generation, controls: next.controls, knowledge: protectedKnowledge(next) }))
    }
    const knowledgeChanged = memoryDigest(next.preferences) !== memoryDigest(this.doc.preferences) || memoryDigest(next.controls) !== memoryDigest(this.doc.controls)
    this.writeAtomic(this.file, bytes)
    this.doc = next
    this.diskDigest = digest(bytes); this.sourceBytes = null
    // One bounded recovery checkpoint, never an accumulating raw-event archive.
    try { if (knowledgeChanged || next.revision % 128 === 0 || !fs.existsSync(path.join(this.directory,'creator-style.last-good.json'))) this.writeAtomic(path.join(this.directory, 'creator-style.last-good.json'), bytes) }
    catch { this.captureWarning = 'Memory committed; recovery checkpoint unavailable. Existing checkpoint preserved.' }
    return result
  }
  binding(projectId: string): CreatorBinding { return { ...(this.doc.bindings[projectId] ?? { creatorId: 'local' }) } }
  sessionKey(projectId: string): string { return `${this.binding(projectId).creatorId}:${this.doc.generation}` }
  private creator(binding: CreatorBinding) {
    const creator = this.doc.creators.find(c => c.id === binding.creatorId)
    if (!creator) throw new Error('Unknown creator')
    return creator
  }
  private enabled(projectId: string) { const binding = this.binding(projectId); return this.creator(binding).enabled && binding.learningEnabled !== false }
  private relevantScope(scope: StyleScope, projectId: string) {
    return scope.kind === 'creator' || scope.kind === 'project' && scope.id === projectId || scope.kind === 'series' && scope.id === this.binding(projectId).seriesId
  }
  private relevantEvidence(e: CreatorEvidence, projectId: string) {
    const binding = this.binding(projectId)
    const historic=this.doc.capsules.some(c=>c.samples.some(s=>s.id===e.id)&&c.version!==this.doc.preferences.find(p=>p.id===c.preferenceId)?.version)
    const current=this.doc.capsules.some(c=>c.samples.some(s=>s.id===e.id)&&c.version===this.doc.preferences.find(p=>p.id===c.preferenceId)?.version)
    const liveClaim=!e.claims?.length||e.claims.some(v=>this.doc.preferences.some(p=>p.id===v.preferenceId&&p.version===v.version&&creatorPreferenceIsLive(this.doc,binding.creatorId,p.id)))
    return liveClaim && (!historic || current || this.doc.evidence.some(raw=>raw.id===e.id&&!raw.claims?.length)) && !e.suppressed && !this.doc.controls.some(c => c.creatorId === binding.creatorId && (c.evidenceIds.includes(e.id) || e.claims?.some(v=>v.preferenceId===c.id || c.aliases.includes(v.preferenceId)))) && (e.kind !== 'explicit_instruction' || this.doc.preferences.some(p => p.support.includes(e.id) && !['disabled','superseded'].includes(p.status))) && e.creatorId === binding.creatorId && (e.scope ? this.relevantScope(e.scope, projectId) : !e.seriesId || e.seriesId === binding.seriesId) && (e.kind !== 'reference' || e.data.intent === 'persistent' || e.projectId === projectId)
  }
  home(base: string, projectId: string): string {
    const creatorId = this.binding(projectId).creatorId
    return creatorId === 'local' ? base : path.join(base, 'creators', digest(creatorId).slice(0, 32))
  }
  view(projectId: string): CreatorStyleView {
    const binding = this.binding(projectId)
    return structuredClone({ binding, creators: this.doc.creators, preferences: this.doc.preferences.filter(p => p.creatorId === binding.creatorId), evidence: this.doc.evidence.filter(e => e.creatorId === binding.creatorId), context: this.context(projectId), generation: this.doc.generation, revision: this.doc.revision, capsules: this.doc.capsules.filter(c => c.creatorId === binding.creatorId), retention: this.doc.stats[binding.creatorId], captureWarning: this.captureWarning })
  }
  context(projectId: string, request = ''): string {
    this.assertControlFloor()
    if (!this.enabled(projectId)) return ''
    return this.selection(projectId,request).context
  }
  private selection(projectId:string,request='') { return selectCreatorMemory(this.doc,projectId,request,e=>this.relevantEvidence(e,projectId)) }
  user(projectId: string, args: Record<string, unknown>): CreatorStyleView {
    const action = clean(args.action, 'action', 40), binding = this.binding(projectId)
    if (action === 'view') return this.view(projectId)
    this.mutate(doc => {
      if (action !== 'create_creator') doc.generation++ // Do not resume recalled style the creator changed/forgot.
      if (action === 'create_creator') {
        doc.creators.push({ id: randomUUID(), label: clean(args.label, 'label', 100), enabled: true }); return
      }
      if (action === 'bind') {
        const creatorId = clean(args.creatorId, 'creatorId', 100)
        if (!doc.creators.some(c => c.id === creatorId)) throw new Error('Unknown creator')
        doc.bindings[projectId] = { creatorId, ...(binding.learningEnabled === false ? { learningEnabled: false } : {}), ...(typeof args.seriesId === 'string' && args.seriesId.trim() ? { seriesId: clean(args.seriesId, 'seriesId', 100) } : {}) }; return
      }
      if (action === 'project_enable') {
        if (typeof args.enabled !== 'boolean') throw new Error('enabled must be boolean')
        doc.bindings[projectId] = { ...binding, learningEnabled: args.enabled }; return
      }
      const creator = doc.creators.find(c => c.id === binding.creatorId)!
      if (action === 'enable') { if (typeof args.enabled !== 'boolean') throw new Error('enabled must be boolean'); creator.enabled = args.enabled; return }
      if (action === 'reset') {
        for (const p of doc.preferences.filter(p => p.creatorId === creator.id)) this.control(doc, p, 'forgotten')
        doc.preferences = doc.preferences.filter(p => p.creatorId !== creator.id); doc.evidence = doc.evidence.filter(e => e.creatorId !== creator.id); doc.proposals = doc.proposals.filter(p => p.creatorId !== creator.id); delete doc.stats[creator.id]; return
      }
      if (action === 'explicit') {
        const at = new Date().toISOString(), hypothesis = clean(args.text, 'preference')
        const scope=scopeFor(args.scope,projectId,binding),dimension=typeof args.dimension==='string'?clean(args.dimension,'dimension',80):'editorial'
        if(doc.preferences.some(p=>p.creatorId===creator.id && p.origin==='explicit' && p.status==='active' && preferenceKey(p)===preferenceKey({scope,hypothesis,dimension,origin:'explicit'})))return
        const evidence: CreatorEvidence = { id: randomUUID(), creatorId: creator.id, projectId, seriesId: binding.seriesId, scope: scopeFor(args.scope, projectId, binding), at, kind: 'explicit_instruction', authority: 'creator_statement', data: { quote: hypothesis } }
        doc.evidence.push(evidence)
        doc.preferences.push({ id: randomUUID(), creatorId: creator.id, scope: scopeFor(args.scope, projectId, binding), dimension: typeof args.dimension === 'string' ? clean(args.dimension, 'dimension', 80) : 'editorial', hypothesis, origin: 'explicit', status: 'active', support: [evidence.id], counterexamples: [], confidence: 'explicit', firstObserved: at, updated: at, version: 1, approved: true, history: [], aliases: [], lineageFilter: filterAdd(emptyFilter(), controlKey(scopeFor(args.scope, projectId, binding), hypothesis)) }); return
      }
      if (action === 'remove_evidence') {
        const id = clean(args.id, 'id', 100)
        if (![...doc.evidence,...doc.capsules.flatMap(c=>c.samples)].some(e => e.id === id && e.creatorId === creator.id)) throw new Error('Evidence does not belong to this creator')
        for(const p of doc.preferences)if(p.creatorId===creator.id && [p,...p.history!].some(v=>v.support.includes(id)||v.counterexamples.includes(id))){
          this.control(doc,p,'disabled');p.status='disabled'
          for(const v of [p,...p.history!]){v.support=v.support.filter(e=>e!==id);v.counterexamples=v.counterexamples.filter(e=>e!==id)}
        }
        doc.evidence=doc.evidence.filter(e=>e.id!==id)
        for(const c of doc.capsules)if(c.creatorId===creator.id){c.samples=c.samples.filter(e=>e.id!==id);c.omittedSamples=c.observations-c.samples.length}
        return
      }
      const preference = doc.preferences.find(p => p.id === args.id && p.creatorId === creator.id)
      if (!preference) throw new Error('Preference does not belong to this creator')
      if (action === 'remove') {
        this.control(doc, preference, 'forgotten')
        for (const e of doc.evidence) if (preference.support.includes(e.id) || preference.counterexamples.includes(e.id)) { e.suppressed = true; e.suppressedBy = [...new Set([...(e.suppressedBy ?? []), preference.id])] }
        doc.preferences = doc.preferences.filter(p => p !== preference); return
      }
      if (action === 'approve' || action === 'revise') {
        if (args.text !== undefined && clean(args.text, 'preference') !== preference.hypothesis) this.newVersion(preference, clean(args.text, 'preference'), preference.dimension, preference.scope)
        preference.approved = true
        if (action === 'revise') {
          for (const e of doc.evidence) if (preference.support.includes(e.id) && e.kind === 'explicit_instruction') e.suppressed = true
          const at = new Date().toISOString(), id = randomUUID()
          doc.evidence.push({ id, creatorId: creator.id, projectId, seriesId: binding.seriesId, scope: preference.scope, at, kind: 'explicit_instruction', authority: 'creator_statement', data: { quote: preference.hypothesis, revises: preference.id } })
          preference.support.push(id); preference.origin = 'explicit'; preference.confidence = 'explicit'
        }
        preference.status = action==='revise' && doc.controls.some(c=>c.id===preference.id&&c.kind==='disabled') ? 'disabled' : 'active'
        if(preference.status==='disabled')this.control(doc,preference,'disabled')
        if (action === 'approve') {
          doc.controls = doc.controls.filter(c => c.id !== preference.id || c.kind !== 'disabled')
          for (const e of doc.evidence) if (preference.support.includes(e.id)) { e.suppressedBy = e.suppressedBy?.filter(id => id !== preference.id); if (!e.suppressedBy?.length && !doc.controls.some(c => c.kind === 'forgotten' && c.evidenceIds.includes(e.id))) e.suppressed = false }
          const at = new Date().toISOString(), id = randomUUID()
          doc.evidence.push({ id, creatorId: creator.id, projectId, seriesId: binding.seriesId, scope: preference.scope, at, kind: 'explicit_instruction', authority: 'creator_statement', data: { quote: preference.hypothesis, approvalOf: preference.id } })
          preference.support.push(id); preference.confidence = 'explicit'
        }
      } else if (action === 'disable') {
        this.control(doc, preference, 'disabled')
        preference.status = 'disabled'
        for (const e of doc.evidence) if (preference.support.includes(e.id) || preference.counterexamples.includes(e.id)) { e.suppressed = true; e.suppressedBy = [...new Set([...(e.suppressedBy ?? []), preference.id])] }
      }
      else throw new Error('Unsupported creator action')
      preference.updated = new Date().toISOString()
    })
    return this.view(projectId)
  }
  /** Only foreground Hermes interprets correction evidence. No edit operation is generated. */
  agent(projectId: string, args: Record<string, unknown>) {
    const response = () => {
      this.assertControlFloor()
      const enabled=this.enabled(projectId),selected=this.selection(projectId,typeof args.request==='string'?args.request.slice(0,1000):'')
      return {binding:this.binding(projectId),generation:this.doc.generation,revision:this.doc.revision,context:enabled?selected.context:'',
        preferences:enabled?selected.payload.preferences.map(p=>({id:p.id,version:p.version,status:p.status,scope:p.scope})):[],
        evidence:enabled?selected.payload.recent_evidence.map(e=>({id:e.id,kind:e.kind,authority:e.authority,projectId:e.projectId})):[],
        omitted_evidence:enabled?selected.payload.omitted_evidence:0,omitted_preferences:enabled?selected.payload.omitted_preferences:0,
        omitted_creator_instructions:enabled?selected.payload.omitted_creator_instructions:0,retention:this.doc.stats[this.binding(projectId).creatorId]}
    }
    if (args.action === 'context') return response()
    const binding = this.binding(projectId)
    if (!this.enabled(projectId)) throw new Error('Creator learning is disabled')
    if(args.action==='preferences'){
      if(args.expected_revision!==this.doc.revision || args.creator_id!==binding.creatorId)throw Error('Fresh creator/revision required for pagination')
      const cursor=Number(args.cursor??0)
      if(!Number.isSafeInteger(cursor)||cursor<0)throw Error('Invalid cursor')
      const all=this.selection(projectId,String(args.request??'')).all,items=all.slice(cursor,cursor+8)
      return {...response(),preferences:items.map(p=>({id:p.id,version:p.version,status:p.status,scope:p.scope,hypothesis:p.hypothesis})),next_cursor:cursor+8<all.length?cursor+8:null}
    }
    if(args.action==='preference'){
      const p=this.selection(projectId).all.find(p=>p.id===args.id)
      if(!p)throw Error('Unknown, controlled or inapplicable preference')
      return {...response(),preference:structuredClone({...p,history:undefined,lineageFilter:undefined}),capsules:this.doc.capsules.filter(c=>c.preferenceId===p.id&&c.version===p.version).map(c=>structuredClone({...c,seenFilter:undefined}))}
    }
    if (args.action === 'evidence') {
      const evidence = [...this.doc.evidence,...this.doc.capsules.flatMap(c=>c.samples)].find(e => e.id === args.id && this.relevantEvidence(e, projectId))
      if (!evidence) throw new Error('Unknown or cross-creator evidence')
      return { ...response(), evidence: [structuredClone(evidence)] }
    }
    if (args.creator_id !== binding.creatorId) throw new Error('Unknown or cross-creator memory identity; retrieve current context')
    const repeat = args.action === 'maintenance' && this.doc.maintenance?.find(r=>r.creatorId===binding.creatorId && r.id===args.request_id && r.digest===digest(args.operations))
    if (!repeat && args.expected_revision !== this.doc.revision) throw new Error('Stale memory revision; retrieve current context. Nothing changed.')
    if(args.action === 'maintenance') {
      const operations=args.operations
      if(!Array.isArray(operations)||operations.length<1||operations.length>8)throw Error('Maintenance requires 1–8 explicit foreground operations')
      const requestId=clean(args.request_id,'request_id',80), requestHash=digest(operations)
      const receipt=this.doc.maintenance?.find(r=>r.creatorId===binding.creatorId && r.id===requestId)
      if(receipt){if(receipt.digest!==requestHash)throw Error('Idempotency key reused with different operations');return {...response(),maintenance:receipt,replayed:true}}
      this.mutate(doc=>{
        for(const operation of operations){
          if(!operation||typeof operation!=='object'||Array.isArray(operation))throw Error('Invalid maintenance operation')
          this.applyAgentOperation(doc,projectId,binding,operation)
        }
        doc.maintenance=[...doc.maintenance??[],{id:requestId,creatorId:binding.creatorId,digest:requestHash,revision:doc.revision+1,operations:operations.length,at:new Date().toISOString()}]
      })
    } else this.mutate(doc=>this.applyAgentOperation(doc,projectId,binding,args))
    return response()
  }
  private applyAgentOperation(doc:CreatorMemoryDocument, projectId:string, binding:CreatorBinding, args:Record<string,any>) {
      if(!['hypothesis','counterexample','link','exception','consolidate','supersede'].includes(String(args.action)))throw Error('Invalid foreground maintenance operation')
      if(['consolidate','supersede'].includes(String(args.action)))clean(args.reason,'semantic reason',600)
      const ids = args.evidence_ids
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 12 || !ids.every(id => typeof id === 'string')) throw new Error('Supply 1–12 actual evidence_ids')
      const evidence = ids.map(id => {
        const e = [...doc.evidence,...doc.capsules.flatMap(c=>c.samples)].find(e => e.id === id && this.relevantEvidence(e, projectId))
        if (!e) throw new Error('Unknown or cross-creator evidence')
        return e
      })
      let preference = doc.preferences.find(p => p.id === args.id && p.creatorId === binding.creatorId)
      if (args.id && !preference) throw new Error('Unknown/forgotten preference; creator controls cannot be bypassed')
      if (preference && (args.expected_version !== preference.version || !this.relevantScope(preference.scope, projectId))) throw new Error('Stale preference version or wrong scope; retrieve current evidence')
      if (preference?.status === 'disabled' || preference && doc.controls.some(c => c.id === preference!.id || c.aliases.includes(preference!.id))) throw new Error('Preference is disabled/forgotten; only creator controls may re-enable it')
      if(preference && !creatorPreferenceIsLive(doc,binding.creatorId,preference.id))throw Error('Preference has a controlled/stale dependency; reground memory')
      const at = new Date().toISOString()
      if (['hypothesis','exception','consolidate','supersede','link'].includes(String(args.action))) {
        if (args.id && !preference) throw new Error('Unknown preference')
        if (args.action!=='link' && preference && (preference.approved || preference.origin === 'explicit' || preference.status === 'active')) throw new Error('Do not overwrite an explicit/approved creator preference; propose a separate candidate or attach a counterexample')
        const linking=args.action==='link'
        if(linking && !preference)throw Error('Link requires an existing candidate')
        if(linking && (args.scope && digest(scopeFor(args.scope,projectId,binding))!==digest(preference!.scope) || args.applicability!==undefined || args.exception_to!==undefined))throw Error('Link attaches facts only; it cannot revise meaning/scope or creator-approved knowledge')
        const hypothesis = linking ? preference!.hypothesis : clean(args.hypothesis, 'hypothesis'), dimension = linking ? preference!.dimension : clean(args.dimension, 'dimension', 80)
        const applicability=args.applicability===undefined ? preference?.applicability : clean(args.applicability,'applicability',400)
        const exceptionTo=args.exception_to===undefined ? preference?.exceptionTo : clean(args.exception_to,'exception_to',100)
        const exceptionVersion=args.exception_version===undefined?preference?.exceptionVersion:Number(args.exception_version)
        if(args.action==='exception' && (!applicability||!exceptionTo))throw Error('Exception requires explicit applicability and an existing base preference')
        if(exceptionTo && !doc.preferences.some(p=>p.id===exceptionTo&&p.version===exceptionVersion&&p.creatorId===binding.creatorId&&this.relevantScope(p.scope,projectId)&&!['disabled','superseded'].includes(p.status)))throw Error('Unknown, controlled or cross-creator exception base')
        const scope = !linking && args.scope ? scopeFor(args.scope, projectId, binding) : preference?.scope ?? scopeFor(undefined, projectId, binding)
        if (!linking && doc.controls.some(c => c.creatorId === binding.creatorId && filterHas(c.keyFilter, controlKey(scope, hypothesis)))) throw new Error('Controlled/forgotten wording; only the creator may restore it')
        if (!evidence.every(e => this.evidenceFitsScope(e, scope))) throw new Error('Evidence scope does not support the requested preference scope')
        if(!preference)preference=doc.preferences.find(p=>p.creatorId===binding.creatorId && preferenceKey(p)===preferenceKey({scope,hypothesis,dimension,origin:'inferred',applicability,exceptionTo,exceptionVersion}))
        if(preference && (args.action!=='link' && preference.approved || preference.status==='disabled'))throw Error('Protected preference cannot be overwritten')
        if (!preference) {
          preference = { id: randomUUID(), creatorId: binding.creatorId, scope, dimension, hypothesis, origin: 'inferred', status: 'candidate', support: [], counterexamples: [], confidence: 'tentative', firstObserved: at, updated: at, version: 1, approved: false, history: [], aliases: [], applicability, exceptionTo, exceptionVersion, lineageFilter: filterAdd(emptyFilter(), controlKey(scope, hypothesis)) }
          doc.preferences.push(preference)
        } else { if (hypothesis !== preference.hypothesis || dimension !== preference.dimension || digest(scope) !== digest(preference.scope) || applicability !== preference.applicability || exceptionTo !== preference.exceptionTo || exceptionVersion !== preference.exceptionVersion) this.newVersion(preference, hypothesis, dimension, scope); if(!linking)preference.status = 'candidate' }
        preference.applicability=applicability;preference.exceptionTo=exceptionTo;preference.exceptionVersion=exceptionVersion
        preference.support = [...new Set([...preference.support, ...ids])]
        if(args.action==='consolidate'||args.action==='supersede'){
          if(!Array.isArray(args.source_preferences)||!args.source_preferences.length||args.source_preferences.length>8)throw Error('Select 1–8 source candidate IDs and versions')
          const sourceIds=new Set<string>()
          for(const ref of args.source_preferences){
            const old=doc.preferences.find(p=>p.id===ref.id && p.creatorId===binding.creatorId)
            if(!old || old.id===preference.id || old.version!==ref.expected_version || old.approved || old.status==='disabled' || digest(old.scope)!==digest(preference.scope))throw Error('Invalid/stale/protected or differently scoped consolidation source')
            if(old.counterexamples.some(id=>!Array.isArray(args.counterexample_ids)||!args.counterexample_ids.includes(id)))throw Error('Consolidation must explicitly preserve retained counterexamples')
            const oldCaps=doc.capsules.filter(c=>c.preferenceId===old.id&&c.version===old.version)
            preference.consolidation=[...preference.consolidation??[],{id:old.id,version:old.version!,hypothesis:old.hypothesis,reason:clean(args.reason,'reason',600),observations:oldCaps.filter(c=>c.role==='support').reduce((n,c)=>n+c.observations,0),counterexamples:oldCaps.filter(c=>c.role==='counterexample').reduce((n,c)=>n+c.observations,0),omittedSamples:oldCaps.reduce((n,c)=>n+c.omittedSamples,0)}].slice(-8)
            sourceIds.add(old.id);preference.aliases=[...new Set([...preference.aliases!,old.id,...old.aliases!])]
            preference.lineageFilter=filterUnion(preference.lineageFilter!,old.lineageFilter!)
          }
          doc.preferences=doc.preferences.filter(p=>!sourceIds.has(p.id))
          for(const id of (args.counterexample_ids as string[]|undefined)??[]){
            const e=[...doc.evidence,...doc.capsules.flatMap(c=>c.samples)].find(e=>e.id===id&&this.relevantEvidence(e,projectId))
            if(!e||!this.evidenceFitsScope(e,preference.scope))throw Error('Invalid consolidation counterexample')
            preference.counterexamples=[...new Set([...preference.counterexamples,id])]
          }
        }
      } else if (args.action === 'counterexample' && preference) {
        if (!evidence.every(e => this.evidenceFitsScope(e, preference!.scope))) throw new Error('Evidence scope does not support the current preference')
        preference.counterexamples = [...new Set([...preference.counterexamples, ...ids])]; preference.status = 'disputed'
      } else throw new Error('Hermes may context, hypothesis or counterexample; creator controls explicit approval and bindings')
      preference.confidence = preference.approved || preference.origin === 'explicit' ? 'explicit' : 'tentative'
      preference.updated = at
  }
  private evidenceFitsScope(e: CreatorEvidence, scope: StyleScope) {
    if (scope.kind === 'project') return e.projectId === scope.id && (!e.scope || e.scope.kind !== 'series' || e.scope.id === e.seriesId)
    if (scope.kind === 'series') return e.seriesId === scope.id || e.scope?.kind === 'series' && e.scope.id === scope.id
    return !e.scope || e.scope.kind === 'creator' // Project instructions cannot silently become global taste.
  }
  private newVersion(p: CreatorPreference, hypothesis: string, dimension: string, scope: StyleScope) {
    p.history!.push({ version: p.version!, hypothesis: p.hypothesis, dimension: p.dimension, scope: p.scope, support: [...p.support], counterexamples: [...p.counterexamples], updated: p.updated, applicability:p.applicability, exceptionTo:p.exceptionTo, exceptionVersion:p.exceptionVersion })
    p.version!++; p.hypothesis = hypothesis; p.dimension = dimension; p.scope = scope
    p.support = []; p.counterexamples = []
    p.lineageFilter = filterAdd(p.lineageFilter!, controlKey(scope, hypothesis))
  }
  private control(doc: CreatorMemoryDocument, p: CreatorPreference, kind: 'disabled' | 'forgotten') {
    doc.controls = doc.controls.filter(c => c.id !== p.id)
    doc.controls.push({ id: p.id, creatorId: p.creatorId, scope: p.scope, kind, aliases: p.aliases!, keyFilter: p.lineageFilter!, evidenceIds: [...new Set([...p.support, ...p.counterexamples,...p.history!.flatMap(v=>[...v.support,...v.counterexamples])])], at: new Date().toISOString() })
  }
  observe(change: ChangeEvent, before: Project): void {
    try { this.observeChange(change, before) }
    catch (error) {
      this.captureWarning = `Some correction evidence could not be recorded: ${error instanceof Error ? error.message : String(error)}`
      throw error // Existing actor subscriber isolation preserves the timeline commit.
    }
  }
  private observeChange(change: ChangeEvent, before: Project): void {
    const after = change.new_snapshot
    if (before.project_id !== after.project_id || change.summary === 'Replaced project state') return // new/load is not feedback
    const binding = this.binding(after.project_id)
    if (!this.enabled(after.project_id)) return
    const old = layers(before), next = layers(after)
    const beforeStructure = structure(before), afterStructure = structure(after), structureChanged = digest(beforeStructure) !== digest(afterStructure)
    const changed = [...new Set([...old.keys(), ...next.keys()])].filter(id => digest(old.get(id) ?? null) !== digest(next.get(id) ?? null))
    if (!changed.length && !structureChanged) return
    this.mutate(doc => {
      if (change.actor.kind === 'Agent') {
        for (const layerId of changed) {
          doc.proposals = doc.proposals.filter(p => !(p.creatorId === binding.creatorId && p.projectId === after.project_id && p.layerId === layerId))
          doc.proposals.push({ creatorId: binding.creatorId, projectId: after.project_id, layerId, opId: change.op_id, valueHash: digest(next.get(layerId) ?? null) })
        }
        return // retention applies the bound independently to each creator
      }
      if (change.summary === 'Redo') return
      const id = change.op_id
      if (doc.evidence.some(e => e.id === id || (e.data.operationIds as string[] | undefined)?.includes(id))) return
      const restoration = change.summary === 'Undo' || change.summary.startsWith('Restored checkpoint') || change.summary === 'Jump to history entry'
      const deltas = changed.slice(0, 8).map(layerId => ({ layerId, properties: changedProperties(old.get(layerId) ?? null, next.get(layerId) ?? null),
        before: JSON.stringify(old.get(layerId) ?? null).slice(0, 2000), after: JSON.stringify(next.get(layerId) ?? null).slice(0, 2000),
        beforeTruncated: JSON.stringify(old.get(layerId) ?? null).length > 2000, afterTruncated: JSON.stringify(next.get(layerId) ?? null).length > 2000,
        proposalOpId: doc.proposals.find(p => p.creatorId === binding.creatorId && p.projectId === after.project_id && p.layerId === layerId && p.valueHash === digest(old.get(layerId) ?? null))?.opId ?? null,
      }))
      const linked = deltas.some(d => d.proposalOpId !== null)
      const evidence: CreatorEvidence = { id, creatorId: binding.creatorId, projectId: after.project_id, seriesId: binding.seriesId, at: change.timestamp, kind: restoration ? 'undo' : linked ? 'correction' : 'manual_edit', authority: 'ProjectActor', data: { actor: change.actor, opId: change.op_id, operationIds:[change.op_id], operationCount:1, relationship: restoration ? 'ambiguous_restoration' : linked ? 'ai_proposal_correction' : 'independent_manual_edit', summary: change.summary, beforeState: digest(before), afterState: digest(after), deltas, ...(structureChanged ? { structureBefore: JSON.stringify(beforeStructure).slice(0, 2000), structureAfter: JSON.stringify(afterStructure).slice(0, 2000) } : {}), omittedLayers: Math.max(0, changed.length - deltas.length), intention: 'unknown; may be experiment or project-specific repair' } }
      const previous = doc.evidence.at(-1)
      const used = !!previous && (!!previous.claims?.length || doc.preferences.some(p => p.support.includes(previous.id) || p.counterexamples.includes(previous.id)))
      if (canGroupAdjustments(previous, evidence, used)) {
        const prior = previous!.data.deltas as typeof deltas
        const firstObserved = previous!.data.firstObserved ?? previous!.at
        evidence.data.deltas = deltas.map(d => ({ ...d, before: prior.find(p => p.layerId === d.layerId)!.before, beforeTruncated: prior.find(p => p.layerId === d.layerId)!.beforeTruncated, proposalOpId: prior.find(p => p.layerId === d.layerId)!.proposalOpId ?? d.proposalOpId }))
        evidence.data.relationship = previous!.data.relationship
        previous!.at = evidence.at
        previous!.data = { ...evidence.data, beforeState: previous!.data.beforeState, firstObserved, operationCount: Number(previous!.data.operationCount ?? 1) + 1, operationIds: [...(previous!.data.operationIds as string[] ?? [previous!.id]), change.op_id].slice(-8), sequence: 'Adjacent same-property commits; not proof of a single gesture or intent' }
        statsFor(doc,binding.creatorId).groupedOperations++
      } else { doc.evidence.push(evidence); statsFor(doc,binding.creatorId).admittedObservations++ }
    })
  }
  reference(projectId: string, data: Record<string, unknown>): CreatorStyleView {
    const binding = this.binding(projectId)
    if (!this.enabled(projectId)) throw new Error('Creator learning is disabled')
    if (!['own_finished', 'external_inspiration'].includes(String(data.relationship)) || !['project', 'persistent'].includes(String(data.intent))) throw new Error('Reference relationship and intended scope required')
    this.mutate(doc => {doc.evidence.push({ id: randomUUID(), creatorId: binding.creatorId, projectId, seriesId: binding.seriesId, at: new Date().toISOString(), kind: 'reference', authority: 'source_metadata_and_local_observations', data });statsFor(doc,binding.creatorId).admittedObservations++})
    return this.view(projectId)
  }
}
