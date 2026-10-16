import type {Layer, Project, Track} from '../model'
import type {IdGen} from '../ids'
import {gridForLayerKind, snapOnGrid} from '../snap'
import {CAPTION_TIMING_KEY, captionRevealEnd, readCaptionTiming, type CaptionTiming} from '../../../shared/captionTiming'
import {sourceSignature} from './textCorrection'
import {applyDurationAutofit} from './helpers'

const mediaParams = (l: Layer | undefined) => l?.params.kind === 'VideoClip' || l?.params.kind === 'Audio' ? l.params : null
const normalRate = (l: Layer) => l.params.kind !== 'VideoClip' || l.params.speed === 1
const animated = (v: unknown): boolean => !!v && typeof v === 'object' &&
  (('mode' in v && (v.mode === 'Keyframed' || v.mode === 'Path')) || Object.values(v).some(animated))

/** Follow fresh, explicitly anchored caption observations in the SAME actor
 * transaction as their source edit. Legacy/unbound/manual/locked captions are
 * never guessed into this relationship. No recognition, inference or I/O. */
export function syncCaptionSources(before: Project, after: Project, ids: IdGen): void {
  for (const previous of Object.values(before.compositions)) {
    const comp = after.compositions[previous.id]
    if (!comp) continue
    const oldLayers = previous.tracks.flatMap(t => t.layers)
    const oldById = new Map(oldLayers.map(l => [l.id, l]))
    const currentSources = comp.tracks.flatMap(t => t.layers).filter(l => mediaParams(l))
    const find = (id: string) => comp.tracks.flatMap(t => t.layers).find(l => l.id === id)
    const plans: Array<{track: Track; original: Layer; replacements: Layer[]}> = []
    for (const oldTrack of previous.tracks) for (const old of oldTrack.layers) {
      if (oldTrack.role !== 'Caption' || oldTrack.locked || old.locked || old.params.kind !== 'Text') continue
      if (old.params.intro || old.params.outro || animated(old.params) || animated(old.effects) || previous.links.some(l=>l.members.includes(old.id)) || previous.transitions.some(t=>t.from_layer===old.id || t.to_layer===old.id)) continue
      const timing = readCaptionTiming(old.metadata[CAPTION_TIMING_KEY]), binding = timing?.source
      if (!timing || !binding || binding.caption_start_us !== old.t_start_us || binding.caption_end_us !== old.t_end_us || timing.text !== old.params.content || timing.duration_us !== old.t_end_us-old.t_start_us) continue
      // No trustworthy complete word-to-text map: leave editable phrase intact.
      if (captionRevealEnd(timing.text,timing,timing.duration_us) !== timing.text.length) continue
      const source = oldById.get(binding.id), oldParams = mediaParams(source)
      if (!source || !oldParams || !normalRate(source) || sourceSignature(source) !== binding.signature) continue
      const live = find(old.id), track = comp.tracks.find(t => t.layers.some(l => l.id === old.id))
      if (!live || !track || track.locked || live.locked) continue
      const nextSource = find(source.id)
      // Relocation to another composition is not deletion. Cross-composition
      // caption ownership is unsupported: preserve the cue and let it go stale.
      if (!nextSource && Object.values(after.compositions).some(c => c.tracks.some(t => t.layers.some(l => l.id === source.id)))) continue
      if (nextSource && sourceSignature(nextSource) === binding.signature) continue
      // A user/batch explicitly edited the caption too: preserve that intent.
      if (JSON.stringify(live) !== JSON.stringify(old)) {
        const nextParams = mediaParams(nextSource)
        const delta = nextSource ? nextSource.t_start_us-source.t_start_us : 0
        if (nextSource && nextParams && normalRate(nextSource) && nextParams.media===oldParams.media && nextParams.src_in_us===oldParams.src_in_us && nextParams.src_out_us===oldParams.src_out_us &&
          live.t_start_us===old.t_start_us+delta && live.t_end_us===old.t_end_us+delta && JSON.stringify(live.params)===JSON.stringify(old.params) && JSON.stringify(live.metadata)===JSON.stringify(old.metadata)) {
          live.metadata[CAPTION_TIMING_KEY]={...timing,source:{...binding,signature:sourceSignature(nextSource),caption_start_us:live.t_start_us,caption_end_us:live.t_end_us}}
        }
        continue
      }
      if (nextSource && (!normalRate(nextSource) || mediaParams(nextSource)?.media !== oldParams.media)) continue
      const fragments: Layer[] = nextSource ? [nextSource] : []
      const left = mediaParams(nextSource)
      // Recognize an actual split, not arbitrary newly added matching footage.
      if (nextSource && left && left.src_in_us === oldParams.src_in_us && left.src_out_us < oldParams.src_out_us) {
        const right = currentSources.find(l => {
          const p = mediaParams(l)
          return !oldById.has(l.id) && normalRate(l) && p?.media === oldParams.media && p.src_in_us === left.src_out_us && p.src_out_us === oldParams.src_out_us && l.t_start_us === nextSource.t_end_us && l.t_end_us === source.t_end_us
        })
        if (right) fragments.push(right)
      }
      const replacements: Layer[] = []
      let invalidMapping = false
      for (const fragment of fragments) {
        const fp = mediaParams(fragment)!
        const map = (sourceUs: number) => fragment.t_start_us + sourceUs-fp.src_in_us
        const words = timing.words.map(w => ({text:w.text,
          start:oldParams.src_in_us+old.t_start_us+w.start_us-source.t_start_us,
          end:oldParams.src_in_us+old.t_start_us+w.end_us-source.t_start_us}))
          .filter(w => w.end>fp.src_in_us && w.start<fp.src_out_us)
        if (!words.length) continue
        const all = words.length === timing.words.length
        const sourceStart = all ? oldParams.src_in_us+old.t_start_us-source.t_start_us : words[0]!.start
        const sourceEnd = all ? oldParams.src_in_us+old.t_end_us-source.t_start_us : words.at(-1)!.end
        const grid=gridForLayerKind('Text',comp.fps)
        const start = Math.max(fragment.t_start_us,snapOnGrid(map(Math.max(fp.src_in_us,sourceStart)),grid))
        const end = Math.min(fragment.t_end_us,snapOnGrid(map(Math.min(fp.src_out_us,sourceEnd)),grid))
        if (end<=start) continue
        const caption=structuredClone(old)
        caption.id=replacements.length ? ids() : old.id
        caption.t_start_us=start;caption.t_end_us=end
        if (caption.params.kind !== 'Text') continue
        caption.params.content=all ? timing.text : words.map(w=>w.text).join(' ')
        const clipped=words.some(w=>w.start<fp.src_in_us || w.end>fp.src_out_us)
        const nextTiming: CaptionTiming={version:1,text:caption.params.content,duration_us:end-start,
          provenance:clipped?'none':timing.provenance,
          words:words.map(w=>({text:w.text,start_us:Math.max(0,map(Math.max(fp.src_in_us,w.start))-start),end_us:Math.min(end-start,map(Math.min(fp.src_out_us,w.end))-start)})),
          source:{id:fragment.id,signature:sourceSignature(fragment),caption_start_us:start,caption_end_us:end}}
        if (!readCaptionTiming(nextTiming)) { invalidMapping = true; break }
        caption.metadata[CAPTION_TIMING_KEY]=nextTiming
        replacements.push(caption)
      }
      // Never delete an authored cue because a replacement could not be mapped.
      if (!invalidMapping) plans.push({track,original:old,replacements})
    }
    // Remove all planned cues before repacking, so a reorder is not blocked by
    // another cue's OLD position. Never move unrelated or locked captions.
    for (const p of plans) p.track.layers=p.track.layers.filter(l=>l.id!==p.original.id)
    for (const p of plans) for (const cue of p.replacements) {
      const candidates=[p.track,...comp.tracks.filter(t=>t!==p.track&&t.role==='Caption'&&!t.locked)]
      let track=candidates.find(t=>!t.layers.some(l=>l.t_start_us<cue.t_end_us && l.t_end_us>cue.t_start_us))
      if (!track) {track={...p.track,id:ids(),label:null,layers:[]};comp.tracks.push(track)}
      track.layers.push(cue);track.layers.sort((a,b)=>a.t_start_us-b.t_start_us)
    }
    if (plans.length) applyDurationAutofit(comp)
  }
}
