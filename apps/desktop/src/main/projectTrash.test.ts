import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trashRecentProject } from './projectTrash'

describe('dashboard project Trash', () => {
  let parent: string
  let project: string
  let deps: Parameters<typeof trashRecentProject>[1]
  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'project-trash-unit-'))
    project = path.join(parent, 'example-project')
    fs.mkdirSync(project)
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schema_version: 1, project_id: 'synthetic-project' }))
    deps = {
      recents: { list: () => [{ path: project, name: 'Example', last_opened: '' }], remove: vi.fn() },
      protectedPaths: [os.homedir()], prepare: vi.fn().mockResolvedValue(undefined),
      trashItem: vi.fn(async target => fs.renameSync(target, path.join(parent, 'simulated-trash'))),
    }
  })
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }))

  it('moves only the confirmed folder and removes the recent entry after success', async () => {
    fs.writeFileSync(path.join(parent, 'external-source.txt'), 'keep')
    expect(await trashRecentProject(project, deps)).toBe('trashed')
    expect(deps.prepare).toHaveBeenCalledWith(project)
    expect(deps.trashItem).toHaveBeenCalledWith(project)
    expect(deps.recents.remove).toHaveBeenCalledWith(project)
    expect(fs.existsSync(path.join(parent, 'external-source.txt'))).toBe(true)
    expect(fs.existsSync(path.join(parent, 'simulated-trash/project.json'))).toBe(true)
  })

  it('does not remove the recent entry or folder when Trash fails', async () => {
    deps.trashItem = vi.fn().mockRejectedValue(new Error('Trash unavailable'))
    await expect(trashRecentProject(project, deps)).rejects.toThrow('Trash unavailable')
    expect(fs.existsSync(project)).toBe(true)
    expect(deps.recents.remove).not.toHaveBeenCalled()
  })

  it('preserves unsaved work if preparation fails', async () => {
    deps.prepare = vi.fn().mockRejectedValue(new Error('Save failed'))
    await expect(trashRecentProject(project, deps)).rejects.toThrow('Save failed')
    expect(deps.trashItem).not.toHaveBeenCalled()
    expect(deps.recents.remove).not.toHaveBeenCalled()
  })

  it('cleans an already-missing recent without invoking Trash', async () => {
    fs.renameSync(project, path.join(parent, 'moved-project'))
    expect(await trashRecentProject(project, deps)).toBe('missing')
    expect(deps.trashItem).not.toHaveBeenCalled()
    expect(deps.recents.remove).toHaveBeenCalledWith(project)
  })

  it.each([undefined, '', '.', '/unregistered-project'])('refuses unregistered or non-absolute targets: %s', async target => {
    await expect(trashRecentProject(target, deps)).rejects.toThrow()
    expect(deps.trashItem).not.toHaveBeenCalled()
  })

  it('refuses broad protected directories even when listed as recent', async () => {
    deps.protectedPaths = [project]
    await expect(trashRecentProject(project, deps)).rejects.toThrow('cannot be moved')
    expect(deps.trashItem).not.toHaveBeenCalled()
  })

  it('refuses an ancestor of a protected directory', async () => {
    deps.protectedPaths = [path.join(project, 'runtime')]
    await expect(trashRecentProject(project, deps)).rejects.toThrow('cannot be moved')
    expect(deps.trashItem).not.toHaveBeenCalled()
  })

  it('refuses a symlink instead of following it to another folder', async () => {
    fs.renameSync(project, path.join(parent, 'real-project'))
    fs.symlinkSync(path.join(parent, 'real-project'), project, 'junction')
    await expect(trashRecentProject(project, deps)).rejects.toThrow('regular project folder')
    expect(deps.trashItem).not.toHaveBeenCalled()
  })

  it('refuses invalid project files', async () => {
    fs.writeFileSync(path.join(project, 'project.json'), '{}')
    await expect(trashRecentProject(project, deps)).rejects.toThrow('recognized project.json')
    expect(deps.trashItem).not.toHaveBeenCalled()
  })

  it('revalidates the folder after async preparation', async () => {
    deps.prepare = vi.fn(async () => {
      fs.renameSync(project, path.join(parent, 'original'))
      fs.mkdirSync(project)
      fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ schema_version: 1, project_id: 'replacement' }))
    })
    await expect(trashRecentProject(project, deps)).rejects.toThrow('folder changed')
    expect(deps.trashItem).not.toHaveBeenCalled()
  })
})
