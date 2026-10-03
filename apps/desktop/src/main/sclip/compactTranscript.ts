/** Projection only: the native cache remains the source of timing and text. */
export function compactMediaContext(result: any): any {
  if (result.isError) return result
  return { ...result, content: result.content.map((item: any) => {
    if (item.type !== 'text') return item
    const body = JSON.parse(item.text)
    const transcript = body.transcript
    const compact = {
      media: body.media, range: body.range, detail: 'segments',
      transcript: transcript && { ...transcript, segments: transcript.segments?.map((segment: any) => ({
        text: segment.text, t_start_us: segment.t_start_us, t_end_us: segment.t_end_us,
      })) },
      detail_reference: `media://${body.media?.id}/transcript/${body.range?.start_us}/${body.range?.end_us}`,
      coverage: 'All cached transcript segments overlapping the requested source range; other modalities and word arrays omitted, available through detail=range.',
    }
    const text = JSON.stringify(compact)
    if (text.length > 32_000) throw new Error('Compact transcript exceeds the response limit; request a narrower source-time range. No segments were silently dropped.')
    return { ...item, text }
  }) }
}
