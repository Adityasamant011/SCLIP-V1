import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { synthesizeSpeechLocally } from './localTts.js'

describe('Local TTS Engine', () => {
  it('synthesizes text to an MP3 file using Kokoro-82M and caches it', async () => {
    const tmpCache = path.join(os.tmpdir(), `test_tts_cache_${Date.now()}`)
    fs.mkdirSync(tmpCache, { recursive: true })

    try {
      const res1 = await synthesizeSpeechLocally(
        { text: 'Hello, this is a test of local speech synthesis in Sclip.', voice: 'alloy', speed: 1.0 },
        tmpCache,
      )

      expect(res1.filePath).toBeTruthy()
      expect(fs.existsSync(res1.filePath)).toBe(true)
      expect(fs.statSync(res1.filePath).size).toBeGreaterThan(100)
      expect(res1.cached).toBe(false)
      expect(res1.engine).toBe('kokoro-tts')

      // Test cache hit
      const res2 = await synthesizeSpeechLocally(
        { text: 'Hello, this is a test of local speech synthesis in Sclip.', voice: 'alloy', speed: 1.0 },
        tmpCache,
      )

      expect(res2.filePath).toBe(res1.filePath)
      expect(res2.cached).toBe(true)
      expect(res2.engine).toBe('kokoro-tts')
    } finally {
      try {
        fs.rmSync(tmpCache, { recursive: true, force: true })
      } catch {}
    }
  }, 30_000)

  it('rejects empty text', async () => {
    await expect(synthesizeSpeechLocally({ text: '   ' }, '/tmp')).rejects.toThrow('text is empty')
  })

  it('supports Kokoro-82M natural American & British voices', async () => {
    const tmpCache = path.join(os.tmpdir(), `test_kokoro_voices_${Date.now()}`)
    fs.mkdirSync(tmpCache, { recursive: true })

    try {
      const kokoroVoices = ['af_heart', 'am_michael', 'bf_emma', 'bm_george']

      for (const v of kokoroVoices) {
        const res = await synthesizeSpeechLocally(
          { text: `Testing Kokoro voice ${v}.`, voice: v, speed: 1.0 },
          tmpCache,
        )
        expect(res.filePath).toBeTruthy()
        expect(fs.existsSync(res.filePath)).toBe(true)
        expect(fs.statSync(res.filePath).size).toBeGreaterThan(100)
        expect(res.engine).toBe('kokoro-tts')
      }
    } finally {
      try {
        fs.rmSync(tmpCache, { recursive: true, force: true })
      } catch {}
    }
  }, 60_000)

  it('gracefully synthesizes standard aliases using Kokoro-82M', async () => {
    const tmpCache = path.join(os.tmpdir(), `test_alias_voices_${Date.now()}`)
    fs.mkdirSync(tmpCache, { recursive: true })

    try {
      const aliasVoices = ['nova', 'onyx', 'fable', 'shimmer']

      for (const v of aliasVoices) {
        const res = await synthesizeSpeechLocally(
          { text: `Testing alias voice ${v}.`, voice: v, speed: 1.0 },
          tmpCache,
        )
        expect(res.filePath).toBeTruthy()
        expect(fs.existsSync(res.filePath)).toBe(true)
        expect(fs.statSync(res.filePath).size).toBeGreaterThan(100)
        expect(res.engine).toBe('kokoro-tts')
      }
    } finally {
      try {
        fs.rmSync(tmpCache, { recursive: true, force: true })
      } catch {}
    }
  }, 60_000)
})
