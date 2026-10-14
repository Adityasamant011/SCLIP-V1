// The audio-effect refusals as an agent reads them. Colocated rather than in
// __tests__/mcp.errors.test.ts because the rules and their wording ship
// together with the `add_effect` description this file also owns.
//
// The client drops `error.data`, so what these pin is the MESSAGE: it has to
// name the RULE, not just the violation, or the agent retries the same call.
import { describe, it, expect } from 'vitest'
import { mapCommandError, MCP_TOOL_DEFS } from './mcp-commands'

describe('mapCommandError — audio effects', () => {
  it('EffectKindNotApplicable names the kind, the layer kind and the namespace rule', () => {
    const out = mapCommandError({ error: 'EffectKindNotApplicable', kind: 'audio.denoise', layer_kind: 'VideoClip' })
    expect(out.code).toBe('invalid_params')
    expect(out.message).toContain('audio.denoise')
    expect(out.message).toContain('VideoClip')
    expect(out.message).toContain('Audio layers and only Audio layers')
  })

  it('AudioEffectParamStatic names the param and the tool that CAN write it', () => {
    const out = mapCommandError({ error: 'AudioEffectParamStatic', effect: 'E1', param: 'strength' })
    expect(out.code).toBe('invalid_params')
    expect(out.message).toContain('strength')
    expect(out.message).toContain('STATIC ONLY')
    expect(out.message).toContain('update_effect')
    expect(out.message).toContain('set_keyframe')
  })
})

describe('add_effect description', () => {
  const description = MCP_TOOL_DEFS.find((d) => d.name === 'add_effect')?.description ?? ''

  // The description is the only place an agent learns the audio kind exists,
  // what its params mean, and which two rules it will otherwise trip over.
  it('advertises audio.denoise, its params, and both audio rules', () => {
    expect(description).toContain('audio.denoise')
    for (const param of ['strength', 'margin', 'profile_in_us', 'profile_out_us']) {
      expect(description, param).toContain(param)
    }
    expect(description).toContain('Audio layers ONLY')
    expect(description).toContain('STATIC ONLY')
  })
})

describe('full-source media placement contract',()=>{
  const tool=MCP_TOOL_DEFS.find(d=>d.name==='add_media_layer')!
  const valid={media_id:'00000000-0000-0000-0000-000000000001',track_id:'00000000-0000-0000-0000-000000000002',t_start_us:0}
  it('refuses supplied source/timeline trim fields rather than silently ignoring them',()=>{
    expect(()=>tool.parseDedicated!({...valid,src_in_us:0,src_out_us:3_000_000,t_end_us:3_000_000})).toThrow(/add_video_layer|trim_layer/)
    expect(tool.parseDedicated!(valid)).toEqual(valid)
  })
})
