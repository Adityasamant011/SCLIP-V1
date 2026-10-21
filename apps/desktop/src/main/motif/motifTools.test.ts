import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { UserMotifStore } from './store'
import { composeMotifHtml, type Manifest } from '../../shared/motifs/catalog'
import { runMotifTool, type MotifToolDeps } from './motifTools'
import type { BuiltinMotif, MotifLayerRef } from './authoring'

function m(name: string, id = 'ignored'): Manifest {
  return { id, name, version: 1, size: [100, 100], default_duration_s: 1, fonts: [], props_schema: {} }
}
function doc(man: Manifest, body = 'x'): string {
  return composeMotifHtml(man, `<head></head><body>${body}<script>motif.define({setup(){}})</script></body>`)
}

let store: UserMotifStore
let emitted: number
let refreshed: number
let rebinds: unknown[][]
let layers: MotifLayerRef[]
let logs: string[]
let deps: MotifToolDeps
const BUILTINS: BuiltinMotif[] = [{ id: 'countdown', manifest: m('Countdown', 'countdown'), html: doc(m('Countdown', 'countdown'), 'CD'), hasParamsUi: false }]

beforeEach(() => {
  store = new UserMotifStore(mkdtempSync(path.join(tmpdir(), 'motiftools-')))
  emitted = 0; refreshed = 0; rebinds = []; layers = []; logs = []
  deps = {
    store, builtins: BUILTINS,
    motifLayers: () => layers,
    dispatchRebind: (u) => { rebinds.push(u) },
    emitChanged: () => { emitted++ },
    refreshCatalog: () => { refreshed++ },
    readFile: (p) => { throw new Error('unexpected readFile ' + p) },
    emitLog: (e) => { logs.push(e.message) },
  }
})

