import type { Project } from '../state/model'
import type { CreatorEvidence } from '../../shared/creator-style'

export const isHostFeedback = (text: string) => /^\[Sclip (?:completion checkpoint|creator learning)\]/.test(text)

export function admitCreatorLearningTool(binding: {learningOnly?:boolean;learningCalls?:number}, name:string) {
  if(!binding.learningOnly)return
  if(name!=='creator_style_memory')throw Error('LEARNING_ONLY: this host continuation authorizes canonical memory review only, not timeline edits or other tools. Record insufficient evidence if more inspection is needed.')
  if((binding.learningCalls??0)>=12)throw Error('LEARNING_BUDGET_EXHAUSTED: stop this bounded pass and disclose remaining pending observations. Continue only on a new creator request.')
  binding.learningCalls=(binding.learningCalls??0)+1
}

/** Authored state only. These measurements do not establish intent or visual quality. */
export function creatorProjectFacts(project: Project) {
  const comp = project.compositions[project.root_id]
  if (!comp) return { availability: 'unavailable' }
  const layers = comp.tracks.flatMap(t => t.layers)
  const counts = (items: string[]) => Object.fromEntries([...new Set(items)].map(k => [k, items.filter(i => i === k).length]))
  return {
    composition_id: comp.id, duration_us: comp.duration_us, resolution: [comp.width, comp.height],
    layer_count: layers.length, layer_kinds: counts(layers.map(l => l.params.kind)),
    video_ranges: layers.filter(l => l.params.kind === 'VideoClip').slice(0, 12).map(l => [l.t_start_us, l.t_end_us]),
    text_treatments: [...new Set(layers.flatMap(l => l.params.kind === 'Text'
      ? [JSON.stringify({ family: l.params.font.family, size_px: l.params.font.size_px, size_to_canvas_height: l.params.font.size_px / comp.height, outline: l.params.outline })] : []))].slice(0, 6).map(s => JSON.parse(s)),
    transition_count: comp.transitions.length,
    limitations: 'Bounded authored-state facts, not creator approval or rendered perception. Inspect rendered video/audio and source context before interpreting visual, pacing or story intent.',
  }
}

export const CREATOR_LEARNING_GUIDANCE = `Relevant retained creator observations are available during this ordinary foreground turn. Consider attributed prompts, manual changes, matched corrections, undo/rejection and reactions across projects for conditional editing patterns or mistake-prevention lessons. Current instructions and creator controls take priority. Your own edits, silence, export/save and repeated retrieval are not creator support; measurements are not perception. A single ambiguous action is not a universal preference. A bug repair is not automatically taste.
Use creator_style_memory action=observations for relevant retained pages (a next_cursor means incomplete coverage), evidence for exact context, and existing preference details when needed. Fresh bindings come from the read/write response. If supported, save a concise tentative hypothesis with actual evidence_ids, applicability, rationale, lesson_kind, exceptions/counterexamples. Existing candidates need id/expected_version; new ones omit them. Separate distinct meanings; consolidate only equivalent related candidates. Never approve your own candidate or override disable/forget. Keep hypothesis <=360 characters, applicability <=400, rationale/reason <=600; revise overlong text yourself. After a targeted failed repair, disclose the unsaved lesson and keep observations for later.
Record action=review with the considered evidence_ids and a reasoned outcome: learned requires a successful evidence-linked preference write; otherwise insufficient, project_specific, technical_repair or not_style. Reviewed evidence remains available for later corroboration. Retrieve scoped patterns instead of dumping journals or fixing incidental numbers as permanent style. Keep the single canonical store; generic Hermes memory is only for non-editing facts. Learning maintenance must not delay delivery or create an extra post-delivery model turn.`


/** Selection is factual and bounded; only Hermes decides semantic patterns. */
export function learningPending(evidence: CreatorEvidence[]) {
  return evidence.filter(e => e.kind !== 'explicit_instruction' && !e.review && !e.claims?.length)
}
