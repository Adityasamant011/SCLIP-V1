import { ownedCommand } from '../ownedCommand.js'
import { resolveFfmpegPath } from '../rangeRender.js'
import { evidenceStore } from '../evidenceStore.js'
import { runtimeScope } from '../runtimeScheduler.js'
import { placedLayers } from '../audioAudibility.js'
import { textLayoutBox, textHorizontalBounds } from '../textLayoutFacts.js'
import { timelineCoverage, audioAudibility } from '../audioAudibility.js'
import { fontAvailability } from '../../fonts/resolveSystemFont.js'
import { createHash } from 'node:crypto'
import { reviewState } from '../evidenceCoordinates.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { TsActorHost } from '../../state/ts-actor-host.js'
import type { Composition, Layer, Project } from '../../state/model.js'
import type { VisionSidecarManager } from '../visionSidecar.js'
import { renderTimelineRange } from '../rangeRender.js'
import type {
  TimelineCritiqueIssue,
  TimelineReviewSummary,
} from './reviewerTypes.js'
import type { JevDecide } from '../jevClient.js'


export async function extractFrameAtTime(videoPath:string,timeSec:number,outputPath:string,signal?:AbortSignal):Promise<boolean> {
  try {await ownedCommand(resolveFfmpegPath(process.resourcesPath),['-y','-ss',timeSec.toFixed(3),'-i',videoPath,'-vframes','1','-q:v','2',outputPath],signal);return true}catch{return false}
}

export class BackgroundReviewer {
  private currentSummary: TimelineReviewSummary = {
    commit_id: '',
    status: 'clean',
    updated_at: Date.now(),
    total_issues: 0,
    critical_count: 0,
    warning_count: 0,
    suggestion_count: 0,
    issues: [],
  }

  private debounceTimer: NodeJS.Timeout | null = null
  private inFlightCommitId: string | null = null
  private destroyed = false
  private unsubscribe?: () => void
  private generation = 0
  private controller?: AbortController
  private cachedState?: string
  private readonly narrativeCache=new Map<string,Record<string,number>>()

  constructor(
    private readonly tsHost: TsActorHost,
    private readonly visionSidecar?: VisionSidecarManager,
    private readonly debounceMs = 1500,
    private readonly rangeRenderer: typeof renderTimelineRange = renderTimelineRange,
    private readonly frameExtractor: (videoPath: string, timeSec: number, outputPath: string,signal?:AbortSignal) => Promise<boolean> = extractFrameAtTime,
    private readonly jevDecide?: JevDecide,
    private readonly authorization: { jev?: () => boolean; localPerception?: () => boolean; deadlineMs?: number } = {},
  ) {
    this.attachListener()
  }


  private attachListener(): void {
    // Listen to changes in project actor
    const actor = (this.tsHost as any).actor
    if (actor && typeof actor.subscribe === 'function') {
      this.unsubscribe = actor.subscribe(() => {
        if (!this.destroyed) {
          this.cachedState = undefined
          this.generation++
          this.inFlightCommitId = null
          this.controller?.abort()
          this.scheduleReview()
        }
      })
    }
  }

  public scheduleReview(): void {
    if (this.destroyed) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    // Mutations refresh cheap deterministic facts, not full perception/model review.
    this.debounceTimer = setTimeout(() => { this.debounceTimer = null; this.auditSynchronous() }, this.debounceMs)
  }

  public getSummary(): TimelineReviewSummary {
    if (this.destroyed) return { ...this.currentSummary, availability: 'unavailable', issues: [], total_issues: 0, critical_count: 0, warning_count: 0, suggestion_count: 0 }
    return this.cachedState === reviewState(this.tsHost.actor.snapshot()) ? this.currentSummary : this.auditSynchronous()
  }

