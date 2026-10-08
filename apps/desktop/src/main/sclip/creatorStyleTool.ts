export const CREATOR_STYLE_TOOL = {
  name: 'creator_style_memory',
  description: 'Local creator-scoped style evidence, not an editing rule engine. context returns current revision, creator binding, preference versions and attributed facts. YOU interpret evidence and choose hypothesis text, dimension and scope. For writes supply creator_id and expected_revision from fresh context, actual evidence_ids, and expected_version when updating an existing id. Disabled/forgotten preferences can only be restored by the creator. A revised meaning starts a new evidence version. Inferred claims stay tentative; factual counts are not editorial certainty. Current request overrides memory. One undo, saving/exporting or your own edits do not prove taste. No timeline edits, creative values, automatic A/V sync or new model calls. Do not mirror style into generic USER.md/MEMORY.md. Creator approval and bindings are user controls.',
  inputSchema: { type: 'object', properties: {
    action: { type: 'string', enum: ['context', 'evidence', 'hypothesis', 'counterexample'] },
    id: { type: 'string' }, hypothesis: { type: 'string', maxLength: 1000 }, dimension: { type: 'string', maxLength: 80 },
    creator_id: { type: 'string', description: 'Exact current creator identity from context; required for writes.' },
    expected_revision: { type: 'integer', minimum: 0, description: 'Fresh memory revision from context; required for writes.' },
    expected_version: { type: 'integer', minimum: 1, description: 'Current version of an existing preference being updated.' },
    request: { type: 'string', maxLength: 1000, description: 'Optional current editing objective for local lexical memory relevance. Does not select clips or creative values.' },
    scope: { type: 'object', properties: { kind: { type: 'string', enum: ['creator', 'series', 'project'] } }, required: ['kind'], additionalProperties: false },
    evidence_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12 },
  }, required: ['action'], additionalProperties: false },
} as const
