import fs from 'node:fs'
import path from 'node:path'
import type { RecentsStore } from './recents'

interface ProjectTrashDeps {
  recents: Pick<RecentsStore, 'list' | 'remove'>
  protectedPaths: readonly string[]
  prepare: (target: string) => Promise<void>
  trashItem: (target: string) => Promise<void>
}

/** Dashboard-only filesystem action. Never permanently deletes or follows a project symlink. */
export async function trashRecentProject(candidate: unknown, deps: ProjectTrashDeps): Promise<'trashed' | 'missing'> {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) throw new Error('Choose a project from the recent list.')
  const target = path.resolve(candidate)
  const samePath = (a: string, b: string) => process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase() : a === b
  if (!deps.recents.list().some(entry => samePath(path.resolve(entry.path), target))) {
    throw new Error('This project is no longer in the recent list. Open it first.')
  }
  const protect = (resolved: string) => {
    for (const protectedPath of [path.parse(resolved).root, ...deps.protectedPaths]) {
      const absolute = fs.existsSync(protectedPath) ? fs.realpathSync(protectedPath) : path.resolve(protectedPath)
      const relative = path.relative(resolved, absolute)
      if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
        throw new Error('This location cannot be moved to Trash as a project.')
      }
    }
  }
  protect(target)
  let initial: fs.Stats
  try { initial = fs.lstatSync(target) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    deps.recents.remove(candidate)
    return 'missing'
  }
  const validate = () => {
    const stat = fs.lstatSync(target)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Only a regular project folder can be moved to Trash.')
    protect(fs.realpathSync(target))
    if (stat.dev !== initial.dev || stat.ino !== initial.ino) throw new Error('The project folder changed. Try again.')
    const file = path.join(target, 'project.json')
    const fileStat = fs.lstatSync(file)
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('This is not a regular project folder.')
    const project = JSON.parse(fs.readFileSync(file, 'utf8')) as { project_id?: unknown; schema_version?: unknown }
    if (typeof project.project_id !== 'string' || !project.project_id || typeof project.schema_version !== 'number') {
      throw new Error('This folder does not contain a recognized project.json.')
    }
  }
  validate()
  // Save the current project before moving it; refusal leaves both folder and recent entry intact.
  await deps.prepare(target)
  validate()
  await deps.trashItem(target)
  deps.recents.remove(candidate)
  return 'trashed'
}
