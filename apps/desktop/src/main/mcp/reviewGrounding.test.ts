import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { videoClipParams } from '../state/mutations/media'
import { createActor } from '../state/actor'
import { blankProject } from '../state/model'
import { uuidV7Gen } from '../state/ids'
import { handleCallTool } from './server'
import { startMcpHost } from './index'
import { startAutonomousReview } from '../sclip/autonomousReview'
import { timelineTime, reviewState } from '../sclip/evidenceCoordinates'
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('./auth', () => ({ loadOrInitAuth: () => ({ token: 'synthetic-token', port: 0 }), saveAuth: () => {}, rotateToken: (a: unknown) => a }))
const analyze = vi.hoisted(() => vi.fn(async () => ({ ok: true, description: 'Synthetic observation', confidence: 0.5 })))
vi.mock('../sclip/visionRuntime', () => ({ getVisionRuntime: () => ({ analyze, clearCache: () => {} }) }))
function fixture(visual = false) {
  const ids = uuidV7Gen()
  let actor = createActor({ initial: blankProject(ids, 'synthetic-review'), idGen: ids, clock: () => 'now' })
  const mediaId = '00000000-0000-0000-0000-000000000001'
  actor.dispatch('add_media', { id: mediaId, kind: 'Video', duration_us: 600_000_000 })
  const track = actor.snapshot().compositions[actor.snapshot().root_id]!.tracks[0]!.id
  const layer = actor.dispatch('add_layer', { track, kind: 'color', t_start_us: 0, t_end_us: 60_000_000 })
  if (!layer.ok) throw new Error('fixture failed')
  if (visual) { const copy = structuredClone(actor.snapshot()); copy.compositions[copy.root_id]!.tracks[0]!.layers[0]!.params = videoClipParams(mediaId, 0, 60_000_000); actor = createActor({ initial: copy, idGen: ids, clock: () => 'now' }) }
  const ts = { actor, mcpCall: (name: string, args: string) => actor.mcpCall(name, args) } as any
  const backend = { mcpCatalog: async () => '{"tools":[],"resources":[]}', mcpCallTool: vi.fn(async () => '{"ok":true,"result":{"content":[{"type":"text","text":"{}"}]}}'),
    mcpReadResource: vi.fn(async () => JSON.stringify({ ok: true, result: { contents: [{ uri: 'synthetic', mimeType: 'image/jpeg', blob: Buffer.from('synthetic frame').toString('base64') }] } })) } as any
  return { actor, mediaId, layerId: layer.value as string, ts, backend }
}
const body = (r: any) => JSON.parse(r.content[0].text)
describe('Evidence coordinates', () => {
  it('accepts timeline 20s in a 60s edit with current timeline provenance', async () => {
    const { ts, backend } = fixture()
    const execute = vi.fn(async (_code: string) => ({ pngBase64: Buffer.from('frame').toString('base64'), tUs: 20_000_000 }))
    const result: any = await handleCallTool(backend, () => ts, 'vision_inspect', { timeline_t_us: 20_000_000, question: 'Describe' }, undefined, undefined, undefined,
      () => ({ isDestroyed: () => false, webContents: { executeJavaScript: execute } } as any))
    expect(result.isError).not.toBe(true)
    expect(body(result)).toMatchObject({ coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', timeline_t_us: 20_000_000 })
    expect(execute.mock.calls[0]![0]).toContain('captureFrameAt(20000000')
  })
  it('rejects timeline 200s before compositor or vision runs, without clamping', async () => {
    const { ts, backend } = fixture()
    analyze.mockClear()
    const execute = vi.fn()
    const result: any = await handleCallTool(backend, () => ts, 'vision_inspect', { timeline_t_us: 200_000_000, question: 'Describe' }, undefined, undefined, undefined,
      () => ({ isDestroyed: () => false, webContents: { executeJavaScript: execute } } as any))
    expect(result.isError).toBe(true)
    expect(body(result)).toMatchObject({ code: 'INVALID_EVIDENCE_COORDINATE', coordinate_space: 'timeline', requested_t_us: 200_000_000, duration_us: 60_000_000 })
    expect(execute).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled()
  })
  it('accepts source 200s in 600s media through the existing source-frame resource', async () => {
    const { ts, backend, mediaId } = fixture()
    const result: any = await handleCallTool(backend, () => ts, 'vision_inspect', { media_id: mediaId, source_t_us: 200_000_000, question: 'Describe' })
    expect(body(result)).toMatchObject({ coordinate_space: 'source', evidence_origin: 'SOURCE_MEDIA', source_t_us: 200_000_000, media_id: mediaId })
    expect(backend.mcpReadResource.mock.calls[0]![0]).toBe(`media://${mediaId}/frame/200000000`)
  })
  it('refuses conflicting aliases and ignores proxy bookkeeping for state freshness', () => {
    expect(() => timelineTime({ timeline_t_us: 20, t_us: 200 })).toThrow('CONFLICTING_TIME_ARGUMENTS')
    expect(timelineTime({ t_us: 20 })).toBe(20)
    const { actor, layerId, mediaId } = fixture(); const before = reviewState(actor.snapshot()); const copy = structuredClone(actor.snapshot())
    copy.media_pool[mediaId]!.decode_route = { ...copy.media_pool[mediaId]!.decode_route, quick_proxy: 'proxy' } as any
    expect(reviewState(copy)).toBe(before)
    actor.mcpCall('trim_layer', JSON.stringify({ layer_id: layerId, edge: 'out', new_t_us: 50_000_000 }))
    expect(reviewState(actor.snapshot())).not.toBe(before)
  })
})
async function reviewFixture(activeWindow?: any, visual = false) {
  const f = fixture(visual); const host = await startMcpHost(f.backend, { getTsHost: () => f.ts, getActiveWindow: () => activeWindow ?? null })
  const started = await startAutonomousReview(host.getInfo(), f.actor.snapshot().project_id);
  expect(started.editorial_evidence_packet).toMatchObject({identity:{project_id:f.actor.snapshot().project_id},evidence_receipt:{id:'p0',modalities:['timeline','text']}});
  const clients: Client[] = []
  async function connect() {
    const client = new Client({ name: 'synthetic-reviewer', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(started.url), { requestInit: { headers: { Authorization: `Bearer ${host.getInfo().bearer_token}` } } }))
    clients.push(client); return client
  }
  const client = await connect()
  return { ...f, host, connect, call: async (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<any>,
    async close() { for (const c of clients) await c.close(); await host.close() } }
}
function diagnosis(f: ReturnType<typeof fixture>, evidenceId: string) {
  return { version: 1, summary: 'Synthetic requested endpoint is 50s; current endpoint is 60s', clip_count: 0,
    inspections: [{ id: 'observed', evidence_id: evidenceId, type: 'section', timeline_range_us: [40_000_000, 60_000_000], method: 'context_only', evidence: 'Authoritative current endpoint', assessment: 'bad', reason: 'Requested endpoint differs', clip_ids: [f.layerId] }],
    identified_issues: [{ id: 'tail', severity: 'moderate', timeline_t_us: 50_000_000, affected_range_us: [40_000_000, 60_000_000], issue_type: 'other', description: 'Extra tail relative to synthetic brief', suggestion: 'Reviewer chooses trim' }], ready_for_next_stage: false }
}
describe('Product autonomous review lifecycle', () => {
  it('starts automatically, survives reconnects, reaches decision, and permits no repair', async () => {
    const f = await reviewFixture()
    try {
      expect(body(await f.call('revision_control', { action: 'status' })).workflow_stage).toBe('DIAGNOSING')
      for (let i = 0; i < 4; i++) expect((await f.call('get_timeline_context')).isError).not.toBe(true)
      const second = await f.connect(); const status: any = await second.callTool({ name: 'revision_control', arguments: { action: 'status' } })
      expect(body(status).workflow_stage).toBe('READY_TO_DECIDE')
      expect((await f.call('calculate_video_fit', { layer_id: f.layerId, mode: 'cover' })).isError).toBe(true)
      expect(body(await f.call('revision_control', { action: 'conclude_no_repair', evidence_id: 'e4', reason: 'Synthetic reviewer judges no justified creative repair' })).workflow_stage).toBe('COMPLETE')
      expect((await f.call('trim_layer', { layer_id: f.layerId, edge: 'out', new_t_us: 50_000_000 })).isError).toBe(true)
    } finally { await f.close() }
  })
  it('permits a reviewer-chosen grounded mutation and requires current verification', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context')
      expect(body(await f.call('validate_rough_cut_review', { review: diagnosis(f, 'invented') })).valid).toBe(false)
      expect(body(await f.call('validate_rough_cut_review', { review: diagnosis(f, 'e1') })).valid).toBe(true)
      await f.call('checkpoint', { label: 'Synthetic review' }); await f.call('revision_control', { action: 'select_issue', issue_id: 'tail' })
      expect((await f.call('trim_layer', { layer_id: f.layerId, edge: 'out', new_t_us: 50_000_000 })).isError).not.toBe(true)
      expect((await f.call('revision_control', { action: 'finish_issue', status: 'resolved' })).isError).toBe(true)
      await f.call('get_timeline_context')
      expect((await f.call('revision_control', { action: 'finish_issue', status: 'resolved' })).isError).not.toBe(true)
      expect(f.actor.snapshot().compositions[f.actor.snapshot().root_id]!.duration_us).toBe(50_000_000)
    } finally { await f.close() }
  })
  it('blocks stale selection/receipts until current evidence and a new diagnosis', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context'); await f.call('validate_rough_cut_review', { review: diagnosis(f, 'e1') }); await f.call('checkpoint', { label: 'Synthetic review' })
      const change = f.actor.mcpCall('update_layer_params', JSON.stringify({ layer_id: f.layerId, patch: { kind: 'Color', color: { r: 30, g: 0, b: 0, a: 255 } } }))
      expect(change.ok).toBe(true)
      expect((await f.call('revision_control', { action: 'select_issue', issue_id: 'tail' })).isError).toBe(true)
      expect(body(await f.call('validate_rough_cut_review', { review: diagnosis(f, 'e1') })).valid).toBe(false)
      // Before selection, repair-phase extra inspection requires regrounding.
      await f.call('revision_control', { action: 'reground', reason: 'Concurrent edit' })
      await f.call('get_timeline_context')
      expect(body(await f.call('validate_rough_cut_review', { review: diagnosis(f, 'e2') })).valid).toBe(true)
      await f.call('checkpoint', { label: 'Fresh review' })
      expect((await f.call('revision_control', { action: 'select_issue', issue_id: 'tail' })).isError).not.toBe(true)
      f.actor.mcpCall('update_layer_params', JSON.stringify({ layer_id: f.layerId, patch: { kind: 'Color', color: { r: 60, g: 0, b: 0, a: 255 } } }))
      expect((await f.call('trim_layer', { layer_id: f.layerId, edge: 'out', new_t_us: 50_000_000 })).isError).toBe(true)
    } finally { await f.close() }
  })
})

