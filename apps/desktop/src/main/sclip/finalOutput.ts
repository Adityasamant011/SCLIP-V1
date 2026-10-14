import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Project, Layer } from '../state/model.js'
import { currentOutput, explicitOutputDuration, type DurationRequirement } from './editingBrief.js'
import { audioAudibility } from './audioAudibility.js'
import { avRelationships } from './mediaRelationships.js'
import { renderComposedTimelineRange, resolveFfmpegPath, MAX_RANGE_RENDER_DURATION_US } from './rangeRender.js'
const exec = promisify(execFile)
export interface OutputRequirements {
  requiresVideo: boolean; requiresAudio: boolean; requiresSpeech: boolean
  /** Delivery container hint; audio mention never overrides explicit video. */
  media: 'video' | 'audio' | 'unspecified'; speech: boolean; duration?: DurationRequirement
}
/** Supported scope: literal English single-output modality nouns, audio-only /
 * video-only / silent, and direct no/without/omit/exclude/do-not-include noun
 * negations. No semantic speech recognition or arbitrary paraphrase inference. */
export function outputRequirements(brief: string, project: Project): OutputRequirements {
  const positive = brief.replace(/\b(?:no|without|omit|exclude|do not include|don't include)\s+(?:(?:any|the|a|background)\s+)?(?:audio|sound|soundtrack|music|narration|voice[- ]?over|speech|spoken dialogue|dialogue|video|footage)\b/gi, '')
  const silent = /\b(?:silent|video[- ]only|(?:no|without)\s+(?:any\s+)?(?:audio|sound))\b/i.test(brief)
  const noVideo = /\b(?:audio[- ]only|soundtrack only|(?:no|without)\s+(?:any\s+)?(?:video|footage))\b/i.test(brief)
  const video = !noVideo && /\b(?:video|footage|tutorial|highlight|showcase|reel|title|draft|clip)\b/i.test(positive)
  const audio = !silent && /\b(?:audio|podcast|soundtrack|music|narration|voice[- ]?over|speech|spoken|dialogue|talking[- ]head)\b/i.test(positive)
  const requiresSpeech = !silent && /\b(?:narration|voice[- ]?over|speech|spoken|dialogue|talking[- ]head)\b/i.test(positive)
  const existingVisual = project.compositions[project.root_id]?.tracks.some(t => t.enabled && t.layers.some(l => l.enabled && l.params.kind !== 'Audio'))
  const requiresVideo = video || !noVideo && !audio && !!existingVisual
  const requiresAudio = audio || requiresSpeech
  return {requiresVideo, requiresAudio, requiresSpeech, media: requiresVideo ? 'video' : requiresAudio ? 'audio' : 'unspecified', speech: requiresSpeech, duration: explicitOutputDuration(brief)}
}
function invisible(layer: Layer) {
  const p = layer.params
  return ('opacity' in p && p.opacity.mode === 'Static' && p.opacity.value <= 0) ||
    (p.kind === 'Color' && p.color.mode === 'Static' && p.color.value.a <= 0)
}
/** Potential authored visual intervals. An explicit opaque black Color counts;
 * a background alone cannot turn an audio-only edit into a finished video. */
export function visualOutput(project: Project) {
  const ranges: [number, number][] = []; let footage = 0
  function walk(id: string, offset: number, lo: number, hi: number, seen: Set<string>) {
    if (seen.has(id) || seen.size > 32) return
    const next = new Set(seen).add(id)
    for (const t of project.compositions[id]?.tracks ?? []) for (const l of t.enabled ? t.layers : []) {
      if (!l.enabled || invisible(l) || l.params.kind === 'Audio') continue
      const a = Math.max(lo, offset + l.t_start_us), b = Math.min(hi, offset + l.t_end_us)
      if (b <= a) continue
      if (l.params.kind === 'CompositionRef') walk(l.params.composition, offset + l.t_start_us - l.params.src_in_us, a, b, next)
      else { ranges.push([a,b]); if (l.params.kind === 'VideoClip') footage++ }
    }
  }
  const duration = project.compositions[project.root_id].duration_us
  walk(project.root_id,0,0,duration,new Set())
  const covered: [number,number][] = []
  for (const r of ranges.sort((a,b)=>a[0]-b[0])) {
    const last = covered.at(-1)
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1],r[1]); else covered.push([...r])
  }
  const gaps: [number,number][] = []; let end = 0
  for (const r of covered) { if (r[0] > end) gaps.push([end,r[0]]); end=r[1] }
  if (end<duration) gaps.push([end,duration])
  return {potential_visual_ranges_us:covered,uncovered_ranges_us:gaps,video_clip_count:footage,
    scope:'Authored enabled intervals, excluding statically transparent layers; not pixel visibility or subject recognition. Black/title cards and intentional background intervals may be legitimate.'}
}
export function validateOutputState(project: Project, requirements?: OutputRequirements, duration?: DurationRequirement) {
  const output = currentOutput(project,requirements?.duration ?? duration), visual = visualOutput(project), audio = audioAudibility(project)
  const errors: string[] = [], warnings: string[] = []
  if (output.duration_requirement?.met === false) errors.push('OUTPUT_DURATION_UNMET')
  if (output.duration_us <= 0 || output.layer_count === 0) errors.push('EMPTY_OUTPUT')
  if (requirements?.requiresVideo && !visual.potential_visual_ranges_us.length) errors.push('REQUIRED_VIDEO_ABSENT')
  if (requirements?.requiresAudio && audio.selected_count === 0) errors.push('REQUIRED_AUDIO_ABSENT')
  if (visual.uncovered_ranges_us.length && requirements?.media !== 'audio') warnings.push('UNAUTHORED_VISUAL_INTERVALS: Inspect these ranges; background/black can be intentional. No gap-filling edit is prescribed.')
  const frame=1e6*project.compositions[project.root_id].fps.den/project.compositions[project.root_id].fps.num
  for (const comp of Object.values(project.compositions)) for (const t of comp.tracks) for (const l of t.enabled ? t.layers : []) {
    if (!l.enabled || !('media' in l.params)) continue
    const m = project.media_pool[l.params.media]
    if (!m) { errors.push(`MISSING_MEDIA:${l.id}`); continue }
    if ('src_out_us' in l.params && (l.params.src_in_us<0 || l.params.src_out_us<=l.params.src_in_us || m.metadata.duration_us != null && l.params.src_out_us>m.metadata.duration_us+frame)) errors.push(`INVALID_SOURCE_RANGE:${l.id}`)
  }
  const relationships=avRelationships(project)
  if (relationships.some(r=>Math.abs(r.video_minus_audio_source_offset_us)>frame || r.video_speed!==1)) warnings.push('AUDIO_VIDEO_MAPPING_DIFFERENCE: Authored offsets/rates can be intentional; judge actual synchronized playback.')
  return {valid:errors.length===0,errors,warnings,current_output:output,visual_output:visual,audio_output:audio,relationships,time_units:'Integer microseconds: 1 second = 1000000 us',duration_seconds:output.duration_us/1e6}
}
export function requiredRenderedDimensions(project: Project, requirements?: OutputRequirements) {
  const dims: Array<'visual'|'audio'|'speech'>=[]
  if (requirements?.media !== 'audio' && visualOutput(project).potential_visual_ranges_us.length) dims.push('visual')
  if (audioAudibility(project).selected_count>0) dims.push('audio')
  if (requirements?.requiresSpeech) dims.push('speech')
  return dims
}
export function sourceFingerprint(project: Project, additionalMediaIds: string[] = []) {
  const used = new Set([...additionalMediaIds, ...Object.values(project.compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers.flatMap(l=>'media' in l.params?[l.params.media]:[])))])
  return createHash('sha256').update(JSON.stringify([...used].sort().map(id=>{
    const m=project.media_pool[id];try {const s=fs.statSync(m.path_abs);return [id,s.size,s.mtimeMs]} catch {return [id,'unavailable']}
  }))).digest('hex')
}
export interface DeliveryProof { valid: boolean; reason?: string; duration_us?: number; has_video?: boolean; has_audio?: boolean; decoded?: boolean; artifact_sha256?: string }
/** Never promote a bare success flag without decoded, duration and required stream facts. */
export function deliveryProofValid(project: Project, requirements: OutputRequirements | undefined, proof: DeliveryProof) {
  const duration=project.compositions[project.root_id].duration_us
  const frame=1e6*project.compositions[project.root_id].fps.den/project.compositions[project.root_id].fps.num
  const needVideo=requirements?.requiresVideo||requirements?.media!=='audio'&&visualOutput(project).potential_visual_ranges_us.length>0
  const needAudio=requirements?.requiresAudio||audioAudibility(project).selected_count>0
  return proof.valid && proof.decoded===true && Number.isFinite(proof.duration_us) && Math.abs(proof.duration_us!-duration)<=Math.max(frame,100000) && (!needVideo||proof.has_video===true) && (!needAudio||proof.has_audio===true)
}
/** Full temporary production-compositor artifact, then actual stream decode.
 * This is host technical QA, never a Hermes review receipt or final export. */
