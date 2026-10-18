import { describe, expect, it, vi } from 'vitest'
import { ReadableStream } from 'node:stream/web'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { downloadExternalMediaCandidate } from './downloader'
import type { ExternalMediaCandidate } from './types'

describe('stock download cancellation', () => {
  it('removes the partial file when the caller cancels a streaming download', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-stock-cancel-'))
    const controller = new AbortController(), originalFetch = globalThis.fetch
    const stream = new ReadableStream({
      start(c) { c.enqueue(new Uint8Array([1, 2, 3])) },
      pull() { controller.abort() },
    })
    globalThis.fetch = vi.fn(async () => new Response(stream as never, { headers: { 'content-type': 'video/mp4' } }))
    const candidate = { candidate_id: 'synthetic', provider: 'pexels', provider_asset_id: '1', title: 'Synthetic',
      import_mode: 'AUTO_IMPORT', rights_status: 'PROVIDER_LICENSE_ELIGIBLE', direct_media_url: 'https://videos.pexels.com/synthetic.mp4',
    } as ExternalMediaCandidate
    try {
      await expect(downloadExternalMediaCandidate(candidate, directory, { signal: controller.signal })).rejects.toThrow()
      expect(fs.readdirSync(directory)).toEqual([])
    } finally { globalThis.fetch = originalFetch; fs.rmSync(directory, { recursive: true, force: true }) }
  })
})