const simpleIssue = (f: Awaited<ReturnType<typeof reviewFixture>>, receipts = ['e1']) => ({ description: 'Synthetic brief requests a shorter endpoint', severity: 'moderate', repairable: true, evidence_dimensions:['timeline'], evidence_receipt_ids: receipts, layer_ids: [f.layerId] })
describe('Executable editorial issue interface', () => {
  it('accepts a flat issue and derives current layer bounds and state bookkeeping', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context')
      const r = body(await f.call('record_issue', simpleIssue(f)))
      expect(r).toMatchObject({ accepted: true, issue: { id: 'issue-1', affected_range_us: [0, 60_000_000], evidence_receipt_ids: ['e1'], repairable: true } })
      expect(r.review_session.workflow_stage).toBe('REPAIRING')
    } finally { await f.close() }
  })
  it('returns missing fields with a concise correction and accepts a corrected submission', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context')
      const { evidence_receipt_ids: _ids, ...bad } = simpleIssue(f)
      const r = await f.call('record_issue', { ...bad, evidence_id: 'e1' })
      expect(r.isError).toBe(true)
      expect(body(r)).toMatchObject({ code: 'INVALID_ISSUE', fields: ['evidence_receipt_ids'] })
      expect(body(r).correction).toContain('flat record_issue')
      expect(body(await f.call('record_issue', simpleIssue(f))).accepted).toBe(true)
    } finally { await f.close() }
  })
  it('blocks contradictory no-repair decisions until explicit evidence-backed withdrawal', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context'); await f.call('record_issue', simpleIssue(f))
      const cleanLegacy = { ...diagnosis(f, 'e1'), identified_issues: [] }
      expect(body(await f.call('validate_rough_cut_review', { review: cleanLegacy })).valid).toBe(true)
      expect((await f.call('revision_control', { action: 'finalize' })).isError).toBe(true)
      await f.call('revision_control', { action: 'select_issue', issue_id: 'issue-1' })
      const conclude = { action: 'conclude_no_repair', evidence_id: 'e1', reason: 'Reviewer prefers no edit' }
      expect(body(await f.call('revision_control', conclude)).code).toBe('ACTIVE_REPAIRABLE_ISSUES')
      expect((await f.call('withdraw_issue', { issue_id: 'issue-1', reason: '', evidence_receipt_ids: ['e1'] })).isError).toBe(true)
      expect((await f.call('withdraw_issue', { issue_id: 'issue-1', reason: 'Reviewer reconsiders brief', evidence_receipt_ids: ['invented'] })).isError).toBe(true)
      expect(body(await f.call('withdraw_issue', { issue_id: 'issue-1', reason: 'Reviewer judges current duration intentional after reconsidering brief', evidence_receipt_ids: ['e1'] })).accepted).toBe(true)
      expect(body(await f.call('revision_control', conclude)).workflow_stage).toBe('COMPLETE')
    } finally { await f.close() }
  })
  it('selects, checkpoints, mutates ProjectActor, reinspects, verifies and completes', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context'); await f.call('record_issue', simpleIssue(f))
      expect((await f.call('revision_control', { action: 'select_issue', issue_id: 'issue-1' })).isError).not.toBe(true)
      const trim = { layer_id: f.layerId, edge: 'out', new_t_us: 50_000_000 }
      expect((await f.call('trim_layer', trim)).isError).toBe(true)
      await f.call('checkpoint', { label: 'Reviewer selected endpoint repair' })
      expect((await f.call('trim_layer', trim)).isError).not.toBe(true)
      expect(f.actor.snapshot().compositions[f.actor.snapshot().root_id]!.duration_us).toBe(50_000_000)
      expect((await f.call('revision_control', { action: 'finish_issue', status: 'resolved' })).isError).toBe(true)
      expect((await f.call('withdraw_issue', { issue_id: 'issue-1', reason: 'Reconsider', evidence_receipt_ids: ['e1'] })).isError).toBe(true)
      await f.call('get_timeline_context', { start_us: 40_000_000, end_us: 50_000_000 })
      expect((await f.call('revision_control', { action: 'finish_issue', status: 'resolved' })).isError).not.toBe(true)
      expect(body(await f.call('revision_control', { action: 'complete' })).workflow_stage).toBe('COMPLETE')
    } finally { await f.close() }
  })
  it('preserves stale receipt and mutation blocking in the simplified protocol', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context'); await f.call('record_issue', simpleIssue(f)); await f.call('checkpoint', { label: 'Review' })
      await f.call('revision_control', { action: 'select_issue', issue_id: 'issue-1' })
      f.actor.mcpCall('update_layer_params', JSON.stringify({ layer_id: f.layerId, patch: { kind: 'Color', color: { r: 90, g: 0, b: 0, a: 255 } } }))
      expect((await f.call('trim_layer', { layer_id: f.layerId, edge: 'out', new_t_us: 50_000_000 })).isError).toBe(true)
      expect(body(await f.call('withdraw_issue', { issue_id: 'issue-1', reason: 'Changed externally', evidence_receipt_ids: ['e1'] })).code).toBe('STALE_OR_UNKNOWN_EVIDENCE')
      await f.call('get_timeline_context')
      expect(body(await f.call('withdraw_issue', { issue_id: 'issue-1', reason: 'New state changes editorial judgment', evidence_receipt_ids: ['e2'] })).accepted).toBe(true)
    } finally { await f.close() }
  })
  it('rejects source-only or unrelated receipts and permits consistent non-repairable judgments', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_media_context', { media_id: f.mediaId })
      expect(body(await f.call('record_issue', simpleIssue(f))).code).toBe('CURRENT_TIMELINE_EVIDENCE_REQUIRED')
      await f.call('get_timeline_context', { start_us: 0, end_us: 10_000_000 })
      expect(body(await f.call('record_issue', { ...simpleIssue(f, ['e2']), affected_range_us: [40_000_000, 60_000_000] })).code).toBe('EVIDENCE_RANGE_MISMATCH')
      expect(body(await f.call('record_issue', { ...simpleIssue(f, ['e2']), repairable: false })).accepted).toBe(true)
      expect(body(await f.call('revision_control', { action: 'conclude_no_repair', evidence_id: 'e2', reason: 'Reviewer judges optional polish unjustified' })).workflow_stage).toBe('COMPLETE')
    } finally { await f.close() }
  })
})

