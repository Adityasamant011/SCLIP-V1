import fs from 'node:fs'
import path from 'node:path'
import type { ChangeEvent } from '../state/actor.js'
import type { Project, TextParams } from '../state/model.js'

type StyleProperty = 'fontSize' | 'fontFamily' | 'outlineWidth'

export interface LocalStyleEvent {
  id: string
  schemaVersion: '1.0'
  timestamp: number
  projectId: string
  source: 'user'
  action: 'completed_property_edit' | 'undo'
  category: 'caption'
  targetProperty: StyleProperty
  before: number | string | null
  after: number | string | null
  context: {
    aspectRatio: string
    contentType: null
    resolution: [number, number]
    fps: number
  }
  provenance: { commandType: string; note: string | null }
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b]
  return a || 1
}

function captionLayers(project: Project): Map<string, TextParams> {
  const result = new Map<string, TextParams>()
  for (const composition of Object.values(project.compositions)) {
    for (const track of composition.tracks) {
      if (track.role !== 'Caption') continue
      for (const layer of track.layers) {
        if (layer.params.kind === 'Text') result.set(layer.id, layer.params)
      }
    }
  }
  return result
}

function property(params: TextParams, key: StyleProperty): number | string | null {
  if (key === 'fontSize') return params.font.size_px
  if (key === 'fontFamily') return params.font.family
  return params.outline?.width ?? null
}

/** One event per human operation and property, never one per generated cue.
 *  A project-wide restyle of 50 captions must count as ONE preference sample. */
export function captionStyleEvents(
  before: Project,
  change: ChangeEvent,
  agentTouched: ReadonlySet<string>,
): LocalStyleEvent[] {
  const after = change.new_snapshot
  if (change.actor.kind !== 'User' || before.project_id !== after.project_id) return []
  if (change.summary === 'Redo' || change.summary.startsWith('Restored checkpoint') || change.summary === 'Jump to history entry') return []
  const oldLayers = captionLayers(before)
  const newLayers = captionLayers(after)
  const composition = after.compositions[after.root_id]
  if (!composition) return []
  const divisor = gcd(composition.width, composition.height)
  const context = {
    aspectRatio: `${composition.width / divisor}:${composition.height / divisor}`,
    contentType: null,
    resolution: [composition.width, composition.height] as [number, number],
    fps: composition.fps.num / composition.fps.den,
  }
  const events: LocalStyleEvent[] = []
  for (const key of ['fontSize', 'fontFamily', 'outlineWidth'] as const) {
    const changes: Array<{ id: string; before: number | string | null; after: number | string | null }> = []
    for (const [id, next] of newLayers) {
      const previous = oldLayers.get(id)
      if (!previous) continue // adding a new cue is not a correction
      const priorValue = property(previous, key)
      const nextValue = property(next, key)
      if (priorValue !== nextValue) changes.push({ id, before: priorValue, after: nextValue })
    }
    if (changes.length === 0) continue
    // Mixed target values are likely individual layout repairs; do not turn
    // those into one misleading creator-wide preference.
    const target = changes[0]!.after
    if (!changes.every((item) => item.after === target)) continue
    const prior = changes.every((item) => item.before === changes[0]!.before) ? changes[0]!.before : null
    const correctedAgentContent = changes.some((item) => agentTouched.has(item.id))
    events.push({
      id: `${change.op_id}:${key}`,
      schemaVersion: '1.0',
      timestamp: Number.isFinite(Date.parse(change.timestamp)) ? Date.parse(change.timestamp) : Date.now(),
      projectId: after.project_id,
      source: 'user',
      action: change.summary === 'Undo' ? 'undo' : 'completed_property_edit',
      category: 'caption',
      targetProperty: key,
      before: prior,
      after: target,
      context,
      provenance: { commandType: change.summary, note: correctedAgentContent ? 'agent correction' : null },
    })
  }
  return events
}

export interface StyleEventRecorder {
  observe(change: ChangeEvent, before: Project): void
  flush(): Promise<void>
}

/** Local, best-effort adapter to Hermes's existing style-events.jsonl contract.
 *  It never blocks ProjectActor's mutation path on a disk append. */
export function createStyleEventRecorder(hermesHome: string): StyleEventRecorder {
  const memories = path.join(hermesHome, 'memories')
  const eventsPath = path.join(memories, 'style-events.jsonl')
  const pointerPath = path.join(hermesHome, 'active_project.json')
  let pending: Promise<void> = Promise.resolve()
  let pointerKey = ''
  let projectId = ''
  const agentTouched = new Set<string>()

  return {
    observe(change, before) {
      const after = change.new_snapshot
      if (after.project_id !== projectId) {
        agentTouched.clear()
        projectId = after.project_id
      }
      const composition = after.compositions[after.root_id]
      if (composition) {
        const divisor = gcd(composition.width, composition.height)
        const aspectRatio = `${composition.width / divisor}:${composition.height / divisor}`
        const nextPointer = `${after.project_id}:${aspectRatio}`
        if (nextPointer !== pointerKey) {
          pointerKey = nextPointer
          try {
            fs.mkdirSync(hermesHome, { recursive: true, mode: 0o700 })
            const temp = `${pointerPath}.tmp`
            fs.writeFileSync(temp, JSON.stringify({ projectId: after.project_id, metadata: { aspectRatio } }), { mode: 0o600 })
            fs.renameSync(temp, pointerPath)
          } catch (error) {
            console.warn('[style-events] active project pointer unavailable', error instanceof Error ? error.message : String(error))
          }
        }
      }
      if (change.actor.kind === 'Agent') {
        const oldCaptions = captionLayers(before)
        for (const [id, params] of captionLayers(after)) {
          if (oldCaptions.get(id) !== params) agentTouched.add(id)
        }
        return
      }
      const events = captionStyleEvents(before, change, agentTouched)
      if (events.length === 0) return
      agentTouched.clear()
      pending = pending.then(async () => {
        await fs.promises.mkdir(memories, { recursive: true, mode: 0o700 })
        const file = await fs.promises.open(eventsPath, 'a', 0o600)
        try { await file.writeFile(events.map((event) => JSON.stringify(event)).join('\n') + '\n') }
        finally { await file.close() }
      }).catch((error) => {
        console.warn('[style-events] local preference evidence was not saved', error instanceof Error ? error.message : String(error))
      })
    },
    flush: () => pending,
  }
}
