import type {
  ExternalMediaCandidate,
  ExternalMediaProvider,
  ExternalMediaSearchOptions,
} from '../types.js'
import { getProviderKey } from '../credentials.js'

export class PixabayProvider implements ExternalMediaProvider {
  readonly name = 'pixabay' as const
  readonly displayName = 'Pixabay'

  async search(options: ExternalMediaSearchOptions): Promise<ExternalMediaCandidate[]> {
    const { query, media_type = 'either', limit = 10, orientation } = options
    const apiKey = getProviderKey('pixabay')

    if (!apiKey) {
      throw new Error('PROVIDER_NOT_CONFIGURED: Pixabay API key is not configured.')
    }

    const candidates: ExternalMediaCandidate[] = []
    const orientationParam = orientation ? `&orientation=${orientation === 'portrait' ? 'vertical' : 'horizontal'}` : ''

    if (media_type === 'either' || media_type === 'video') {
      try {
        const videoRes = await fetch(
          `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${limit}${orientationParam}`,
          { signal: AbortSignal.timeout(8000) },
        )
        if (videoRes.ok) {
          const data = (await videoRes.json()) as any
          for (const hit of data.hits || []) {
            const video = hit.videos?.large || hit.videos?.medium || hit.videos?.small
            const directUrl = video?.url
            const width = video?.width || 1920
            const height = video?.height || 1080
            const orient = width > height ? 'landscape' : width < height ? 'portrait' : 'square'

            candidates.push({
              candidate_id: `pixabay-video-${hit.id}`,
              provider: 'pixabay',
              provider_asset_id: String(hit.id),
              media_type: 'video',
              title: hit.tags || `Pixabay Video: ${query}`,
              description: `Stock footage by ${hit.user || 'contributor'}`,
              thumbnail_url: hit.videos?.tiny?.thumbnail || hit.userImageURL || '',
              preview_url: directUrl,
              source_page_url: hit.pageURL,
              direct_media_url: directUrl,
              creator: hit.user,
              origin_domain: 'pixabay.com',
              width,
              height,
              duration: hit.duration,
              orientation: orient,
              query_used: query,
              rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
              import_mode: directUrl ? 'AUTO_IMPORT' : 'USER_IMPORT',
              license: 'Pixabay Content License (Free for commercial use)',
              license_url: 'https://pixabay.com/service/license-summary/',
              attribution: hit.user ? `Video by ${hit.user} from Pixabay` : undefined,
              attribution_required: false,
            })
          }
        } else {
          throw new Error(`Pixabay video search failed (${videoRes.status})`)
        }
      } catch (err) {
        if (media_type === 'video') throw err
      }
    }

    if (media_type === 'either' || media_type === 'image') {
      try {
        const imageRes = await fetch(
          `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=all&per_page=${limit}${orientationParam}`,
          { signal: AbortSignal.timeout(8000) },
        )
        if (imageRes.ok) {
          const data = (await imageRes.json()) as any
          for (const hit of data.hits || []) {
            const directUrl = hit.largeImageURL || hit.webformatURL
            const width = hit.imageWidth
            const height = hit.imageHeight
            const orient = width && height
              ? (width > height ? 'landscape' : width < height ? 'portrait' : 'square')
              : undefined

            candidates.push({
              candidate_id: `pixabay-image-${hit.id}`,
              provider: 'pixabay',
              provider_asset_id: String(hit.id),
              media_type: 'image',
              title: hit.tags || `Pixabay Photo: ${query}`,
              description: `Stock photo by ${hit.user || 'contributor'}`,
              thumbnail_url: hit.previewURL,
              preview_url: hit.webformatURL,
              source_page_url: hit.pageURL,
              direct_media_url: directUrl,
              creator: hit.user,
              origin_domain: 'pixabay.com',
              width,
              height,
              orientation: orient,
              query_used: query,
              rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
              import_mode: directUrl ? 'AUTO_IMPORT' : 'USER_IMPORT',
              license: 'Pixabay Content License (Free for commercial use)',
              license_url: 'https://pixabay.com/service/license-summary/',
              attribution: hit.user ? `Photo by ${hit.user} from Pixabay` : undefined,
              attribution_required: false,
            })
          }
        } else {
          throw new Error(`Pixabay image search failed (${imageRes.status})`)
        }
      } catch (err) {
        if (media_type === 'image') throw err
      }
    }

    return candidates.slice(0, limit)
  }
}