describe('Visual repair state correctness', () => {
  it('reports identical quantized parameter updates without history or subscription mutations', () => {
    const f = fixture(true); const before = f.actor.snapshot(); const events = vi.fn(); f.actor.subscribe(events)
    const layer = before.compositions[before.root_id]!.tracks[0]!.layers[0]!
    const current = (layer.params as any).transform.position.x.value
    const result: any = f.actor.mcpCall('update_layer_params', JSON.stringify({ layer_id: f.layerId, patch: { kind: 'VideoClip', x: current } }))
    expect(result.ok).toBe(true)
    expect(JSON.parse(result.result.content[0].text)).toMatchObject({ code: 'NO_EFFECTIVE_CHANGE', layer_id: f.layerId, state_unchanged: true })
    expect(f.actor.snapshot()).toBe(before); expect(events).not.toHaveBeenCalled()
    const changed = f.actor.mcpCall('update_layer_params', JSON.stringify({ layer_id: f.layerId, patch: { kind: 'VideoClip', x: current + 10 } }))
    expect(changed.ok).toBe(true); expect(f.actor.snapshot()).not.toBe(before); expect(events).toHaveBeenCalledTimes(1)
  })
  it('requires fresh rendered evidence after a visual issue mutation, not a context-only read', async () => {
    const execute = vi.fn(async (code: string) => ({ pngBase64: Buffer.from('synthetic image').toString('base64'), tUs: Number(code.match(/captureFrameAt\((\d+)/)![1]), factualEvidence: { content: 'Synthetic wall', canvas_coverage: 'full' } }))
    const f = await reviewFixture({ isDestroyed: () => false, webContents: { executeJavaScript: execute } }, true)
    try {
      const range = { start_us: 0, end_us: 60_000_000, representative_samples: 3 }
      expect((await f.call('inspect_timeline_range_visuals', range)).isError).not.toBe(true)
      await f.call('record_issue', {...simpleIssue(f),evidence_dimensions:['visual']}); await f.call('checkpoint', { label: 'Reviewer choice' }); await f.call('revision_control', { action: 'select_issue', issue_id: 'issue-1' })
      expect((await f.call('update_layer_params', { layer_id: f.layerId, patch: { kind: 'VideoClip', x: 10 } })).isError).not.toBe(true)
      expect((await f.call('get_timeline_context')).isError).not.toBe(true)
      expect((await f.call('revision_control', { action: 'finish_issue', status: 'resolved' })).isError).toBe(true)
      expect((await f.call('inspect_timeline_range_visuals', range)).isError).not.toBe(true)
      expect((await f.call('revision_control', { action: 'finish_issue', status: 'resolved' })).isError).not.toBe(true)
      expect(execute.mock.calls.filter(c=>c[0].includes('captureFrameAt('))).toHaveLength(6)
    } finally { await f.close() }
  })
})

describe('Atomic repair transaction review boundary', () => {
  it('publishes all members before requiring one fresh verification, then permits Hermes to resolve', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context')
      await f.call('record_issue', simpleIssue(f))
      await f.call('checkpoint', { label: 'Hermes repair' })
      await f.call('revision_control', { action: 'select_issue', issue_id: 'issue-1' })
      const version = () => createHash('sha256').update(reviewState(f.actor.snapshot())).digest('hex')
      const events: any[]=[];f.actor.subscribe(e=>events.push(e))
      const operations = [
        {kind:'update_layer',layer_id:f.layerId,patch:{t_end_us:50_000_000}},
        {kind:'update_layer_params',layer_id:f.layerId,patch:{kind:'Color',color:{r:30,g:40,b:50,a:255}}},
      ]
      const result = await f.call('apply_repair_transaction', { expected_state_version:version(),reason:'Hermes chose a coordinated repair',operations })
      expect(result.isError).not.toBe(true);expect(body(result).operations).toHaveLength(2);expect(events).toHaveLength(1)
      expect(body(await f.call('revision_control',{action:'status'})).verification_pending).toBe(true)
      expect((await f.call('revision_control',{action:'finish_issue',status:'resolved'})).isError).toBe(true)
      expect((await f.call('apply_repair_transaction',{expected_state_version:version(),reason:'Another repair',operations})).isError).toBe(true)
      await f.call('get_timeline_context')
      expect(body(await f.call('revision_control',{action:'status'})).verification_pending).toBe(false)
      expect((await f.call('revision_control',{action:'finish_issue',status:'resolved'})).isError).not.toBe(true)
    } finally { await f.close() }
  })
  it('a rejected batch neither mutates nor starts verification; Hermes may submit a legal alternative', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context');await f.call('record_issue',simpleIssue(f))
      await f.call('checkpoint',{label:'Hermes repair'});await f.call('revision_control',{action:'select_issue',issue_id:'issue-1'})
      const version=createHash('sha256').update(reviewState(f.actor.snapshot())).digest('hex'), before=f.actor.snapshot()
      const first={kind:'update_layer',layer_id:f.layerId,patch:{t_end_us:50_000_000}}
      expect((await f.call('apply_repair_transaction',{expected_state_version:version,reason:'Hermes repair',operations:[first,{...first,patch:{t_end_us:-1}}]})).isError).toBe(true)
      expect(f.actor.snapshot()).toBe(before)
      expect(body(await f.call('revision_control',{action:'status'})).verification_pending).toBe(false)
      expect((await f.call('apply_repair_transaction',{expected_state_version:version,reason:'Hermes legal alternative',operations:[first]})).isError).not.toBe(true)
    } finally { await f.close() }
  })
})

