import type {
  ExternalMediaCandidate,
  ExternalMediaProvider,
  ExternalMediaSearchOptions,
  ImportMode,
  RightsStatus,
} from '../types.js'

export class WikimediaProvider implements ExternalMediaProvider {
  readonly name = 'wikimedia' as const
  readonly displayName = 'Wikimedia Commons'

  async search(options: ExternalMediaSearchOptions): Promise<ExternalMediaCandidate[]> {
    const { query, media_type = 'either', limit = 10 } = options
    const candidates: ExternalMediaCandidate[] = []

    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}&prop=imageinfo&iiprop=url|size|extmetadata|mime&format=json&origin=*`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SCLIP-Video-Editor/1.0 (https://sclip.app)' },
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) {
        throw new Error(`Wikimedia search failed (${res.status})`)
      }

      const data = (await res.json()) as any
      const pages = data.query?.pages || {}

      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId]
        const info = page.imageinfo?.[0]
        if (!info) continue

        const mime: string = info.mime || ''
        const isVideo = mime.startsWith('video/')
        const isImage = mime.startsWith('image/')
        if (!isVideo && !isImage) continue

        if (media_type === 'video' && !isVideo) continue
        if (media_type === 'image' && !isImage) continue

        const meta = info.extmetadata || {}
        const reportedLicense = meta.LicenseShortName?.value || meta.License?.value
        const hasLicenseMetadata =
          typeof reportedLicense === 'string' && reportedLicense.trim().length > 0
        const license = hasLicenseMetadata ? reportedLicense.trim() : 'Unverified'
        const licenseUrl = meta.LicenseUrl?.value || 'https://commons.wikimedia.org/'
        const rawArtist = meta.Artist?.value || ''
        const artist = rawArtist
          ? rawArtist.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim()
          : 'Wikimedia Contributor'
        const rawDesc = meta.ImageDescription?.value || ''
        const description = rawDesc
          ? rawDesc.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 300)
          : `Historical / documentary media from Wikimedia Commons for ${query}`

        const lic = license.toLowerCase()
        let rights_status: RightsStatus = 'RIGHTS_UNVERIFIED'
        let import_mode: ImportMode = 'APPROVAL_REQUIRED'
        let attribution_required = true

        if (!hasLicenseMetadata || license === 'Unverified') {
          rights_status = 'RIGHTS_UNVERIFIED'
          import_mode = 'DISCOVERY_ONLY'
          attribution_required = true
        } else if (
          lic.includes('nc') ||
          lic.includes('noncommercial') ||
          lic.includes('nd') ||
          lic.includes('no-derivatives') ||
          lic.includes('noderivs')
        ) {
          rights_status = 'BLOCKED'
          import_mode = 'DISCOVERY_ONLY'
          attribution_required = true
        } else if (
          lic.includes('cc0') ||
          lic.includes('public domain') ||
          lic.includes('pdm') ||
          lic === 'pd'
        ) {
          rights_status = 'OPEN_LICENSE_VERIFIED'
          import_mode = 'AUTO_IMPORT'
          attribution_required = false
        } else if (
          lic.includes('sa') ||
          lic.includes('sharealike') ||
          lic.includes('share-alike')
        ) {
          rights_status = 'SHAREALIKE_REVIEW_REQUIRED'
          import_mode = 'APPROVAL_REQUIRED'
          attribution_required = true
        } else if (
          lic.includes('by') ||
          lic.includes('creative commons') ||
          lic.includes('attribution')
        ) {
          rights_status = 'OPEN_LICENSE_ATTRIBUTION_REQUIRED'
          import_mode = 'AUTO_IMPORT'
          attribution_required = true
        } else {
          rights_status = 'RIGHTS_UNVERIFIED'
          import_mode = 'APPROVAL_REQUIRED'
          attribution_required = true
        }

        const width = info.width
        const height = info.height
        const orient = width && height
          ? (width > height ? 'landscape' : width < height ? 'portrait' : 'square')
          : undefined

        const directUrl = (import_mode === 'AUTO_IMPORT' && info.url?.startsWith('https://'))
          ? info.url
          : undefined

        const title = page.title?.replace(/^File:/, '') || `Wikimedia: ${query}`

        candidates.push({
          candidate_id: `wikimedia-${pageId}`,
          provider: 'wikimedia',
          provider_asset_id: String(pageId),
          media_type: isVideo ? 'video' : 'image',
          title,
          description,
          thumbnail_url: info.thumburl || info.url || '',
          preview_url: info.url,
          source_page_url:
            info.descriptionurl ||
            `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`,
          direct_media_url: directUrl,
          creator: artist,
          origin_domain: 'commons.wikimedia.org',
          width,
          height,
          orientation: orient,
          query_used: query,
          rights_status,
          import_mode,
          license,
          license_url: licenseUrl,
          attribution: `${title} by ${artist} (${license})`,
          attribution_required,
        })
      }
    } catch (error) {
      throw new Error(
        `Wikimedia search failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return candidates.slice(0, limit)
  }
}
