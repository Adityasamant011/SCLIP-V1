/** Local discovery/handler diagnostic. No Hermes or Jev provider request. */
import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchApp, invokeCmd, summary, tmpDir } from './helpers/driver'

test('opt-in Jev catalog and read-only handler stay accessible beside original source', async () => {
  test.skip(process.env.SCLIP_JEV_TOOL_SELECTION_OFFLINE !== '1', 'Explicit local-only diagnostic')
  test.setTimeout(180_000)
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const source = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
  expect(fs.existsSync(source)).toBe(true)
  const userData = tmpDir('sclip-jev-tool-selection-')
  const { app, page } = await launchApp({ userDataDir: userData, env: {
    SCLIP_USER_DATA_DIR: userData, SCLIP_JEV_ENABLED: '1', OPENROUTER_API_KEY: '',
    SCLIP_HERMES_EXECUTABLE: path.join(userData, 'do-not-launch-hermes'),
  } })
  let client: Client | undefined
  try {
    const parent = tmpDir('sclip-jev-tool-selection-project-'), name = 'selection-diagnostic'
    await invokeCmd(page, 'project_new_workspace', { parentFolder: parent, name, width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 })
    const media = await invokeCmd<string>(page, 'import_media', { path: source })
    fs.cpSync(path.join(sourceProject, 'Cache/transcripts'), path.join(parent, name, 'Cache/transcripts'), { recursive: true })
    const before = await summary(page)
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    client = new Client({ name: 'sclip-jev-local-selection-diagnostic', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))
    const catalog = (await client.listTools()).tools
    expect(catalog).toHaveLength(103)
    const jev = catalog.find(tool => tool.name === 'evaluate_source_passages')
    const sourceTool = catalog.find(tool => tool.name === 'get_media_context')
    expect(jev?.description).toContain('Semantic transcript search')
    expect(jev?.inputSchema.required).toEqual(['media_ids', 'request'])
    expect(jev?.inputSchema.properties).toHaveProperty('limit')
    expect(sourceTool).toBeTruthy()
    const reportDir = path.resolve('e2e/bench-results/jev')
    fs.mkdirSync(reportDir, { recursive: true })
    fs.writeFileSync(path.join(reportDir, 'tool-selection-local-catalog.json'), JSON.stringify(
      catalog.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })), null, 2))

    // This valid read-only call has no candidate overlap, so it exercises the
    // production MCP handler without contacting or billing Jev.
    const empty = await client.callTool({ name: 'evaluate_source_passages', arguments: {
      media_ids: [media], request: 'focus and mentorship', start_us: 580_000_000, end_us: 590_000_000, limit: 12,
    } })
    expect(empty.isError).not.toBe(true)
    expect(JSON.parse((empty.content[0] as { text: string }).text).status).toBe('insufficient_evidence')
    const original = await client.callTool({ name: 'get_media_context', arguments: {
      media_id: media, detail: 'segments', start_us: 150_000_000, end_us: 180_000_000,
    } })
    expect(original.isError).not.toBe(true)
    expect((original.content[0] as { text: string }).text.length).toBeGreaterThan(500)
    const nested = await client.callTool({ name: 'get_media_context', arguments: {
      media_id: media, detail: 'segments', range: { start_us: 60_000_000, end_us: 120_000_000 },
    } })
    expect(nested.isError).toBe(true)
    expect((nested.content[0] as { text: string }).text).toContain('flat start_us and end_us')
    const corrected = await client.callTool({ name: 'get_media_context', arguments: {
      media_id: media, detail: 'segments', start_us: 60_000_000, end_us: 120_000_000,
    } })
    expect(corrected.isError).not.toBe(true)
    expect(JSON.parse((corrected.content[0] as { text: string }).text).range).toMatchObject({
      start_us: 60_000_000, end_us: 120_000_000,
    })
    expect(JSON.stringify((await summary(page)).tracks)).toBe(JSON.stringify(before.tracks))
  } finally { await client?.close(); await app.close() }

  const disabledData = tmpDir('sclip-jev-tool-selection-disabled-')
  const disabled = await launchApp({ userDataDir: disabledData, env: {
    SCLIP_USER_DATA_DIR: disabledData, SCLIP_JEV_ENABLED: '0',
    SCLIP_HERMES_EXECUTABLE: path.join(disabledData, 'do-not-launch-hermes'),
  } })
  let disabledClient: Client | undefined
  try {
    const info = await disabled.page.evaluate(() => (window as any).api.mcp.getInfo())
    disabledClient = new Client({ name: 'sclip-jev-disabled-local-diagnostic', version: '1' }, {})
    await disabledClient.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))
    const disabledCatalog = (await disabledClient.listTools()).tools
    expect(disabledCatalog).toHaveLength(102)
    expect(disabledCatalog.some(tool => tool.name === 'evaluate_source_passages')).toBe(false)
    expect(disabledCatalog.some(tool => tool.name === 'get_media_context')).toBe(true)
  } finally { await disabledClient?.close(); await disabled.app.close() }
})
