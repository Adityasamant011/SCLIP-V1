import {describe, expect, it, vi} from 'vitest'
import {createActor} from '../actor'
import {blankProject, type Layer} from '../model'
import {seededGen} from '../ids'
import {mediaItemTemplate} from '../mutations/media'
import {runHybrid, type HybridDeps} from '../hybrids'
import {CAPTION_TIMING_KEY, readCaptionTiming} from '../../../shared/captionTiming'

const mediaId = '11111111-1111-4111-8111-111111111111'
const word = (text: string, start: number, end: number) => ({text, t_start_us: start, t_end_us: end})
const segment = (text: string, start: number, end: number, words?: unknown[]) => ({text, t_start_us: start, t_end_us: end, ...(words ? {words} : {})})
const first = (timed: boolean) => segment('First complete sentence.', 0, 1_000_000,
  timed ? [word('First', 0, 300_000), word('complete', 300_000, 600_000), word('sentence.', 600_000, 1_000_000)] : undefined)
const second = (timed: boolean) => segment('Second complete sentence.', 1_000_000, 2_000_000,
  timed ? [word('Second', 1_000_000, 1_300_000), word('complete', 1_300_000, 1_600_000), word('sentence.', 1_600_000, 2_000_000)] : undefined)

function fixture(segments: unknown[], options: {start?: number; end?: number; offset?: number; timing?: string} = {}) {
  const idGen = seededGen(), initial = blankProject(idGen, 'synthetic-caption-coverage')
  initial.media_pool[mediaId] = mediaItemTemplate(mediaId, 'Video', 10_000_000)
  const actor = createActor({initial, idGen, clock: () => '<test>'})
  const start = options.start ?? 0, end = options.end ?? 2_000_000, offset = options.offset ?? 0
  const placed = actor.dispatch('add_layer', {kind: 'video', media: mediaId, track: initial.compositions[initial.root_id].tracks[0].id,
    src_in_us: start, src_out_us: end, t_start_us: offset, t_end_us: offset + end - start})
  if (!placed.ok) throw Error(JSON.stringify(placed.error))
  const readTranscript = vi.fn(async () => JSON.stringify({status: 'available', word_timing: options.timing ?? 'exact', segments}))
  const deps = {actor, compute: {readTranscript},
    workspaceDir: () => null, snapshotComposition: () => actor.snapshot().compositions[initial.root_id]} as unknown as HybridDeps
  const apply = () => runHybrid('apply_transcripts', {layer_id: placed.value}, deps)
  const captions = () => actor.snapshot().compositions[initial.root_id].tracks.flatMap(t => t.layers)
    .filter(l => l.params.kind === 'Text').sort((a, b) => a.t_start_us - b.t_start_us)
  return {actor, apply, captions, deps, layerId: placed.value, readTranscript}
}
const content = (layers: Layer[]) => layers.map(l => l.params.kind === 'Text' ? l.params.content : '').join(' ')
const timing = (layer: Layer) => readCaptionTiming(layer.metadata[CAPTION_TIMING_KEY])

