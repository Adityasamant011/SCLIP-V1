import { useEffect, useState } from 'react'
import { invoke } from '@/bridge/ipc'
export function reviewStatusLabel(status?: string) {
  if(status==='response_only')return 'Response finished — no edit verified'
  if(status==='completed')return 'Current edit reviewed; rendered media verified'
  if(status==='running')return 'Hermes is working — current edit unverified'
  if(status==='review_required')return 'Final verification required — current edit unverified'
  if(status==='incomplete')return 'Editing incomplete — current edit unverified'
  if(status==='interrupted')return 'Editing interrupted — current edit unverified'
  if(status==='cancelled')return 'Editing cancelled — current edit unverified'
  return status === 'considered_in_completed_review' ? 'Current edit reviewed by Hermes' : status === 'review_incomplete_in_this_state' ? 'Review incomplete — current edit unverified' : 'Current edit not yet reviewed'
}
/** Existing completion receipt only. Neither diagnostics nor an interrupted terminal certify readiness. */
export function ReviewStatus({projectId}: {projectId:string}) {
  const [status,setStatus]=useState<string>()
  useEffect(()=>{let live=true,busy=false;setStatus(undefined)
    const refresh=async()=>{if(busy)return;busy=true;try{const r=await invoke<{status:string}>('sclip_get_review_disposition');if(live)setStatus(r.status)}catch{if(live)setStatus(undefined)}finally{busy=false}}
    void refresh();const timer=setInterval(()=>void refresh(),2000)
    return ()=>{live=false;clearInterval(timer)}
  },[projectId])
  return <div role="status" className="sclip-review-status" title="Current-state review receipt; this is not an automatic quality score or a guarantee that the edit is publishable.">{reviewStatusLabel(status)}</div>
}
