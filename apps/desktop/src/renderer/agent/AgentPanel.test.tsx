// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./SclipAiPanel', () => ({ SclipAiPanel: () => <div>Hermes terminal only</div> }))
import { AgentPanel } from './AgentPanel'

describe('AgentPanel', () => {
  it('renders only the Sclip terminal surface', () => {
    render(<AgentPanel editor />)
    expect(screen.getByText('Hermes terminal only')).toBeTruthy()
    expect(screen.queryByText('Activity Log')).toBeNull()
  })
})