describe('ProjectActor restore and review lifecycle stay coherent', () => {
  for (const atomic of [false, true]) it(`${atomic ? 'transaction' : 'single edit'} restore invalidates receipts and permits a different repair`, async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context'); await f.call('record_issue', simpleIssue(f))
      const checkpoint = (await f.call('checkpoint', {label:'Reviewer rollback point'})).content[0].text
      const original = f.actor.snapshot()
      await f.call('revision_control', {action:'select_issue',issue_id:'issue-1'})
      const operations = [{kind:'update_layer',layer_id:f.layerId,patch:{t_end_us:43_000_000}},
        {kind:'update_layer_params',layer_id:f.layerId,patch:{kind:'Color',color:{r:27,g:91,b:62,a:255}}}]
      const edit = atomic ? await f.call('apply_repair_transaction', {
        expected_state_version:createHash('sha256').update(reviewState(original)).digest('hex'),reason:'Reviewer selected coordinated changes',operations,
      }) : await f.call('trim_layer',{layer_id:f.layerId,edge:'out',new_t_us:43_000_000})
      expect(edit.isError).not.toBe(true)
      await f.call('get_timeline_context')
      expect((await f.call('restore_checkpoint',{checkpoint_id:checkpoint})).isError).not.toBe(true)
      expect(f.actor.snapshot()).toEqual(original)
      const status = body(await f.call('revision_control',{action:'status'}))
      expect(status.active_issue).toBe('issue-1');expect(status.outcomes).toEqual({})
      expect(status.verification_pending).toBe(false);expect(status.evidence_ids).toEqual([])
      expect(status.last_rollback.invalidated_evidence_ids).toContain('e2')
      expect((await f.call('withdraw_issue',{issue_id:'issue-1',reason:'Reconsidered',evidence_receipt_ids:['e2']})).isError).toBe(true)
      expect((await f.call('revision_control',{action:'finish_issue',status:'resolved'})).isError).toBe(true)
      await f.call('checkpoint',{label:'Alternative repair'})
      expect((await f.call('trim_layer',{layer_id:f.layerId,edge:'out',new_t_us:57_000_000})).isError).toBe(true)
      expect((await f.call('get_timeline_context')).isError).not.toBe(true)
      expect((await f.call('trim_layer',{layer_id:f.layerId,edge:'out',new_t_us:57_000_000})).isError).not.toBe(true)
      await f.call('get_timeline_context')
      expect((await f.call('revision_control',{action:'finish_issue',status:'resolved'})).isError).not.toBe(true)
    } finally { await f.close() }
  })
  it('only a successful restore clears pending verification; unresolved finish then works', async () => {
    const f = await reviewFixture()
    try {
      await f.call('get_timeline_context');await f.call('record_issue',simpleIssue(f))
      const checkpoint=(await f.call('checkpoint',{label:'Restore point'})).content[0].text
      const original=f.actor.snapshot()
      await f.call('revision_control',{action:'select_issue',issue_id:'issue-1'})
      await f.call('trim_layer',{layer_id:f.layerId,edge:'out',new_t_us:41_000_000})
      const changed=f.actor.snapshot()
      expect((await f.call('restore_checkpoint',{checkpoint_id:'00000000-0000-0000-0000-000000000077'})).isError).toBe(true)
      expect(f.actor.snapshot()).toBe(changed)
      expect(body(await f.call('revision_control',{action:'status'})).verification_pending).toBe(true)
      expect((await f.call('restore_checkpoint',{checkpoint_id:checkpoint})).isError).not.toBe(true)
      expect(f.actor.snapshot()).toEqual(original)
      expect((await f.call('revision_control',{action:'finish_issue',status:'unresolved'})).isError).not.toBe(true)
      expect(body(await f.call('revision_control',{action:'complete'})).workflow_stage).toBe('COMPLETE')
    } finally { await f.close() }
  })
})
