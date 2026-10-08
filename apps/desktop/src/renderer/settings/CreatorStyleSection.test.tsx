// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const ipc=vi.hoisted(()=>({invoke:vi.fn()}))
vi.mock('@/bridge/ipc',()=>ipc)
import { CreatorStyleSection } from './CreatorStyleSection'
const view={binding:{creatorId:'local'},creators:[{id:'local',label:'Local creator',enabled:true}],preferences:[],evidence:[],context:'',generation:0}
afterEach(()=>{cleanup();vi.clearAllMocks()})
describe('Inspectable creator controls',()=>{
 it('stores an explicit instruction with chosen scope and can reset without a model',async()=>{
  ipc.invoke.mockResolvedValue(view)
  render(<CreatorStyleSection/>);const user=userEvent.setup()
  await waitFor(()=>expect(screen.getByLabelText('Creator')).toBeTruthy())
  await user.type(screen.getByLabelText('Explicit style preference'),'Clean direct editing')
  await user.selectOptions(screen.getByLabelText('Preference scope'),'project')
  await user.click(screen.getByRole('button',{name:'Remember preference'}))
  expect(ipc.invoke).toHaveBeenCalledWith('sclip_creator_style',{action:'explicit',text:'Clean direct editing',scope:{kind:'project'}})
  await user.click(screen.getByText('Reset creator learning'))
  await user.click(screen.getByRole('button',{name:'Clear creator style memory'}))
  expect(ipc.invoke).toHaveBeenCalledWith('sclip_creator_style',{action:'reset'})
 })
 it('shows persistence failures rather than claiming memory saved',async()=>{
  ipc.invoke.mockRejectedValue(new Error('Existing file preserved'))
  render(<CreatorStyleSection/>)
  expect((await screen.findByRole('alert')).textContent).toContain('Existing file preserved')
 })
})
