export type RenderOrigin = 'user' | 'inspection' | 'background'

/** One real export at a time. Foreground may preempt only the background lease;
 * release is acknowledged after the executing export's cleanup, never early. */
export class RenderLease {
  private active: { origin: RenderOrigin; controller: AbortController; done: Promise<void>; finish(): void } | undefined
  constructor(private readonly releaseTimeoutMs = 5000) {}
  async acquire(origin: RenderOrigin) {
    const previous = this.active
    if (previous?.origin === 'background' && origin !== 'background') {
      previous.controller.abort()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([previous.done, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Background audio export is still stopping; retry shortly')), this.releaseTimeoutMs)
        })])
      } finally { if (timer) clearTimeout(timer) }
    }
    if (this.active) throw new Error('A render is already running')
    let finish!: () => void
    const lease = { origin, controller: new AbortController(), done: new Promise<void>(resolve => { finish = resolve }), finish: () => finish() }
    this.active = lease
    return { signal: lease.controller.signal, release: () => {
      if (this.active === lease) { this.active = undefined; lease.finish() }
    } }
  }
}
