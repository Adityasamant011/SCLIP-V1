/** Preserve the worker's actual measurements. No semantic voice/emotion judge
 * exists here; spectral heuristics must not be promoted to model observations. */
export function audioPerceptionFacts(response: Record<string,unknown>) {
  const list=(key:string)=>Array.isArray(response[key])?(response[key] as any[]).slice(0,256):[]
  const number=(key:string)=>typeof response[key]==='number'&&Number.isFinite(response[key])?response[key] as number:0
  return {ok:response.ok!==false,duration_s:number('duration_s'),duration_us:number('duration_us'),tempo_bpm:number('tempo_bpm'),
    beats_us:list('beats_us'),speech_chops:list('speech_chops'),awkward_silences:list('awkward_silences'),audio_pops:list('audio_pops'),
    beat_sync_rate:number('beat_sync_rate'),has_clipping:response.has_clipping===true,
    measurement_basis:'Deterministic waveform/spectral measurements, estimated beats and provided word timings. Not semantic emotion, crowd identification or voice suitability.',
    semantic_inferences:false as const,vocal_delivery_assessed:false as const,
    error:response.ok===false?'Local audio measurements unavailable':undefined}
}
