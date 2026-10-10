import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
/** Container evidence, independent of authored layer presence or model claims.
 * An audio stream can contain silence; audibility requires PCM measurements. */
export async function renderedFileHasAudio(file: string, ffprobe: string, signal?: AbortSignal): Promise<boolean> {
  const { stdout } = await exec(ffprobe, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'json', file], { timeout: 20_000, maxBuffer: 2_000_000, signal })
  const result = JSON.parse(stdout)
  if (!Array.isArray(result.streams)) throw new Error('Rendered media probe returned no stream metadata')
  return result.streams.some((s: { codec_type?: string }) => s.codec_type === 'audio')
}
