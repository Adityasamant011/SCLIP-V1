/** Versioned, optional Layer.metadata entry. Times are relative to the caption,
 * so a plain move preserves them; edits that cannot preserve the mapping abstain. */
export interface CaptionWord { text: string; start_us: number; end_us: number }
export interface CaptionTiming {
  version: 1
  text: string
  duration_us: number
  provenance: 'exact' | 'interpolated_from_cue' | 'none'
  words: CaptionWord[]
  source?: { id: string; signature: string; caption_start_us?: number; caption_end_us?: number }
}
export const CAPTION_TIMING_KEY = 'weftcut.caption_timing'
export const CAPTION_DISPLAY_KEY = 'weftcut.caption_display'
export type CaptionDisplay = 'phrase' | 'word_reveal'

/** Reveal a prefix using stored observations, never invented word times.
 * Undefined means abstain and render the complete phrase. Keep the complete
 * string/glyph layout intact: this result is only a visibility mask boundary. */
export function captionRevealEnd(text: string, timing: unknown, localUs: number): number | undefined {
  const t = readCaptionTiming(timing)
  if (!t || t.text !== text || !t.words.length || !Number.isFinite(localUs) || /[\u0590-\u08ff]/u.test(text)) return undefined
  let cursor = 0, end = 0
  for (const w of t.words) {
    if (w.end_us <= w.start_us || w.start_us >= t.duration_us) return undefined
    const at = text.indexOf(w.text, cursor)
    if (at < 0 || /[^\s\p{P}]/u.test(text.slice(cursor, at))) return undefined
    cursor = at + w.text.length
    if (localUs >= w.start_us) end = cursor
  }
  if (/[^\s\p{P}]/u.test(text.slice(cursor))) return undefined
  return end === cursor ? text.length : end
}

export interface TranscriptPayload {
  source?: { id: string; signature: string; project_id: string; composition_id: string }
  word_timing: 'exact' | 'interpolated_from_cue' | 'none'
  segments: Array<{ text: string; t_start_us: number; t_end_us: number; words: Array<{ text: string; t_start_us: number; t_end_us: number }> }>
}

export function readCaptionTiming(value: unknown): CaptionTiming | null {
  if (!value || typeof value !== 'object') return null
  const v = value as CaptionTiming
  if (v.version !== 1 || typeof v.text !== 'string' || !Number.isSafeInteger(v.duration_us) || v.duration_us <= 0 || !['exact', 'interpolated_from_cue', 'none'].includes(v.provenance) || !Array.isArray(v.words)) return null
  let previous = 0
  for (const w of v.words) {
    if (!w || typeof w.text !== 'string' || !w.text.trim() || !Number.isSafeInteger(w.start_us) || !Number.isSafeInteger(w.end_us) || w.start_us < previous || w.end_us < w.start_us || w.end_us > v.duration_us + 50_000) return null
    previous = w.end_us
  }
  if (v.source && (typeof v.source.id !== 'string' || typeof v.source.signature !== 'string')) return null
  if (v.source && (v.source.caption_start_us !== undefined || v.source.caption_end_us !== undefined) &&
    (!Number.isSafeInteger(v.source.caption_start_us) || !Number.isSafeInteger(v.source.caption_end_us) ||
      v.source.caption_start_us! < 0 || v.source.caption_end_us! <= v.source.caption_start_us!)) return null
  return v
}

/** Automatic captions reveal by default, including previously saved timing
 * metadata. An explicit phrase choice remains authoritative; plain titles and
 * subtitle imports without speech observations keep their existing behavior. */
export function captionDisplay(metadata: Record<string, unknown>): CaptionDisplay | undefined {
  const explicit = metadata[CAPTION_DISPLAY_KEY]
  if (explicit === 'phrase' || explicit === 'word_reveal') return explicit
  return readCaptionTiming(metadata[CAPTION_TIMING_KEY]) ? 'word_reveal' : undefined
}