export async function verifyDelivery(project: Project, requirements: OutputRequirements | undefined, getActiveWindow: Parameters<typeof renderComposedTimelineRange>[1]['getActiveWindow'], signal?: AbortSignal): Promise<DeliveryProof> {
  const duration = project.compositions[project.root_id].duration_us
  if (duration>MAX_RANGE_RENDER_DURATION_US) return {valid:false,reason:'Full output exceeds the bounded completion render window; whole-output decodability remains unproven.'}
  let file: string | undefined
  try {
    const window=getActiveWindow()
    if(!window||window.isDestroyed())throw new Error('Composed export requires an open Sclip desktop window')
    for(const comp of Object.values(project.compositions))for(const track of comp.tracks)for(const layer of track.enabled?track.layers:[]){
      if(!layer.enabled||!('media' in layer.params))continue
      const source=project.media_pool[layer.params.media]
      if(!source||!fs.statSync(source.path_abs,{throwIfNoEntry:false})?.isFile())throw new Error('Required source file unavailable; current output provenance cannot be verified')
    }
    const audioOnly=requirements?.media==='audio'||requirements?.media!=='video'&&!visualOutput(project).potential_visual_ranges_us.length&&audioAudibility(project).selected_count>0
    const rendered=await renderComposedTimelineRange(project,{start_us:0,end_us:duration,audioOnly,getActiveWindow:()=>window,signal});file=rendered.path
    const ffmpeg=resolveFfmpegPath(),ffprobe=ffmpeg.replace(/ffmpeg(\.exe)?$/,'ffprobe$1')
    const probe=await exec(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],{timeout:30000,signal,maxBuffer:2e6})
    const info=JSON.parse(probe.stdout),hasVideo=info.streams?.some((s:any)=>s.codec_type==='video'),hasAudio=info.streams?.some((s:any)=>s.codec_type==='audio')
    const actual=Math.round(Number(info.format?.duration)*1e6),frame=1e6*project.compositions[project.root_id].fps.den/project.compositions[project.root_id].fps.num
    if (!Number.isFinite(actual)||Math.abs(actual-duration)>Math.max(frame,100000)) throw new Error('Rendered duration disagrees with the complete requested timeline range')
    if (!audioOnly&&!hasVideo) throw new Error('Rendered artifact has no video stream')
    if ((audioOnly||requirements?.requiresAudio||audioAudibility(project).selected_count>0)&&!hasAudio) throw new Error('Required rendered audio stream is absent')
    await exec(ffmpeg,['-v','error','-xerror','-i',file,'-map','0:v?','-map','0:a?','-f','null','-'],{timeout:120000,signal,maxBuffer:2e6})
    return {valid:true,duration_us:actual,has_video:!!hasVideo,has_audio:!!hasAudio,decoded:true,artifact_sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
  } catch (e) {return {valid:false,reason:e instanceof Error?e.message:String(e)}}
  finally {if(file)fs.rmSync(file,{force:true})}
}
