import {describe,it,expect,vi} from 'vitest'
import {RevisionLoopGuard} from './revisionLoopGuard'
import {reviewProgress} from './reviewProgress'
import {reviewState} from './evidenceCoordinates'
import {freshActor} from '../state/__tests__/pbt/harness'
vi.mock('electron',()=>({app:{isPackaged:true}}))
function fixture(){const actor=freshActor(),p=actor.snapshot();actor.dispatch('add_layer',{track:p.compositions[p.root_id].tracks[0].id,kind:'color',color:{r:10,g:20,b:30,a:255},t_start_us:0,t_end_us:3e6});return {p:actor.snapshot(),guard:new RevisionLoopGuard(true)}}
describe('Grounded review progression',()=>{
 it('keeps required post-mutation visual verification reachable after metadata consumes the focused budget, without unlimited retries',()=>{
  const {p,guard}=fixture(),state=reviewState(p),r=guard.recordEvidence('vision_inspect','timeline',[0,3e6],state,['visual','geometry'])
  const issue=guard.recordIssue({description:'Synthetic visual concern',severity:'moderate',repairable:true,evidence_receipt_ids:[r.id],evidence_dimensions:['visual','geometry'],affected_range_us:[0,3e6]},state,3e6,new Map())
  guard.selectIssue(issue.issue.id,state);guard.checkpointCreated();guard.mutationCommitted('changed')
  expect(guard.beforeInspection('get_timeline_context',{})).toBeNull()
  guard.recordEvidence('get_timeline_context','timeline',[0,3e6],'changed',['timeline','text'])
  expect(guard.beforeInspection('get_editorial_evidence_packet',{})).toBeNull()
  expect(guard.beforeInspection('vision_inspect',{timeline_t_us:4e6})).toContain('overlapping')
  expect(guard.beforeInspection('vision_inspect',{timeline_t_us:1e6})).toBeNull()
  expect(guard.status.verification_pending).toBe(true)
  expect(()=>guard.finishIssue('resolved','changed')).toThrow()
  expect(guard.beforeInspection('vision_inspect',{timeline_t_us:1e6})).toContain('budget')
  guard.recordEvidence('vision_inspect','timeline',[1e6,1e6],'changed',['visual','geometry'])
  expect(guard.status.verification_pending).toBe(false)
  guard.finishIssue('resolved','changed')
 })
 it('offers an evidence-bound withdrawal without selecting it, and never offers it while repair verification is pending',()=>{
  const {p,guard}=fixture(),state=reviewState(p),r=guard.recordEvidence('vision_inspect','timeline',[0,3e6],state,['visual'])
  const issue=guard.recordIssue({description:'Tentative synthetic concern',severity:'moderate',repairable:true,evidence_receipt_ids:[r.id],evidence_dimensions:['visual'],affected_range_us:[0,3e6]},state,3e6,new Map())
  const before=guard.status,choice=guard.guidance(state).tool_call_examples.find(e=>e.name==='mcp__weftcut__withdraw_issue')
  expect(choice).toMatchObject({arguments:{issue_id:issue.issue.id,evidence_receipt_ids:[r.id]}})
  expect(guard.status).toEqual(before)
  guard.selectIssue(issue.issue.id,state);guard.checkpointCreated();guard.mutationCommitted('changed')
  expect(guard.guidance('changed').legal_next_actions).not.toContain('withdraw_issue')
  guard.recordEvidence('vision_inspect','timeline',[0,3e6],'changed',['visual'])
  const verifiedChoice=guard.guidance('changed').tool_call_examples.find(e=>e.name==='mcp__weftcut__withdraw_issue')!
  expect(verifiedChoice).toBeTruthy();guard.withdrawIssue({...verifiedChoice.arguments,reason:'My current observation does not support this concern'},'changed')
  expect(guard.status.issues[0].repairable).toBe(false)
 })
 it('offers only actual rendered evidence entry points before a receipt, no invented no-repair decision or unnecessary extension',()=>{
  const {p,guard}=fixture(),before=guard.status,g=reviewProgress(guard,p)
  expect(g.missing_rendered_modalities).toEqual(['visual'])
  expect(g.tool_call_examples.map(e=>e.name)).toEqual(['mcp__weftcut__vision_inspect','mcp__weftcut__render_timeline_range'])
  expect(g.inspection_tool_options?.map(e=>e.name)).toEqual(['mcp__weftcut__vision_inspect','mcp__weftcut__render_timeline_range'])
  expect(g.legal_next_actions).not.toContain('revision_control:extend_inspection');expect(guard.status).toEqual(before)
 })
 it('supplies actual no-repair receipt and valid end call shape without finalizing on behalf of Hermes',()=>{
  const {p,guard}=fixture(),state=reviewState(p),r=guard.recordEvidence('vision_inspect','timeline',[0,3e6],state,['visual'])
  const g=reviewProgress(guard,p),choice=g.tool_call_examples.find(e=>e.arguments.action==='conclude_no_repair')!
  expect(choice.arguments.evidence_id).toBe(r.id);expect(guard.status.phase).toBe('initial')
  guard.concludeNoRepair('Synthetic fixture intentionally keeps its current card',r.id,state)
  expect(reviewProgress(guard,p).tool_call_examples).toEqual([{name:'mcp__weftcut__end_agent_session',arguments:{}}])
 })
 it('provides correct flat repair progression and keeps stale/absent verification from resolving a claim',()=>{
  const {p,guard}=fixture(),state=reviewState(p),r=guard.recordEvidence('vision_inspect','timeline',[0,3e6],state,['visual'])
  const issue=guard.recordIssue({description:'Synthetic observed issue',severity:'moderate',repairable:true,evidence_receipt_ids:[r.id],evidence_dimensions:['visual'],affected_range_us:[0,3e6]},state,3e6,new Map())
  expect(guard.guidance(state).tool_call_examples[0].arguments).toEqual({action:'select_issue',issue_id:issue.issue.id})
  guard.selectIssue(issue.issue.id,state);expect(guard.guidance(state).legal_next_actions).toContain('checkpoint')
  guard.checkpointCreated();guard.mutationCommitted('new-state')
  const pending=guard.guidance('new-state',['visual']);expect(pending.current_timeline_receipts).toEqual([]);expect(pending.legal_next_actions).toEqual(['current_rendered_inspection'])
  expect(()=>guard.finishIssue('resolved','new-state')).toThrow()
  guard.recordEvidence('vision_inspect','timeline',[0,3e6],'new-state',['visual'])
  expect(guard.guidance('new-state').tool_call_examples.some(e=>e.arguments.status==='resolved')).toBe(true)
  guard.finishIssue('resolved','new-state');expect(guard.guidance('new-state').legal_next_actions).toContain('revision_control:complete')
 })
})
