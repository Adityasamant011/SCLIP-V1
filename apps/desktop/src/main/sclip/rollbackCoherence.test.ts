import { describe, expect, it } from 'vitest'
import { RevisionLoopGuard } from './revisionLoopGuard'
import type { EvidenceDimension } from './evidenceModalities'

function selected(dimension: EvidenceDimension, start: number, end: number, layer: string) {
  const g = new RevisionLoopGuard(true)
  const receipt = g.recordEvidence('synthetic', 'timeline', [start, end], 'A', [dimension])
  const issue = g.recordIssue({ description: `Hermes observes ${dimension} uncertainty`, severity: 'moderate', repairable: true,
    evidence_dimensions: [dimension], evidence_receipt_ids: [receipt.id], layer_ids: [layer] }, 'A', end, new Map([[layer, [start, end]]]))
  g.selectIssue(issue.issue.id, 'A'); g.checkpointCreated(); g.mutationCommitted('B')
  const abandoned = g.recordEvidence('synthetic', 'timeline', [start, end], 'B', [dimension])
  return { g, issue: issue.issue.id, original: receipt.id, abandoned: abandoned.id }
}

describe('Checkpoint restoration is bookkeeping, not an editorial outcome', () => {
  for (const [dimension, start, end, layer] of [
    ['visual', 123_000, 9_870_000, 'visual-layer'], ['speech', 2_900_000, 37_100_000, 'dialogue-layer'],
    ['text', 0, 440_000, 'title-layer'], ['timeline', 70_000_000, 120_000_000, 'sequence-layer'],
  ] as const) {
    it(`keeps ${dimension} issue and permits alternative decisions after restore`, () => {
      const { g, issue, original, abandoned } = selected(dimension, start, end, layer)
      g.checkpointRestored('synthetic-checkpoint', 'B', 'A')
      expect(g.status.active_issue).toBe(issue); expect(g.status.issues).toHaveLength(1)
      expect(g.status.outcomes).toEqual({}); expect(g.status.verification_pending).toBe(false)
      expect(g.status.attempts[issue]).toBe(1)
      expect(g.status.evidence_ids).toEqual([])
      expect(g.status.last_rollback?.invalidated_evidence_ids).toEqual([original, abandoned])
      expect(() => g.finishIssue('resolved', 'A')).toThrow('committed mutation')
      for (const receipt of [original, abandoned]) expect(() => g.withdrawIssue({issue_id: issue, reason: 'Hermes reconsiders', evidence_receipt_ids: [receipt]}, 'A')).toThrow('STALE_OR_UNKNOWN_EVIDENCE')
      g.checkpointCreated(); expect(g.beforeMutation('A')).toContain('fresh relevant evidence')
      expect(g.beforeInspection('get_timeline_context')).toBeNull()
      g.recordEvidence('synthetic', 'timeline', [start, end], 'A', [dimension])
      expect(g.beforeMutation('A')).toBeNull()
      // Neither operation nor any creative parameter is supplied by lifecycle infrastructure.
      expect(g.status).not.toHaveProperty('operations'); expect(g.status).not.toHaveProperty('repair_values')
      g.mutationCommitted('C'); expect(g.status.verification_pending).toBe(true)
      g.recordEvidence('synthetic', 'timeline', [start, end], 'C', [dimension])
      g.finishIssue('resolved', 'C'); expect(g.complete().workflow_stage).toBe('COMPLETE')
    })
  }
  it('allows honest unresolved closure without verifying the abandoned state', () => {
    const { g } = selected('audio', 550_000, 7_300_000, 'ambient-layer')
    g.checkpointRestored('checkpoint', 'B', 'A')
    expect(g.finishIssue('unresolved', 'A').outcomes).toEqual({'issue-1': 'unresolved'})
    expect(g.complete().workflow_stage).toBe('COMPLETE')
  })
  it('allows grounded withdrawal and no repair without automatically choosing either', () => {
    const { g, issue } = selected('text', 10, 900, 'overlay')
    g.checkpointRestored('checkpoint', 'B', 'A')
    const r = g.recordEvidence('synthetic', 'timeline', [10,900], 'A', ['text'])
    expect(g.status.outcomes).toEqual({})
    g.withdrawIssue({issue_id: issue, reason: 'Hermes reclassifies after observation', evidence_receipt_ids:[r.id]}, 'A')
    expect(g.concludeNoRepair('Hermes judges no justified repair', r.id, 'A').workflow_stage).toBe('COMPLETE')
  })
  it('clears pending abandoned verification even before any B inspection', () => {
    const {g} = selected('speech', 0, 800, 'voice')
    g.checkpointCreated(); g.mutationCommitted('C')
    expect(g.status.verification_pending).toBe(true)
    g.checkpointRestored('checkpoint', 'C', 'A')
    expect(g.status.verification_pending).toBe(false)
    expect(() => g.finishIssue('unresolved', 'A')).not.toThrow()
  })
  it('does not reset the bounded mutation attempt count on repeated rollbacks', () => {
    const {g} = selected('timeline', 0, 100, 'layer')
    for (const next of ['C','D']) {
      g.checkpointRestored('checkpoint','B','A'); g.recordEvidence('synthetic','timeline',[0,100],'A',['timeline'])
      g.checkpointCreated(); expect(g.beforeMutation('A')).toBeNull(); g.mutationCommitted(next)
    }
    g.checkpointRestored('checkpoint','D','A'); g.recordEvidence('synthetic','timeline',[0,100],'A',['timeline']);g.checkpointCreated()
    expect(g.beforeMutation('A')).toContain('attempt limit')
  })
})
