import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ExternalMediaService,
  PexelsProvider,
  PixabayProvider,
  WikimediaProvider,
  OpenverseProvider,
  YouTubeProvider,
  parseIsoDuration,
  validateSafeUrl,
  downloadExternalMediaCandidate,
  buildAttributionObligation,
  attachAttributionMetadata,
  getProjectAttributionObligations,
  getTimelineAttributionObligations,
  checkExportAttributionSafety,
  type ExternalMediaCandidate,
  type ExternalMediaProvider,
} from './index.js'
import { registeredMcpTools, handleCallTool } from '../../mcp/server.js'
import { createActor } from '../../state/actor.js'
import { blankProject } from '../../state/model.js'
import { uuidV7Gen } from '../../state/ids.js'
import { mediaItemTemplate } from '../../state/mutations/media.js'
import { serializeProjectToJson } from '../../state/persistence.js'
import { parseProject } from '../../state/serialize.js'
import type { TsActorHost } from '../../state/ts-actor-host.js'

describe('External Media B-Roll System (Phase 1)', () => {
  describe('Provider Normalization', () => {
    it('normalizes YouTube discovery candidates and enforces DISCOVERY_ONLY / USER_IMPORT', async () => {
      const provider = new YouTubeProvider()
      const mockSearchData = {
        items: [
          {
            id: { videoId: 'abc123vid' },
            snippet: {
              title: 'Steve Jobs iPhone 2007 Presentation',
              description: 'Official keynote introduction of iPhone',
              channelTitle: 'Apple Keynotes Archive',
              publishedAt: '2007-01-09T18:00:00Z',
              thumbnails: {
                high: { url: 'https://i.ytimg.com/vi/abc123vid/hqdefault.jpg' },
              },
            },
          },
        ],
      }
      const mockVideosData = {
        items: [
          {
            id: 'abc123vid',
            contentDetails: { duration: 'PT1H24M15S' },
            status: { license: 'youtube' },
          },
        ],
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(async (url: any) => {
        const u = String(url)
        if (u.includes('youtube/v3/search')) {
          return { ok: true, json: async () => mockSearchData } as any
        }
        if (u.includes('youtube/v3/videos')) {
          return { ok: true, json: async () => mockVideosData } as any
        }
        return { ok: false, status: 404 } as any
      })

      process.env.YOUTUBE_API_KEY = 'test-youtube-key'

      try {
        const results = await provider.search({ query: 'Steve Jobs iPhone 2007' })
        expect(results).toHaveLength(1)
        const c = results[0]!
        expect(c.candidate_id).toBe('youtube-abc123vid')
        expect(c.provider).toBe('youtube')
        expect(c.media_type).toBe('video')
        expect(c.title).toBe('Steve Jobs iPhone 2007 Presentation')
        expect(c.creator).toBe('Apple Keynotes Archive')
        expect(c.duration).toBe(1 * 3600 + 24 * 60 + 15) // PT1H24M15S = 5055s
        expect(c.source_page_url).toBe('https://www.youtube.com/watch?v=abc123vid')
        expect(c.direct_media_url).toBeUndefined() // NEVER direct download for normal YouTube
        expect(c.rights_status).toBe('RIGHTS_UNVERIFIED')
        expect(c.import_mode).toBe('DISCOVERY_ONLY')
        expect(c.attribution_required).toBe(true)
      } finally {
        globalThis.fetch = originalFetch
        delete process.env.YOUTUBE_API_KEY
      }
    })

    it('correctly parses ISO 8601 durations', () => {
      expect(parseIsoDuration('PT1M30S')).toBe(90)
      expect(parseIsoDuration('PT55S')).toBe(55)
      expect(parseIsoDuration('PT2H5M12S')).toBe(7512)
      expect(parseIsoDuration('')).toBeUndefined()
      expect(parseIsoDuration('invalid')).toBeUndefined()
    })

    it('normalizes Pexels video and photo candidates with AUTO_IMPORT', async () => {
      const provider = new PexelsProvider()
      const mockVideoData = {
        videos: [
          {
            id: 9988,
            width: 1920,
            height: 1080,
            duration: 12,
            image: 'https://images.pexels.com/videos/9988/thumb.jpg',
            url: 'https://www.pexels.com/video/9988/',
            user: { name: 'Pexels Filmmaker' },
            video_files: [
              { quality: 'hd', width: 1920, height: 1080, fps: 30, link: 'https://cdn.pexels.com/video-files/9988/hd.mp4' },
            ],
          },
        ],
      }
      const mockPhotoData = {
        photos: [
          {
            id: 4455,
            width: 3000,
            height: 2000,
            alt: 'Developer coding at laptop',
            photographer: 'Stock Photographer',
            url: 'https://www.pexels.com/photo/4455/',
            src: {
              medium: 'https://images.pexels.com/photos/4455/medium.jpg',
              original: 'https://images.pexels.com/photos/4455/original.jpg',
            },
          },
        ],
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(async (url: any) => {
        const u = String(url)
        if (u.includes('videos/search')) return { ok: true, json: async () => mockVideoData } as any
        if (u.includes('v1/search')) return { ok: true, json: async () => mockPhotoData } as any
        return { ok: false, status: 404 } as any
      })
      process.env.PEXELS_API_KEY = 'test-pexels-key'

      try {
        const results = await provider.search({ query: 'coding laptop', media_type: 'either' })
        expect(results).toHaveLength(2)

        const video = results.find((c) => c.media_type === 'video')!
        expect(video.candidate_id).toBe('pexels-video-9988')
        expect(video.rights_status).toBe('PROVIDER_LICENSE_ELIGIBLE')
        expect(video.import_mode).toBe('AUTO_IMPORT')
        expect(video.direct_media_url).toBe('https://cdn.pexels.com/video-files/9988/hd.mp4')
        expect(video.duration).toBe(12)
        expect(video.orientation).toBe('landscape')

        const photo = results.find((c) => c.media_type === 'image')!
        expect(photo.candidate_id).toBe('pexels-photo-4455')
        expect(photo.rights_status).toBe('PROVIDER_LICENSE_ELIGIBLE')
        expect(photo.import_mode).toBe('AUTO_IMPORT')
        expect(photo.direct_media_url).toBe('https://images.pexels.com/photos/4455/original.jpg')
      } finally {
        globalThis.fetch = originalFetch
        delete process.env.PEXELS_API_KEY
      }
    })

    it('normalizes Pixabay video and image candidates', async () => {
      const provider = new PixabayProvider()
      const mockVideoData = {
        hits: [
          {
            id: 1234,
            duration: 15,
            user: 'pixabay_user',
            pageURL: 'https://pixabay.com/videos/nature-1234/',
            videos: {
              large: { url: 'https://pixabay.com/videos/get/1234_large.mp4', width: 1920, height: 1080 },
              tiny: { thumbnail: 'https://pixabay.com/videos/thumb-1234.jpg' },
            },
          },
        ],
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(async (_url: any) => {
        return { ok: true, json: async () => mockVideoData } as any
      })
      process.env.PIXABAY_API_KEY = 'test-pixabay-key'

      try {
        const results = await provider.search({ query: 'nature', media_type: 'video' })
        expect(results).toHaveLength(1)
        expect(results[0]!.candidate_id).toBe('pixabay-video-1234')
        expect(results[0]!.rights_status).toBe('PROVIDER_LICENSE_ELIGIBLE')
        expect(results[0]!.import_mode).toBe('AUTO_IMPORT')
        expect(results[0]!.direct_media_url).toBe('https://pixabay.com/videos/get/1234_large.mp4')
      } finally {
        globalThis.fetch = originalFetch
        delete process.env.PIXABAY_API_KEY
      }
    })

    it('normalizes Wikimedia Commons media and distinguishes CC0, CC-BY, and unverified rights', async () => {
      const provider = new WikimediaProvider()
      const mockWikimediaData = {
        query: {
          pages: {
            '101': {
              title: 'File:Apollo_11_Liftoff.jpg',
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/wikipedia/commons/apollo11.jpg',
                  thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/apollo11.jpg',
                  width: 2000,
                  height: 1500,
                  mime: 'image/jpeg',
                  extmetadata: {
                    LicenseShortName: { value: 'Public domain' },
                    LicenseUrl: { value: 'https://en.wikipedia.org/wiki/Public_domain' },
                    Artist: { value: '<p>NASA</p>' },
                    ImageDescription: { value: 'Apollo 11 Saturn V rocket liftoff' },
                  },
                },
              ],
            },
            '102': {
              title: 'File:Eiffel_Tower_Day.jpg',
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/wikipedia/commons/eiffel.jpg',
                  width: 1080,
                  height: 1920,
                  mime: 'image/jpeg',
                  extmetadata: {
                    LicenseShortName: { value: 'CC BY 4.0' },
                    LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
                    Artist: { value: 'Photographer Pierre' },
                  },
                },
              ],
            },
            '103': {
              title: 'File:Uncredited_Historical.jpg',
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/wikipedia/commons/mystery.jpg',
                  width: 800,
                  height: 600,
                  mime: 'image/jpeg',
                  extmetadata: {}, // Missing license metadata!
                },
              ],
            },
          },
        },
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => mockWikimediaData } as any))

      try {
        const results = await provider.search({ query: 'historical events', media_type: 'image' })
        expect(results).toHaveLength(3)

        const pd = results.find((c) => c.candidate_id === 'wikimedia-101')!
        expect(pd.rights_status).toBe('OPEN_LICENSE_VERIFIED')
        expect(pd.import_mode).toBe('AUTO_IMPORT')
        expect(pd.attribution_required).toBe(false)
        expect(pd.creator).toBe('NASA')
        expect(pd.direct_media_url).toBe('https://upload.wikimedia.org/wikipedia/commons/apollo11.jpg')

        const ccby = results.find((c) => c.candidate_id === 'wikimedia-102')!
        expect(ccby.rights_status).toBe('OPEN_LICENSE_ATTRIBUTION_REQUIRED')
        expect(ccby.import_mode).toBe('AUTO_IMPORT')
        expect(ccby.attribution_required).toBe(true)
        expect(ccby.orientation).toBe('portrait')

        const unverified = results.find((c) => c.candidate_id === 'wikimedia-103')!
        expect(unverified.rights_status).toBe('RIGHTS_UNVERIFIED')
        expect(unverified.import_mode).toBe('DISCOVERY_ONLY')
        expect(unverified.direct_media_url).toBeUndefined() // Block direct auto download when rights are unverified
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('normalizes Openverse open images and returns empty for video', async () => {
      const provider = new OpenverseProvider()
      const mockOpenverseData = {
        results: [
          {
            id: 'ov-photo-1',
            title: 'Vintage Camera',
            creator: 'Camera Collector',
            license: 'by',
            license_version: '4.0',
            license_url: 'https://creativecommons.org/licenses/by/4.0/',
            url: 'https://images.openverse.org/camera.jpg',
            thumbnail: 'https://images.openverse.org/camera_thumb.jpg',
            width: 1200,
            height: 800,
          },
        ],
      }

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => mockOpenverseData } as any))

      try {
        // Openverse does not claim to support video
        const videoRes = await provider.search({ query: 'camera', media_type: 'video' })
        expect(videoRes).toEqual([])

        const imageRes = await provider.search({ query: 'camera', media_type: 'image' })
        expect(imageRes).toHaveLength(1)
        expect(imageRes[0]!.candidate_id).toBe('openverse-ov-photo-1')
        expect(imageRes[0]!.rights_status).toBe('DISCOVERY_CC_CLAIMED')
        expect(imageRes[0]!.import_mode).toBe('APPROVAL_REQUIRED')
        expect(imageRes[0]!.direct_media_url).toBeUndefined() // Openverse unverified CC claims require upstream approval
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  describe('Downloader Security & Import Gates', () => {
    it('validates safe HTTPS URLs and blocks private/local IP ranges (SSRF protection)', () => {
      expect(() => validateSafeUrl('http://insecure.com/video.mp4')).toThrow('Insecure protocol')
      expect(() => validateSafeUrl('file:///etc/passwd')).toThrow('Insecure protocol')
      expect(() => validateSafeUrl('https://localhost/video.mp4')).toThrow('Blocked private or localhost')
      expect(() => validateSafeUrl('https://127.0.0.1/video.mp4')).toThrow('Blocked loopback')
      expect(() => validateSafeUrl('https://192.168.1.100/video.mp4')).toThrow('Blocked private')
      expect(() => validateSafeUrl('https://10.0.0.5/video.mp4')).toThrow('Blocked private')
      expect(() => validateSafeUrl('https://172.16.1.1/video.mp4')).toThrow('Blocked private')
      expect(() => validateSafeUrl('https://169.254.169.254/latest/meta-data/')).toThrow('Blocked link-local')
      expect(() => validateSafeUrl('https://[::1]/video.mp4')).toThrow('Blocked IPv6')

      const valid = validateSafeUrl('https://images.pexels.com/photos/123/original.jpg')
      expect(valid.protocol).toBe('https:')
      expect(valid.hostname).toBe('images.pexels.com')
    })

    it('enforces AUTO_IMPORT gate and rejects USER_IMPORT or DISCOVERY_ONLY candidates', async () => {
      const candidate: ExternalMediaCandidate = {
        candidate_id: 'youtube-test',
        provider: 'youtube',
        provider_asset_id: 'test',
        media_type: 'video',
        title: 'Copyrighted Video',
        thumbnail_url: 'https://thumb.com/t.jpg',
        source_page_url: 'https://youtube.com/watch?v=test',
        direct_media_url: 'https://youtube.com/watch?v=test',
        query_used: 'query',
        rights_status: 'RIGHTS_UNVERIFIED',
        import_mode: 'DISCOVERY_ONLY',
        attribution_required: true,
      }

      await expect(
        downloadExternalMediaCandidate(candidate, '/tmp/target'),
      ).rejects.toThrow('is not eligible for automatic download')
    })

    it('downloads permitted AUTO_IMPORT candidate, checks size limit, and writes provenance sidecar', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-downloader-test-'))
      const fakeImageBytes = Buffer.from('FAKE_JPEG_IMAGE_DATA_BYTES')

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(async () => {
        return {
          ok: true,
          headers: new Headers({
            'content-type': 'image/jpeg',
            'content-length': String(fakeImageBytes.length),
          }),
          body: {
            getReader: () => {
              let done = false
              return {
                read: async () => {
                  if (done) return { done: true, value: undefined }
                  done = true
                  return { done: false, value: new Uint8Array(fakeImageBytes) }
                },
                cancel: () => {},
              }
            },
          },
        } as any
      })

      const candidate: ExternalMediaCandidate = {
        candidate_id: 'pexels-photo-777',
        provider: 'pexels',
        provider_asset_id: '777',
        media_type: 'image',
        title: 'Clean Workspace Desk',
        thumbnail_url: 'https://images.pexels.com/thumb.jpg',
        source_page_url: 'https://pexels.com/photo/777',
        direct_media_url: 'https://images.pexels.com/777.jpg',
        creator: 'Photographer Jane',
        query_used: 'clean workspace',
        rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
        import_mode: 'AUTO_IMPORT',
        license: 'Pexels License',
        license_url: 'https://pexels.com/license',
        attribution: 'Photo by Jane from Pexels',
        attribution_required: false,
      }

      try {
        const result = await downloadExternalMediaCandidate(candidate, tmpDir)
        expect(fs.existsSync(result.filePath)).toBe(true)
        expect(fs.existsSync(result.provenancePath)).toBe(true)
        expect(result.fileSize).toBe(fakeImageBytes.length)

        const prov = JSON.parse(fs.readFileSync(result.provenancePath, 'utf8'))
        expect(prov.candidate_id).toBe('pexels-photo-777')
        expect(prov.provider).toBe('pexels')
        expect(prov.rights_status).toBe('PROVIDER_LICENSE_ELIGIBLE')
        expect(prov.import_mode).toBe('AUTO_IMPORT')
        expect(prov.attribution).toBe('Photo by Jane from Pexels')
      } finally {
        globalThis.fetch = originalFetch
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('ExternalMediaService: Routing, Deduplication & Stalled Search Protection', () => {
    it('tolerates partial provider failure and aggregates surviving candidates', async () => {
      const service = new ExternalMediaService()
      service.clearCaches()
      service.clearProviders()

      const pexelsMock: ExternalMediaProvider = {
        name: 'pexels',
        displayName: 'Pexels Mock',
        search: async () => [
          {
            candidate_id: 'pexels-v1',
            provider: 'pexels',
            provider_asset_id: 'v1',
            media_type: 'video',
            title: 'Office Timelapse',
            thumbnail_url: 'https://cdn.com/t.jpg',
            source_page_url: 'https://pexels.com/v1',
            direct_media_url: 'https://cdn.pexels.com/v1.mp4',
            query_used: 'office',
            rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
            import_mode: 'AUTO_IMPORT',
            attribution_required: false,
          },
        ],
      }

      const failingProvider: ExternalMediaProvider = {
        name: 'wikimedia',
        displayName: 'Failing Wikimedia Mock',
        search: async () => {
          throw new Error('Wikimedia API 503 Service Unavailable')
        },
      }

      service.registerProvider(pexelsMock)
      service.registerProvider(failingProvider)

      const result = await service.search({ query: 'office', provider: 'auto', media_type: 'video' })
      expect(result.success).toBe(true)
      expect(result.search_status).toBe('PARTIAL')
      expect(result.candidates.length).toBeGreaterThanOrEqual(1)
      expect(result.candidates.some((c) => c.candidate_id === 'pexels-v1')).toBe(true)
      expect(result.provider_outcomes?.some((o) => o.provider === 'wikimedia' && o.error !== null)).toBe(true)
    })

    it('deduplicates identical candidates across providers', async () => {
      const service = new ExternalMediaService()
      service.clearCaches()
      service.clearProviders()

      const p1: ExternalMediaProvider = {
        name: 'pexels',
        displayName: 'P1',
        search: async () => [
          {
            candidate_id: 'p1-1',
            provider: 'pexels',
            provider_asset_id: '1',
            media_type: 'image',
            title: 'Shared Asset',
            thumbnail_url: 'https://shared.com/thumb.jpg',
            source_page_url: 'https://shared.com/page/1',
            direct_media_url: 'https://shared.com/asset.jpg',
            query_used: 'shared',
            rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
            import_mode: 'AUTO_IMPORT',
            attribution_required: false,
          },
        ],
      }

      const p2: ExternalMediaProvider = {
        name: 'pixabay',
        displayName: 'P2',
        search: async () => [
          {
            candidate_id: 'p2-1',
            provider: 'pixabay',
            provider_asset_id: '2',
            media_type: 'image',
            title: 'Duplicate of Shared Asset',
            thumbnail_url: 'https://shared.com/thumb.jpg',
            source_page_url: 'https://shared.com/page/1',
            direct_media_url: 'https://shared.com/asset.jpg', // Same direct URL!
            query_used: 'shared',
            rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
            import_mode: 'AUTO_IMPORT',
            attribution_required: false,
          },
        ],
      }

      service.registerProvider(p1)
      service.registerProvider(p2)

      const result = await service.search({ query: 'shared', provider: 'auto', media_type: 'image' })
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0]!.candidate_id).toBe('p1-1')
    })

    it('protects against stalled infinite search loops and returns EXHAUSTED', async () => {
      const service = new ExternalMediaService()
      service.clearCaches()
      service.clearProviders()

      const repeatedProvider: ExternalMediaProvider = {
        name: 'pexels',
        displayName: 'Repeated Mock',
        search: async () => [
          {
            candidate_id: 'same-candidate-1',
            provider: 'pexels',
            provider_asset_id: '1',
            media_type: 'video',
            title: 'Same Candidate',
            thumbnail_url: 'https://cdn.com/t.jpg',
            source_page_url: 'https://pexels.com/same',
            direct_media_url: 'https://cdn.pexels.com/same.mp4',
            query_used: 'same',
            rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
            import_mode: 'AUTO_IMPORT',
            attribution_required: false,
          },
        ],
      }

      service.registerProvider(repeatedProvider)

      // Search 1: finds candidate
      const s1 = await service.search({ query: 'developer typing', project_id: 'loop-proj', provider: 'pexels' })
      expect(s1.progress?.consecutive_no_progress).toBe(0)

      // Search 2: returns same candidate, stalled count increases to 1
      const s2 = await service.search({ query: 'developer typing on keyboard', project_id: 'loop-proj', provider: 'pexels' })
      expect(s2.progress?.consecutive_no_progress).toBe(1)

      // Search 3: returns same candidate, stalled count increases to 2
      const s3 = await service.search({ query: 'coding laptop close up', project_id: 'loop-proj', provider: 'pexels' })
      expect(s3.progress?.consecutive_no_progress).toBe(2)

      // Search 4: stalled count >= 3 triggers EXHAUSTED guard
      const s4 = await service.search({ query: 'programmer typing at night', project_id: 'loop-proj', provider: 'pexels' })
      expect(s4.search_status).toBe('EXHAUSTED')
      expect(s4.success).toBe(false)
      expect(s4.candidates).toHaveLength(0)
      expect(s4.workflow_guidance).toContain('exhausted')
    })
  })

  describe('MCP Registration & End-to-End Import Pipeline', () => {
    it('advertises video_search_external_media and import_external_media in tools/list', async () => {
      const fakeBackend = {
        mcpCatalog: async () => JSON.stringify({ tools: [], resources: [] }),
      } as any

      const tools = await registeredMcpTools(fakeBackend, { enableExternalMedia: true })
      const searchTool = tools.find((t) => t.name === 'video_search_external_media')
      const importTool = tools.find((t) => t.name === 'import_external_media')

      expect(searchTool).toBeDefined()
      expect(searchTool?.description).toContain('Search for real external B-roll visuals')
      expect(searchTool?.inputSchema?.required).toContain('query')

      expect(importTool).toBeDefined()
      expect(importTool?.description).toContain('Import an external media candidate')
      expect(importTool?.inputSchema?.required).toContain('candidate_id')
    })

    it('end-to-end: searches candidate, enforces rights, imports into media pool, and enables SourceObservationIndex', async () => {
      const idGen = uuidV7Gen()
      const project = blankProject(idGen, 'broll-project')
      const actor = createActor({ initial: project, idGen, clock: () => '2026-10-02T12:00:00Z' })

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-e2e-broll-'))
      const fakeVideoFile = path.join(tmpDir, 'downloaded_test.mp4')
      fs.writeFileSync(fakeVideoFile, Buffer.from('FAKE_VIDEO_MP4_HEADER_AND_FRAMES'))

      const tsHost: Partial<TsActorHost> = {
        actor,
        mcpHybridDeps: {
          actor,
          workspaceDir: () => tmpDir,
          readFile: (p: string) => fs.readFileSync(p, 'utf8'),
          compute: {
            probeMedia: vi.fn(async (filePath: string) => {
              const item = mediaItemTemplate('media-imported-broll-1', 'Video', 15_000_000, false)
              item.path_abs = filePath
              return JSON.stringify(item)
            }),
            hashMediaSource: vi.fn(async () => 'fake-hash-blake3'),
            parseSubtitles: vi.fn(async () => '{}'),
            synthesizeSpeechCompute: vi.fn(async () => '{}'),
            analyzeShotsFloor: vi.fn(async () => '[]'),
            reduceShotReport: vi.fn(async () => '{}'),
            shotDefaultOpts: vi.fn(async () => '{}'),
          } as any,
          enqueueDerivatives: vi.fn(async () => {}),
          enqueueWorkspaceCopy: vi.fn(async () => {}),
          snapshotComposition: vi.fn(() => project.compositions[project.root_id]!),
        } as any,
      }

      // Prepare custom test service
      const testService = new ExternalMediaService()
      testService.clearCaches()

      const candidateToImport: ExternalMediaCandidate = {
        candidate_id: 'pexels-video-4444',
        provider: 'pexels',
        provider_asset_id: '4444',
        media_type: 'video',
        title: 'Office Worker Typing',
        thumbnail_url: 'https://cdn.com/t.jpg',
        source_page_url: 'https://pexels.com/video/4444',
        direct_media_url: 'https://cdn.pexels.com/v4444.mp4',
        creator: 'Filmmaker John',
        width: 1920,
        height: 1080,
        duration: 15,
        query_used: 'typing',
        rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
        import_mode: 'AUTO_IMPORT',
        license: 'Pexels License',
        attribution: 'Video by John from Pexels',
        attribution_required: false,
      }

      testService.cacheCandidates([candidateToImport])

      // Mock fetch for downloader
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn(async () => {
        return {
          ok: true,
          headers: new Headers({
            'content-type': 'video/mp4',
            'content-length': '1024',
          }),
          body: {
            getReader: () => {
              let done = false
              return {
                read: async () => {
                  if (done) return { done: true, value: undefined }
                  done = true
                  return { done: false, value: new Uint8Array(Buffer.from('FAKE_MP4_BYTES')) }
                },
                cancel: () => {},
              }
            },
          },
        } as any
      })

      try {
        // Step 1: Run video_search_external_media via handleCallTool
        const searchResult = await handleCallTool(
          {} as any,
          () => tsHost as TsActorHost,
          'video_search_external_media',
          { query: 'office worker typing' },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          testService,
        )

        expect((searchResult as any).isError).toBeFalsy()

        // Step 2: Attempt import of candidate with USER_IMPORT / DISCOVERY_ONLY (should fail gate)
        const unimportableCandidate: ExternalMediaCandidate = {
          candidate_id: 'youtube-ref-1',
          provider: 'youtube',
          provider_asset_id: 'ref1',
          media_type: 'video',
          title: 'YouTube Footage',
          thumbnail_url: 'https://yt.com/t.jpg',
          source_page_url: 'https://youtube.com/watch?v=ref1',
          direct_media_url: undefined,
          query_used: 'ref',
          rights_status: 'RIGHTS_UNVERIFIED',
          import_mode: 'DISCOVERY_ONLY',
          attribution_required: true,
        }
        testService.cacheCandidates([unimportableCandidate])

        const failedImportResult = await handleCallTool(
          {} as any,
          () => tsHost as TsActorHost,
          'import_external_media',
          { candidate_id: 'youtube-ref-1' },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          testService,
        )
        expect((failedImportResult as any).isError).toBe(true)
        expect((failedImportResult as any).content[0]?.type === 'text' && (failedImportResult as any).content[0].text).toContain('cannot be imported automatically')

        // Step 3: Successfully import AUTO_IMPORT candidate
        const successfulImportResult = await handleCallTool(
          {} as any,
          () => tsHost as TsActorHost,
          'import_external_media',
          { candidate_id: 'pexels-video-4444' },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          testService,
        )

        expect((successfulImportResult as any).isError).toBeFalsy()
        const parsedImportText = JSON.parse(
          (successfulImportResult as any).content[0]?.type === 'text' ? (successfulImportResult as any).content[0].text : '{}',
        )
        expect(parsedImportText.success).toBe(true)
        expect(parsedImportText.media_id).toBe('media-imported-broll-1')
        expect(parsedImportText.candidate_id).toBe('pexels-video-4444')
        expect(parsedImportText.provider).toBe('pexels')
        expect(parsedImportText.rights_status).toBe('PROVIDER_LICENSE_ELIGIBLE')
        expect(parsedImportText.import_mode).toBe('AUTO_IMPORT')

        // Verify media is registered in the ProjectActor media pool
        const snap = actor.snapshot()
        const poolItem = snap.media_pool['media-imported-broll-1']
        expect(poolItem).toBeDefined()
        expect(poolItem?.kind).toBe('Video')
        expect(poolItem?.metadata.duration_us).toBe(15_000_000)

        // Step 4: Verify SourceObservationIndex can inspect the newly imported media item
        const mockObservationIndex = {
          retrieve: vi.fn(async (media: any, _startUs: number, _endUs?: number, _limit?: number) => ({
            status: 'available' as const,
            media_id: media.id,
            source_hash: 'fake-hash-blake3',
            analysis_version: 2,
            analysis_model: 'vision-sidecar',
            source_duration_us: 15_000_000,
            verified_metadata: { width: 1920, height: 1080, kind: 'Video' },
            observations: [
              {
                source_t_us: 2_000_000,
                kind: 'visual' as const,
                description: 'Close-up of hands typing code on a mechanical keyboard',
                model: 'qwen3-vl',
                evidence: 'model_observation' as const,
                sample_window_us: [1_000_000, 3_000_000] as [number, number],
              },
            ],
            audio: { status: 'not_generated' as const, reason: 'semantic_audio_model_not_integrated' as const },
            transcript: { status: 'not_generated' as const },
            cached: false,
          })),
        }

        const obsResult = await handleCallTool(
          {} as any,
          () => tsHost as TsActorHost,
          'get_source_observations',
          { media_id: 'media-imported-broll-1', start_us: 0, end_us: 10_000_000 },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          mockObservationIndex as any,
          testService,
        )

        expect((obsResult as any).isError).toBeFalsy()
        const obsData = JSON.parse(
          (obsResult as any).content[0]?.type === 'text' ? (obsResult as any).content[0].text : '{}',
        )
        expect(obsData.status).toBe('available')
        expect(obsData.media_id).toBe('media-imported-broll-1')
        expect(obsData.observations[0].description).toContain('typing code')
      } finally {
        globalThis.fetch = originalFetch
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('Attribution Obligations & Export Safety Tracking', () => {
    it('tracks attribution obligations and detects unresolved timeline obligations before export', () => {
      const candidate: ExternalMediaCandidate = {
        candidate_id: 'wikimedia-sample-photo',
        provider: 'wikimedia',
        provider_asset_id: '9988',
        media_type: 'image',
        title: 'Historic Event',
        thumbnail_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/event.jpg',
        source_page_url: 'https://commons.wikimedia.org/wiki/File:Event.jpg',
        direct_media_url: 'https://upload.wikimedia.org/wikipedia/commons/event.jpg',
        query_used: 'Historic Event',
        rights_status: 'OPEN_LICENSE_ATTRIBUTION_REQUIRED',
        import_mode: 'AUTO_IMPORT',
        license: 'CC BY 4.0',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
        creator: 'Historian Photographer',
        attribution: 'Historic Event by Historian Photographer (CC BY 4.0)',
        attribution_required: true,
      }

      const obligation = buildAttributionObligation(candidate, 'media-att-1')
      expect(obligation.attribution_required).toBe(true)
      expect(obligation.export_obligation_status).toBe('UNRESOLVED')
      expect(obligation.creator).toBe('Historian Photographer')
      expect(obligation.provider).toBe('wikimedia')

      const idGen = uuidV7Gen()
      const project = blankProject(idGen, 'Test Attribution')
      const mediaItem = mediaItemTemplate('media-att-1', 'Image', null)
      attachAttributionMetadata(mediaItem, obligation, '/path/to/provenance.json')
      project.media_pool['media-att-1'] = mediaItem

      // When media is in the pool but NOT placed on the timeline, export is safe
      const initialReport = checkExportAttributionSafety(project)
      expect(initialReport.can_export).toBe(true)
      expect(initialReport.unresolved_count).toBe(0)

      // Place media on timeline
      const rootComp = project.compositions[project.root_id]!
      const bRollTrack = rootComp.tracks.find((t) => t.role === 'BRoll')!
      const actor = createActor({ initial: project, idGen })
      actor.dispatch('add_layer', {
        track: bRollTrack.id,
        kind: 'image',
        media: 'media-att-1',
        t_start_us: 0,
        t_end_us: 5_000_000,
      })

      // When media IS on the timeline and unresolved, export safety detects the obligation and generates warnings
      expect(getTimelineAttributionObligations(actor.snapshot())).toHaveLength(1)
      const timelineReport = checkExportAttributionSafety(actor.snapshot())
      expect(timelineReport.can_export).toBe(false)
      expect(timelineReport.has_unresolved_obligations).toBe(true)
      expect(timelineReport.unresolved_count).toBe(1)
      expect(timelineReport.warnings[0]).toContain('Unresolved attribution obligation')
      expect(timelineReport.warnings[0]).toContain('Historic Event by Historian Photographer (CC BY 4.0)')

      // Once resolved, export is allowed
      const resolvedObligation = {
        ...obligation,
        export_obligation_status: 'RESOLVED' as const,
      }
      const testProject = JSON.parse(JSON.stringify(actor.snapshot()))
      testProject.media_pool['media-att-1']!.metadata.attribution_obligation = resolvedObligation
      const resolvedReport = checkExportAttributionSafety(testProject)
      expect(resolvedReport.can_export).toBe(true)
      expect(resolvedReport.unresolved_count).toBe(0)
    })
  })

  describe('Authentic Routing vs Generic Stock Preference', () => {
    it('prefers authentic discovery and excludes generic stock from masquerading as exact events', async () => {
      const service = new ExternalMediaService()
      service.clearProviders()

      const queriedProviders: string[] = []
      const makeMockProvider = (name: any) => ({
        name,
        displayName: name,
        search: vi.fn(async () => {
          queriedProviders.push(name)
          return []
        }),
      })

      service.registerProvider(makeMockProvider('youtube'))
      service.registerProvider(makeMockProvider('wikimedia'))
      service.registerProvider(makeMockProvider('openverse'))
      service.registerProvider(makeMockProvider('pexels'))
      service.registerProvider(makeMockProvider('pixabay'))

      // Exact factual event query
      await service.search({
        query: 'Steve Jobs presenting first iPhone 2007',
        visual_intent: {
          purpose: 'visual_proof',
          specificity: 'exact',
          authenticity: 'required',
        },
      })

      // Must prefer authentic sources and NOT query generic stock when specificity is exact
      expect(queriedProviders).toContain('youtube')
      expect(queriedProviders).toContain('wikimedia')
      expect(queriedProviders).toContain('openverse')
      expect(queriedProviders).not.toContain('pexels')
      expect(queriedProviders).not.toContain('pixabay')
    })

    it('prefers stock providers first for generic atmospheric visual queries', async () => {
      const service = new ExternalMediaService()
      service.clearProviders()

      const queriedProviders: string[] = []
      const makeMockProvider = (name: any) => ({
        name,
        displayName: name,
        search: vi.fn(async () => {
          queriedProviders.push(name)
          return []
        }),
      })

      service.registerProvider(makeMockProvider('youtube'))
      service.registerProvider(makeMockProvider('wikimedia'))
      service.registerProvider(makeMockProvider('openverse'))
      service.registerProvider(makeMockProvider('pexels'))
      service.registerProvider(makeMockProvider('pixabay'))

      await service.search({
        query: 'developer typing at laptop at night',
        visual_intent: {
          purpose: 'atmosphere',
          specificity: 'generic',
          authenticity: 'unnecessary',
        },
      })

      // Pexels and Pixabay stock must be prioritized
      expect(queriedProviders[0]).toBe('pexels')
      expect(queriedProviders[1]).toBe('pixabay')
    })
  })

  describe('Candidate Quality, Deduplication & Validation', () => {
    it('removes duplicate candidate IDs, duplicate asset IDs, and duplicate URLs', async () => {
      const service = new ExternalMediaService()
      service.clearProviders()

      const provider1 = {
        name: 'pexels' as const,
        displayName: 'Pexels',
        search: vi.fn(async () => [
          {
            candidate_id: 'dup-1',
            provider: 'pexels' as const,
            provider_asset_id: 'asset-100',
            media_type: 'video' as const,
            title: 'Typing on Laptop',
            thumbnail_url: 'https://pexels.com/files/100-thumb.jpg',
            source_page_url: 'https://pexels.com/video/100',
            direct_media_url: 'https://pexels.com/files/100.mp4',
            query_used: 'typing laptop',
            rights_status: 'PROVIDER_LICENSE_ELIGIBLE' as const,
            import_mode: 'AUTO_IMPORT' as const,
            attribution_required: false,
          },
          // Duplicate candidate_id
          {
            candidate_id: 'dup-1',
            provider: 'pexels' as const,
            provider_asset_id: 'asset-100-duplicate',
            media_type: 'video' as const,
            title: 'Typing on Laptop Dup',
            thumbnail_url: 'https://pexels.com/files/100-thumb.jpg',
            source_page_url: 'https://pexels.com/video/100',
            direct_media_url: 'https://pexels.com/files/100.mp4',
            query_used: 'typing laptop',
            rights_status: 'PROVIDER_LICENSE_ELIGIBLE' as const,
            import_mode: 'AUTO_IMPORT' as const,
            attribution_required: false,
          },
        ]),
      }

      const provider2 = {
        name: 'pixabay' as const,
        displayName: 'Pixabay',
        search: vi.fn(async () => [
          // Same direct URL from another provider
          {
            candidate_id: 'pix-1',
            provider: 'pixabay' as const,
            provider_asset_id: 'asset-200',
            media_type: 'video' as const,
            title: 'Identical Media File',
            thumbnail_url: 'https://pixabay.com/files/200-thumb.jpg',
            source_page_url: 'https://pixabay.com/video/200',
            direct_media_url: 'https://pexels.com/files/100.mp4',
            query_used: 'typing laptop',
            rights_status: 'PROVIDER_LICENSE_ELIGIBLE' as const,
            import_mode: 'AUTO_IMPORT' as const,
            attribution_required: false,
          },
        ]),
      }

      service.registerProvider(provider1)
      service.registerProvider(provider2)

      const result = await service.search({ query: 'typing laptop' })
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0]!.candidate_id).toBe('dup-1')
    })

    it('rejects malformed provider metadata and keeps empty result sets clean', async () => {
      const service = new ExternalMediaService()
      service.clearProviders()

      const badProvider = {
        name: 'wikimedia' as const,
        displayName: 'Wikimedia',
        search: vi.fn(async () => [
          // Missing title
          {
            candidate_id: 'bad-1',
            provider: 'wikimedia' as const,
            provider_asset_id: 'b1',
            media_type: 'image' as const,
            title: '',
            rights_status: 'OPEN_LICENSE_VERIFIED' as const,
            import_mode: 'AUTO_IMPORT' as const,
            attribution_required: false,
          } as any,
          // Invalid media type
          {
            candidate_id: 'bad-2',
            provider: 'wikimedia' as const,
            provider_asset_id: 'b2',
            media_type: 'audio' as any,
            title: 'Audio Asset',
            rights_status: 'OPEN_LICENSE_VERIFIED' as const,
            import_mode: 'AUTO_IMPORT' as const,
            attribution_required: false,
          },
        ]),
      }

      service.registerProvider(badProvider)
      const result = await service.search({ query: 'malformed test' })
      expect(result.candidates).toEqual([])
      expect(result.total_found).toBe(0)
      expect(result.search_status).toBe('NO_RESULTS')
    })
  })

  describe('Stalled Search & Query Recovery', () => {
    it('detects repeated stalled searches, reports EXHAUSTED, and recovers on a different query', async () => {
      const service = new ExternalMediaService()
      service.clearProviders()

      const candidateA: ExternalMediaCandidate = {
        candidate_id: 'stalled-cand-1',
        provider: 'pexels',
        provider_asset_id: '1',
        media_type: 'video',
        title: 'Static Candidate A',
        thumbnail_url: 'https://pexels.com/thumb/1.jpg',
        source_page_url: 'https://pexels.com/video/1',
        direct_media_url: 'https://pexels.com/1.mp4',
        query_used: 'repetitive query',
        rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
        import_mode: 'AUTO_IMPORT',
        attribution_required: false,
      }

      const mockProvider = {
        name: 'pexels' as const,
        displayName: 'Pexels',
        search: vi.fn(async (opts: any) => {
          if (opts.query === 'repetitive query') {
            return [candidateA]
          }
          return [
            {
              candidate_id: 'new-cand-2',
              provider: 'pexels' as const,
              provider_asset_id: '2',
              media_type: 'video' as const,
              title: 'Fresh Candidate B',
              thumbnail_url: 'https://pexels.com/thumb/2.jpg',
              source_page_url: 'https://pexels.com/video/2',
              direct_media_url: 'https://pexels.com/2.mp4',
              query_used: 'fresh distinct query topic',
              rights_status: 'PROVIDER_LICENSE_ELIGIBLE' as const,
              import_mode: 'AUTO_IMPORT' as const,
              attribution_required: false,
            },
          ]
        }),
      }

      service.registerProvider(mockProvider)

      // Query 1: Returns candidate A (stalled count = 0)
      const res1 = await service.search({ query: 'repetitive query', project_id: 'proj-stall' })
      expect(res1.progress?.consecutive_no_progress).toBe(0)
      expect(res1.search_status).toBe('OK')

      // Query 2: Repeated same query returns no new candidates (stalled count = 1)
      const res2 = await service.search({ query: 'repetitive query', project_id: 'proj-stall' })
      expect(res2.progress?.consecutive_no_progress).toBe(1)

      // Query 3: Repeated same query returns no new candidates (stalled count = 2)
      const res3 = await service.search({ query: 'repetitive query', project_id: 'proj-stall' })
      expect(res3.progress?.consecutive_no_progress).toBe(2)

      // Query 4: Fourth repeated query trips stalled guard >= 3 -> EXHAUSTED
      const res4 = await service.search({ query: 'repetitive query', project_id: 'proj-stall' })
      expect(res4.search_status).toBe('EXHAUSTED')
      expect(res4.workflow_guidance).toContain('exhausted')

      // Query 5: Meaningfully different query recovers from EXHAUSTED!
      const res5 = await service.search({ query: 'fresh distinct query topic', project_id: 'proj-stall' })
      expect(res5.search_status).toBe('OK')
      expect(res5.progress?.consecutive_no_progress).toBe(0)
      expect(res5.candidates[0]?.candidate_id).toBe('new-cand-2')
    })
  })

  describe('Download Security & Multi-hop Redirect SSRF Protection', () => {
    it('blocks decimal numeric IP addresses and link-local addresses in validateSafeUrl', () => {
      // 2130706433 is decimal for 127.0.0.1
      expect(() => validateSafeUrl('https://2130706433/test.mp4')).toThrow('Blocked')
      expect(() => validateSafeUrl('https://169.254.169.254/meta-data')).toThrow('Blocked link-local')
      expect(() => validateSafeUrl('https://0.0.0.0/test.mp4')).toThrow('Blocked private or localhost')
    })

    it('rejects multi-hop redirects leading from public URLs to private IP addresses', async () => {
      const originalFetch = globalThis.fetch
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-redirect-test-'))

      try {
        globalThis.fetch = vi.fn(async (url: any) => {
          const u = String(url)
          if (u === 'https://public-cdn.example.com/asset.mp4') {
            return {
              status: 302,
              headers: new Headers({ location: 'https://192.168.1.1/secret.mp4' }),
            } as any
          }
          return { ok: true, status: 200 } as any
        })

        const candidate: ExternalMediaCandidate = {
          candidate_id: 'test-ssrf-redirect',
          provider: 'pexels',
          provider_asset_id: 'ssrf1',
          media_type: 'video',
          title: 'SSRF Attack',
          thumbnail_url: 'https://public-cdn.example.com/thumb.jpg',
          source_page_url: 'https://public-cdn.example.com/info',
          direct_media_url: 'https://public-cdn.example.com/asset.mp4',
          query_used: 'ssrf test',
          rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
          import_mode: 'AUTO_IMPORT',
          attribution_required: false,
        }

        await expect(downloadExternalMediaCandidate(candidate, tmpDir)).rejects.toThrow(
          'Blocked private 192.168.0.0/16 address',
        )
      } finally {
        globalThis.fetch = originalFetch
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('aborts oversized downloads and cleans up temporary files on interruption', async () => {
      const originalFetch = globalThis.fetch
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-oversized-test-'))

      try {
        globalThis.fetch = vi.fn(async () => {
          return {
            ok: true,
            status: 200,
            headers: new Headers({
              'content-type': 'video/mp4',
              'content-length': '300000000', // 300MB exceeds 250MB limit
            }),
          } as any
        })

        const candidate: ExternalMediaCandidate = {
          candidate_id: 'oversized-test',
          provider: 'pexels',
          provider_asset_id: 'over1',
          media_type: 'video',
          title: 'Huge Video',
          thumbnail_url: 'https://pexels.com/video/huge-thumb.jpg',
          source_page_url: 'https://pexels.com/video/huge',
          direct_media_url: 'https://pexels.com/huge.mp4',
          query_used: 'huge video',
          rights_status: 'PROVIDER_LICENSE_ELIGIBLE',
          import_mode: 'AUTO_IMPORT',
          attribution_required: false,
        }

        await expect(downloadExternalMediaCandidate(candidate, tmpDir)).rejects.toThrow('exceeds limit')

        // Verify no leftover .tmp files
        const files = fs.readdirSync(tmpDir)
        expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0)
      } finally {
        globalThis.fetch = originalFetch
        fs.rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('Project Persistence with External Media & Attribution', () => {
    it('round-trips external media with attribution obligation and provenance across project save and reload', () => {
      const idGen = uuidV7Gen()
      const project = blankProject(idGen, 'Test Roundtrip')
      const mediaId = 'persisted-ext-media-1'
      const item = mediaItemTemplate(mediaId, 'Video', 12_000_000)

      const obligation = {
        media_id: mediaId,
        candidate_id: 'pexels-video-999',
        attribution_required: true,
        attribution_text: 'Video by Contributor on Pexels',
        license: 'Pexels License',
        license_url: 'https://www.pexels.com/license/',
        source_page_url: 'https://www.pexels.com/video/999/',
        creator: 'Contributor',
        provider: 'pexels',
        export_obligation_status: 'UNRESOLVED' as const,
      }

      attachAttributionMetadata(item, obligation, '/media/pexels_999.mp4.provenance.json')
      project.media_pool[mediaId] = item

      // Save project to JSON
      const json = serializeProjectToJson(project)
      expect(json).toBeTruthy()

      // Reload project from JSON
      const parsedRaw = JSON.parse(json)
      const reloadedProject = parseProject(parsedRaw)

      // Verify media exists in reloaded project
      const reloadedItem = reloadedProject.media_pool[mediaId]
      expect(reloadedItem).toBeDefined()
      expect(reloadedItem?.metadata.attribution_obligation).toBeDefined()

      const reloadedObligation = reloadedItem?.metadata.attribution_obligation as typeof obligation
      expect(reloadedObligation.attribution_required).toBe(true)
      expect(reloadedObligation.export_obligation_status).toBe('UNRESOLVED')
      expect(reloadedObligation.license).toBe('Pexels License')
      expect(reloadedObligation.creator).toBe('Contributor')
      expect(reloadedItem?.metadata.provenance_path).toBe('/media/pexels_999.mp4.provenance.json')

      // Verify project obligations are detected from reloaded project
      const projectObligations = getProjectAttributionObligations(reloadedProject)
      expect(projectObligations).toHaveLength(1)
      expect(projectObligations[0]?.attribution_text).toBe('Video by Contributor on Pexels')
    })
  })
})

