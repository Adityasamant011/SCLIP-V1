import { describe, it, expect } from 'vitest'
import { mergeMcpCatalog, mergeMcpResources } from './mcpCatalog.js'
import { MCP_TOOL_DEFS } from '../state/mcp-commands.js'
import { MOTIF_TOOL_DEFS, MOTIF_RESOURCE_DEFS } from './motifToolDefs.js'
import { routeMcpTool } from './mutationTools.js'
import { registeredMcpTools } from './server.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

describe('mergeMcpCatalog', () => {
  const tsDefs = MCP_TOOL_DEFS.map((d) => ({ name: d.name, description: d.description, inputSchema: d.inputSchema }))
  const motifDefs = MOTIF_TOOL_DEFS.map((d) => ({ name: d.name, description: d.description, inputSchema: d.inputSchema }))

  it('drops motif tools from Rust side and re-adds from the TS motif table (no dup, motif present)', () => {
    // Rust catalog includes motif tool; TS receives both ts + motif defs.
    // Motif tools route 'motif' (not 'rust'/'hybrid'), so the Rust entry is dropped.
    const rust = [
      { name: 'ping' }, { name: 'import_media' },          // native + hybrid (kept)
      { name: 'get_motif_source' },                         // motif in Rust — must be dropped
      { name: 'add_track' }, { name: 'add_motif' },         // TS-executed (dropped from rust side)
    ]
    const merged = mergeMcpCatalog(rust, [...tsDefs, ...motifDefs])
    const names = merged.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)            // no dup
    expect(names).toContain('get_motif_source')               // present via TS motif table
    expect(names).toContain('ping')                           // rust-native kept
    expect(names).toContain('import_media')                   // hybrid kept
    expect(names).toContain('add_track')                      // ts kept (from TS table)
    expect(names).toContain('add_motif')
    // The Rust entry for get_motif_source was dropped; only the TS motif def survives.
    expect(names.filter((n) => n === 'get_motif_source').length).toBe(1)
  })

  it('every merged name resolves to exactly one engine (no advertised-but-unhandled)', () => {
    const rust = [{ name: 'list_motifs' }, { name: 'ping' }, { name: 'import_media' }, { name: 'add_track' }]
    const merged = mergeMcpCatalog(rust, [...tsDefs, ...motifDefs])
    for (const t of merged) expect(['ts', 'rust', 'hybrid', 'motif']).toContain(routeMcpTool(t.name))
  })

  it('advertises the TS table inputSchema for ts-routed tools', () => {
    const rust = [{ name: 'add_track', description: 'RUST DESC', inputSchema: { type: 'object', properties: {} } }]
    const merged = mergeMcpCatalog(rust, [...tsDefs, ...motifDefs])
    const addTrack = merged.find((t) => t.name === 'add_track')!
    expect(addTrack.description).not.toBe('RUST DESC')        // TS table wins for ts tools
  })
})

describe('Hermes-facing registered catalog count', () => {
  it('counts the authoritative merged list with external media disabled by default in V1', async () => {
    const catalog = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/mcp/rust-catalog-snapshot.json'), 'utf8')
    const backend = { mcpCatalog: async () => catalog } as Parameters<typeof registeredMcpTools>[0]
    const disabled = await registeredMcpTools(backend)
    const enabled = await registeredMcpTools(backend, { evaluateSourcePassages: async () => ({}) })
    expect(disabled).toHaveLength(104)
    expect(enabled).toHaveLength(105)
    expect(disabled.some(tool => tool.name === 'calculate_video_fit')).toBe(true)
    expect(disabled.some(tool => tool.name === 'get_timeline_critique')).toBe(true)
    expect(disabled.some(tool => tool.name === 'video_search_external_media')).toBe(false)
    expect(disabled.some(tool => tool.name === 'resolve_visual_intents')).toBe(false)
    expect(disabled.some(tool => tool.name === 'import_external_media')).toBe(false)
    expect(new Set(enabled.map(tool => tool.name)).size).toBe(enabled.length)
    expect(disabled.some(tool => tool.name === 'evaluate_source_passages')).toBe(false)
    expect(enabled.some(tool => tool.name === 'evaluate_source_passages')).toBe(true)
    expect(enabled.some(tool => tool.name === 'export_timeline')).toBe(false)

    // With enableExternalMedia flag:
    const externalOn = await registeredMcpTools(backend, { enableExternalMedia: true })
    const externalAndJevOn = await registeredMcpTools(backend, { enableExternalMedia: true, evaluateSourcePassages: async () => ({}) })
    expect(externalOn).toHaveLength(107)
    expect(externalAndJevOn).toHaveLength(108)
    expect(externalOn.some(tool => tool.name === 'video_search_external_media')).toBe(true)
    expect(externalOn.some(tool => tool.name === 'resolve_visual_intents')).toBe(true)
    expect(externalOn.some(tool => tool.name === 'import_external_media')).toBe(true)
  })
})

describe('mergeMcpResources', () => {
  const rustResources = [
    { uri: 'project://current', name: 'Current project', mimeType: 'application/json' },
    { uri: 'motifs://current', name: 'Motif catalog (rust)', mimeType: 'application/json' },
    { uri: 'project://media', name: 'Media pool', mimeType: 'application/json' },
  ]

  it('drops Rust motifs://current and re-adds from the TS resource table', () => {
    const merged = mergeMcpResources(rustResources, MOTIF_RESOURCE_DEFS)
    const uris = merged.map((r) => r.uri)
    expect(new Set(uris).size).toBe(uris.length)              // no dup
    expect(uris).toContain('motifs://current')                 // present via TS table
    expect(uris).toContain('project://current')               // rust resource kept
    expect(uris).toContain('project://media')                 // rust resource kept
    // TS entry, not the Rust one
    const motifRes = merged.find((r) => r.uri === 'motifs://current')!
    expect(motifRes.name).toBe('Motif catalog')               // from MOTIF_RESOURCE_DEFS
  })

  it('preserves Rust resources whose uri is not overridden', () => {
    const merged = mergeMcpResources(rustResources, [])
    expect(merged.map((r) => r.uri)).toEqual(rustResources.map((r) => r.uri))
  })

  it('appends TS-only resources not in Rust', () => {
    const merged = mergeMcpResources([], MOTIF_RESOURCE_DEFS)
    expect(merged.map((r) => r.uri)).toContain('motifs://current')
  })
})
