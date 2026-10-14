const operationProperties = {
  action:{type:'string',enum:['hypothesis','link','counterexample','exception','consolidate','supersede']},
  id:{type:'string'},expected_version:{type:'integer',minimum:1},
  hypothesis:{type:'string',maxLength:1000},dimension:{type:'string',maxLength:80},
  scope:{type:'object',properties:{kind:{type:'string',enum:['creator','series','project']}},required:['kind'],additionalProperties:false},
  evidence_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:12},
  applicability:{type:'string',maxLength:400},exception_to:{type:'string'},exception_version:{type:'integer',minimum:1},reason:{type:'string',maxLength:600},
  source_preferences:{type:'array',items:{type:'object',properties:{id:{type:'string'},expected_version:{type:'integer',minimum:1}},required:['id','expected_version'],additionalProperties:false},minItems:1,maxItems:8},
  counterexample_ids:{type:'array',items:{type:'string'},maxItems:12},
} as const
export const CREATOR_STYLE_TOOL = {
 name:'creator_style_memory',
 description:'Canonical local creator memory; no timeline edits or background model calls. context returns the SAME compact packet selection and IDs used in your current context, fresh creator/revision, versions and evidence-loss disclosure. preference/evidence retrieve relevant details; preferences pages omitted applicable knowledge (requires creator_id/expected_revision). YOU interpret facts: counts are not certainty. Writes require creator_id/expected_revision and actual evidence_ids; existing targets/source_preferences require expected_version. maintenance atomically applies 1–8 YOUR operations with request_id (idempotency): hypothesis, link, counterexample, contextual exception, consolidate or supersede inferred candidates. You supply meanings, scopes, applicability, evidence and semantic reason. Consolidation sources must have the same scope; retain their selected counterexamples explicitly. Changed meanings start new evidence versions; old support is not inherited. Disabled/forgotten controls and creator-approved wording cannot be overridden. Exact duplicates reuse the current canonical family. Evidence can be insufficient: decline to learn. Current brief overrides memory. Do not mirror style into USER.md/MEMORY.md; generic memory remains for non-style facts. Creator approval/disable/forget are user controls.',
 inputSchema:{type:'object',properties:{
  ...operationProperties,
  action:{type:'string',enum:['context','preferences','preference','evidence','hypothesis','counterexample','maintenance']},
  creator_id:{type:'string',description:'Exact current creator identity; required for writes/pagination.'},
  expected_revision:{type:'integer',minimum:0,description:'Fresh memory revision; required for writes/pagination.'},
  request:{type:'string',maxLength:1000,description:'Current objective for local lexical relevance; never chooses edits.'},
  cursor:{type:'integer',minimum:0},request_id:{type:'string',maxLength:80},
  operations:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:operationProperties,required:['action','evidence_ids'],additionalProperties:false}},
 },required:['action'],additionalProperties:false,
 allOf:[
  {if:{properties:{action:{enum:['evidence','preference']}},required:['action']},then:{required:['id']}},
  {if:{properties:{action:{enum:['hypothesis','counterexample','maintenance','preferences']}},required:['action']},then:{required:['creator_id','expected_revision']}},
  {if:{properties:{action:{const:'hypothesis'}},required:['action']},then:{required:['hypothesis','dimension','evidence_ids']}},
  {if:{properties:{action:{const:'hypothesis'},id:{type:'string'}},required:['action','id']},then:{required:['expected_version']}},
  {if:{properties:{action:{const:'counterexample'}},required:['action']},then:{required:['id','expected_version','evidence_ids']}},
  {if:{properties:{action:{const:'maintenance'}},required:['action']},then:{required:['request_id','operations']}},
 ]},
} as const
