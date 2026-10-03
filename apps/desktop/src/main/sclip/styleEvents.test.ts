import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createActor } from '../state/actor'
import { seededGen } from '../state/ids'
import { blankProject } from '../state/model'
import { createStyleEventRecorder } from './styleEvents'

const temporaryHomes: string[] = []
afterEach(() => {
  for (const directory of temporaryHomes.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('local creator-style event bridge', () => {
  it('records one human correction for a multi-cue restyle, not agent work or cue count', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-style-events-'))
    temporaryHomes.push(home)
    const idGen = seededGen()
    const actor = createActor({ initial: blankProject(idGen, 'style'), idGen, clock: () => '2026-09-29T00:00:00.000Z' })
    const recorder = createStyleEventRecorder(home)
    let previous = actor.snapshot()
    actor.subscribe((change) => {
      recorder.observe(change, previous)
      previous = change.new_snapshot
    })

    const cues = [
      { start_us: 0, end_us: 1_000_000, text: 'First' },
      { start_us: 1_000_000, end_us: 2_000_000, text: 'Second' },
    ]
    expect(actor.dispatchAs({ kind: 'Agent', client: 'mcp' }, 'add_caption_track', {
      cues, comp_w: 1920, comp_h: 1080, label: 'Captions',
    }).ok).toBe(true)
    expect(actor.dispatch('restyle_captions', { patch: { font_size_px: 72 } }).ok).toBe(true)
    await recorder.flush()

    const events = fs.readFileSync(path.join(home, 'memories', 'style-events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ source: 'user', action: 'completed_property_edit', category: 'caption', targetProperty: 'fontSize', after: 72, provenance: { note: 'agent correction' } })
    expect(events[0].projectId).toBe(actor.snapshot().project_id)
    const pointer = JSON.parse(fs.readFileSync(path.join(home, 'active_project.json'), 'utf8'))
    expect(pointer.projectId).toBe(actor.snapshot().project_id)
    expect(pointer.metadata.aspectRatio).toBe('16:9')
  })

  it('ignores generated cue additions and unrelated project changes', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-style-events-'))
    temporaryHomes.push(home)
    const idGen = seededGen()
    const actor = createActor({ initial: blankProject(idGen, 'style'), idGen })
    const recorder = createStyleEventRecorder(home)
    let previous = actor.snapshot()
    actor.subscribe((change) => {
      recorder.observe(change, previous)
      previous = change.new_snapshot
    })
    expect(actor.dispatch('add_caption_track', {
      cues: [{ start_us: 0, end_us: 1_000_000, text: 'One' }], comp_w: 1920, comp_h: 1080, label: null,
    }).ok).toBe(true)
    await recorder.flush()
    expect(fs.existsSync(path.join(home, 'memories', 'style-events.jsonl'))).toBe(false)
  })
})
