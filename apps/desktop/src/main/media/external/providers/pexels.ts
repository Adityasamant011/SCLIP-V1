import {chooseVideoRendition} from '../videoRendition.js'
import type {
  ExternalMediaCandidate,
  ExternalMediaProvider,
  ExternalMediaSearchOptions,
} from '../types.js'
import { getProviderKey } from '../credentials.js'
import { sharedStockAvailable, stockSearchRequest } from '../sharedStock.js'

export class PexelsProvider implements ExternalMediaProvider {
  readonly name = 'pexels' as const
  readonly displayName = 'Pexels Stock'

  async search(options: ExternalMediaSearchOptions): Promise<ExternalMediaCandidate[]> {
    const { query, media_type = 'either', orientation } = options
    const limit = Math.max(1, Math.min(80, options.limit ?? 10))
    const apiKey = getProviderKey('pexels')

    if (!apiKey && !sharedStockAvailable()) {
      throw new Error('PROVIDER_NOT_CONFIGURED: Pexels API key is not configured.')
    }

    const candidates: ExternalMediaCandidate[] = []
    const failures: unknown[] = []
    const orientationParam = orientation ? `&orientation=${orientation}` : ''

    if (media_type === 'either' || media_type === 'video') {
      try {
        const videoRes = await stockSearchRequest('pexels',
          `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${limit}${orientationParam}`,
          {
            headers: { Authorization: apiKey ?? '' },
            signal: AbortSignal.timeout(8000),
          }, !!apiKey,
        )
        if (videoRes.ok) {
          const data = (await videoRes.json()) as any
          for (const v of data.videos || []) {
            const bestFile = chooseVideoRendition(v.video_files || [])

            const directUrl = bestFile?.link
            const width = bestFile?.width
            const height = bestFile?.height
            const orient = width && height
              ? (width > height ? 'landscape' : width < height ? 'portrait' : 'square')
              : undefined

            candidates.push({
              candidate_id: `pexels-video-${v.id}`,
              provider: 'pexels',
              provider_asset_id: String(v.id),
              media_type: 'video',
              title: `Pexels Video: ${query}`,
              description: `Pexels stock footage by ${v.user?.name || 'contributor'}`,
              thumbnail_url: v.image || '',
              preview_url: directUrl,
              source_page_url: v.url || `https://www.pexels.com/video/${v.id}/`,
              direct_media_url: directUrl,
              creator: v.user?.name,
              origin_domain: 'pexels.com',
              width,
              height,
              duration: v.duration,
              fps: bestFile?.fps,
              orientation: orient,
              query_used: query,
              rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
              import_mode: directUrl ? 'AUTO_IMPORT' : 'USER_IMPORT',
              license: 'Pexels License (Free to use)',
              license_url: 'https://www.pexels.com/license/',
              attribution: v.user?.name ? `Video by ${v.user.name} from Pexels` : undefined,
              attribution_required: false,
            })
          }
        } else {
          throw new Error(`Pexels video search failed (${videoRes.status})`)
        }
      } catch (err) {
        failures.push(err)
        if (media_type === 'video') throw err
      }
    }

    if (media_type === 'either' || media_type === 'image') {
      try {
        const photoRes = await stockSearchRequest('pexels',
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}${orientationParam}`,
          {
            headers: { Authorization: apiKey ?? '' },
            signal: AbortSignal.timeout(8000),
          }, !!apiKey,
        )
        if (photoRes.ok) {
          const data = (await photoRes.json()) as any
          for (const p of data.photos || []) {
            const directUrl = p.src?.original || p.src?.large2x || p.src?.large
            const width = p.width
            const height = p.height
            const orient = width && height
              ? (width > height ? 'landscape' : width < height ? 'portrait' : 'square')
              : undefined

            candidates.push({
              candidate_id: `pexels-photo-${p.id}`,
              provider: 'pexels',
              provider_asset_id: String(p.id),
              media_type: 'image',
              title: p.alt || `Pexels Photo: ${query}`,
              description: `Pexels stock photo by ${p.photographer || 'contributor'}`,
              thumbnail_url: p.src?.medium || p.src?.small || '',
              preview_url: p.src?.large || p.src?.medium,
              source_page_url: p.url || `https://www.pexels.com/photo/${p.id}/`,
              direct_media_url: directUrl,
              creator: p.photographer,
              origin_domain: 'pexels.com',
              width,
              height,
              orientation: orient,
              query_used: query,
              rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
              import_mode: directUrl ? 'AUTO_IMPORT' : 'USER_IMPORT',
              license: 'Pexels License (Free to use)',
              license_url: 'https://www.pexels.com/license/',
              attribution: p.photographer ? `Photo by ${p.photographer} from Pexels` : undefined,
              attribution_required: false,
            })
          }
        } else {
          throw new Error(`Pexels photo search failed (${photoRes.status})`)
        }
      } catch (err) {
        failures.push(err)
        if (media_type === 'image') throw err
      }
    }

    if (failures.length === 2) throw new Error('Pexels stock searches failed; check your API key, quota and network connection.')
    return candidates.slice(0, limit)
  }
}
