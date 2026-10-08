export const CREATOR_STYLE_TOOL = {
  name: 'creator_style_memory',
  description: 'Local creator-scoped style evidence, not an editing rule engine. context returns fresh relevant preferences and attributed correction/reference facts. YOU interpret evidence and choose hypothesis text, dimension and scope; supply actual evidence_ids for hypothesis or counterexample. Inferred hypotheses remain tentative until creator approval in Settings. Current request overrides memory. One undo, saving/exporting or your own edits do not prove taste. No timeline edits, creative values, automatic A/V sync or new model calls. Creator binding/explicit instruction/approval/reset are user controls. References are user-supplied imported finished videos, own work or inspiration, and persist only with user-selected intent.',
  inputSchema: { type: 'object', properties: {
    action: { type: 'string', enum: ['context', 'evidence', 'hypothesis', 'counterexample'] },
    id: { type: 'string' }, hypothesis: { type: 'string', maxLength: 1000 }, dimension: { type: 'string', maxLength: 80 },
    request: { type: 'string', maxLength: 1000, description: 'Optional current editing objective for local lexical memory relevance. Does not select clips or creative values.' },
    scope: { type: 'object', properties: { kind: { type: 'string', enum: ['creator', 'series', 'project'] } }, required: ['kind'], additionalProperties: false },
    evidence_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12 },
  }, required: ['action'], additionalProperties: false },
} as const
