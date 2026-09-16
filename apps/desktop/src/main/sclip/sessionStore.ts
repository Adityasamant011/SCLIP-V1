import fs from 'node:fs'
import path from 'node:path'

export interface SclipSession {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  archived: boolean
}

interface ProjectSessions {
  activeSessionId: string | null
  sessions: SclipSession[]
}

interface State {
  version: 1
  projects: Record<string, ProjectSessions>
}

const EMPTY: State = { version: 1, projects: {} }

/**
 * Sclip owns only the association between a WeftCut project and Hermes session
 * ids. Hermes remains the authority for each session's messages and context.
 */
export class SclipSessionStore {
  private state: State

  constructor(private readonly file: string) {
    this.state = this.read()
  }

  list(projectId: string): { activeSessionId: string | null; sessions: SclipSession[] } {
    const project = this.state.projects[projectId] ?? { activeSessionId: null, sessions: [] }
    return {
      activeSessionId: project.activeSessionId,
      sessions: project.sessions.filter(session => !session.archived).map(session => ({ ...session })),
    }
  }

  add(projectId: string, session: SclipSession): void {
    const project = this.project(projectId)
    if (!project.sessions.some(existing => existing.id === session.id)) project.sessions.push(session)
    project.activeSessionId = session.id
    this.save()
  }

  activate(projectId: string, sessionId: string): void {
    const project = this.project(projectId)
    const session = project.sessions.find(candidate => candidate.id === sessionId && !candidate.archived)
    if (!session) throw new Error('Session does not belong to this project')
    session.updatedAt = new Date().toISOString()
    project.activeSessionId = sessionId
    this.save()
  }

  /** True only for a current, non-archived session owned by this project. */
  owns(projectId: string, sessionId: string): boolean {
    if (!projectId || !sessionId) return false
    return Boolean(this.state.projects[projectId]?.sessions.some(session => session.id === sessionId && !session.archived))
  }

  rename(projectId: string, sessionId: string, name: string): void {
    const session = this.session(projectId, sessionId)
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Session name cannot be empty')
    session.name = trimmed.slice(0, 120)
    session.updatedAt = new Date().toISOString()
    this.save()
  }

  archive(projectId: string, sessionId: string): void {
    const project = this.project(projectId)
    const session = this.session(projectId, sessionId)
    session.archived = true
    session.updatedAt = new Date().toISOString()
    if (project.activeSessionId === sessionId) {
      project.activeSessionId = project.sessions.find(candidate => !candidate.archived)?.id ?? null
    }
    this.save()
  }

  private project(projectId: string): ProjectSessions {
    if (!projectId) throw new Error('A project id is required')
    return (this.state.projects[projectId] ??= { activeSessionId: null, sessions: [] })
  }

  private session(projectId: string, sessionId: string): SclipSession {
    const session = this.project(projectId).sessions.find(candidate => candidate.id === sessionId && !candidate.archived)
    if (!session) throw new Error('Session does not belong to this project')
    return session
  }

  private read(): State {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<State>
      if (value.version === 1 && value.projects && typeof value.projects === 'object') return value as State
    } catch {
      // Absence or corruption must not prevent the editor from opening. The
      // next successful mutation rewrites a clean, application-owned document.
    }
    return { ...EMPTY, projects: {} }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(this.state), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporary, this.file)
    try { fs.chmodSync(this.file, 0o600) } catch { /* Windows does not support POSIX modes. */ }
  }
}
