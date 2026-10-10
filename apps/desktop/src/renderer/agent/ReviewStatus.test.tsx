// @vitest-environment jsdom
import {it,expect,vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import {ReviewStatus,reviewStatusLabel} from './ReviewStatus'
const invoke=vi.hoisted(()=>vi.fn(async()=>({status:'review_incomplete_in_this_state'})))
vi.mock('@/bridge/ipc',()=>({invoke}))
it('does not certify an interrupted/incomplete edit; polls only local bookkeeping',async()=>{
 const r=render(<ReviewStatus projectId="synthetic"/>);await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('incomplete'))
 expect(invoke).toHaveBeenCalledWith('sclip_get_review_disposition');expect(reviewStatusLabel('considered_in_completed_review')).toBe('Current edit reviewed by Hermes');expect(reviewStatusLabel()).toContain('not yet reviewed');r.unmount()
})
