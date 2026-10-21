import { describe, expect, it } from 'vitest'
import { RevisionLoopGuard } from './revisionLoopGuard.js'

describe('Phase 2E session guard', () => {
  function closedVisualRepair() {
    const guard = new RevisionLoopGuard(true)
    const seen = guard.recordEvidence('vision_inspect','timeline',[0,1000],'before',['visual'])
    guard.recordEvidence('inspect_rendered_audio','timeline',[0,1000],'before',['audio','speech'])
    const { issue } = guard.recordIssue({description:'Synthetic visual concern',severity:'moderate',repairable:true,evidence_receipt_ids:[seen.id],evidence_dimensions:['visual'],affected_range_us:[0,1000]},'before',1000,new Map())
    guard.selectIssue(issue.id,'before');guard.checkpointCreated();guard.mutationCommitted('after')
    guard.recordEvidence('vision_inspect','timeline',[0,1000],'after',['visual'])
    guard.finishIssue('resolved','after')
    return guard
  }
  it('reacquires missing audio/speech after closing a visual repair without inventing another issue', () => {
    const guard = closedVisualRepair(), completion = {state:'after',required:['visual','audio','speech'] as const}
    expect(guard.hasCurrentRenderedEvidence('after',[...completion.required])).toBe(false)
    expect(guard.guidance('after',[...completion.required]).legal_next_actions).toEqual(['current_rendered_inspection'])
    expect(guard.beforeMutation('after')).not.toBeNull()
    expect(guard.beforeInspection('get_media_context',{start_us:0},{...completion,required:[...completion.required]})).not.toBeNull()
    expect(guard.beforeInspection('vision_inspect',{media_id:'source',source_t_us:0},{...completion,required:[...completion.required]})).not.toBeNull()
    expect(guard.beforeInspection('inspect_rendered_audio',{start_us:0,end_us:1000},{...completion,required:[...completion.required]})).toBeNull()
    guard.recordEvidence('inspect_rendered_audio','timeline',[0,1000],'after',['audio','speech'])
    expect(guard.hasCurrentRenderedEvidence('after',[...completion.required])).toBe(true)
    expect(guard.guidance('after',[...completion.required]).legal_next_actions).toContain('revision_control:complete')
    expect(guard.beforeInspection('inspect_rendered_audio',{start_us:0,end_us:1000},{...completion,required:[...completion.required]})).not.toBeNull()
    expect(guard.complete().phase).toBe('done')
  })
  it('bounds failed final acquisitions and refuses changed state or metadata as final evidence', () => {
    const guard = closedVisualRepair(), required = ['visual','audio','speech'] as const
    expect(guard.beforeInspection('inspect_rendered_audio',{start_us:0,end_us:1000},{state:'external-change',required:[...required]})).not.toBeNull()
    for(let i=0;i<4;i++)expect(guard.beforeInspection('inspect_rendered_audio',{start_us:0,end_us:1000},{state:'after',required:[...required]})).toBeNull()
    expect(guard.beforeInspection('inspect_rendered_audio',{start_us:0,end_us:1000},{state:'after',required:[...required]})).not.toBeNull()
    expect(guard.hasCurrentRenderedEvidence('after',[...required])).toBe(false)
    expect(guard.guidance('after',[...required]).tool_call_examples).toMatchObject([{name:'mcp__weftcut__end_agent_session',arguments:{review_unavailable_reason:expect.any(String)}}])
  })
  it('rejects repairs against a changed timeline and preserves a three-cycle limit', () => {
    const guard = new RevisionLoopGuard(true)
    guard.reviewValidated(['first'], {}, 'state-a')
    guard.checkpointCreated()
    expect(() => guard.selectIssue('first', 'state-b')).toThrow('changed since review')
    guard.selectIssue('first', 'state-a')
    expect(guard.beforeMutation('state-b')).toContain('changed outside')
    guard.finishIssue('unresolved')
    for (const id of ['second', 'third']) {
      guard.reviewValidated([id], {}, 'state-a')
      guard.selectIssue(id, 'state-a')
      guard.mutationCommitted('state-b')
      guard.inspectionCompleted('get_timeline_context', {})
      guard.finishIssue('resolved')
    }
    guard.reviewValidated(['fourth'], {}, 'state-b')
    expect(() => guard.selectIssue('fourth', 'state-b')).toThrow('Three repair cycles')
  })
  it('requires new diagnosis after a concurrent edit, then accepts a grounded repair', () => {
    const guard = new RevisionLoopGuard(true)
    guard.reviewValidated(['old'], {}, 'before')
    guard.checkpointCreated()
    expect(() => guard.selectIssue('old', 'changed')).toThrow('changed since review')
    guard.inspectionCompleted('get_timeline_context', {})
    // An inspection alone cannot bless the stale diagnosis.
    expect(() => guard.selectIssue('old', 'changed')).toThrow('changed since review')
    guard.reviewValidated(['current'], {}, 'changed')
    guard.selectIssue('current', 'changed')
    expect(guard.beforeMutation('changed')).toBeNull()
    guard.mutationCommitted('repaired')
    expect(guard.beforeMutation('repaired')).toContain('Reinspect')
    guard.inspectionCompleted('get_timeline_context', {})
    guard.finishIssue('resolved')
    expect(guard.status.outcomes.current).toBe('resolved')
  })

  it('reserves action and verification after a grounded diagnosis', () => {
    const guard = new RevisionLoopGuard(true)
    expect(guard.beforeMutation()).toContain('initial review')
    for (let i = 0; i < 4; i++) guard.beforeInspection()
    guard.reviewValidated(['context'], { context: [0, 5_000_000] })
    expect(guard.beforeInspection()).toContain('Diagnosis is complete')
    guard.checkpointCreated()
    guard.selectIssue('context')
    expect(guard.beforeMutation()).toBeNull()
    guard.mutationCommitted()
    expect(guard.beforeMutation()).toContain('Reinspect')
    expect(() => guard.finishIssue('resolved')).toThrow('reinspection')
    expect(guard.beforeInspection('get_media_context', {})).toContain('Verification requires')
    expect(guard.beforeInspection('vision_inspect', { t_us: 30_000_000 })).toContain('Verification requires')
    guard.inspectionCompleted('get_media_context', { start_us: 0, end_us: 5_000_000 })
    guard.inspectionCompleted('vision_inspect', { t_us: 30_000_000 })
    expect(guard.status.verification_pending).toBe(true)
    guard.inspectionCompleted('get_timeline_context', { start_us: 0, end_us: 5_000_000 })
    guard.finishIssue('resolved')
    expect(guard.status.outcomes.context).toBe('resolved')
  })
  it('bounds initial inspection and permits only one reasoned extension', () => {
    const guard = new RevisionLoopGuard(true)
    for (let i = 0; i < 4; i++) expect(guard.beforeInspection()).toBeNull()
    expect(guard.beforeInspection()).toContain('budget reached')
    expect(() => guard.extendInspection('')).toThrow('reason')
    guard.extendInspection('One ambiguous boundary needs source context')
    for (let i = 0; i < 2; i++) expect(guard.beforeInspection()).toBeNull()
    expect(guard.beforeInspection()).toContain('budget reached')
    expect(() => guard.extendInspection('again')).toThrow('already been used')
  })

  it('does not reset attempts after rollback or reselecting the same issue', () => {
    const guard = new RevisionLoopGuard(true)
    guard.reviewValidated(['issue-1'])
    expect(() => guard.selectIssue('issue-1')).toThrow('checkpoint')
    guard.checkpointCreated()
    expect(() => guard.selectIssue('invented')).toThrow('not identified')
    guard.selectIssue('issue-1')
    for (let i = 0; i < 3; i++) {
      expect(guard.beforeMutation()).toBeNull()
      guard.mutationCommitted()
      guard.inspectionCompleted('get_timeline_context', {})
    }
    expect(guard.beforeMutation()).toContain('limit reached')
    expect(() => guard.begin()).toThrow('cannot reset attempt counts')
    guard.selectIssue('issue-1')
    expect(guard.status.attempts['issue-1']).toBe(3)
    guard.finishIssue('unresolved')
    guard.finalize()
    expect(guard.beforeMutation()).toContain('no further timeline mutations')
    guard.reviewValidated([])
    expect(guard.status.phase).toBe('done')
    expect(guard.status.outcomes['issue-1']).toBe('unresolved')
    expect(() => guard.begin()).toThrow('cannot reset attempt counts')
  })

  it('leaves clean review unedited and allows direct edits outside a revision session', () => {
    const direct = new RevisionLoopGuard()
    expect(direct.beforeMutation()).toBeNull()
    const clean = new RevisionLoopGuard(true)
    clean.reviewValidated()
    clean.finalize()
    expect(clean.beforeMutation()).toContain('no further timeline mutations')
    clean.reviewValidated()
    expect(clean.status.attempts).toEqual({})
  })

  it('keeps the initial deadline but allows slow repairs until three committed attempts', () => {
    let now = 1
    const guard = new RevisionLoopGuard(true, () => now)
    now += 300_000
    expect(guard.beforeInspection()).toBeNull()
    now += 300_000
    expect(guard.beforeInspection()).toContain('time budget reached')
    guard.reviewValidated(['issue-1'])
    guard.checkpointCreated()
    guard.selectIssue('issue-1')
    now += 480_000
    expect(guard.status.phase_budget_ms).toBeNull()
    for (let i = 0; i < 3; i++) {
      now += 480_000
      expect(guard.beforeMutation()).toBeNull()
      guard.mutationCommitted()
      guard.inspectionCompleted('get_timeline_context', {})
    }
    expect(guard.beforeMutation()).toContain('Revision attempt limit reached')
    expect(guard.status.attempts).toEqual({ 'issue-1': 3 })
    guard.finishIssue('unresolved')
    guard.finalize()
    guard.reviewValidated()
    expect(guard.status.phase).toBe('done')
  })
})

