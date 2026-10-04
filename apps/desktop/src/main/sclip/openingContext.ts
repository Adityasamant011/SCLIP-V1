import type { TimelineContext, CachedSegment } from './timelineContext.js'

/** Evidence only: no keyword heuristic or semantic verdict. Hermes judges context. */
export function openingSourceWindow(context: TimelineContext) {
  const clip = context.tracks.flatMap(track => track.layers)
    .filter(layer => layer.kind === 'VideoClip' && layer.media_id && layer.src_in_us !== null && layer.src_out_us !== null)
    .sort((a, b) => a.t_start_us - b.t_start_us)[0]
  if (!clip) return null
  const sourceStart = clip.src_in_us!
  const selectedEnd = Math.min(clip.src_out_us!, sourceStart + 20_000_000)
  return { layer_id: clip.layer_id, media_id: clip.media_id!, timeline_start_us: clip.t_start_us,
    source_start_us: sourceStart, source_end_us: clip.src_out_us!,
    evidence_start_us: Math.max(0, sourceStart - 10_000_000),
    selected_evidence_end_us: selectedEnd, evidence_end_us: selectedEnd + 10_000_000 }
}

export function openingTranscriptEvidence(window: NonNullable<ReturnType<typeof openingSourceWindow>>, transcript: { status?: string; segments?: CachedSegment[] } | null) {
  const segments = transcript?.segments ?? []
  const words = segments.flatMap(segment => segment.words ?? [])
  const select = (start: number, end: number) => words.length
    ? words.filter(word => word.t_end_us > start && word.t_start_us < end)
    : segments.filter(segment => segment.t_end_us > start && segment.t_start_us < end)
      .map(({ text, t_start_us, t_end_us }) => ({ text, t_start_us, t_end_us }))
  return { ...window, status: segments.length ? 'available' : 'not_generated',
    timing_detail: words.length ? 'words' : 'segments_may_cross_selection_boundaries',
    omitted_before: select(window.evidence_start_us, window.source_start_us),
    selected_opening: select(window.source_start_us, window.selected_evidence_end_us),
    following_source: select(window.selected_evidence_end_us, window.evidence_end_us),
    instruction: 'Judge whether the selected opening establishes enough context for the brief without omitted preceding source. Extend backward, choose another passage, or restructure if needed. This evidence is not a semantic verdict; no viral-hook rule applies.' }
}
