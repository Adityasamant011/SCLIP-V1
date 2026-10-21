import {it,expect} from 'vitest'
import {mechanicalPlanFromRanges,SOURCE_RANGES_SCHEMA} from './assemblyInput'
import {mcpDef} from '../state/mcp-commands'
import {normalizeToolArguments} from '../mcp/argumentNormalization'
it('keeps every chosen source interval and order without generating editorial choices',()=>{
 const clips=[{media_id:'one',source_start_us:10000000,source_end_us:13000000},{media_id:'two',source_start_us:1000000,source_end_us:5000000,reason:'Creator selection'}]
 const plan=mechanicalPlanFromRanges(clips)
 expect(plan.sections[0].clips.map(c=>[c.media_id,c.source_start_us,c.source_end_us])).toEqual([['one',10000000,13000000],['two',1000000,5000000]])
 expect(plan.brief.target_duration_us).toBe(7000000);expect(plan.sections[0].clips[1].reason).toBe('Creator selection')
 expect(mcpDef('apply_rough_cut_plan').inputSchema.properties).toHaveProperty('clips')
})
it('accepts only explicit valid intervals and retains strict command validation',()=>{
 expect(()=>mechanicalPlanFromRanges([{media_id:'one',source_start_us:1}])).toThrow()
 expect(()=>mechanicalPlanFromRanges([{media_id:'one',source_start_us:4,source_end_us:3}])).toThrow()
 const clips=normalizeToolArguments({item:[{media_id:'one',source_start_us:'0',source_end_us:'3000000'}]},SOURCE_RANGES_SCHEMA)
 expect(mechanicalPlanFromRanges(clips).brief.target_duration_us).toBe(3000000)
})
