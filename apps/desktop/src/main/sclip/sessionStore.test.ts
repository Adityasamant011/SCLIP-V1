import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SclipSessionStore } from './sessionStore'

const directories: string[] = []
function store(): SclipSessionStore {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'weftcut-sclip-session-'))
  directories.push(dir)
  return new SclipSessionStore(path.join(dir, 'sessions.json'))
}
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })))

describe('SclipSessionStore', () => {
  it('keeps project session associations isolated and persistent', () => {
    const sessions = store()
    const now = '2026-09-15T12:00:00.000Z'
    sessions.add('project-a', { id: 'a1', name: 'Rough cut', createdAt: now, updatedAt: now, archived: false })
    sessions.add('project-b', { id: 'b1', name: 'Captions', createdAt: now, updatedAt: now, archived: false })

    expect(sessions.list('project-a')).toMatchObject({ activeSessionId: 'a1', sessions: [{ id: 'a1' }] })
    expect(sessions.list('project-b')).toMatchObject({ activeSessionId: 'b1', sessions: [{ id: 'b1' }] })
  })

  it('does not allow a session from another project to become active', () => {
    const sessions = store()
    const now = '2026-09-15T12:00:00.000Z'
    sessions.add('project-a', { id: 'a1', name: 'A', createdAt: now, updatedAt: now, archived: false })
    expect(() => sessions.activate('project-b', 'a1')).toThrow('does not belong')
  })
})