  private publish(snap: Project, issues: TimelineCritiqueIssue[], state: string, deep = false): TimelineReviewSummary {
    const identity = { project_id: snap.project_id, composition_id: snap.root_id, state_version: createHash('sha256').update(state).digest('hex') }
    const unique = [...new Map(issues.map(i => [i.id, i])).values()]
    this.cachedState = state
    this.currentSummary = {
      ...identity, commit_id: identity.state_version, status: unique.length ? 'has_issues' : 'clean',
      availability: 'available', updated_at: Date.now(), total_issues: unique.length,
      critical_count: unique.filter(i => i.severity === 'critical').length,
      warning_count: unique.filter(i => i.severity === 'warning').length,
      suggestion_count: unique.filter(i => i.severity === 'suggestion').length,
      readiness: 'not_certified',
      coverage: deep ? 'Authorized optional observations where available; partial, not comprehensive. Vocal delivery quality unassessed.' : 'Deterministic layout estimates only; rendered audio, vocal delivery, meaning, story and export uninspected',
      issues: unique.map(i => ({ ...i, coordinate_space: 'timeline', ...identity,
        evidence_class: /^(visual_mismatch|broken_thought|narrative_whiplash)/.test(i.id) ? 'MODEL_OBSERVATION' : 'DETERMINISTIC_MEASUREMENT',
        evidence_basis: /^(broken_thought|narrative_whiplash)/.test(i.id) ? 'Current dependency-validated rendered-mix recognition around authored visual boundaries. Partial, fallible text-only Jev concern; not visual alignment or a story verdict.' : /^(speech_chop|pop_|silence_|beat_|energy_)/.test(i.id) ? 'Optional bounded rendered-range waveform/spectral measurements, estimated beats or provided source word timings; not a semantic delivery judgment.' : /^visual_mismatch/.test(i.id) ? 'Optional cross-modal perception observation; partial coverage and fallible interpretation.' : 'Authoritative layer/media metadata, deterministic layout estimate; not rendered pixels.',
        requires_inspection: true, uncertainty: 'Potential concern; Hermes must inspect relevant rendered evidence and decide whether intentional or actionable.' })),
    }
    return this.currentSummary
  }

  public auditSynchronous(): TimelineReviewSummary {
    if (this.destroyed) return this.getSummary()
    const snap = this.tsHost.actor.snapshot(), state = reviewState(snap)
    if (this.cachedState === state) return this.currentSummary
    const comp = snap.compositions[snap.root_id]
    if (!comp) return { ...this.currentSummary, availability: 'unavailable', issues: [], total_issues: 0, critical_count: 0, warning_count: 0, suggestion_count: 0 }
    const issues: TimelineCritiqueIssue[] = []
    this.auditLayoutAndMotifs(snap, comp, issues)
    return this.publish(snap, issues, state)
  }

  /** Full optional pass is a completion/explicit-review request, never per mutation. */
  public async runReview(signal?: AbortSignal): Promise<TimelineReviewSummary> {
    if (signal?.aborted) return { ...this.getSummary(), optional_observations: 'canceled' }
    const work = this.performReview()
    const controller = this.controller
    const cancel = () => controller?.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    let timer: NodeJS.Timeout | undefined
    let onAbort: (() => void) | undefined
    try {
      return await Promise.race([work, new Promise<TimelineReviewSummary>(resolve => {
        onAbort = () => resolve({ ...this.getSummary(), optional_observations: 'canceled' })
        controller?.signal.addEventListener('abort', onAbort, { once: true })
        timer = setTimeout(() => {
          if (onAbort) controller?.signal.removeEventListener('abort', onAbort)
          controller?.abort()
          resolve({ ...this.getSummary(), optional_observations: 'timed_out' })
        }, this.authorization.deadlineMs ?? 30_000)
      })])
    } finally {
      signal?.removeEventListener('abort', cancel)
      if (timer) clearTimeout(timer)
      if (onAbort) controller?.signal.removeEventListener('abort', onAbort)
    }
  }

  private authorized(kind: 'jev' | 'localPerception'): boolean {
    try { return this.authorization[kind]?.() === true } catch { return false }
  }

