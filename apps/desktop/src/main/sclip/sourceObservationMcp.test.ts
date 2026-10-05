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

it('advertises/routes source coverage and speech context as read-only evidence with explicit space',async()=>{
 const media={id:'distinct-source',metadata:{duration_us:45000000}}
 const overview={identity:{media_id:media.id,coordinate_space:'source'},structure:{cells:[{visual:{status:'sampled_instants_only'},speech:{status:'not_observed'}}]}}
 const index={cachedUnderstanding:async()=>overview,coarseUnderstanding:async()=>overview,speechContext:async()=>({coordinate_space:'source',status:'not_generated'})}
 const catalog=await registeredMcpTools({mcpCatalog:async()=>'{"tools":[]}'} as never,{sourceObservationIndex:index as never})
 for(const tool of ['get_source_understanding','get_source_speech_context'])expect(catalog.some(t=>t.name===tool)).toBe(true)
 const host={actor:{snapshot:()=>({media_pool:{[media.id]:media}})}} as never
 for(const [tool,args] of [['get_source_understanding',{media_id:media.id,detail:'coarse'}],['get_source_speech_context',{media_id:media.id,start_us:2000000,end_us:12000000}]] as const){
  const result:any=await handleCallTool({} as never,()=>host,tool,args,undefined,undefined,undefined,undefined,undefined,index as never)
  expect(result.isError).not.toBe(true);expect(result.content[0].text).toContain('source')
 }
})
