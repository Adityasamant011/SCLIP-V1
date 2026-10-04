import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
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
function fixture() {
  const ids = uuidV7Gen()
  const actor = createActor({ initial: blankProject(ids, 'synthetic-review'), idGen: ids, clock: () => 'now' })
  const mediaId = '00000000-0000-0000-0000-000000000001'
  actor.dispatch('add_media', { id: mediaId, kind: 'Video', duration_us: 600_000_000 })
  const track = actor.snapshot().compositions[actor.snapshot().root_id]!.tracks[0]!.id
  const layer = actor.dispatch('add_layer', { track, kind: 'color', t_start_us: 0, t_end_us: 60_000_000 })
  if (!layer.ok) throw new Error('fixture failed')
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
async function reviewFixture() {
  const f = fixture(); const host = await startMcpHost(f.backend, { getTsHost: () => f.ts })
  const started = await startAutonomousReview(host.getInfo(), f.actor.snapshot().project_id); const clients: Client[] = []
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