describe('runMotifTool', () => {
  it('creates a recipe draft from short grounded values without echoing HTML, preserving editable defaults', () => {
    const id = runMotifTool('write_hyperframes_draft', { recipe: 'process', width: 640, height: 360, duration_s: 5, props: { title: 'A real workflow', step_1: 'Inspect', step_2: 'Edit', step_3: 'Review', second_at: 1.7, third_at: 3 } }, deps) as string
    const draft = store.getDraft(id)!
    expect(draft.manifest.size).toEqual([640, 360])
    expect(draft.manifest.props_schema.title.default).toBe('A real workflow')
    expect(draft.html).toContain('process-marker')
    expect(draft.html).toContain('seekFrame')
    expect(emitted).toBe(1)
  })
  it('repairs the observed nested manifest/recipe wire encodings while preserving text and validators',()=>{
    const id=runMotifTool('write_hyperframes_draft',{recipe:'process',width:640,height:360,duration_s:5,props:{title:'001',second_at:'1.5',third_at:'3'}},deps) as string
    expect(store.getDraft(id)!.manifest.props_schema.second_at.default).toBe(1.5)
    expect(store.getDraft(id)!.manifest.props_schema.title.default).toBe('001')
    const custom=runMotifTool('write_hyperframes_draft',{manifest:{name:'Wire fixture',size:{item:['320','180']},default_duration_s:'2',props_schema:{title:{type:'string',default:'001',max_length:'80',multiline:'true'},step:{type:'number',default:'1.5',min:'0',max:'2'},motion:{type:'enum',default:'standard',options:{item:{item:['standard','reduced']}}}}},html:'<div data-composition-id="wire"></div><script>window.__timelines.wire=gsap.timeline({paused:true}).to({}, {duration:2});</script>'},deps) as string
    const m=store.getDraft(custom)!.manifest
    expect(m.size).toEqual([320,180]);expect(m.props_schema.title).toMatchObject({default:'001',max_length:80,multiline:true})
    expect(m.props_schema.step.default).toBe(1.5);expect((m.props_schema.motion as any).options).toEqual(['standard','reduced'])
    expect(()=>runMotifTool('write_hyperframes_draft',{recipe:'process',props:{second_at:'1px'}},deps)).toThrow('number')
  })
  it('rejects ambiguous source modes, invented props and reversed beats without creating a draft', () => {
    for (const args of [{ recipe: 'process', html: 'x' }, { recipe: 'process', props: { invented: 1 } }, { recipe: 'process', props: { second_at: 3, third_at: 2 } }]) {
      expect(() => runMotifTool('write_hyperframes_draft', args, deps)).toThrow()
    }
    expect(store.listDraftIds()).toEqual([]); expect(emitted).toBe(0)
  })
  it('reads recipe source without creating drafts, emitting changes or editing the actor', () => {
    const before = store.listDraftIds()
    const result = runMotifTool('get_hyperframes_recipe', { recipe: 'comparison', aspect: 'portrait' }, deps) as { manifest: Manifest; html: string }
    expect(result.manifest.size).toEqual([720, 1280])
    const id = runMotifTool('write_hyperframes_draft', { manifest: result.manifest, html: result.html }, deps) as string
    expect(store.getDraft(id)?.html).toContain('seekFrame')
    expect(store.listDraftIds()).toHaveLength(before.length + 1)
    expect(emitted).toBe(1); expect(refreshed).toBe(1); expect(rebinds).toEqual([])
  })
  it('creates a HyperFrames draft with normalized identity and keeps caller arguments unchanged', () => {
    const args = { manifest: { name: 'Graphic', size: [100, 100], default_duration_s: 1, props_schema: {} },
      html: '<div data-composition-id="intro"></div><script>window.__timelines.intro=gsap.timeline({paused:true}).to({}, {duration:1});</script>' }
    const before = JSON.stringify(args)
    const id = runMotifTool('write_hyperframes_draft', args, deps) as string
    expect(store.getDraft(id)?.html).toContain('seekFrame')
    expect(JSON.stringify(args)).toBe(before)
    expect(emitted).toBe(1)
  })
  it('list_motifs returns the full payload with html', () => {
    const out = runMotifTool('list_motifs', {}, deps) as Record<string, unknown>[]
    expect(out.find((e) => e.id === 'countdown')!.status).toBe('builtin')
    expect(typeof out[0].html).toBe('string')
  })

  it('get_motif_source reads an id (renderer arg shape { id })', () => {
    const out = runMotifTool('get_motif_source', { id: 'countdown' }, deps) as { manifest: Manifest }
    expect(out.manifest.id).toBe('countdown')
  })

  it('write_motif_draft unwraps the renderer { args: { manifest, html } } shape, emits + refreshes', () => {
    const id = runMotifTool('write_motif_draft', { args: { manifest: m('Foo'), html: '<head></head><body>B</body>' } }, deps) as string
    expect(store.getDraft(id)).not.toBeNull()
    expect(emitted).toBe(1); expect(refreshed).toBe(1)
  })

  it('write_motif_draft also accepts the MCP flat { manifest, html, from } shape', () => {
    const id = runMotifTool('write_motif_draft', { manifest: m('Foo'), html: '<head></head><body>B</body>', from: 'countdown' }, deps) as string
    expect(store.readDraftTarget(id)).toBe('countdown')
  })

  it('amend_motif_draft uses camelCase { draftId, source }', () => {
    store.writeDraft('d1', doc(m('D', 'd1'), 'one'))
    runMotifTool('amend_motif_draft', { draftId: 'd1', source: doc(m('D', 'hacker'), 'TWO') }, deps)
    expect(store.getDraft('d1')!.html).toContain('TWO')
    expect(emitted).toBe(1)
  })

  it('create_edit_draft uses camelCase { sourceId }', () => {
    const id = runMotifTool('create_edit_draft', { sourceId: 'countdown' }, deps) as string
    expect(store.getDraft(id)).not.toBeNull(); expect(emitted).toBe(1)
  })

  it('import_motif reads the file then mints a draft', () => {
    deps.readFile = vi.fn(() => doc(m('Imported', 'x'), 'IMP'))
    const id = runMotifTool('import_motif', { path: '/some/file.html' }, deps) as string
    expect(store.getDraft(id)!.html).toContain('IMP'); expect(emitted).toBe(1)
  })

  it('delete_motif removes a published motif and emits', () => {
    store.writeDraft('foo', doc(m('Foo', 'foo'))); store.installDraft('foo', 'foo')
    runMotifTool('delete_motif', { id: 'foo' }, deps)
    expect(store.getMotif('foo')).toBeNull(); expect(emitted).toBe(1)
  })

  it('install_motif (New) publishes, returns id, no rebind dispatched', () => {
    store.writeDraft('foo', doc(m('Foo', 'foo')))
    const id = runMotifTool('install_motif', { args: { draft_id: 'foo', mode: { kind: 'new' } } }, deps) as string
    expect(id).toBe('foo'); expect(rebinds).toEqual([]); expect(emitted).toBe(1); expect(refreshed).toBe(1)
  })

  it('install_motif (Update) dispatches the rebind built from the live layers', () => {
    store.writeDraft('foo', doc(m('Foo', 'foo'))); store.installDraft('foo', 'foo')
    store.writeDraft('wip', doc(m('Foo', 'wip')))
    layers = [{ layerId: 'la', motifId: 'wip', version: 1, props: {} }]
    const id = runMotifTool('install_motif', { args: { draft_id: 'wip', mode: { kind: 'update', target_id: 'foo' } } }, deps) as string
    expect(id).toBe('foo')
    expect(rebinds.length).toBe(1)
    expect((rebinds[0] as any[])[0]).toMatchObject({ layer_id: 'la', motif_id: 'foo', motif_version: 2 })
  })

  it('install_motif accepts the MCP flat string mode "new"', () => {
    store.writeDraft('foo', doc(m('Foo', 'foo')))
    const id = runMotifTool('install_motif', { draft_id: 'foo', mode: 'new' }, deps) as string
    expect(id).toBe('foo')
  })

  it('throws on an unhandled tool', () => {
    expect(() => runMotifTool('nope', {}, deps)).toThrow(/unhandled tool/)
  })

  it('motif_staleness_report returns [] when nothing is stale', () => {
    const v2 = { ...m('Foo', 'foo'), version: 2 }
    store.writeDraft('foo', doc(v2)); store.installDraft('foo', 'foo')
    layers = [{ layerId: 'la', motifId: 'foo', version: 2, props: {} }]
    expect(runMotifTool('motif_staleness_report', {}, deps)).toEqual([])
    expect(logs).toEqual([])
  })

  it('motif_staleness_report rows a v1 layer against a v2 published motif + logs a warn', () => {
    const v2 = { ...m('Foo', 'foo'), version: 2 }
    store.writeDraft('foo', doc(v2)); store.installDraft('foo', 'foo')
    layers = [{ layerId: 'la', motifId: 'foo', version: 1, props: { a: 1 } }]
    const report = runMotifTool('motif_staleness_report', {}, deps)
    expect(report).toEqual([{ motif_id: 'foo', name: 'Foo', placed_version: 1, current_version: 2, layer_count: 1 }])
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('foo v1→v2')
  })

  it('acknowledge_motif_staleness dispatches a rebind for stale layers, returns the count, refreshes', () => {
    const v2 = { ...m('Foo', 'foo'), version: 2 }
    store.writeDraft('foo', doc(v2)); store.installDraft('foo', 'foo')
    layers = [{ layerId: 'la', motifId: 'foo', version: 1, props: { a: 1 } }]
    const count = runMotifTool('acknowledge_motif_staleness', {}, deps) as number
    expect(count).toBe(1)
    expect(rebinds.length).toBe(1)
    expect((rebinds[0] as any[])[0]).toMatchObject({ layer_id: 'la', motif_id: 'foo', motif_version: 2, props: { a: 1 } })
    expect(refreshed).toBe(1)
  })

  it('acknowledge_motif_staleness returns 0 + dispatches nothing when nothing is stale', () => {
    const v2 = { ...m('Foo', 'foo'), version: 2 }
    store.writeDraft('foo', doc(v2)); store.installDraft('foo', 'foo')
    layers = [{ layerId: 'la', motifId: 'foo', version: 2, props: {} }]
    expect(runMotifTool('acknowledge_motif_staleness', {}, deps)).toBe(0)
    expect(rebinds).toEqual([])
    expect(refreshed).toBe(1)   // refresh is unconditional (cheap, idempotent)
  })
})
