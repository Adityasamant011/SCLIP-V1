import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildMcpServer, handleCallTool, callClipComputeTool } from './server'
import { createActor } from '../state/actor'
import { blankProject } from '../state/model'
import { uuidV7Gen } from '../state/ids'

const mediaId = '00000000-0000-0000-0000-0000000000aa'
function setup(sourceStartUs = 0) {
  const ids = uuidV7Gen()
  const actor = createActor({ initial: blankProject(ids, 'source-test'), idGen: ids, clock: () => 'now' })
  actor.dispatch('add_media', { id: mediaId, kind: 'Video', duration_us: 575_000_000 })
  const track = actor.snapshot().compositions[actor.snapshot().root_id]!.tracks[0]!.id
  const added = actor.dispatch('add_layer', { track, kind: 'video', media: mediaId, src_in_us: sourceStartUs, src_out_us: 575_000_000, t_start_us: 0, t_end_us: 575_000_000 - sourceStartUs })
  if (!added.ok) throw new Error('fixture layer failed')
  return { actor, layerId: added.value as string }
}
const envelope = (body: unknown) => JSON.stringify({ ok: true, result: { content: [{ type: 'text', text: JSON.stringify(body) }] } })

describe('MCP transcript access and user-only export', () => {
  it('timeline opening reads bounded surrounding evidence through the production source-context route', async () => {
    const { actor, layerId } = setup(30_000_000)
    const spy = vi.fn(async (_name: string, _args: string) => envelope({ transcript: { status: 'available', segments: [
      { text: 'Here is the process.', t_start_us: 25_000_000, t_end_us: 29_000_000 },
      { text: 'The next stage begins.', t_start_us: 30_000_000, t_end_us: 34_000_000 },
    ] } }))
    const result: any = await handleCallTool({ mcpCallTool: spy } as any, () => ({ actor }) as any, 'get_timeline_context', {})
    const body = JSON.parse(result.content[0].text)
    expect(body.layer_counts_by_kind.VideoClip).toBe(1)
    expect(body.opening_context).toMatchObject({ layer_id: layerId, source_start_us: 30_000_000, status: 'available' })
    expect(body.opening_context.omitted_before[0].text).toBe('Here is the process.')
    expect(body.opening_context.selected_opening[0].text).toBe('The next stage begins.')
    expect(JSON.parse(spy.mock.calls[0]![1])).toMatchObject({ start_us: 20_000_000, end_us: 60_000_000, detail: 'range' })
  })
  it('can roll back only compact evidence without changing ordinary tools or source context', async () => {
    const backend = { mcpCatalog: async () => JSON.stringify({ tools: [], resources: [] }), mcpCallTool: vi.fn() } as any
    const server = buildMcpServer(backend, { compactSourceEvidence: false })
    const client = new Client({ name: 'test', version: '1' }, {})
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a); await client.connect(b)
    try {
      const tools = (await client.listTools()).tools
      expect((tools.find(t => t.name === 'get_media_context')!.inputSchema.properties as any).detail.enum).toEqual(['overview', 'range'])
      expect(tools.map(t => t.name)).toEqual(expect.arrayContaining(['vision_inspect', 'add_video_layer', 'get_timeline_context']))
      const result = await client.callTool({ name: 'get_media_context', arguments: { media_id: mediaId, detail: 'segments' } })
      expect(result.isError).toBe(true)
      expect(backend.mcpCallTool).not.toHaveBeenCalled()
    } finally { await client.close(); await server.close() }
  })
  it('segments preserves exact text/times/coverage while omitting word arrays and other modalities', async () => {
    const { actor } = setup()
    const full = { media: { id: mediaId }, range: { start_us: 0, end_us: 50_000_000 }, detail: 'range',
      transcript: { status: 'available', is_full_source: true, segments: [{ text: 'Exact source text.', t_start_us: 123, t_end_us: 456, words: Array(1000).fill({ text: 'word', t_start_us: 123, t_end_us: 456 }) }] }, shots: { segments: Array(100).fill('shot') } }
    const spy = vi.fn(async () => envelope(full))
    const compact: any = await handleCallTool({ mcpCallTool: spy } as any, () => ({ actor }) as any, 'get_media_context', { media_id: mediaId, detail: 'segments', end_us: 50_000_000 })
    const body = JSON.parse(compact.content[0].text)
    expect(body.transcript.segments).toEqual([{ text: 'Exact source text.', t_start_us: 123, t_end_us: 456 }])
    expect(body.transcript.status).toBe('available')
    expect(body.range).toEqual(full.range)
    expect(body.shots).toBeUndefined()
    expect(compact.content[0].text.length).toBeLessThan(JSON.stringify(full).length / 10)
    const detailed: any = await handleCallTool({ mcpCallTool: spy } as any, () => ({ actor }) as any, 'get_media_context', { media_id: mediaId, detail: 'range', end_us: 50_000_000 })
    expect(JSON.parse(detailed.content[0].text)).toMatchObject({ ...full, coordinate_space: 'source' })
  })
  it('time-bounded context requests select text/range even without detail', async () => {
    const { actor } = setup()
    const spy = vi.fn(async (_name: string, json: string) => envelope(JSON.parse(json)))
    const backend = { mcpCallTool: spy } as any
    const host = { actor } as any
    for (const start of [0, 180_000_000, 420_000_000]) {
      const result: any = await handleCallTool(backend, () => host, 'get_media_context', { media_id: mediaId, start_us: start, end_us: start + 60_000_000 })
      expect(JSON.parse(result.content[0].text)).toMatchObject({ detail: 'range', start_us: start, end_us: start + 60_000_000, media: { id: mediaId } })
    }
    await handleCallTool(backend, () => host, 'get_media_context', { media_id: mediaId })
    expect(JSON.parse(spy.mock.calls.at(-1)![1]).detail).toBe('overview')
    await handleCallTool(backend, () => host, 'get_media_context', { media_id: mediaId, start_us: 540_000_000 })
    expect(JSON.parse(spy.mock.calls.at(-1)![1]).end_us).toBe(575_000_000)
    await handleCallTool(backend, () => host, 'get_media_context', { media_id: mediaId, start_us: 0, end_us: 60_000_000, detail: 'overview' })
    expect(JSON.parse(spy.mock.calls.at(-1)![1]).detail).toBe('overview')
  })
  it.each([
    { start_us: -1, end_us: 1 }, { start_us: 0, end_us: 61_000_000 },
    { start_us: 4, end_us: 4 }, { start_us: '0', end_us: 50 },
    { start_us: 0, end_us: 50, detail: 'unknown' },
  ])('refuses invalid/unbounded range requests without reading the cache: %j', async args => {
    const { actor } = setup()
    const spy = vi.fn()
    await expect(handleCallTool({ mcpCallTool: spy } as any, () => ({ actor }) as any, 'get_media_context', { media_id: mediaId, ...args })).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
  })
  it('rejects a nested range instead of silently rereading the opening window, then accepts flat bounds', async () => {
    const { actor } = setup()
    const spy = vi.fn(async (_name: string, json: string) => envelope(JSON.parse(json)))
    const host = { actor } as any
    await expect(handleCallTool({ mcpCallTool: spy } as any, () => host, 'get_media_context', {
      media_id: mediaId, detail: 'segments', range: { start_us: 60_000_000, end_us: 120_000_000 },
    })).rejects.toThrow(/flat start_us and end_us/)
    expect(spy).not.toHaveBeenCalled()
    const corrected: any = await handleCallTool({ mcpCallTool: spy } as any, () => host, 'get_media_context', {
      media_id: mediaId, detail: 'segments', start_us: 60_000_000, end_us: 120_000_000,
    })
    expect(corrected.isError).not.toBe(true)
    expect(JSON.parse(spy.mock.calls[0]![1])).toMatchObject({ start_us: 60_000_000, end_us: 120_000_000 })
  })
  it('compacts long transcription for MCP only, leaving the shared UI compute result intact', async () => {
    const { actor, layerId } = setup()
    const full = { backend: 'whisper_cpp', segments: [{ text: 'synthetic words '.repeat(7000), t_start_us: 0, t_end_us: 575_000_000 }], srt: 'fixture', word_timing: 'Exact' }
    const spy = vi.fn(async () => envelope(full))
    const host = { actor } as any
    const result: any = await handleCallTool({ mcpCallTool: spy } as any, () => host, 'transcribe_clip', { layer_id: layerId })
    expect(JSON.parse(result.content[0].text)).toMatchObject({ status: 'available', backend: 'whisper_cpp', media_id: mediaId, response: 'cached_transcript_summary' })
    expect(result.content[0].text.length).toBeLessThan(2000)
    const ui: any = await callClipComputeTool({ mcpCallTool: spy } as any, host, 'transcribe_clip', { layer_id: layerId })
    expect(JSON.parse(ui.content[0].text)).toEqual(full)
    spy.mockResolvedValueOnce(envelope({ segments: [], srt: 'short' }))
    const short: any = await handleCallTool({ mcpCallTool: spy } as any, () => host, 'transcribe_clip', { layer_id: layerId })
    expect(JSON.parse(short.content[0].text).srt).toBe('short')
  })
  it('advertises accurate range semantics, keeps perception tools, and denies stale final export calls', async () => {
    const backend = { mcpCatalog: async () => JSON.stringify({ tools: [{ name: 'export_timeline' }], resources: [] }), mcpCallTool: vi.fn() } as any
    const server = buildMcpServer(backend)
    const client = new Client({ name: 'test', version: '1' }, {})
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    await client.connect(b)
    try {
      const tools = (await client.listTools()).tools
      expect(tools.map(t => t.name)).not.toContain('export_timeline')
      expect(tools.map(t => t.name)).toEqual(expect.arrayContaining(['vision_inspect', 'inspect_timeline_frame', 'render_timeline_range']))
      expect(tools.find(t => t.name === 'get_media_context')!.description).toContain('actual transcript')
      const result = await client.callTool({ name: 'export_timeline', arguments: {} })
      expect(result.isError).toBe(true)
      expect(JSON.stringify(result.content)).toContain('user-only')
      expect(backend.mcpCallTool).not.toHaveBeenCalled()
    } finally { await client.close(); await server.close() }
  })
  it('advertises/dispatches the optional read-only helper only when enabled', async () => {
    const backend = { mcpCatalog: async () => JSON.stringify({ tools: [], resources: [] }), mcpCallTool: vi.fn() } as any
    for (const enabled of [false, true]) {
      const evaluate = vi.fn(async () => ({ status: 'evaluated', passages: [] }))
      const server = buildMcpServer(backend, { evaluateSourcePassages: enabled ? evaluate : undefined })
      const client = new Client({ name: 'test', version: '1' }, {})
      const [a, b] = InMemoryTransport.createLinkedPair()
      await server.connect(a); await client.connect(b)
      try {
        const tools = (await client.listTools()).tools
        expect(tools.some(t => t.name === 'evaluate_source_passages')).toBe(enabled)
        // Discovery/normal connection never invokes the auxiliary model.
        expect(evaluate).not.toHaveBeenCalled()
        const result = await client.callTool({ name: 'evaluate_source_passages', arguments: { media_ids: [mediaId], request: 'Compare explanations' } })
        expect(result.isError === true).toBe(!enabled)
        expect(evaluate).toHaveBeenCalledTimes(enabled ? 1 : 0)
        expect(backend.mcpCallTool).not.toHaveBeenCalled()
      } finally { await client.close(); await server.close() }
    }
  })
})

it('reads a long cached transcript in one public call while keeping native reads bounded and exact',async()=>{
 const {actor}=setup()
 const spy=vi.fn(async (_name:string,json:string)=>{const a=JSON.parse(json);return envelope({media:{id:mediaId},range:{start_us:a.start_us,end_us:a.end_us},transcript:{status:'available',segments:[{text:'Exact text '+a.start_us,t_start_us:a.start_us,t_end_us:a.end_us}]}})})
 const before=actor.snapshot()
 const r:any=await handleCallTool({mcpCallTool:spy} as any,()=>({actor}) as any,'get_media_context',{media_id:mediaId,detail:'segments',start_us:0,end_us:180000000})
 expect(r.isError).not.toBe(true);const b=JSON.parse(r.content[0].text)
 expect(spy).toHaveBeenCalledTimes(3);expect(b.transcript.segments).toHaveLength(3)
 expect(b.range).toEqual({start_us:0,end_us:180000000});expect(b.coordinate_space).toBe('source')
 expect(b.detail_reference).toMatchObject({tool:'get_media_context',detail:'range',max_window_us:60000000})
 expect(actor.snapshot()).toBe(before)
})
