import { afterEach, expect, it, vi } from 'vitest'
import { RenderLease } from './renderLease'
afterEach(() => vi.useRealTimers())
it('foreground preempts only background and waits for actual release', async () => {
  const lock = new RenderLease(), bg = await lock.acquire('background')
  let acquired = false
  const next = lock.acquire('user').then(lease => { acquired = true; return lease })
  expect(bg.signal.aborted).toBe(true)
  await Promise.resolve(); expect(acquired).toBe(false)
  bg.release(); const user = await next
  expect(user.signal.aborted).toBe(false)
  await expect(lock.acquire('inspection')).rejects.toThrow('already running')
  await expect(lock.acquire('background')).rejects.toThrow('already running')
  expect(user.signal.aborted).toBe(false); user.release()
})
it('timeout never releases a still-executing resource and late release recovers', async () => {
  vi.useFakeTimers()
  const lock = new RenderLease(20), bg = await lock.acquire('background')
  const attempt = expect(lock.acquire('inspection')).rejects.toThrow('still stopping')
  await vi.advanceTimersByTimeAsync(20); await attempt
  await expect(lock.acquire('background')).rejects.toThrow('already running')
  bg.release(); const next = await lock.acquire('inspection'); next.release()
})
it('an old repeated release never releases another export', async () => {
  const lock = new RenderLease(), first = await lock.acquire('background')
  first.release(); const second = await lock.acquire('user'); first.release()
  await expect(lock.acquire('inspection')).rejects.toThrow('already running'); second.release()
})
