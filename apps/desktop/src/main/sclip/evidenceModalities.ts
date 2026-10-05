export const EVIDENCE_DIMENSIONS = ['visual', 'audio', 'speech', 'text', 'geometry', 'timeline'] as const
export type EvidenceDimension = typeof EVIDENCE_DIMENSIONS[number]
/** Types describe observations, never editorial problems. multimodal expands to explicit dimensions. */
export function evidenceDimensions(value: unknown): EvidenceDimension[] {
  if (!Array.isArray(value) || !value.length || value.some(v => !EVIDENCE_DIMENSIONS.includes(v))) throw new Error('Declare evidence_dimensions as a nonempty array of visual, audio, speech, text, geometry or timeline. For multimodal claims list each relevant dimension.')
  return [...new Set(value)] as EvidenceDimension[]
}
export function toolDimensions(tool: string, data: any = {}): EvidenceDimension[] {
  if (tool === 'inspect_rendered_audio') return data.observed_dimensions ?? []
  if (tool === 'inspect_timeline_range_visuals' || tool === 'inspect_timeline_temporal_window') return ['visual', 'geometry']
  if (['vision_inspect','inspect_timeline_frame'].includes(tool)) return data.composed_frame_facts ? ['visual','geometry'] : ['visual']
  if (tool === 'render_timeline_range') return ['visual', 'audio']
  if (tool === 'get_editorial_evidence_packet') return data.observed_dimensions ?? ['timeline', 'text']
  if (tool === 'get_timeline_context') return ['timeline', 'text'] // Video-source cut cues alone do not establish audible speech in the edited Audio layer.
  if (tool === 'calculate_video_fit') return ['geometry']
  if(tool==='get_source_understanding') return [] // Source coverage is not current timeline verification.
  if(tool==='get_source_speech_context') return data.status==='cached' ? ['speech'] : []
  if (tool === 'get_media_context') return data.transcript ? ['speech'] : []
  return ['timeline']
}

/** Actual sampled/represented intervals, not a range-level claim inferred from sparse samples. */
export function evidenceCoverage(tool:string,data:any,range:[number,number]): Partial<Record<EvidenceDimension,[number,number][]>> {
  if(tool==='inspect_rendered_audio'){
    const observedEnd=Math.min(range[1],range[0]+Number(data.signal?.duration_us??0))
    return Object.fromEntries(toolDimensions(tool,data).map(d=>[d,observedEnd>range[0]?[[range[0],observedEnd]]:[]]))
  }
  if(tool==='get_editorial_evidence_packet')return {
    timeline:[range],text:(data.text??[]).map((t:any)=>t.timeline_range_us),
    speech:(data.speech??[]).filter((s:any)=>s.kind==='Audio'&&s.word_timing_available).map((s:any)=>s.selected_timeline_range_us),
    visual:(data.visuals?.frame_observations??[]).filter((f:any)=>f.inference_ok).map((f:any)=>[f.timeline_t_us,f.timeline_t_us]),
  }
  if(tool==='inspect_timeline_range_visuals'||tool==='inspect_timeline_temporal_window')return {visual:(data.representative_samples??[]).map((f:any)=>[f.timeline_t_us,f.timeline_t_us]),geometry:(data.representative_samples??[]).map((f:any)=>[f.timeline_t_us,f.timeline_t_us])}
  return Object.fromEntries(toolDimensions(tool,data).map(d=>[d,[range]]))
}