it('completion cannot certify an unavailable or geometry-only rendered observation',()=>{
 const g=new RevisionLoopGuard(true)
 g.recordEvidence('get_timeline_critique','timeline',[0,1000],'state',['timeline'])
 g.recordEvidence('inspect_timeline_range_visuals','timeline',[0,1000],'state',['visual','geometry'],undefined,{visual:[],geometry:[[0,0]]})
 expect(g.hasCurrentRenderedEvidence('state')).toBe(false)
 g.recordEvidence('inspect_rendered_audio','timeline',[0,1000],'state',[])
 expect(g.hasCurrentRenderedEvidence('state')).toBe(false)
 g.recordEvidence('vision_inspect','timeline',[500,500],'state',['visual'])
 expect(g.hasCurrentRenderedEvidence('state')).toBe(true)
 expect(g.hasCurrentRenderedEvidence('changed')).toBe(false)
})

it('technical acquisition failures permit only three recovery attempts, without unlimited rescans',()=>{
 const guard=new RevisionLoopGuard(true)
 for(let i=0;i<7;i++){expect(guard.beforeInspection('inspect_timeline_frame')).toBeNull();guard.inspectionFailed('CURRENT_FRAME_UNAVAILABLE: decoder timeout')}
 expect(guard.beforeInspection('inspect_timeline_frame')).toContain('budget reached')
})
