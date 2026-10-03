import { describe, expect, it } from 'vitest'
import { handleCallTool, registeredMcpTools } from '../mcp/server.js'

describe('source observation MCP integration', () => {
  it('advertises and routes bounded source evidence without entering the edit path', async () => {
    const media = { id: 'm1', path_abs: '/tmp/source.mp4', kind: 'Video', metadata: { duration_us: 1_000_000 } }
    const index = { retrieve: async () => ({
      status: 'available', media_id: 'm1', source_hash: 'h', analysis_version: 1,
      source_duration_us: 1_000_000, verified_metadata: { width: null, height: null, kind: 'Video' },
      observations: [{ source_t_us: 500_000, kind: 'visual', description: 'A slide is visible.', model: 'test', evidence: 'model_observation', sample_window_us: [0, 1_000_000] }],
      audio: { status: 'not_generated', reason: 'semantic_audio_model_not_integrated' }, cached: true,
    }) }
    const tsHost = { actor: { snapshot: () => ({ media_pool: { m1: media } }) } } as never
    const backend = {} as never
    const catalog = await registeredMcpTools({ mcpCatalog: async () => JSON.stringify({ tools: [] }) } as never, { sourceObservationIndex: index as never })
    expect(catalog.some((tool) => tool.name === 'get_source_observations')).toBe(true)
    const result = await handleCallTool(backend, () => tsHost, 'get_source_observations', { media_id: 'm1', start_us: 0, end_us: 1_000_000 }, undefined, undefined, undefined, undefined, undefined, index as never)
    expect('isError' in result && result.isError).toBeFalsy()
    if (!('content' in result)) throw new Error('MCP result did not contain content')
    const content = result.content as Array<{ type: string; text?: string }>
    const text = content.find((item) => item.type === 'text')
    if (!text?.text) throw new Error('MCP result did not contain JSON text')
    expect(JSON.parse(text.text).observations[0].source_t_us).toBe(500_000)
  })
})
