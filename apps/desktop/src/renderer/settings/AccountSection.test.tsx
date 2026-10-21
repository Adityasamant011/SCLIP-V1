// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const ipc=vi.hoisted(()=>({ invoke:vi.fn() }))
vi.mock('@/bridge/ipc',()=>ipc)
import { AccountSection } from './AccountSection'
beforeEach(()=>{ cleanup();vi.clearAllMocks() })
it('does not sell plans when the build has no account service',async()=>{
  ipc.invoke.mockResolvedValue({ configured:false,signedIn:false })
  render(<AccountSection />)
  await screen.findByText(/Subscriptions cannot be purchased yet/)
  expect(screen.queryByRole('button',{ name:'Choose Sclip AI' })).toBeNull()
})
it('keeps managed sales disabled when unfunded and sends BYOK checkout to the main process',async()=>{
  ipc.invoke.mockResolvedValue({ configured:true,signedIn:true,email:'tester@example.invalid',plan:'none',active:false,managedEnabled:false })
  render(<AccountSection />)
  const managed=await screen.findByRole('button',{ name:'Choose Sclip AI' })
  expect((managed as HTMLButtonElement).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button',{ name:'Choose Bring your AI' }))
  await waitFor(()=>expect(ipc.invoke).toHaveBeenCalledWith('sclip_account_checkout',{ plan:'byok' }))
})
it('clears the password after submission and handles email confirmation',async()=>{
  ipc.invoke.mockImplementation(async channel=>channel==='sclip_account_get'?{ configured:true,signedIn:false }: { confirmationRequired:true })
  render(<AccountSection />)
  await screen.findByLabelText('Account email')
  const user=userEvent.setup()
  await user.type(screen.getByLabelText('Account email'),'tester@example.invalid')
  await user.type(screen.getByLabelText('Account password'),'test-password')
  await user.click(screen.getByRole('button',{ name:/^Sign in$/ }))
  await screen.findByText(/Check your email to confirm/)
  expect((screen.getByLabelText('Account password') as HTMLInputElement).value).toBe('')
})