  private async performReview(): Promise<TimelineReviewSummary> {
    if (this.destroyed) return this.getSummary()
    this.controller?.abort()
    this.controller = new AbortController()
    const generation = ++this.generation
    const snap = this.tsHost.actor.snapshot(), state = reviewState(snap), comp = snap.compositions[snap.root_id]
    if (!comp) return this.auditSynchronous()
    const commitId = `${createHash('sha256').update(state).digest('hex')}:${generation}`
    this.inFlightCommitId = commitId
    const issues: TimelineCritiqueIssue[] = []
    this.auditLayoutAndMotifs(snap, comp, issues)
    // Optional perception has its own explicit local authorization. No automatic model calls.
    if (this.visionSidecar && this.authorized('localPerception')) await runtimeScope.run({...runtimeScope.getStore(),signal:this.controller.signal,priority:0},()=>this.auditAudioPerception(snap,comp,issues,commitId))
    if (this.isCurrent(generation, state) && this.jevDecide && this.authorized('jev')) await this.auditNarrativeCoherence(snap, comp, issues, commitId)
    if (!this.isCurrent(generation, state)) return this.getSummary()
    return this.publish(snap, issues, state, true)
  }

  private isCurrent(generation: number, state: string) {
    return !this.destroyed && !this.controller?.signal.aborted && generation === this.generation && state === reviewState(this.tsHost.actor.snapshot())
  }

