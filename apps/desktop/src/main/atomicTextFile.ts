import { randomUUID } from 'node:crypto'
import path from 'node:path'

export interface AtomicTextFileFs {
  openSync(path: string, flags: string, mode?: number): number
  writeFileSync(fd: number, text: string, encoding: 'utf8'): void
  fsyncSync(fd: number): void
  closeSync(fd: number): void
  statSync(path: string): { mode: number }
  renameSync(from: string, to: string): void
  rmSync(path: string, options: { force: true }): void
}

/** Replace a text file via a unique sibling temp file.
 *
 * The sibling is on the same filesystem so rename is atomic for readers. This
 * Sync data before rename, then the parent directory on POSIX. This does not
 * promise survival of hardware/controller failure. Windows has no portable
 * directory fsync through Node. A post-rename sync error explicitly reports
 * that the destination was replaced; callers must not assume rollback.
 */
export function writeTextAtomically(fs: AtomicTextFileFs, destination: string, text: string): void {
  const dir = path.dirname(destination)
  const base = path.basename(destination)
  const temp = path.join(dir, `.${base}.${process.pid}.${randomUUID()}.tmp`)
  let fd: number | undefined
  let ownsTemp = false
  let replaced = false
  try {
    let mode = 0o600
    try { mode = fs.statSync(destination).mode & 0o777 } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    fd = fs.openSync(temp, 'wx', mode)
    ownsTemp = true
    fs.writeFileSync(fd, text, 'utf8')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.renameSync(temp, destination)
    ownsTemp = false
    replaced = true
    if (process.platform !== 'win32') {
      fd = fs.openSync(dir, 'r')
      fs.fsyncSync(fd)
      fs.closeSync(fd)
      fd = undefined
    }
  } catch (error) {
    if (fd !== undefined) { try { fs.closeSync(fd) } catch { /* original error wins */ } }
    if (ownsTemp) { try { fs.rmSync(temp, { force: true }) } catch { /* original error wins */ } }
    if (replaced) throw Object.assign(new Error(`Destination replaced but directory durability check failed: ${String(error)}`, { cause: error }), { destinationReplaced: true })
    throw error
  }
}
