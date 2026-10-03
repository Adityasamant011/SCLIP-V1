import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildMcpServer, registeredMcpTools } from './server.js'

describe('SCLIP V1 External B-Roll Freeze & Feature Gate', () => {
  const fakeBackend = {
    mcpCatalog: async () => JSON.stringify({ tools: [], resources: [] }),
    mcpCallTool: async () => JSON.stringify({ ok: true, result: { content: [{ type: 'text', text: 'ok' }] } }),
  } as any

  it('by default in V1, external B-roll tools are hidden from tools/list', async () => {
    const tools = await registeredMcpTools(fakeBackend)
    const toolNames = tools.map((t) => t.name)

    expect(toolNames).not.toContain('video_search_external_media')
    expect(toolNames).not.toContain('resolve_visual_intents')
    expect(toolNames).not.toContain('import_external_media')

    // Standard user-media tools remain fully available
    expect(toolNames).toContain('calculate_video_fit')
    expect(toolNames).toContain('vision_inspect')
    expect(toolNames).toContain('get_timeline_critique')
    expect(toolNames).toContain('get_media_context')
  })

  it('rejects calls to external B-roll tools when disabled by default', async () => {
    const server = buildMcpServer(fakeBackend)
    const client = new Client({ name: 'hermes-v1-client', version: '1.0' }, {})
    const [t1, t2] = InMemoryTransport.createLinkedPair()
    await server.connect(t1)
    await client.connect(t2)

    try {
      const searchRes = await client.callTool({
        name: 'video_search_external_media',
        arguments: { query: 'tokyo timelapse' },
      })
      expect(searchRes.isError).toBe(true)
      expect((searchRes.content as any)[0].text).toContain('External B-roll discovery is disabled in Sclip V1')

      const resolveRes = await client.callTool({
        name: 'resolve_visual_intents',
        arguments: { intents: [{ subject: 'city skyline' }] },
      })
      expect(resolveRes.isError).toBe(true)
      expect((resolveRes.content as any)[0].text).toContain('External B-roll discovery is disabled in Sclip V1')

      const importRes = await client.callTool({
        name: 'import_external_media',
        arguments: { candidate_id: 'test-candidate' },
      })
      expect(importRes.isError).toBe(true)
      expect((importRes.content as any)[0].text).toContain('External B-roll discovery is disabled in Sclip V1')
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('advertises and permits external B-roll tools when enableExternalMedia is true', async () => {
    const tools = await registeredMcpTools(fakeBackend, { enableExternalMedia: true })
    const toolNames = tools.map((t) => t.name)

    expect(toolNames).toContain('video_search_external_media')
    expect(toolNames).toContain('resolve_visual_intents')
    expect(toolNames).toContain('import_external_media')
  })

  it('advertises external B-roll tools when SCLIP_ENABLE_EXTERNAL_BROLL=1 env var is set', async () => {
    const originalEnv = process.env.SCLIP_ENABLE_EXTERNAL_BROLL
    try {
      process.env.SCLIP_ENABLE_EXTERNAL_BROLL = '1'
      const tools = await registeredMcpTools(fakeBackend)
      const toolNames = tools.map((t) => t.name)

      expect(toolNames).toContain('video_search_external_media')
      expect(toolNames).toContain('resolve_visual_intents')
      expect(toolNames).toContain('import_external_media')
    } finally {
      if (originalEnv === undefined) {
        delete process.env.SCLIP_ENABLE_EXTERNAL_BROLL
      } else {
        process.env.SCLIP_ENABLE_EXTERNAL_BROLL = originalEnv
      }
    }
  })
})
