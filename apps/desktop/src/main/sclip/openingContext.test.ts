import { describe, expect, it } from 'vitest'
import { openingSourceWindow, openingTranscriptEvidence } from './openingContext.js'
import type { TimelineContext } from './timelineContext.js'

describe('opening context evidence', () => {
  const context = { tracks: [{ layers: [
    { kind: 'Audio', t_start_us: 0 },
    { kind: 'VideoClip', layer_id: 'opening', media_id: 'source', t_start_us: 0, src_in_us: 30_000_000, src_out_us: 35_000_000 },
    { kind: 'VideoClip', layer_id: 'later', media_id: 'source', t_start_us: 5_000_000, src_in_us: 70_000_000, src_out_us: 80_000_000 },
  ] }] } as unknown as TimelineContext
  it('provides omitted setup, exact selected words and following context without a semantic verdict', () => {
    const window = openingSourceWindow(context)!
    expect(window).toMatchObject({ layer_id: 'opening', evidence_start_us: 20_000_000, evidence_end_us: 45_000_000 })
    const words = [
      { text: 'The workshop has three stages.', t_start_us: 25_000_000, t_end_us: 29_000_000 },
      { text: 'This is the second.', t_start_us: 30_000_000, t_end_us: 34_000_000 },
      { text: 'Now assemble the frame.', t_start_us: 36_000_000, t_end_us: 39_000_000 },
    ]
    const result = openingTranscriptEvidence(window, { segments: [{ text: 'Source passage', t_start_us: 25_000_000, t_end_us: 39_000_000, words }] })
    expect(result.omitted_before).toEqual([words[0]])
    expect(result.selected_opening).toEqual([words[1]])
    expect(result.following_source).toEqual([words[2]])
    expect(result).not.toHaveProperty('standalone_pass')
  })
  it('marks absent evidence honestly and preserves segment boundary uncertainty', () => {
    const window = openingSourceWindow(context)!
    expect(openingTranscriptEvidence(window, null).status).toBe('not_generated')
    expect(openingTranscriptEvidence(window, { segments: [{ text: 'A complete statement.', t_start_us: 29_000_000, t_end_us: 34_000_000 }] }).timing_detail).toBe('segments_may_cross_selection_boundaries')
  })
})
