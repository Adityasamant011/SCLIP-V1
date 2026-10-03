// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const ipc = vi.hoisted(() => ({
  sclipGetHermesConfig: vi.fn(),
  sclipGetHermesStatus: vi.fn(),
  sclipSetHermesConfig: vi.fn(),
  sclipRemoveHermesKey: vi.fn(),
  sclipTestHermesConnection: vi.fn(),
}))
vi.mock('../ipc/sclip', () => ipc)
vi.mock('./AgentSection', () => ({ AgentSection: () => null }))

import { HermesSettingsSection } from './HermesSettingsSection'

const sentinel = 'SCLIP_TEST_SECRET_DO_NOT_LEAK_12345'
let configured = false

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  configured = false
  ipc.sclipGetHermesConfig.mockImplementation(async () => ({
    provider: 'openrouter', model: 'nex-agi/nex-n2.5-pro:free', maxIterations: 30,
    configuredKeys: { openrouter: configured },
  }))
  ipc.sclipGetHermesStatus.mockResolvedValue({ online: false, mcpTools: 0 })
  ipc.sclipSetHermesConfig.mockImplementation(async () => { configured = true; return { ok: true } })
  ipc.sclipRemoveHermesKey.mockImplementation(async () => { configured = false; return { ok: true } })
  ipc.sclipTestHermesConnection.mockResolvedValue({ ok: true, message: 'Connected successfully.' })
})

describe('Hermes credential settings', () => {
  it('clears a saved secret, shows configured state, replaces and removes without rereading it', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<HermesSettingsSection />)
    const secretInput = await screen.findByLabelText('API key') as HTMLInputElement
    await user.type(secretInput, sentinel)
    expect(secretInput.value).toBe(sentinel)
    await user.click(screen.getByRole('button', { name: 'Save & Apply' }))
    await waitFor(() => expect(ipc.sclipSetHermesConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: sentinel })))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace key' })).toBeTruthy())
    expect(screen.queryByDisplayValue(sentinel)).toBeNull()
    expect(JSON.stringify(await ipc.sclipGetHermesConfig())).not.toContain(sentinel)

    await user.click(screen.getByRole('button', { name: 'Replace key' }))
    const replacement = screen.getByLabelText('API key') as HTMLInputElement
    expect(replacement.value).toBe('')
    await user.type(replacement, 'replacement-sentinel')
    await user.click(screen.getByRole('button', { name: 'Save & Apply' }))
    await waitFor(() => expect(ipc.sclipSetHermesConfig).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: 'replacement-sentinel' })))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(ipc.sclipRemoveHermesKey).toHaveBeenCalledWith('openrouter'))
    await waitFor(() => expect(screen.getByLabelText('API key')).toBeTruthy())
  })

  it('tests the saved provider and model from the backend without exposing a credential', async () => {
    configured = true
    const user = userEvent.setup()
    render(<HermesSettingsSection />)
    await screen.findByRole('button', { name: 'Replace key' })
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => expect(ipc.sclipTestHermesConnection).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openrouter', model: 'nex-agi/nex-n2.5-pro:free',
    })))
    expect(screen.getByRole('status').textContent).toContain('Connected successfully.')
    expect(document.body.textContent).not.toContain(sentinel)
  })
})