describe('cached transcript caption coverage', () => {
  for (const speed of [0.5, 2]) for (const supplied of [false, true]) {
    it(`refuses unsupported speed ${speed} before reads/writes, supplied=${supplied}, and recovers`, async () => {
      const f = fixture([first(true), second(false)])
      expect(f.actor.dispatch('update_layer_params', {layer: f.layerId, patch: {kind: 'VideoClip', speed}}).ok).toBe(true)
      const before = structuredClone(f.actor.snapshot())
      await expect(runHybrid('apply_transcripts', {layer_id: f.layerId,
        ...(supplied ? {transcripts: [{word_timing: 'exact', segments: [first(true)]}]} : {})}, f.deps)).rejects.toThrow('retimed VideoClip')
      expect(f.actor.snapshot()).toEqual(before)
      expect(f.readTranscript).not.toHaveBeenCalled()
      expect(f.captions()).toEqual([])
      expect(f.actor.dispatch('update_layer_params', {layer: f.layerId, patch: {kind: 'VideoClip', speed: 1}}).ok).toBe(true)
      await f.apply()
      expect(content(f.captions())).toBe('First complete sentence. Second complete sentence.')
    })
  }
  for (const [a, b] of [[true, true], [false, false], [false, true], [true, false]]) {
    it(`retains complete sentences with first timed=${a}, second timed=${b}`, async () => {
      const f = fixture([first(a), second(b)]); await f.apply()
      expect(content(f.captions())).toBe('First complete sentence. Second complete sentence.')
      expect(f.captions()).toHaveLength(2)
      expect(timing(f.captions()[0])?.provenance).toBe(a ? 'exact' : 'none')
      expect(timing(f.captions()[1])?.provenance).toBe(b ? 'exact' : 'none')
    })
  }
  it('uses segment text when a word array is only partial', async () => {
    const f = fixture([segment('First complete sentence.', 0, 1_000_000, [word('First', 0, 300_000)]), second(true)])
    await f.apply(); expect(content(f.captions())).toBe('First complete sentence. Second complete sentence.')
    expect(timing(f.captions()[0])?.provenance).toBe('none')
  })
  for (const value of [undefined, null, -1, Number.NaN]) {
    it(`falls back to known segment bounds for missing/invalid word time ${value}`, async () => {
      const f = fixture([segment('First complete sentence.', 0, 1_000_000, [{text: 'First complete sentence.', t_start_us: value, t_end_us: 1_000_000}]), second(true)])
      await f.apply(); expect(content(f.captions())).toBe('First complete sentence. Second complete sentence.')
      expect(timing(f.captions()[0])?.provenance).toBe('none')
    })
  }
  it('uses complete measured words when segment timestamps are missing', async () => {
    const f = fixture([{text: 'Measured sentence.', words: [word('Measured', 0, 400_000), word('sentence.', 400_000, 1_000_000)]}, second(false)])
    await f.apply(); expect(content(f.captions())).toBe('Measured sentence. Second complete sentence.')
    expect(timing(f.captions()[0])?.provenance).toBe('exact')
  })
  it('rejects unlocatable speech without a partial mutation', async () => {
    const f = fixture([first(true), {text: 'Unlocatable complete sentence.'}]); const before = f.actor.snapshot()
    await expect(f.apply()).rejects.toThrow(/segment 1 has no usable timestamp bounds/)
    expect(f.actor.snapshot()).toEqual(before)
  })
  it('sorts source segments and measured words before placing captions', async () => {
    const a = first(true); a.words!.reverse()
    const f = fixture([second(false), a]); await f.apply()
    expect(content(f.captions())).toBe('First complete sentence. Second complete sentence.')
    expect(timing(f.captions()[0])?.provenance).toBe('exact')
  })
  it('preserves overlapping speech on separate actor-owned caption lanes', async () => {
    const f = fixture([first(true), segment('Overlapping second voice.', 500_000, 1_500_000)])
    await f.apply(); expect(content(f.captions())).toBe('First complete sentence. Overlapping second voice.')
    const c = f.actor.snapshot().compositions[f.actor.snapshot().root_id]
    expect(c.tracks.filter(t => t.role === 'Caption' && t.layers.length)).toHaveLength(2)
  })
  it('does not treat overlapping word intervals as exact alignment', async () => {
    const f = fixture([segment('Overlapping word intervals.', 0, 1_000_000,
      [word('Overlapping', 0, 500_000), word('word', 300_000, 600_000), word('intervals.', 600_000, 1_000_000)])])
    await f.apply(); expect(content(f.captions())).toBe('Overlapping word intervals.')
    expect(timing(f.captions()[0])?.provenance).toBe('none')
  })
  it('retains long untimed text with explicitly interpolated provenance', async () => {
    const text = 'Every spoken word must remain in these generated captions.'
    const f = fixture([segment(text, 0, 2_000_000)])
    await f.apply(); expect(content(f.captions())).toBe(text)
    expect(f.captions().every(l => timing(l)?.provenance === 'interpolated_from_cue')).toBe(true)
  })
  it('clamps mixed captions to a trimmed source and shifted timeline', async () => {
    const f = fixture([first(true), second(false)], {start: 500_000, end: 1_500_000, offset: 3_000_000})
    await f.apply(); expect(content(f.captions())).toContain('Second complete sentence.')
    for (const l of f.captions()) { expect(l.t_start_us).toBeGreaterThanOrEqual(3_000_000); expect(l.t_end_us).toBeLessThanOrEqual(4_000_000) }
    expect(content(f.captions())).not.toContain('First')
  })
  it('preserves unknown declared precision rather than promoting words to exact', async () => {
    const f = fixture([first(true)], {timing: 'none'}); await f.apply()
    expect(timing(f.captions()[0])?.provenance).toBe('none')
  })
  it('writes the complete mixed batch in one undo/redo transaction', async () => {
    const f = fixture([first(false), second(true)]); await f.apply(); const before = f.captions()
    expect(f.actor.dispatch('undo', {}).ok).toBe(true); expect(f.captions()).toEqual([])
    expect(f.actor.dispatch('redo', {}).ok).toBe(true); expect(f.captions()).toEqual(before)
  })
})
