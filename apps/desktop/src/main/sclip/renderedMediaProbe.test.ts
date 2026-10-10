import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { renderedFileHasAudio } from './renderedMediaProbe'
import { resolveFfmpegPath } from './rangeRender'

describe('rendered container audio evidence', () => {
  it('distinguishes a silent audio stream from absent audio and rejects invalid artifacts', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-probe-'))
    const ffmpeg = resolveFfmpegPath(), probe = ffmpeg.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1')
    try {
      const audio = path.join(dir, 'audio.mkv'), video = path.join(dir, 'video.mkv'), broken = path.join(dir, 'broken.mp4')
      expect(spawnSync(ffmpeg, ['-v','error','-y','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','0.3','-c:a','pcm_s16le',audio]).status).toBe(0)
      expect(spawnSync(ffmpeg, ['-v','error','-y','-f','lavfi','-i','color=s=32x32:r=10','-t','0.3','-an',video]).status).toBe(0)
      expect(await renderedFileHasAudio(audio, probe)).toBe(true)
      expect(await renderedFileHasAudio(video, probe)).toBe(false)
      fs.writeFileSync(broken, 'broken')
      await expect(renderedFileHasAudio(broken, probe)).rejects.toThrow()
      const controller = new AbortController(); controller.abort()
      await expect(renderedFileHasAudio(audio, probe, controller.signal)).rejects.toThrow()
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })
  it('resolves the shipped binary without requiring a system installation', () => {
    const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-resource-'))
    try {
      const binary = path.join(resources, 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
      fs.mkdirSync(path.dirname(binary)); fs.writeFileSync(binary, '')
      expect(resolveFfmpegPath(resources)).toBe(binary)
    } finally { fs.rmSync(resources, { recursive: true, force: true }) }
  })
})
