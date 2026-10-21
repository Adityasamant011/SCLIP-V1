import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

export interface RuntimeIdentity { project_id?: string; opening?: string; session_id?: string; turn_id?: string; request_id?: string }
type TraceData = RuntimeIdentity & { tool_name?: string; api_request_id?: string; tool_call_id?: string; provider?: string; model?: string; duration_ms?: number; queue_ms?: number; status?: string; input_tokens?: number; output_tokens?: number }
const fields = new Set(['project_id','opening','session_id','turn_id','request_id','tool_name','api_request_id','tool_call_id','provider','model','duration_ms','queue_ms','status','input_tokens','output_tokens'])
/** Local bounded metadata only. This store deliberately cannot accept prompts,
 * paths, request bodies, error prose, credentials or image/audio contents. */
export class RuntimeTrace {
  private rows: Array<{ at: string; event: string; data: TraceData }> = []
  private apiStarts=new Map<string,number>()
  constructor(private file?: string, private limit = 2048) {}
  configure(file: string) { this.file = file }
  record(event: string, value: TraceData) {
    const apiKey=JSON.stringify([value.session_id,value.turn_id,value.api_request_id])
    if(event==='pre_api_request'&&value.api_request_id){this.apiStarts.set(apiKey,performance.now());if(this.apiStarts.size>128)this.apiStarts.delete(this.apiStarts.keys().next().value!)}
    if(['post_api_request','api_request_error'].includes(event)&&this.apiStarts.has(apiKey)){
      value={...value,duration_ms:Math.round(performance.now()-this.apiStarts.get(apiKey)!)};this.apiStarts.delete(apiKey)
    }
    const data = Object.fromEntries(Object.entries(value).filter(([k,v]) => fields.has(k) &&
      (typeof v === 'string' && v.length <= 180 || typeof v === 'number' && Number.isFinite(v)))) as TraceData
    const row = {at:new Date().toISOString(),event:event.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80),data}
    this.rows.push(row); if(this.rows.length>this.limit)this.rows.shift()
    if(this.file)try {
      fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700})
      if((fs.statSync(this.file,{throwIfNoEntry:false})?.size??0)>2*1024*1024)fs.renameSync(this.file,`${this.file}.previous`)
      fs.appendFileSync(this.file,JSON.stringify(row)+'\n',{mode:0o600})
    }catch{/* Diagnostics never fail editing. */}
  }
  span(event: string, identity: TraceData = {}) {
    const start=performance.now();this.record(`${event}.start`,identity)
    return (status='ok')=>this.record(`${event}.end`,{...identity,status,duration_ms:Math.round(performance.now()-start)})
  }
  snapshot(turnId?: string) {
    const rows=this.rows.filter(r=>!turnId||r.data.turn_id===turnId)
    const stages:Record<string,{count:number;total_duration_ms:number}>={}
    for(const row of rows){const s=stages[row.event]??={count:0,total_duration_ms:0};s.count++;s.total_duration_ms+=row.data.duration_ms??0}
    return {local_only:true,retained_events:this.rows.length,stages,recent_events:rows.slice(-8),
      limitations:'Bounded metadata, not a transcript or quality verdict. Overlapping durations must not be summed as wall time.'}
  }
}
export const runtimeTrace=new RuntimeTrace()
