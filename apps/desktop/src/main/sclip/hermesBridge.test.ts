import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redactHermesSecrets } from './hermesSecrets.js'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('../broadcast.js', () => ({ broadcastEvent: vi.fn() }))

import { configureHermesBridge, createProjectSession, getHermesRun, startHermesRun } from './hermesBridge.js'

const SECRET = 'SCLIP_TEST_SECRET_DO_NOT_LEAK_12345'
const sessions = { add: vi.fn(), owns: () => true, list: () => ({ activeSessionId: null, sessions: [] }) }

beforeEach(() => {
  vi.restoreAllMocks()
  configureHermesBridge({
    getGatewayUrl: () => 'http://127.0.0.1:12345',
    getGatewayToken: () => SECRET,
    getActiveProjectId: async () => 'project',
    getMcpStatus: () => ({ tools: 1, resources: 1 }),
    getProfileConfig: () => ({ provider: 'openrouter', model: 'model-id' }),
    redactForRenderer: text => redactHermesSecrets(text, [SECRET]),
    sessions: sessions as any,
  })
})

describe('Hermes bridge secret boundary', () => {
  it('does not forward a provider response body or key in an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: SECRET }), { status: 500 })))
    await expect(createProjectSession('project', 'test')).rejects.toThrow('Hermes returned HTTP 500')
    await expect(createProjectSession('project', 'test')).rejects.not.toThrow(SECRET)
    vi.unstubAllGlobals()
  })

  it('redacts returned run objects and sends current provider/model for old sessions', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
      ? new Response(JSON.stringify({ run_id: 'run-1', status: 'running' }), { status: 200 })
      : new Response(JSON.stringify({ diagnostics: `Authorization: ${SECRET}` }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const started = await startHermesRun({ prompt: 'review', projectId: 'project', sessionId: 'session' })
    expect(started.ok).toBe(true)
    expect(JSON.stringify(started)).not.toContain(SECRET)
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ provider: 'openrouter', model: 'model-id' })
    expect(JSON.stringify(body)).not.toContain(SECRET)
    expect(JSON.stringify(await getHermesRun('run-1'))).not.toContain(SECRET)
    vi.unstubAllGlobals()
  })
})
