import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execute = promisify(execFile)

export function reportedHeadroom(output: string, total: number): number | undefined {
  const match = output.match(/System-wide memory free percentage:\s*(\d+)%/)
  const percent = match ? Number(match[1]) : NaN
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? total * percent / 100 : undefined
}
/** macOS free pages alone omit reclaimable memory. Use its bounded pressure
 * query; unavailable/malformed diagnostics fall back conservatively to free RAM. */
export async function memoryHeadroom() {
  const total = os.totalmem(), free = os.freemem()
  if (process.platform !== 'darwin') return { total, free }
  try {
    const { stdout } = await execute('/usr/bin/memory_pressure', ['-Q'], { timeout: 1000, maxBuffer: 8192 })
    return { total, free: reportedHeadroom(stdout, total) ?? free }
  } catch { return { total, free } }
}
