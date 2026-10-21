/** Contract feedback only: IDs/versions are factual bindings, never a chosen preference. */
export function creatorMemoryGuidance(value: unknown, failure?: string) {
 const packet=value as {binding?:{creatorId?:string};revision?:number;learning_enabled?:boolean;preferences?:Array<{id:string;version:number}>;evidence?:Array<{id:string}>;pending_evidence?:Array<{id:string}>;learning_status?:unknown}
 if(!packet?.binding?.creatorId||!Number.isSafeInteger(packet.revision))return {availability:'unavailable',reason:'Current canonical memory bindings are unavailable'}
 const enabled=packet.learning_enabled!==false,preferences=packet.preferences??[],evidence=packet.evidence??[]
 return {tool:'mcp__weftcut__creator_style_memory',learning_enabled:enabled,
  id_distinction:'Correction/manual/reference IDs are evidence IDs: read them with action=evidence and id. action=preference needs an existing preference ID. expected_revision is the memory revision; expected_version is a specific preference version, never the memory revision.',
  existing_preferences:preferences.map(p=>({id:p.id,expected_version:p.version})),available_evidence_ids:evidence.map(e=>e.id),
  no_existing_preferences:preferences.length===0,
  pending_evidence_ids:enabled?(packet.pending_evidence??[]).map(e=>e.id):[],learning_status:packet.learning_status,
  tool_call_examples:[{name:'mcp__weftcut__creator_style_memory',arguments:{action:'context'}},
   ...(enabled?evidence.slice(0,2).map(e=>({name:'mcp__weftcut__creator_style_memory',arguments:{action:'evidence',id:e.id}})):[]),
   ...(enabled?preferences.slice(0,2).map(p=>({name:'mcp__weftcut__creator_style_memory',arguments:{action:'preference',id:p.id}})):[]),
   ...(enabled?[{name:'mcp__weftcut__creator_style_memory',arguments:{action:'observations',filter:'all'}}]:[])],
  ...(enabled?{write_bindings:{creator_id:packet.binding.creatorId,expected_revision:packet.revision},
   write_contract:{new_hypothesis_requires:['action=hypothesis','hypothesis (YOUR meaning)','dimension (YOUR category)','evidence_ids (actual relevant IDs)','creator_id','expected_revision'],existing_target_also_requires:['id (preference ID)','expected_version (its version)'],new_hypothesis_omits:'id and expected_version; it is not an existing-preference lookup',field_limits:{hypothesis:360,applicability:400,rationale:600,reason:600},revise_same_candidate:'Use hypothesis with id and expected_version to update its meaning. consolidate/supersede combine DISTINCT source candidates; source_preferences cannot contain the target ID.',pagination:'First observations page establishes fresh bindings; pass its creator/revision only with a returned cursor. Every successful write returns new revision/version bindings. Reuse those; do not reread unchanged context.'}}:{}),
  ...(failure?{previous_failure:failure.slice(0,400)}:{}),
  workflow:'Inspect related prompts/reactions, authored changes and corrections across retained projects, including reviewed observations. Synthesize a conditional pattern or mistake-prevention principle, not a per-action dump. Persist supported hypotheses before action=review outcome=learned with actual preference_ids; otherwise review with insufficient/project_specific/technical_repair/not_style and YOUR reason. No new belief is required; no failed write is success.',
  ownership:'Hermes decides whether evidence supports a tentative interpretation, its meaning/scope/applicability, or no learning. These examples only retrieve facts. No host-authored preference, confidence promotion or editing decision is supplied.'}
}
