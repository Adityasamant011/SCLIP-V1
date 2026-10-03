import { describe, expect, it } from 'vitest'
import { RevisionLoopGuard } from './revisionLoopGuard.js'

describe('Phase 2E session guard', () => {
  it('bounds initial inspection and permits only one reasoned extension', () => {
    const guard = new RevisionLoopGuard(true)
    for (let i = 0; i < 8; i++) expect(guard.beforeInspection()).toBeNull()
    expect(guard.beforeInspection()).toContain('budget reached')
    expect(() => guard.extendInspection('')).toThrow('reason')
    guard.extendInspection('One ambiguous boundary needs source context')
    for (let i = 0; i < 4; i++) expect(guard.beforeInspection()).toBeNull()
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
    }
    expect(guard.beforeMutation()).toContain('Revision attempt limit reached')
    expect(guard.status.attempts).toEqual({ 'issue-1': 3 })
    guard.finishIssue('unresolved')
    guard.finalize()
    guard.reviewValidated()
    expect(guard.status.phase).toBe('done')
  })
})
