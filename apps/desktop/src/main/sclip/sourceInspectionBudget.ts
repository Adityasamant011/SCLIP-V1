import type {Project} from '../state/model.js'
/** Per accepted request, shared across MCP reconnects. Counts bounded source
 * discovery admissions, including cached reads and failures. Never chooses or performs an edit. */
export class SourceInspectionBudget {
  private count = 0
  private refinement = false
  private readonly importedStock = new Set<string>()
  private stockPreviews = 0
  private artifactPreviews = 0
  private sourceCount=1
  private configured=false
  configureSources(project:Project){
    if(this.configured)return
    this.configured=true;this.sourceCount=Math.max(1,Object.values(project.media_pool).filter(m=>!this.importedStock.has(m.id)&&['Video','Audio'].includes(m.kind)).length)
  }
  private get initialLimit(){return Math.min(48,Math.max(12,this.sourceCount*7+5))}
  private get refinementLimit(){return Math.min(18,Math.max(6,this.sourceCount*2+4))}
  admitArtifactPreview(cost=1): boolean {if(!Number.isSafeInteger(cost)||cost<1||cost>4)return false;const admitted=this.artifactPreviews+cost<=12;if(admitted)this.artifactPreviews+=cost;return admitted}
  registerStock(mediaId: string) { this.importedStock.add(mediaId) }
  admitStockPreview(mediaId: unknown): boolean {
    if(typeof mediaId!=="string" || !this.importedStock.has(mediaId) || this.stockPreviews>=6)return false
    this.stockPreviews++; return true
  }
  assemblyCommitted() { if(!this.refinement){this.refinement=true;this.count=0} }
  constructor(_now = Date.now) {}
  admit(cost = 1): string | undefined {
    if (this.count + cost > (this.refinement ? this.refinementLimit : this.initialLimit)) {
      return 'Source inspection budget reached for this phase of the request. Reuse existing observations and transcript. Assemble the justified requested edit now, preserving uncertain details as unresolved; if evidence is insufficient, explain the specific limitation and stop. Do not bypass this limit with terminal scripts, image tools, or another transport. No venue name or visual fact may be guessed. A first committed assembly permits one bounded refinement pass. Current-timeline verification remains available after editing.'
    }
    this.count += cost
  }
  guidance() {
    return { stock_preview_calls: this.stockPreviews, stock_preview_limit: 6, source_inspection_calls: this.count, source_inspection_limit: this.refinement ? this.refinementLimit : this.initialLimit, phase: this.refinement ? 'refinement' : 'initial_assembly',
      next_step: this.refinement ? 'Refine only specific unresolved details in the committed assembly; do not restart the source scan.' : this.count >= 6 ? 'Enough initial inspection: use the available evidence for a first editable assembly. Defer uncertain names/details. Do not repeat unchanged visual questions.' : 'Prefer cached transcript and one coarse source map; inspect only unresolved passages needed for the requested edit.' }
  }
}

/** Generated narration and graphic preview files are output work, not repeated
 * discovery of original footage. Artifact checks have their own bounded budget. */
export function isSourceDiscovery(project: Project | undefined, name: string, args: Record<string, unknown>): boolean {
  if (name === 'transcribe_clip' && project) {
    const layer = Object.values(project.compositions).flatMap(c => c.tracks.flatMap(t => t.layers)).find(l => l.id === args.layer_id)
    if (layer?.params.kind === 'Audio') return false
  }
  return isSourceSurvey(project, name) || ['get_media_context','get_source_observations','get_source_understanding','get_source_speech_context','evaluate_source_passages','describe_clip','transcribe_clip'].includes(name)
    || name === 'vision_inspect' && args.media_id !== undefined
}

/** A full source temporarily placed on the timeline is still source discovery. */
export function isSourceSurvey(project:Project|undefined,name:string) {
 if(!project||!['inspect_timeline_range_visuals','inspect_timeline_temporal_window'].includes(name))return false
 const comp=project.compositions[project.root_id], clips=comp.tracks.filter(t=>t.enabled).flatMap(t=>t.layers.filter(l=>l.enabled&&l.params.kind==='VideoClip'))
 if(clips.length!==1||comp.duration_us<=120e6)return false
 const p=clips[0].params
 return p.kind==='VideoClip' && p.src_in_us===0 && Number(project.media_pool[p.media]?.metadata.duration_us)-p.src_out_us<1e6
}
