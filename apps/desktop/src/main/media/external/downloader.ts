import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import type { ExternalMediaCandidate } from './types.js'

const MAX_DOWNLOAD_SIZE_BYTES = 250 * 1024 * 1024 // 250MB
const DOWNLOAD_TIMEOUT_MS = 30000

export interface DownloadResult {
  filePath: string
  fileSize: number
  contentType: string
  provenancePath: string
}

export function validateSafeUrl(urlString: string): URL {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    throw new Error(`Invalid URL: ${urlString}`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Insecure protocol "${parsed.protocol}". Only HTTPS downloads are permitted.`)
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '0.0.0.0' ||
    /^\d+$/.test(hostname)
  ) {
    throw new Error(`Blocked private or localhost address: ${hostname}`)
  }

  // Check IPv4 private ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (ipv4Match) {
    const [_, o1, o2] = ipv4Match.map(Number)
    if (o1 === 127) throw new Error(`Blocked loopback address: ${hostname}`)
    if (o1 === 10) throw new Error(`Blocked private 10.0.0.0/8 address: ${hostname}`)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) throw new Error(`Blocked private 172.16.0.0/12 address: ${hostname}`)
    if (o1 === 192 && o2 === 168) throw new Error(`Blocked private 192.168.0.0/16 address: ${hostname}`)
    if (o1 === 169 && o2 === 254) throw new Error(`Blocked link-local 169.254.0.0/16 address: ${hostname}`)
    if (o1 === 0) throw new Error(`Blocked zero network address: ${hostname}`)
  }

  // Check IPv6 loopback / private ranges
  if (
    hostname === '::1' ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    hostname.startsWith('fe80')
  ) {
    throw new Error(`Blocked IPv6 private or loopback address: ${hostname}`)
  }

  return parsed
}

export function extensionFromMime(mime: string, fallbackUrl?: string): string {
  const cleanMime = mime.toLowerCase().split(';')[0].trim()
  switch (cleanMime) {
    case 'video/mp4':
    case 'video/m4v':
      return '.mp4'
    case 'video/webm':
      return '.webm'
    case 'video/ogg':
    case 'video/ogv':
      return '.ogv'
    case 'video/quicktime':
      return '.mov'
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'image/avif':
      return '.avif'
    default: {
      if (fallbackUrl) {
        try {
          const urlExt = path.extname(new URL(fallbackUrl).pathname).toLowerCase()
          if (['.mp4', '.mov', '.webm', '.ogv', '.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(urlExt)) {
            return urlExt === '.jpeg' ? '.jpg' : urlExt
          }
        } catch {
          // Ignore
        }
      }
      return ''
    }
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
}

export async function downloadExternalMediaCandidate(
  candidate: ExternalMediaCandidate,
  targetDir: string,
  options?: { timeoutMs?: number; maxSizeBytes?: number; signal?: AbortSignal },
): Promise<DownloadResult> {
  if (candidate.import_mode !== 'AUTO_IMPORT') {
    throw new Error(
      `Candidate "${candidate.candidate_id}" is not eligible for automatic download (import_mode: ${candidate.import_mode}, rights_status: ${candidate.rights_status}).`,
    )
  }

  if (!candidate.direct_media_url) {
    throw new Error(`Candidate "${candidate.candidate_id}" has no direct media URL for download.`)
  }

  validateSafeUrl(candidate.direct_media_url)

  await fs.promises.mkdir(targetDir, { recursive: true })

  const timeoutMs = options?.timeoutMs ?? DOWNLOAD_TIMEOUT_MS
  const maxSizeBytes = options?.maxSizeBytes ?? MAX_DOWNLOAD_SIZE_BYTES
  const controller = new AbortController()
  options?.signal?.throwIfAborted()
  const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal
  const timeout = setTimeout(() => controller.abort(new Error(`Download timed out after ${timeoutMs}ms`)), timeoutMs)

  const tempFilePath = path.join(targetDir, `download_${randomUUID()}.tmp`)
  let bytesWritten = 0
  const stagedFiles = [tempFilePath]

  try {
    let currentUrl = candidate.direct_media_url
    let redirectCount = 0
    const MAX_REDIRECTS = 5
    let response: Response

    while (true) {
      validateSafeUrl(currentUrl)
      response = await fetch(currentUrl, {
        signal,
        headers: {
          'User-Agent': 'SCLIP-Video-Editor/1.0 (https://sclip.app; contact@sclip.app)',
        },
        redirect: 'manual',
      })

      if (response.status === 429) {
        // Rate-limited by provider CDN (e.g. Wikimedia). Backoff briefly and retry once.
        await delay(2000, undefined, { signal })
        response = await fetch(currentUrl, {
          signal,
          headers: {
            'User-Agent': 'SCLIP-Video-Editor/1.0 (https://sclip.app; contact@sclip.app)',
          },
          redirect: 'manual',
        })
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirectCount++
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`)
        }
        const location = response.headers.get('location')
        if (!location) {
          throw new Error(`Redirect status ${response.status} missing Location header`)
        }
        const resolvedUrl = new URL(location, currentUrl).toString()
        validateSafeUrl(resolvedUrl)
        currentUrl = resolvedUrl
        continue
      }
      break
    }

    if (response.url) {
      validateSafeUrl(response.url)
    }

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} (${response.statusText}) from ${currentUrl}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const contentLength = Number(response.headers.get('content-length'))

    if (contentLength && contentLength > maxSizeBytes) {
      throw new Error(`File size ${contentLength} bytes exceeds limit of ${maxSizeBytes} bytes.`)
    }

    let ext = extensionFromMime(contentType, currentUrl)
    if (!ext) {
      throw new Error(`Unsupported content type: "${contentType}" from ${currentUrl}`)
    }

    const body = response.body
    if (!body) {
      throw new Error(`Empty response body from ${candidate.direct_media_url}`)
    }

    const bounded = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesWritten += chunk.length
        callback(bytesWritten > maxSizeBytes ? new Error(`Download exceeded maximum permitted size of ${maxSizeBytes} bytes.`) : null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), bounded,
      fs.createWriteStream(tempFilePath, { flags: 'wx' }), { signal })
    if (!bytesWritten) throw new Error('Empty stock media download')

    const sanitizedTitle = sanitizeFilename(candidate.title || candidate.candidate_id)
    const finalFilename = `${sanitizeFilename(candidate.provider)}_${sanitizeFilename(candidate.provider_asset_id)}_${sanitizedTitle}_${randomUUID()}${ext}`
    const finalFilePath = path.join(targetDir, finalFilename)

    signal.throwIfAborted()
    await fs.promises.rename(tempFilePath, finalFilePath)
    stagedFiles.push(finalFilePath)

    const provenance = {
      candidate_id: candidate.candidate_id,
      provider: candidate.provider,
      provider_asset_id: candidate.provider_asset_id,
      title: candidate.title,
      source_page_url: candidate.source_page_url,
      original_url: candidate.direct_media_url,
      creator: candidate.creator ?? null,
      license: candidate.license ?? null,
      license_url: candidate.license_url ?? null,
      attribution: candidate.attribution ?? null,
      attribution_required: candidate.attribution_required,
      rights_status: candidate.rights_status,
      import_mode: candidate.import_mode,
      media_type: candidate.media_type,
      width: candidate.width ?? null,
      height: candidate.height ?? null,
      duration: candidate.duration ?? null,
      file_size: bytesWritten,
      downloaded_at: new Date().toISOString(),
    }

    const provenancePath = `${finalFilePath}.provenance.json`
    stagedFiles.push(provenancePath)
    await fs.promises.writeFile(provenancePath, JSON.stringify(provenance, null, 2), { encoding: 'utf8', flag: 'wx' })
    signal.throwIfAborted()

    return {
      filePath: finalFilePath,
      fileSize: bytesWritten,
      contentType,
      provenancePath,
    }
  } catch (error) {
    try {
      await Promise.all(stagedFiles.map(file => fs.promises.rm(file, { force: true })))
    } catch {
      // Ignore cleanup error
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
