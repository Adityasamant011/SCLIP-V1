const operationProperties = {
  action:{type:'string',enum:['hypothesis','link','counterexample','exception','consolidate','supersede']},
  id:{type:'string'},expected_version:{type:'integer',minimum:1},
  hypothesis:{type:'string',maxLength:360,description:'One short sentence stating the desired editing behavior, preferably 10–25 words. No incident history or diagnosis of the assistant; those belong in rationale. One reusable principle grounded in creator intent. Keep sample pixel values, percentages, before/after examples and inferred ratios in evidence/rationale, not this statement. Never extrapolate a universal setting from corrected values. Do not include scope/rationale prose here or add untouched style dimensions.'},dimension:{type:'string',maxLength:80},
  scope:{type:'object',properties:{kind:{type:'string',enum:['creator','series','project']}},required:['kind'],additionalProperties:false},
  evidence_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:12},
  applicability:{type:'string',maxLength:400,description:'When this principle applies, exceptions and scope limits. Do not assume a project repair applies to every future video.'},exception_to:{type:'string'},exception_version:{type:'integer',minimum:1},reason:{type:'string',maxLength:600},
  lesson_kind:{type:'string',enum:['style_pattern','mistake_prevention']},rationale:{type:'string',maxLength:600,description:'Why the actual selected creator statements/corrections support this interpretation. Neutral questions, your own outputs and silence are not corroboration. Sample measurements belong here or in evidence, not in the hypothesis.'},
  source_preferences:{type:'array',items:{type:'object',properties:{id:{type:'string'},expected_version:{type:'integer',minimum:1}},required:['id','expected_version'],additionalProperties:false},minItems:1,maxItems:8},
  counterexample_ids:{type:'array',items:{type:'string'},maxItems:12},
} as const
const patternRequirements={if:{properties:{action:{enum:['hypothesis','exception','consolidate','supersede']}},required:['action','lesson_kind']},then:{required:['applicability','rationale']}} as const
export const CREATOR_STYLE_TOOL = {
 name:'creator_style_memory',
 description:'Canonical local creator memory; no timeline edits or background model calls. context returns fresh scoped preferences, pending evidence IDs, creator/revision, versions and evidence-loss disclosure. observations pages retained user prompts/reactions, manual edits, corrections and references across projects (the first page returns fresh creator/revision; later cursor pages require those exact bindings; optional request relevance and filter=all/pending/reviewed); reviewed facts remain available for later patterns. evidence retrieves exact facts, project measurements and available related AI proposal changes. preferences pages applicable knowledge; preference retrieves a meaning. YOU interpret facts: counts are not certainty. Synthesize a reusable principle with applicability/rationale, never one memory per operation or a universal numeric dump. Distinguish style_pattern from mistake_prevention using lesson_kind; a technical fix is not automatically taste. Writes require creator_id/expected_revision and actual evidence_ids; existing targets/source_preferences require expected_version. maintenance atomically applies 1–8 YOUR operations with request_id: hypothesis, link, counterexample, exception, consolidate or supersede candidates. Review considered evidence with action=review, evidence_ids, outcome and reason; outcome=learned also requires preference_ids with successful current evidence links. Other outcomes: insufficient/project_specific/not_style/technical_repair. Consolidation preserves selected counterexamples. Changed meanings start new evidence versions. Disabled/forgotten controls and creator-approved wording cannot be overridden. Exact duplicates reuse the current family. Current brief overrides memory. Do not mirror style into USER.md/MEMORY.md; generic memory remains for non-style facts. Creator approval/disable/forget are user controls.',
 inputSchema:{type:'object',properties:{
  ...operationProperties,
  action:{type:'string',enum:['context','preferences','preference','evidence','observations','review','hypothesis','counterexample','maintenance']},
  filter:{type:'string',enum:['all','pending','reviewed']},
  outcome:{type:'string',enum:['learned','insufficient','project_specific','not_style','technical_repair']},
  preference_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:12},
  creator_id:{type:'string',description:'Exact current creator identity; required for writes/pagination.'},
  expected_revision:{type:'integer',minimum:0,description:'Fresh memory revision; required for writes/pagination.'},
  request:{type:'string',maxLength:1000,description:'Current objective for local lexical relevance; never chooses edits.'},
  cursor:{type:'integer',minimum:0},request_id:{type:'string',maxLength:80},
  operations:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:operationProperties,required:['action','evidence_ids'],additionalProperties:false,allOf:[patternRequirements]}},
 },required:['action'],additionalProperties:false,
 allOf:[
  patternRequirements,
  {if:{properties:{action:{enum:['evidence','preference']}},required:['action']},then:{required:['id']}},
  {if:{properties:{action:{enum:['hypothesis','counterexample','maintenance','preferences','review']}},required:['action']},then:{required:['creator_id','expected_revision']}},
  {if:{properties:{action:{const:'observations'},cursor:{minimum:1}},required:['action','cursor']},then:{required:['creator_id','expected_revision']}},
  {if:{properties:{action:{const:'review'}},required:['action']},then:{required:['evidence_ids','outcome','reason']}},
  {if:{properties:{action:{const:'hypothesis'}},required:['action']},then:{required:['hypothesis','dimension','evidence_ids']}},
  {if:{properties:{action:{const:'hypothesis'},id:{type:'string'}},required:['action','id']},then:{required:['expected_version']}},
  {if:{properties:{action:{const:'counterexample'}},required:['action']},then:{required:['id','expected_version','evidence_ids']}},
  {if:{properties:{action:{const:'maintenance'}},required:['action']},then:{required:['request_id','operations']}},
 ]},
} as const
