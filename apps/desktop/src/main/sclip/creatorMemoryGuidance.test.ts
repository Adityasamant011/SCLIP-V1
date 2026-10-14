import {expect,it} from 'vitest'
import {creatorMemoryGuidance} from './creatorMemoryGuidance'
it('distinguishes actual evidence IDs from absent preferences and supplies only retrieval examples and write bindings',()=>{
 const g=creatorMemoryGuidance({binding:{creatorId:'private-creator'},revision:10,learning_enabled:true,preferences:[],evidence:[{id:'actual-correction'}]},'Evidence id is required')
 if(!('tool_call_examples' in g))throw Error('Expected valid current bindings');expect(g.no_existing_preferences).toBe(true);expect(g.write_bindings).toEqual({creator_id:'private-creator',expected_revision:10});expect(g.tool_call_examples).toContainEqual({name:'mcp__weftcut__creator_style_memory',arguments:{action:'evidence',id:'actual-correction'}});expect(g.tool_call_examples.some(e=>e.arguments.action==='hypothesis')).toBe(false);expect(JSON.stringify(g)).not.toContain('font_size');expect(g.previous_failure).toBe('Evidence id is required')
})
it('keeps disabled learning read-only and does not substitute revision for preference version',()=>{
 const disabled=creatorMemoryGuidance({binding:{creatorId:'c'},revision:10,learning_enabled:false,preferences:[],evidence:[]});if(!('tool_call_examples' in disabled))throw Error('Expected valid disabled bindings');expect(disabled.write_bindings).toBeUndefined();expect(disabled.tool_call_examples).toHaveLength(1)
 const enabled=creatorMemoryGuidance({binding:{creatorId:'c'},revision:10,preferences:[{id:'p',version:2}],evidence:[]});if(!('tool_call_examples' in enabled))throw Error('Expected valid preference bindings');expect(enabled.existing_preferences).toEqual([{id:'p',expected_version:2}])
})