  private auditLayoutAndMotifs(
    project: Project,
    comp: Composition,
    issues: TimelineCritiqueIssue[],
  ): void {
    const compW = comp.width
    const compH = comp.height
    const centerY = compH / 2

    const motifLayers: Layer[] = []
    const textLayers: Layer[] = []
    const videoLayers: Layer[] = []

    for (const track of comp.tracks) {
      for (const layer of track.layers) {
        if (track.enabled === false || !layer.enabled) continue
        const kind = layer.params.kind
        if (kind === 'Text') textLayers.push(layer)
        else if (kind === 'Motif') motifLayers.push(layer)
        else if (kind === 'VideoClip') videoLayers.push(layer)
      }
    }

    // Estimate caption geometry; rendering and editorial judgment remain separate.
    function extractNumeric(val: unknown): number | null {
      if (typeof val === 'number' && !Number.isNaN(val)) return val
      if (val && typeof val === 'object') {
        const o = val as Record<string, unknown>
        if (typeof o.value === 'number') return o.value
        if (typeof o.default === 'number') return o.default
      }
      return null
    }

    // Estimate caption geometry; rendering and editorial judgment remain separate.
    for (const text of textLayers) {
      const p = text.params as any
      const transform = (text as any).transform ?? p?.transform
      if (transform && transform.position) {
        const rawX = transform.position.x ?? (transform.position as any)?.value
        const rawY = transform.position.y ?? (transform.position as any)?.value
        const posX = extractNumeric(rawX) ?? 0
        const posY = extractNumeric(rawY)
        if (posY !== null) {
          const isCenterRelative = !p?.transform && Math.abs(posX) < 50
          const absoluteBottomY = isCenterRelative ? centerY + posY : posY
          if (absoluteBottomY > compH + 50) {
            issues.push({
              id: `text_offscreen_${text.id}`,
              severity: 'critical',
              category: 'caption_placement',
              t_us: text.t_start_us,
              affected_range_us: [text.t_start_us, text.t_end_us],
              layer_id: text.id,
              description: `Caption '${p.content?.slice(0, 30) ?? p.text?.slice(0, 30) ?? ''}' has estimated Y=${posY}, possibly below the bottom edge of the ${compW}x${compH} frame; actual rendered bounds are uninspected.`,
              suggested_action: `Inspect the actual caption bounds; Hermes chooses whether placement is appropriate and any repair.`,
            })
          }
        }
      }
      // Font-size estimate, never a required typography treatment.
      const rawFontSize = p.font?.size_px ?? p.font_size_px ?? p.font_size ?? p.fontSize ?? 48
      const fontSize = extractNumeric(rawFontSize) ?? 48
      if (compW === 1080 && compH === 1920 && fontSize < 36) {
        issues.push({
          id: `text_font_small_${text.id}`,
          severity: 'warning',
          category: 'caption_placement',
          t_us: text.t_start_us,
          layer_id: text.id,
          description: `Caption font size (${fontSize}px) may be too small for mobile vertical video readability; verify the rendered text.`,
          suggested_action: `Inspect rendered readability in context; choose a change only if justified.`,
        })
      }
    }

    // Facts identify potential concerns, never choose an edit or disallow intentional overlap.
    for (const text of textLayers) {
      const box = textLayoutBox(text), horizontal=textHorizontalBounds(text)
      const p = text.params as any
      if ((box && (box.left < 0 || box.top < 0 || box.right > compW || box.bottom > compH)) || (horizontal && (horizontal.left<0 || horizontal.right>compW))) issues.push({
        id: `text_box_bounds_${text.id}`, severity: 'warning', category: 'caption_placement', layer_id: text.id,
        t_us: text.t_start_us, affected_range_us: [text.t_start_us,text.t_end_us],
        description: `Authored text layout box extends outside canvas: ${JSON.stringify(box ?? horizontal)} on ${compW}x${compH}. Position is the transform anchor, not a left margin. Glyph occupancy is unknown.`,
        suggested_action: 'Inspect composed text bounds and pixels; decide whether a repair is justified.' })
      const fonts = p.font?.family ? fontAvailability(p.font.family) : null
      if (fonts?.unavailable.length) issues.push({id:`text_font_unavailable_${text.id}`,severity:'warning',category:'caption_placement',layer_id:text.id,t_us:text.t_start_us,
        description:`Requested font families unavailable: ${fonts.unavailable.join(', ')}. Explicit bundled fallback is Liberation Sans / Noto Sans SC; verify the actual rendered typography.`,
        suggested_action:'Choose an available family only if appropriate; no font substitution is authored automatically.'})
    }
    const boxed=textLayers.map(l=>({l,b:textLayoutBox(l)})).filter(v=>v.b!==null).slice(0,64)
    for(let i=0;i<boxed.length;i++) for(let j=i+1;j<boxed.length;j++) {
      const a=boxed[i],b=boxed[j],start=Math.max(a.l.t_start_us,b.l.t_start_us),end=Math.min(a.l.t_end_us,b.l.t_end_us)
      if(end>start && Math.min(a.b!.right,b.b!.right)>Math.max(a.b!.left,b.b!.left) && Math.min(a.b!.bottom,b.b!.bottom)>Math.max(a.b!.top,b.b!.top)) issues.push({
        id:`text_collision_${a.l.id}_${b.l.id}`,severity:'warning',category:'caption_placement',t_us:start,affected_range_us:[start,end],
        description:`Text layout boxes ${a.l.id} and ${b.l.id} intersect during this range. Boxes may contain empty space and overlap may be intentional.`,
        suggested_action:'Inspect the actual composed interval; Hermes judges readability and any repair.'})
    }
    const coverage=timelineCoverage(project,comp.id)
    if(coverage.trailing_range_without_visual_layers_us) issues.push({id:'trailing_visual_coverage',severity:'warning',category:'continuity',t_us:coverage.trailing_range_without_visual_layers_us[0],
      affected_range_us:coverage.trailing_range_without_visual_layers_us as [number,number],description:'Composition extends beyond its last enabled visual layer. Background-only ending may be intentional; inspect the actual ending and audio.',
      suggested_action:'Inspect the ending; Hermes decides whether any change is justified.'})

    // Audit Motifs (Detect time and spatial collision)
    for (let i = 0; i < motifLayers.length; i++) {
      for (let j = i + 1; j < motifLayers.length; j++) {
        const m1 = motifLayers[i]
        const m2 = motifLayers[j]
        const overlapStart = Math.max(m1.t_start_us, m2.t_start_us)
        const overlapEnd = Math.min(m1.t_end_us, m2.t_end_us)
        if (overlapEnd > overlapStart) {
          const p1 = m1.params as any
          const p2 = m2.params as any
          const name1 = p1.motif_id ?? m1.label
          const name2 = p2.motif_id ?? m2.label
          // Check if both occupy similar vertical space
          const v1 = p1.props?.v_align ?? 'center'
          const v2 = p2.props?.v_align ?? 'center'
          if (v1 === v2) {
            issues.push({
              id: `motif_collision_${m1.id}_${m2.id}`,
              severity: 'warning',
              category: 'motif_collision',
              t_us: overlapStart,
              affected_range_us: [overlapStart, overlapEnd],
              description: `Motifs '${name1}' and '${name2}' overlap on timeline from ${(overlapStart / 1e6).toFixed(1)}s to ${(overlapEnd / 1e6).toFixed(1)}s with same alignment ('${v1}').`,
              suggested_action: `Inspect the overlapping interval; Hermes decides whether the combination is intentional.`,
            })
          }
        }
      }
    }

    // Estimate screen coverage; margins or inset video may be intentional.
    for (const vc of videoLayers) {
      const p = vc.params as any
      const media = (project.media_pool?.[p.media] ?? (comp as any)?.media_pool?.[p.media]) as any
      const mediaWidth = media?.metadata?.video?.width ?? media?.width
      const mediaHeight = media?.metadata?.video?.height ?? media?.height
      if (mediaWidth && mediaHeight) {
        const transform = (vc as any).transform ?? p?.transform
        const rawScaleX = transform?.scale_x ?? p?.scale_x ?? transform?.scale?.x ?? (vc as any).scale_x
        const rawScaleY = transform?.scale_y ?? p?.scale_y ?? transform?.scale?.y ?? (vc as any).scale_y
        const scaleX = extractNumeric(rawScaleX) ?? 1.0
        const scaleY = extractNumeric(rawScaleY) ?? 1.0
        const displayW = mediaWidth * scaleX
        const displayH = mediaHeight * scaleY

        // Coverage measurement is advisory; incomplete coverage can be intentional.
        const widthCoverage = displayW / compW
        const heightCoverage = displayH / compH

        if (displayW < compW * 0.95 || displayH < compH * 0.95) {
          issues.push({
            id: `video_coverage_${vc.id}`,
            severity: 'warning',
            category: 'visual_framing',
            t_us: vc.t_start_us,
            affected_range_us: [vc.t_start_us, vc.t_end_us],
            layer_id: vc.id,
            description: `Video clip (${mediaWidth}x${mediaHeight} at ${scaleX.toFixed(2)}x) does not fill the screen under a static scale estimate (only ${(widthCoverage * 100).toFixed(0)}% width, ${(heightCoverage * 100).toFixed(0)}% height of ${compW}x${compH}); actual rendered framing is uninspected.`,
            suggested_action: `Inspect actual rendered frames. Insets, letterboxing and other layouts can be intentional; Hermes chooses any transform or no change.`,
          })
        }
      }
    }
  }

