import type { CreatorEvidence } from '../../shared/creator-style'

/** Observable property differences only. No preference interpretation or edit values generated. */
export function changedProperties(before: unknown, after: unknown, prefix = ''): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return []
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => changedProperties(a[k], b[k], prefix ? `${prefix}.${k}` : k))
  }
  return [prefix || 'layer']
}
export function summarizeCreatorEvidence(e: CreatorEvidence) {
  const deltas = (e.data.deltas ?? []) as Array<Record<string, unknown>>
  const valueAt = (bytes: unknown, property: string) => {
    try {
      const value = property.split('.').reduce((v, key) => v?.[key], JSON.parse(String(bytes)))
      return value === undefined ? 'unknown' : JSON.stringify(value).slice(0, 96)
    } catch { return 'unavailable in truncated record' }
  }
  return { id: e.id, kind: e.kind, authority: e.authority, projectId: e.projectId, scope: e.scope,
    relationship: e.data.relationship, operationCount: e.data.operationCount, summary: e.data.summary,
    changes: deltas.slice(0, 3).map(d => ({ layerId: d.layerId, proposalOpId: d.proposalOpId, properties: d.properties,
      values: ((d.properties ?? []) as string[]).slice(0, 6).map(property => ({ property, before:valueAt(d.before,property), after:valueAt(d.after,property) })) })),
    ...(e.kind === 'explicit_instruction' ? { quote: e.data.quote } : {}),
    ...(e.kind === 'reference' ? { reference: JSON.stringify(e.data).slice(0, 450) } : {}),
    uncertainty: e.data.intention, details: 'Use action=evidence with this id for retained before/after facts; summary is bounded.' }
}

/** Adjacent same-property committed adjustments are one observation sequence,
 * not proof of one gesture/intent. Never rewrite evidence already used by a hypothesis. */
export function canGroupAdjustments(previous: CreatorEvidence | undefined, next: CreatorEvidence, used: boolean): boolean {
  if (!previous || used || previous.suppressed || previous.kind === 'undo' || next.kind === 'undo' || previous.kind === 'reference' || previous.kind === 'explicit_instruction') return false
  const signature = (e: CreatorEvidence) => JSON.stringify((e.data.deltas as any[]).map(d => ({ layerId: d.layerId, properties: d.properties })).sort((a, b) => a.layerId.localeCompare(b.layerId)))
  return previous.creatorId === next.creatorId && previous.projectId === next.projectId && previous.seriesId === next.seriesId && previous.data.summary === next.data.summary && previous.data.afterState === next.data.beforeState && signature(previous) === signature(next) && !next.data.structureBefore
}
