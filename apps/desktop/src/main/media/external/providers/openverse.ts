import type {
  ExternalMediaCandidate,
  ExternalMediaProvider,
  ExternalMediaSearchOptions,
  ImportMode,
  RightsStatus,
} from '../types.js'

export class OpenverseProvider implements ExternalMediaProvider {
  readonly name = 'openverse' as const
  readonly displayName = 'Openverse (Creative Commons Images)'

  async search(options: ExternalMediaSearchOptions): Promise<ExternalMediaCandidate[]> {
    const { query, media_type = 'either', limit = 10 } = options

    // Openverse is strictly an open image catalog; it does not provide video stock.
    if (media_type === 'video') {
      return []
    }

    const candidates: ExternalMediaCandidate[] = []

    try {
      const res = await fetch(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${limit}`,
        {
          headers: { 'User-Agent': 'SCLIP-Video-Editor/1.0 (https://sclip.app)' },
          signal: AbortSignal.timeout(8000),
        },
      )

      if (!res.ok) {
        throw new Error(`Openverse search failed (${res.status})`)
      }

      const data = (await res.json()) as any
      for (const item of data.results || []) {
        const rawLicense = (item.license || '').toLowerCase()
        const hasLicenseMetadata = rawLicense.trim().length > 0
        const license = hasLicenseMetadata
          ? `CC ${item.license.toUpperCase()} ${item.license_version || ''}`.trim()
          : 'Unverified'

        // Openverse does not verify upstream license accuracy.
        // Therefore do not AUTO_IMPORT solely from Openverse metadata without upstream verification.
        const rights_status: RightsStatus = hasLicenseMetadata
          ? 'DISCOVERY_CC_CLAIMED'
          : 'RIGHTS_UNVERIFIED'
        const import_mode: ImportMode = 'APPROVAL_REQUIRED'
        const attribution_required = rawLicense !== 'cc0' && rawLicense !== 'pdm'

        const width = item.width
        const height = item.height
        const orient = width && height
          ? (width > height ? 'landscape' : width < height ? 'portrait' : 'square')
          : undefined

        // Direct media URL is omitted for unverified upstream CC claims to prevent unverified auto-download
        const directUrl = undefined

        const title = item.title || `Openverse Image: ${query}`

        candidates.push({
          candidate_id: `openverse-${item.id}`,
          provider: 'openverse',
          provider_asset_id: String(item.id),
          media_type: 'image',
          title,
          description: `Creative Commons image by ${item.creator || 'unknown'}`,
          thumbnail_url: item.thumbnail || item.url || '',
          preview_url: item.url,
          source_page_url: item.foreign_landing_url || `https://openverse.org/image/${item.id}`,
          direct_media_url: directUrl,
          creator: item.creator,
          origin_domain: item.source || 'openverse.org',
          width,
          height,
          orientation: orient,
          query_used: query,
          rights_status,
          import_mode,
          license,
          license_url: item.license_url,
          attribution: item.attribution || `${title} by ${item.creator || 'unknown'} (${license})`,
          attribution_required,
        })
      }
    } catch (error) {
      throw new Error(
        `Openverse search failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return candidates.slice(0, limit)
  }
}
