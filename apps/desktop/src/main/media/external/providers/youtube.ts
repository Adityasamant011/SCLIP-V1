import type {
  ExternalMediaCandidate,
  ExternalMediaProvider,
  ExternalMediaSearchOptions,
  ImportMode,
  RightsStatus,
} from '../types.js'
import { getProviderKey } from '../credentials.js'

export function parseIsoDuration(durationStr?: string): number | undefined {
  if (!durationStr) return undefined
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(durationStr)
  if (!match) return undefined
  const hours = parseInt(match[1] || '0', 10)
  const minutes = parseInt(match[2] || '0', 10)
  const seconds = parseInt(match[3] || '0', 10)
  return hours * 3600 + minutes * 60 + seconds
}

export class YouTubeProvider implements ExternalMediaProvider {
  readonly name = 'youtube' as const
  readonly displayName = 'YouTube Discovery & Reference'

  async search(options: ExternalMediaSearchOptions): Promise<ExternalMediaCandidate[]> {
    const { query, media_type = 'either', limit = 10 } = options

    if (media_type === 'image') {
      return []
    }

    const apiKey = getProviderKey('youtube')
    if (!apiKey) {
      throw new Error('PROVIDER_NOT_CONFIGURED: YouTube API key is not configured.')
    }

    const candidates: ExternalMediaCandidate[] = []

    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${limit}&key=${apiKey}`
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) })

      if (!searchRes.ok) {
        throw new Error(`YouTube API search failed (${searchRes.status})`)
      }

      const searchData = (await searchRes.json()) as any
      const items = searchData.items || []
      const videoIds = items.map((it: any) => it.id?.videoId).filter(Boolean)

      const detailsMap = new Map<string, { duration?: number; license?: string }>()

      if (videoIds.length > 0) {
        try {
          const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${encodeURIComponent(videoIds.join(','))}&key=${apiKey}`
          const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(8000) })
          if (detailsRes.ok) {
            const detailsData = (await detailsRes.json()) as any
            for (const vItem of detailsData.items || []) {
              const id = vItem.id
              const duration = parseIsoDuration(vItem.contentDetails?.duration)
              const license = vItem.status?.license
              detailsMap.set(id, { duration, license })
            }
          }
        } catch {
          // If details query fails, continue with basic snippet data
        }
      }

      for (const item of items) {
        const videoId = item.id?.videoId
        if (!videoId) continue

        const snippet = item.snippet || {}
        const details = detailsMap.get(videoId)
        const isCc = details?.license === 'creativeCommon'

        const rights_status: RightsStatus = isCc
          ? 'DISCOVERY_CC_CLAIMED'
          : 'RIGHTS_UNVERIFIED'

        // Per Phase 1 requirements: Standard YouTube content results in DISCOVERY_ONLY or USER_IMPORT.
        // Never automatically download normal YouTube videos.
        const import_mode: ImportMode = isCc ? 'USER_IMPORT' : 'DISCOVERY_ONLY'
        const license = isCc
          ? 'YouTube Creative Commons Attribution (CC BY claimed)'
          : 'Standard YouTube License (All Rights Reserved)'

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
        const channel = snippet.channelTitle || 'Unknown Channel'
        const title = snippet.title || `YouTube Video: ${query}`

        candidates.push({
          candidate_id: `youtube-${videoId}`,
          provider: 'youtube',
          provider_asset_id: videoId,
          media_type: 'video',
          title,
          description: snippet.description || `YouTube video from channel ${channel}`,
          thumbnail_url:
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.default?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          preview_url: videoUrl,
          source_page_url: videoUrl,
          direct_media_url: undefined, // Strictly reference/discovery only; no auto-download
          creator: channel,
          origin_domain: 'youtube.com',
          duration: details?.duration,
          orientation: 'landscape',
          query_used: query,
          rights_status,
          import_mode,
          license,
          license_url: isCc ? 'https://support.google.com/youtube/answer/2797468' : 'https://www.youtube.com/static?template=terms',
          attribution: `"${title}" by ${channel} on YouTube (${license})`,
          attribution_required: true,
          published_at: snippet.publishedAt,
        })
      }
    } catch (error) {
      throw new Error(
        `YouTube search failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return candidates.slice(0, limit)
  }
}