  private async auditAudioPerception(
    project: Project,
    comp: Composition,
    issues: TimelineCritiqueIssue[],
    commitId: string,
  ): Promise<void> {
    if (!this.visionSidecar) return

    // Find all cuts across A-roll video layers
    const aRollTrack = comp.tracks.find((t) => {
      const trackName = (t as any).label ?? (t as any).name ?? ''
      return t.role === 'ARoll' || trackName.toLowerCase().includes('a-roll') || trackName.toLowerCase().includes('video')
    })
    if (!aRollTrack || aRollTrack.layers.length < 2) return

    const sortedClips = [...aRollTrack.layers].sort((a, b) => a.t_start_us - b.t_start_us)
    const cutTimestampsUs: number[] = []
    for (let i = 0; i < sortedClips.length - 1; i++) {
      cutTimestampsUs.push(sortedClips[i].t_end_us)
    }

    const selectedAudio = new Set(audioAudibility(project, comp.id).layers.filter(l => l.selected_by_mix_gates && !l.instance_path).map(l => l.layer_id))
    // Provided source timing is only supporting evidence, never proof that a
    // visual cut chopped an independently continuous voiceover.
    const wordBoundaries: Array<{ word: string; t_start_us: number; t_end_us: number }> = []
    for (const track of comp.tracks) for (const layer of track.layers) {
      if (!track.enabled || !layer.enabled || layer.params.kind !== 'Audio' || !selectedAudio.has(layer.id)) continue
      const p = layer.params, trans = (project.media_pool[p.media] as any)?.transcript
      if (!Array.isArray(trans?.segments)) continue
      for (const seg of trans.segments) for (const w of seg.words ?? []) {
        if (typeof w.text === 'string' && Number.isFinite(w.t_start_us) && Number.isFinite(w.t_end_us) && w.t_end_us > p.src_in_us && w.t_start_us < p.src_out_us) {
          wordBoundaries.push({ word: w.text.trim(), t_start_us: layer.t_start_us + w.t_start_us - p.src_in_us, t_end_us: layer.t_start_us + w.t_end_us - p.src_in_us })
        }
      }
    }

    // Word timing is evaluated only at an actual audible Audio boundary.
    const audioEdges = new Set(comp.tracks.flatMap(t => t.layers.filter(l => selectedAudio.has(l.id)).flatMap(l => [l.t_start_us, l.t_end_us])))

    // Render a representative 15-second range around the first major cuts
    const reviewStartUs = Math.max(0, cutTimestampsUs[0] - 2_000_000)
    const reviewEndUs = Math.min(comp.duration_us, reviewStartUs + 15_000_000)

    try {
      const rendered = await this.rangeRenderer(project, {
        start_us: reviewStartUs,
        end_us: reviewEndUs,
        signal: this.controller?.signal,
      })

      if (this.destroyed || this.controller?.signal.aborted || this.inFlightCommitId !== commitId) return

      if (rendered.path && this.authorized('localPerception')) {
        const audioAnalysis = await this.visionSidecar.analyzeAudio({
          audioPath: rendered.path,
          cutTimestampsUs: cutTimestampsUs.filter(t => t >= reviewStartUs && t < reviewEndUs).map(t => t - reviewStartUs),
          wordBoundaries: wordBoundaries.filter(w => [...audioEdges].some(t => cutTimestampsUs.includes(t) && t > w.t_start_us && t < w.t_end_us) && w.t_end_us > reviewStartUs && w.t_start_us < reviewEndUs).map(w => ({ ...w, t_start_us: w.t_start_us - reviewStartUs, t_end_us: w.t_end_us - reviewStartUs })),
        })

        if (audioAnalysis.ok) {
          // Add speech chop issues
          if (audioAnalysis.speech_chops && audioAnalysis.speech_chops.length > 0) {
            for (const chop of audioAnalysis.speech_chops) {
              issues.push({
                id: `speech_chop_${chop.cut_t_us}`,
                severity: 'critical',
                category: 'audio_cutoff',
                t_us: reviewStartUs + chop.cut_t_us,
                description: chop.description,
                suggested_action: chop.suggested_action,
              })
            }
          }

          // Add audio click/pop issues
          const anyAnalysis = audioAnalysis as any
          if (Array.isArray(anyAnalysis.audio_pops) && anyAnalysis.audio_pops.length > 0) {
            for (const pop of anyAnalysis.audio_pops) {
              issues.push({
                id: `pop_${pop.cut_t_us}`,
                severity: 'warning',
                category: 'audio_cutoff',
                t_us: reviewStartUs + pop.cut_t_us,
                description: pop.description,
                suggested_action: pop.suggested_action,
              })
            }
          }

          // Add awkward silence issues
          if (audioAnalysis.awkward_silences && audioAnalysis.awkward_silences.length > 0) {
            for (const sil of audioAnalysis.awkward_silences) {
              issues.push({
                id: `silence_${sil.start_us}`,
                severity: 'warning',
                category: 'pacing',
                t_us: reviewStartUs + sil.start_us,
                affected_range_us: [reviewStartUs + sil.start_us, reviewStartUs + sil.end_us],
                description: `Measured ${sil.duration_s}s of low signal energy at ${(sil.start_us / 1e6).toFixed(1)}s.`,
                suggested_action: `Inspect the audible pause in context; Hermes decides whether it is useful or needs repair.`,
              })
            }
          }

          // Music beat sync check
          if (typeof anyAnalysis.beat_sync_rate === 'number' && anyAnalysis.tempo_bpm > 60 && cutTimestampsUs.length >= 3) {
            if (anyAnalysis.beat_sync_rate < 0.35) {
              issues.push({
                id: `beat_misaligned`,
                severity: 'suggestion',
                category: 'music_sync',
                t_us: cutTimestampsUs[0],
                description: `Only ${Math.round(anyAnalysis.beat_sync_rate * 100)}% of cuts align with detected ${anyAnalysis.tempo_bpm} BPM musical beats.`,
                suggested_action: `Inspect the relevant sound and timing; musical alignment need not be intentional.`,
              })
            }
          }

          // ── Cross-Modal 1: Audio Energy vs Visual Action Mismatch ─────────
          if (anyAnalysis.semantic_inferences === true && Array.isArray(anyAnalysis.crowd_cheers) && anyAnalysis.crowd_cheers.length > 0 && typeof this.visionSidecar.inspectSequence === 'function') {
            for (const cheer of anyAnalysis.crowd_cheers) {
              const relSec = Math.max(0, cheer.start_us / 1e6)
              const tmp1 = path.join(os.tmpdir(), `av_sync_1_${Date.now()}.jpg`)
              const tmp2 = path.join(os.tmpdir(), `av_sync_2_${Date.now()}.jpg`)
              try {
                const ok1 = await this.frameExtractor(rendered.path, relSec, tmp1,this.controller?.signal)
                const ok2 = await this.frameExtractor(rendered.path, relSec + 0.4, tmp2,this.controller?.signal)
                if (ok1 && ok2) {
                  if (this.destroyed || this.controller?.signal.aborted || !this.authorized('localPerception')) return
                  const seqRes = await this.visionSidecar.inspectSequence({
                    imagePaths: [tmp1, tmp2],
                    focus: 'motion',
                  })
                  if (seqRes.ok && seqRes.raw_critique) {
                    const low = seqRes.raw_critique.toLowerCase()
                    if (low.includes('static') || low.includes('no action') || low.includes('bench')) {
                      issues.push({
                        id: `energy_mismatch_${cheer.start_us}`,
                        severity: 'warning',
                        category: 'energy_mismatch',
                        t_us: reviewStartUs + cheer.start_us,
                        affected_range_us: [reviewStartUs + cheer.start_us, reviewStartUs + cheer.end_us],
                        description: `Stadium crowd roar detected at ${(cheer.start_us / 1e6).toFixed(1)}s, but visual frames appear static with low action.`,
                        suggested_action: 'Inspect this potentially contrasting interval; Hermes decides whether the contrast is intentional.',
                      })
                    }
                  }
                }
              } catch (e) {
                // Non-fatal
              } finally {
                try { if (fs.existsSync(tmp1)) fs.unlinkSync(tmp1) } catch {}
                try { if (fs.existsSync(tmp2)) fs.unlinkSync(tmp2) } catch {}
              }
            }
          }

          // ── Cross-Modal 2: Semantic Dialogue vs Visual Topic Mismatch ─────
          if (wordBoundaries.length >= 3 && typeof this.visionSidecar.analyze === 'function') {
            const firstWords = wordBoundaries.slice(0, 8).map((w) => w.word).join(' ')
            const speechMidpointUs = wordBoundaries[Math.min(3, wordBoundaries.length - 1)].t_start_us
            if (speechMidpointUs >= reviewStartUs && speechMidpointUs <= reviewEndUs) {
              const relSec = (speechMidpointUs - reviewStartUs) / 1e6
              const tmpF = path.join(os.tmpdir(), `av_semantic_${Date.now()}.jpg`)
              try {
                const ok = await this.frameExtractor(rendered.path, relSec, tmpF,this.controller?.signal)
                if (ok) {
                  if (this.destroyed || this.controller?.signal.aborted || !this.authorized('localPerception')) return
                  const visRes = await this.visionSidecar.analyze({
                    imagePath: tmpF,
                    question: `The spoken audio says: "${firstWords}". Does this visual frame match or depict what is being spoken? Answer yes or no, and describe what is visible.`,
                  })
                  if (visRes.ok && visRes.description) {
                    const low = visRes.description.toLowerCase()
                    if (low.startsWith('no') || (low.includes('does not match') && !low.includes('matches'))) {
                      issues.push({
                        id: `visual_mismatch_${speechMidpointUs}`,
                        severity: 'suggestion',
                        category: 'visual_mismatch',
                        t_us: speechMidpointUs,
                        description: `Audio speaks about "${firstWords.slice(0, 40)}...", but on-screen visual does not appear to match.`,
                        suggested_action: 'Inspect the spoken context and representative visuals; Hermes decides whether a change is justified.',
                      })
                    }
                  }
                }
              } catch (e) {
                // Non-fatal
              } finally {
                try { if (fs.existsSync(tmpF)) fs.unlinkSync(tmpF) } catch {}
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[BackgroundReviewer] Audio perception pass skipped:', e)
    }
  }

  /**
   * Uses optional Jev advice on dependency-validated current rendered speech around visual boundaries.
   * Checks two things per boundary:
   *   1. Broken thought / Frankenbite: dialogue at the cut leaves a dangling, incomplete sentence.
   *   2. Narrative whiplash: the topic of clip B abruptly abandons or contradicts clip A.
   *
   * Only runs in the async runReview() path (NOT auditSynchronous).
   * No-ops when authorization or current rendered speech is absent; no inline source-transcript substitute.
   */
  private async auditNarrativeCoherence(project:Project,_comp:Composition,issues:TimelineCritiqueIssue[],commitId:string):Promise<void> {
    if(!this.jevDecide||!this.authorized('jev'))return
    const speech=evidenceStore.currentAudio(project)
    const segments=speech.flatMap(e=>e.result.transcript?.status==='available'?e.result.transcript.segments??[]:[])
    if(!segments.length)return
    const cuts=[...new Set(placedLayers(project).filter(p=>p.layer.params.kind==='VideoClip'||p.layer.params.kind==='Motif').map(p=>p.start_us))].filter(t=>t>0).sort((a,b)=>a-b)
    const boundaries=cuts.flatMap(t=>{
      if(!speech.some(e=>e.start<=Math.max(0,t-2000000)&&e.end>=t+2000000))return []
      const before=segments.filter(s=>s.t_start_us<t&&s.t_end_us>t-6000000).map(s=>s.text).join(' ').slice(-700)
      const after=segments.filter(s=>s.t_end_us>t&&s.t_start_us<t+6000000).map(s=>s.text).join(' ').slice(0,700)
      return before&&after?[{t_us:t,before,after}]:[]
    }).slice(0,8)
    if(!boundaries.length)return
    const key=createHash('sha256').update(JSON.stringify({state:reviewState(project),boundaries,version:2})).digest('hex')
    const questions:Record<string,import('../jevClient.js').JevQuestion>={}
    boundaries.forEach((_b,i)=>{questions['boundary_'+i]={type:'noul',instructions:`Evaluate adjacent recognized audible-mix context at visual boundary ${i}. A visual cut is not necessarily a speech edit; an unfinished phrase continued in after is valid. ASR can be wrong.`,criteria:{true:'The combined before/after audible text appears to contain a broken logical connection or contradictory discontinuity needing human/foreground inspection.',false:'The audible text continues plausibly, including continuous narration across a visual cut, or evidence is insufficient.'}}})
    try {
      if(this.destroyed||this.controller?.signal.aborted||this.inFlightCommitId!==commitId)return
      let answers=this.narrativeCache.get(key)
      if(!answers){answers=(await this.jevDecide(boundaries,questions,this.controller?.signal)).answers;this.narrativeCache.set(key,answers);if(this.narrativeCache.size>8)this.narrativeCache.delete(this.narrativeCache.keys().next().value!)}
      if(this.destroyed||this.controller?.signal.aborted||this.inFlightCommitId!==commitId)return
      boundaries.forEach((b,i)=>{const score=answers!['boundary_'+i]??0;if(score>=0.72)issues.push({id:`narrative_whiplash_${b.t_us}`,severity:'suggestion',category:'pacing',t_us:b.t_us,affected_range_us:[Math.max(0,b.t_us-2000000),b.t_us+2000000],description:`Possible audible-context discontinuity near this visual boundary (uncalibrated Jev score ${score.toFixed(2)}). This may be intentional or an ASR error.`,suggested_action:'Inspect surrounding current audible speech and source context; the foreground agent decides whether any repair serves the brief.'})})
    }catch{/* Optional advice never replaces current facts or fails the edit. */}
  }

  public dispose(): void {
    this.destroyed = true
    this.generation++
    this.inFlightCommitId = null
    this.controller?.abort()
    this.unsubscribe?.()
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }
}
