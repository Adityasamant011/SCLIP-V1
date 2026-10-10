import {describe,it,expect,vi} from 'vitest'
import {createRenderPresentation} from './renderPresentation'
describe('internal QA never impersonates user Export',()=>{
 it('does not publish progress, errors, completion or null into user UI',()=>{const publish=vi.fn(),r=createRenderPresentation('inspection',publish);r.update({kind:'error',detail:'No audio selected'});expect(()=>r.finish()).toThrow('No audio selected');expect(publish).not.toHaveBeenCalled();const done=createRenderPresentation('inspection',publish);done.update(null);done.update({kind:'complete',payload:{outputPath:'/tmp/qa',durationUs:1}});expect(()=>done.finish()).not.toThrow();expect(publish).not.toHaveBeenCalled()})
 it('still presents user exports/errors and rejects incomplete internal renders',()=>{const publish=vi.fn(),r=createRenderPresentation('user',publish);r.update({kind:'error',detail:'Export failed'});expect(publish).toHaveBeenCalledWith({kind:'error',detail:'Export failed'});r.finish();expect(()=>createRenderPresentation('inspection',publish).finish()).toThrow('did not complete')})
})
