import { describe,it,expect } from 'vitest'
import { RevisionLoopGuard } from './revisionLoopGuard'
import type { EvidenceDimension } from './evidenceModalities'
const bounds=new Map<string,[number,number]>([['layer',[0,60000000]]])
function selected(dimensions:EvidenceDimension[]) {
  const g=new RevisionLoopGuard(true),r=g.recordEvidence('synthetic','timeline',[0,60000000],'before',dimensions)
  const issue=g.recordIssue({description:'Hermes selected observable uncertainty',severity:'moderate',repairable:true,evidence_dimensions:dimensions,evidence_receipt_ids:[r.id],layer_ids:['layer']},'before',60000000,bounds)
  g.selectIssue(issue.issue.id,'before');g.checkpointCreated();expect(g.beforeMutation('before')).toBeNull();g.mutationCommitted('after');return g
}
describe('Declared claim dimensions and creative freedom',()=>{
  it('visual evidence alone cannot verify speech, and speech cannot verify visual',()=>{
    for(const [claim,irrelevant] of [['speech','visual'],['visual','speech']] as const){const g=selected([claim]);g.recordEvidence('synthetic','timeline',[0,60000000],'after',[irrelevant]);expect(g.status.verification_pending).toBe(true);expect(()=>g.finishIssue('resolved')).toThrow('reinspection')}
  })
  it('requires all multimodal dimensions then leaves satisfaction to Hermes',()=>{
    const g=selected(['audio','visual']);g.recordEvidence('render','timeline',[0,60000000],'after',['visual']);expect(g.status.verification_pending).toBe(true)
    g.recordEvidence('audio','timeline',[0,60000000],'after',['audio']);expect(g.status.verification_pending).toBe(false)
    // Receiving observations does not resolve the issue automatically.
    expect(g.status.outcomes).toEqual({});g.finishIssue('unresolved');expect(g.status.outcomes['issue-1']).toBe('unresolved')
  })
  it('blocks stale/source-only/nonoverlapping verification but accepts fresh relevant evidence',()=>{
    const g=selected(['speech']);g.recordEvidence('speech','timeline',[0,60000000],'before',['speech']);g.recordEvidence('speech','source',[0,60000000],'after',['speech']);g.recordEvidence('speech','timeline',[70000000,80000000],'after',['speech']);expect(g.status.verification_pending).toBe(true)
    g.recordEvidence('speech','timeline',[0,60000000],'after',['speech']);expect(g.status.verification_pending).toBe(false);expect(()=>g.finishIssue('resolved','externally-changed')).toThrow('STALE_VERIFICATION');g.finishIssue('resolved','after');expect(g.status.outcomes['issue-1']).toBe('resolved')
  })
  it('requires receipts to support declared dimensions without interpreting the issue text',()=>{
    const g=new RevisionLoopGuard(true),r=g.recordEvidence('timeline','timeline',[0,60000000],'state',['timeline'])
    expect(()=>g.recordIssue({description:'A visual thought chosen by Hermes',severity:'minor',repairable:true,evidence_dimensions:['visual'],evidence_receipt_ids:[r.id],layer_ids:['layer']},'state',60000000,bounds)).toThrow('UNSUPPORTED_EVIDENCE_DIMENSION')
  })
  it('accepts different issues and repairs under identical observations, generates neither',()=>{
    for(const description of ['Hermes chooses continuity investigation','Hermes chooses a separate composition concern']) {
      const g=selected(['timeline']);expect(g.status.issues).toHaveLength(1);expect(JSON.stringify(g.status)).not.toContain('repair_values')
      // Alternative technically valid Hermes actions are accepted without a prescribed creative parameter.
      g.recordEvidence('state','timeline',[0,60000000],'after',['timeline']);g.finishIssue('resolved');expect(g.complete().workflow_stage).toBe('COMPLETE')
      const other=new RevisionLoopGuard(true),r=other.recordEvidence('state','timeline',[0,60000000],'state',['timeline'])
      expect(other.recordIssue({description,severity:'minor',repairable:false,evidence_dimensions:['timeline'],evidence_receipt_ids:[r.id],layer_ids:['layer']},'state',60000000,bounds).issue.description).toBe(description)
      expect(other.concludeNoRepair('Hermes judges no justified repair',r.id,'state').workflow_stage).toBe('COMPLETE')
    }
  })
  it('fresh speech verification may still find unchanged audio: infrastructure does not pretend improvement',()=>{
    const g=selected(['speech']);const r=g.recordEvidence('get_editorial_evidence_packet','timeline',[0,60000000],'after',['speech','timeline']);expect(r.modalities).toContain('speech');expect(g.status.verification_pending).toBe(false);expect(g.status.outcomes).toEqual({})
  })
})

import {evidenceCoverage} from './evidenceModalities'
it('does not verify a claim with unsampled instants or omitted Audio transcript ranges',()=>{
 const g=selected(['visual']);const coverage=evidenceCoverage('inspect_timeline_range_visuals',{representative_samples:[{timeline_t_us:70000000}]},[0,80000000]);g.recordEvidence('inspect_timeline_range_visuals','timeline',[0,80000000],'after',['visual'],undefined,coverage);expect(g.status.verification_pending).toBe(true)
 const speech=selected(['speech']),index=evidenceCoverage('get_editorial_evidence_packet',{speech:[{kind:'VideoClip',word_timing_available:true,selected_timeline_range_us:[0,60000000]},{kind:'Audio',word_timing_available:true,selected_timeline_range_us:[70000000,80000000]}]},[0,80000000]);speech.recordEvidence('get_editorial_evidence_packet','timeline',[0,80000000],'after',['speech'],undefined,index);expect(speech.status.verification_pending).toBe(true)
})
