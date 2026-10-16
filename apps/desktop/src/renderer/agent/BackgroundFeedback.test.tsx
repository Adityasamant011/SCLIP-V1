// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BackgroundFeedback } from './BackgroundFeedback'
const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/bridge/ipc', () => ({ invoke }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('shows grounded partial feedback and local pause without certifying a finished edit', async () => {
  const live = { project_id: 'synthetic', enabled: true, status: 'available', observation: { timeline_range_us: [0, 2e6], visual: { status: 'observed', description: 'Synthetic scene', truncated: true }, audio: { status: 'no_audible_material' } } }
  invoke.mockImplementation(async cmd => cmd === 'sclip_get_background_feedback' ? { project_id: 'synthetic', issues: [], live_feedback: live } : { ...live, enabled: false, status: 'disabled', observation: undefined })
  render(<BackgroundFeedback projectId="synthetic" />)
  await waitFor(() => expect(screen.getByText(/Synthetic scene/).textContent).toContain('truncated'))
  expect(screen.getByText(/does not certify/)).toBeTruthy()
  fireEvent.click(screen.getByText('Pause local sensing'))
  await waitFor(() => expect(screen.getByText('Resume local sensing')).toBeTruthy())
  expect(invoke).toHaveBeenCalledWith('sclip_set_background_feedback', { enabled: false, project_id: 'synthetic' })
})
it('discards a response for the previous project', async () => {
  invoke.mockResolvedValue({ project_id: 'other-project', live_feedback: { observation: { visual: { description: 'Private prior scene' } } } })
  render(<BackgroundFeedback projectId="current-project" />)
  await waitFor(() => expect(invoke).toHaveBeenCalled())
  expect(screen.queryByText(/Private prior scene/)).toBeNull()
})
