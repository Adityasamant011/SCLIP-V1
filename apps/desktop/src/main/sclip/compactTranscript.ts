/** Projection only: the native cache remains the source of timing and text. */
export function compactMediaContext(result: any): any {
  if (result.isError) return result
  return { ...result, content: result.content.map((item: any) => {
    if (item.type !== 'text') return item
    const body = JSON.parse(item.text)
    const transcript = body.transcript
    const compact = {
      media: body.media, range: body.range, detail: 'segments',
      transcript: transcript && { ...transcript, segments: transcript.segments?.map((segment: any) => ({
        text: segment.text, t_start_us: segment.t_start_us, t_end_us: segment.t_end_us,
      })) },
      detail_reference: Number(body.range?.end_us)-Number(body.range?.start_us)>60_000_000
        ? {tool:'get_media_context',detail:'range',media_id:body.media?.id,max_window_us:60_000_000,instruction:'Choose a source-time window of at most 60 seconds for original word timing.'}
        : `media://${body.media?.id}/transcript/${body.range?.start_us}/${body.range?.end_us}`,
      coverage: 'All cached transcript segments overlapping the requested source range; other modalities and word arrays omitted, available through detail=range.',
    }
    const text = JSON.stringify(compact)
    if (text.length > 32_000) throw new Error('Compact transcript exceeds the response limit; request a narrower source-time range. No segments were silently dropped.')
    return { ...item, text }
  }) }
}

/** Coalesce bounded native cache reads into one agent round trip. Exact source
 * segments are retained; duplicate boundary overlaps are not corroboration. */
export async function compactTranscriptRange(start: number, end: number, read: (start:number,end:number)=>Promise<any>): Promise<any> {
  const windows: Array<[number,number]> = []
  for(let t=start;t<end;t+=60_000_000)windows.push([t,Math.min(t+60_000_000,end)])
  if(!windows.length || windows.length>15)throw new Error('Compact transcript range must be positive and at most 15 minutes.')
  const results=await Promise.allSettled(windows.map(([a,b])=>read(a,b)))
  const failed=results.find(r=>r.status==='rejected')
  if(failed?.status==='rejected')throw failed.reason
  const values=results.map(r=>(r as PromiseFulfilledResult<any>).value)
  const failure=values.find(r=>r.isError);if(failure)return failure
  const bodies=values.map(r=>JSON.parse(r.content.find((c:any)=>c.type==='text').text))
  const seen=new Set<string>(),segments:any[]=[]
  for(const body of bodies)for(const s of body.transcript?.segments??[]){const key=JSON.stringify([s.t_start_us,s.t_end_us,s.text]);if(!seen.has(key)){seen.add(key);segments.push(s)}}
  segments.sort((a,b)=>a.t_start_us-b.t_start_us||a.t_end_us-b.t_end_us)
  const first=bodies[0],available=bodies.every(b=>b.transcript?.status==='available')
  return compactMediaContext({content:[{type:'text',text:JSON.stringify({...first,range:{start_us:start,end_us:end},transcript:{...first.transcript,status:available?'available':segments.length?'partial':'not_generated',segments},cache_read_windows:windows.length})}]})
}
