import { beforeAll, describe, expect, it } from 'vitest'
import { initEval } from '../../../renderer/eval/index.js'
import { freshActor, aRollId } from './pbt/harness.js'
import { parseProject, serializeProject } from '../serialize.js'
import { createActor } from '../actor.js'
import { seededGen } from '../ids.js'

const AUDIO_ID = '00000000-0000-7000-8000-000000000211'

describe('Sclip MCP exposure of existing editor commands', () => {
  beforeAll(initEval)

  it('places standalone music via the production media command and retains it after undo/redo and reload', () => {
    const actor = freshActor()
    expect(actor.dispatch('add_media', { id: AUDIO_ID, kind: 'Audio', duration_us: 5_000_000 }).ok).toBe(true)
    const placed = actor.mcpCall('add_media_layer', JSON.stringify({ media_id: AUDIO_ID, track_id: aRollId(actor), t_start_us: 0 }))
    expect(placed.ok, JSON.stringify(placed)).toBe(true)
    if (!placed.ok) return
    const id = placed.result.content[0].text
    const audio = () => actor.snapshot().compositions[actor.snapshot().root_id].tracks.flatMap(t => t.layers).find(l => l.id === id)
    expect(audio()?.params.kind).toBe('Audio')
    expect(actor.mcpCall('update_layer_params', JSON.stringify({ layer_id: id, patch: { kind: 'Audio', role: 'music', gain_db: -18, fade_in_us: 250_000, fade_out_us: 500_000 } })).ok).toBe(true)
    expect(audio()?.params).toMatchObject({ role: 'music', fade_in_us: 250_000, fade_out_us: 500_000 })
    const saved = JSON.stringify(serializeProject(actor.snapshot()))
    expect(actor.mcpCall('undo', '{}').ok).toBe(true)
    expect(actor.mcpCall('undo', '{}').ok).toBe(true)
    expect(audio()).toBeUndefined()
    expect(actor.mcpCall('redo', '{}').ok).toBe(true)
    expect(actor.mcpCall('redo', '{}').ok).toBe(true)
    expect(JSON.stringify(serializeProject(actor.snapshot()))).toBe(saved)
    const reopened = createActor({ initial: parseProject(JSON.parse(saved)), idGen: seededGen(800) })
    expect(reopened.snapshot().compositions[reopened.snapshot().root_id].tracks.flatMap(t => t.layers).find(l => l.id === id)?.params.kind).toBe('Audio')
  })

  it('creates editable styled native text and reuses the caption restyle command', () => {
    const actor = freshActor()
    const added = actor.mcpCall('add_text_layer', JSON.stringify({ content: 'STOP DOING THIS', t_start_us: 0, duration_us: 2_000_000,
      font_family: 'Inter', font_size_px: 108, font_weight: 700, fill_color: { r: 255, g: 255, b: 255, a: 255 },
      outline_width: 4, outline_color: { r: 0, g: 0, b: 0, a: 255 }, shadow: { color: { r: 0, g: 0, b: 0, a: 255 }, offset_x: 2, offset_y: 3, blur: 4 },
      align: 'Center', box_w: 1200, x: 960, y: 540 }))
    expect(added.ok, JSON.stringify(added)).toBe(true)
    if (!added.ok) return
    const textId = added.result.content[0].text
    const text = actor.snapshot().compositions[actor.snapshot().root_id].tracks.flatMap(t => t.layers).find(l => l.id === textId)!
    expect(text.params).toMatchObject({ kind: 'Text', content: 'STOP DOING THIS', font: { family: 'Inter', size_px: 108, weight: 700 }, outline: { width: 4 }, box_w: 1200 })
    expect(actor.mcpCall('update_layer_params', JSON.stringify({ layer_id: textId, patch: { kind: 'Text', content: 'EDITABLE' } })).ok).toBe(true)

    expect(actor.dispatch('add_caption_track', { cues: [{ start_us: 0, end_us: 1_000_000, text: 'Caption' }], comp_w: 1920, comp_h: 1080, label: null }).ok).toBe(true)
    const restyled = actor.mcpCall('restyle_captions', JSON.stringify({ font_size_px: 64, outline_width: 5, color: { r: 255, g: 255, b: 0, a: 255 } }))
    expect(restyled.ok, JSON.stringify(restyled)).toBe(true)
    const captions = actor.snapshot().compositions[actor.snapshot().root_id].tracks.filter(t => t.role === 'Caption').flatMap(t => t.layers)
    expect(captions[0]?.params).toMatchObject({ kind: 'Text', font: { size_px: 64 }, outline: { width: 5 }, color: { value: { r: 255, g: 255, b: 0, a: 255 } } })
    expect(actor.mcpCall('undo', '{}').ok).toBe(true)
    expect(actor.snapshot().compositions[actor.snapshot().root_id].tracks.filter(t => t.role === 'Caption').flatMap(t => t.layers)[0]?.params).not.toMatchObject({ font: { size_px: 64 } })
  })
})
