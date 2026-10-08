// Read-only architecture probe: existing production code, synthetic states,
// throwaway stores. No model clients, user profiles, app launch or migration.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';

const repo=process.cwd(), temp=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-memory-research-'));
let forbiddenRequests=0;
globalThis.fetch=async()=>{forbiddenRequests++;throw Error('Inference/network forbidden in probe')};
const results={source:'Existing production CreatorStyleStore and ProjectActor; no proposed implementation',model_calls:0,scenarios:{},contexts:{}};
const output=path.join(repo,'docs/phase4c/research/memory-probe-results.json');
const prior=process.env.REUSE_SCENARIO_A==='1'?JSON.parse(fs.readFileSync(output,'utf8')):null;
try {
  const file=path.join(temp,'production.mjs');
  await build({stdin:{contents:`export { CreatorStyleStore } from ${JSON.stringify(path.join(repo,'apps/desktop/src/main/sclip/creatorStyle.ts'))};
export { createActor } from ${JSON.stringify(path.join(repo,'apps/desktop/src/main/state/actor.ts'))};
export { blankProject } from ${JSON.stringify(path.join(repo,'apps/desktop/src/main/state/model.ts'))};
export { seededGen } from ${JSON.stringify(path.join(repo,'apps/desktop/src/main/state/ids.ts'))};
export { initEval } from ${JSON.stringify(path.join(repo,'apps/desktop/src/renderer/eval/index.ts'))};`,resolveDir:repo},outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  const {CreatorStyleStore,createActor,blankProject,seededGen,initEval}=await import(pathToFileURL(file));
  await initEval();
  const store=(name)=>new CreatorStyleStore(path.join(temp,name));
  let serial=10000;
  function project(memory) {
    // Disjoint deterministic namespaces: entity and operation IDs must never
    // overlap across projects, just as production UUIDs do not.
    const ids=seededGen(serial);serial+=100000;
    const actor=createActor({initial:blankProject(ids,'Synthetic'),idGen:ids});
    let previous=actor.snapshot(),failures=0,userFailures=0;
    actor.subscribe(change=>{try {memory.observe(change,previous)} catch {failures++;if(change.actor.kind==='User')userFailures++} finally {previous=change.new_snapshot}});
    const made=actor.mcpCall('add_text_layer',JSON.stringify({content:'Synthetic text',t_start_us:0,duration_us:2_000_000,font_size_px:76}));
    assert(made.ok,JSON.stringify(made));
    const id=Object.values(actor.snapshot().compositions).flatMap(c=>c.tracks.flatMap(t=>t.layers)).find(l=>l.params.kind==='Text').id;
    return {actor,id,projectId:actor.snapshot().project_id,failures:()=>({failures,userFailures}),
      edit:patch=>{const prior=JSON.stringify(actor.snapshot());const r=actor.command('update_layer_params',{layerId:id,patch:{kind:'Text',...patch}});assert(r.ok,JSON.stringify(r));assert.notEqual(JSON.stringify(actor.snapshot()),prior,'Fixture must make an effective edit')}};
  }
  function correction(memory) {const p=project(memory);p.edit({font_size_px:54});return {p,e:memory.view(p.projectId).evidence.at(-1)}}
  function snapshot(memory,projectId='next',request='') {
    const v=memory.view(projectId);
    return {evidence:v.evidence.length,preferences:v.preferences.length,bytes:fs.statSync(memory.file).size,context_characters:memory.context(projectId,request).length,warning:v.captureWarning};
  }
  function hypothesis(memory,projectId,e,text,id,scope) {
    return memory.agent(projectId,{action:'hypothesis',dimension:'editorial',hypothesis:text,evidence_ids:[e.id],...(id?{id}:{}),...(scope?{scope}:{})});
  }

  // A: Different projects and alternating properties defeat adjacent grouping.
  {
    if(prior){results.scenarios.A=prior.scenarios.A;results.contexts.A=prior.contexts.A;results.scenario_A_reused=true;}
    else {
    const m=store('A'),start=performance.now();let userFailures=0,failures=0;
    for(let n=0;n<100;n++) {
      const p=project(m);
      for(let j=0;j<100;j++) p.edit(j%2?{opacity:0.5+(j%4)*0.1}:{font_size_px:30+j});
      userFailures+=p.failures().userFailures;failures+=p.failures().failures;
      if([9,49,99].includes(n)) console.log(`A progress: ${n+1} projects`);
    }
    results.scenarios.A={attempted_user_adjustments:10000,committed_user_adjustments:10000,uncaptured_user_changes:userFailures,all_capture_errors:failures,...snapshot(m),runtime_ms:performance.now()-start};
    assert.equal(results.scenarios.A.evidence,600);assert.equal(results.scenarios.A.preferences,0);
    results.contexts.A=m.context('next');
    fs.writeFileSync(output,JSON.stringify(results,null,2));
    }
  }
  // B: Reusing an ID prevents duplicate belief objects, but evidence/IDs grow.
  // Omitting it permits exact duplicate text, not just paraphrases.
  {
    const m=store('B'),dups=store('B-duplicates');let pref;
    for(let n=0;n<100;n++) {
      const {p,e}=correction(m);hypothesis(m,p.projectId,e,'May favor restrained captions when readable',pref?.id);
      pref=m.view(p.projectId).preferences[0];
      const {p:dp,e:de}=correction(dups);hypothesis(dups,dp.projectId,de,'May favor restrained captions when readable');
    }
    const {p,e}=correction(dups);let rejected=false;try {hypothesis(dups,p.projectId,e,'May favor restrained captions when readable')}catch{rejected=true}
    assert(rejected);assert.equal(dups.view(p.projectId).preferences.length,100);
    results.scenarios.B={same_id:{...snapshot(m),support_ids:pref.support.length,confidence:pref.confidence,status:pref.status},new_id:{...snapshot(dups),identical_text_preferences:dups.view(p.projectId).preferences.filter(v=>v.hypothesis==='May favor restrained captions when readable').length,rejected_101st:rejected}};
    results.contexts.B=m.context('next');
    results.contexts.B_duplicates=dups.context('next');
    const reloaded=new CreatorStyleStore(path.dirname(m.file));
    assert.equal(reloaded.view('next').preferences[0].id,pref.id);
    assert.equal(reloaded.view('next').preferences[0].support.length,100);
    results.scenarios.B.persistence_reload='PASS';
  }
  // C: Contradictory explicit instructions are both retained as active.
  {
    const m=store('C');m.user('old',{action:'explicit',text:'Generally prefer energetic caption emphasis'});
    m.user('new',{action:'explicit',text:'My taste changed: generally prefer restrained typography'});
    const v=m.view('next');assert.equal(v.preferences.filter(p=>p.status==='active').length,2);
    results.scenarios.C={active_conflicting_preferences:2,automatic_supersession:false,retains_both_quotes:true,...snapshot(m)};results.contexts.C=m.context('next');
  }
  // D: Explicit series scope already works; it is not inferred from footage.
  {
    const m=store('D'),contexts={};
    for(const [series,text] of [['lessons','Restrained explanatory text'],['promotions','Energetic typography'],['documentaries','Allow thoughtful pauses']]) {
      m.user(series,{action:'bind',creatorId:'local',seriesId:series});m.user(series,{action:'explicit',text,scope:{kind:'series'}});
      m.user('next-'+series,{action:'bind',creatorId:'local',seriesId:series});
    }
    for(const series of ['lessons','promotions','documentaries']) contexts[series]=m.context('next-'+series);
    assert(contexts.lessons.includes('Restrained explanatory text'));assert(!contexts.lessons.includes('Energetic typography'));assert.equal(m.context('unbound'),'');
    results.scenarios.D={explicit_series_isolation:'PASS',inferred_semantic_context:'Not implemented',...snapshot(m,'next-lessons')};results.contexts.D=contexts.lessons;
  }
  // E: Random/noisy edits never autonomously create preferences. But manually
  // supplied semantics are not validated by the bookkeeping strength label.
  {
    const m=store('E');let uncaptured=0;
    for(let n=0;n<10;n++){const p=project(m);for(let j=0;j<100;j++){p.edit({font_size_px:40+j%50});const u=p.actor.command(j%2?'project_redo':'project_undo',{});if(!u.ok){p.actor.dispatch(j%2?'redo':'undo',{});} }uncaptured+=p.failures().userFailures}
    const noise=snapshot(m);assert.equal(noise.preferences,0);
    const q=store('E-strength'),a=correction(q),b=correction(q);
    hypothesis(q,a.p.projectId,a.e,'May dislike intense music');const pref=q.view(a.p.projectId).preferences[0];
    hypothesis(q,b.p.projectId,b.e,'May dislike intense music',pref.id);
    const assessed=q.view(b.p.projectId).preferences[0];assert.equal(assessed.confidence,'supported');assert.equal(assessed.status,'candidate');
    results.scenarios.E={noise:{...noise,uncaptured_changes:uncaptured},unrelated_caption_evidence_for_audio_claim:{confidence:assessed.confidence,status:assessed.status,semantic_support_checked:false}};
  }
  // F: A saturated store blocks new evidence and explicit knowledge, including
  // another creator. Suppression does not reclaim capacity.
  {
    const m=store('F');m.user('start',{action:'explicit',text:'Keep approved information'});
    const p=project(m);for(let j=0;j<599;j++)p.edit(j%2?{opacity:0.5+j%4*0.1}:{font_size_px:30+j});
    const full=snapshot(m,p.projectId);assert.equal(full.evidence,600);
    let explicitBlocked=false;try{m.user(p.projectId,{action:'explicit',text:'A new important explicit instruction'})}catch{explicitBlocked=true}
    const b=m.user('other',{action:'create_creator',label:'Synthetic B'}).creators.at(-1);
    m.user('other',{action:'bind',creatorId:b.id});let secondCreatorBlocked=false;try{m.user('other',{action:'explicit',text:'Synthetic B instruction'})}catch{secondCreatorBlocked=true}
    const pref=m.view('start').preferences[0];m.user('start',{action:'disable',id:pref.id});
    const after=snapshot(m,'start');assert.equal(after.evidence,600);
    results.scenarios.F={before:full,new_explicit_blocked:explicitBlocked,second_creator_blocked:secondCreatorBlocked,disable_frees_evidence_capacity:false,approved_text_preserved:m.view('start').preferences[0].hypothesis==='Keep approved information'};
  }
  // G: Disable/remove hide current records; counterexample can revive disabled
  // status. Explicit revision leaves a formerly attached contradiction quote.
  {
    const m=store('G'),v=m.user('one',{action:'explicit',text:'Generally prefer restrained text'}),pref=v.preferences[0],oldKey=m.sessionKey('one');
    m.user('one',{action:'disable',id:pref.id});const hidden=!m.context('two').includes('Generally prefer restrained text');
    const {p,e}=correction(m);m.agent(p.projectId,{action:'counterexample',id:pref.id,evidence_ids:[e.id]});
    const revived=m.view('two').preferences[0];assert.equal(revived.status,'disputed');assert(m.context('two').includes('Generally prefer restrained text'));
    m.user('one',{action:'remove',id:pref.id});assert(!m.context('two').includes('Generally prefer restrained text'));
    const next=correction(m);hypothesis(m,next.p.projectId,next.e,'Generally prefer restrained text');
    const r=store('G-revision'),a=r.user('one',{action:'explicit',text:'Old energetic style'}),pid=a.preferences[0].id;
    const prior=correction(r);r.agent(prior.p.projectId,{action:'counterexample',id:pid,evidence_ids:[prior.e.id]});
    r.user('one',{action:'revise',id:pid,text:'New restrained style'});const revised=r.view('two').preferences[0];
    results.scenarios.G={disable_hides_current_context:hidden,epoch_rotated:m.sessionKey('one')!==oldKey,disabled_can_be_revived_by_counterexample:revived.status==='disputed',removed_can_be_recreated_from_new_evidence:m.context('two').includes('Generally prefer restrained text'),revision_preserves_old_counterexamples:revised.counterexamples.length,native_memory_clear:'Not part of creator ledger controls'};
    results.contexts.G=m.context('two');
  }
  // Retrieval adversary: active irrelevant global entries crowd out a matching
  // project candidate; response IDs do not necessarily describe ranked context.
  {
    const m=store('retrieval');
    for(let j=0;j<8;j++)m.user('old',{action:'explicit',text:'Unrelated backdrop preference '+j});
    const {p,e}=correction(m);hypothesis(m,p.projectId,e,'Preserve significant pauses for this current project',undefined,{kind:'project'});
    const context=m.context(p.projectId,'Preserve significant pauses');
    results.scenarios.retrieval={relevant_project_candidate_omitted:!context.includes('Preserve significant pauses for this current project'),active_before_relevance:true,characters:context.length};results.contexts.retrieval=context;
  }
  // Scope mutation adversary: accumulating old IDs while rewording/rescoping
  // an existing candidate does not revalidate the older evidence's scope.
  {
    const m=store('scope'),ap=project(m);m.user(ap.projectId,{action:'bind',creatorId:'local',seriesId:'series-a'});
    ap.edit({font_size_px:54});const a={p:ap,e:m.view(ap.projectId).evidence.at(-1)};
    hypothesis(m,a.p.projectId,a.e,'Maybe restrained text in series A',undefined,{kind:'series'});const id=m.view(a.p.projectId).preferences[0].id;
    const b=project(m);m.user(b.projectId,{action:'bind',creatorId:'local',seriesId:'series-b'});b.edit({font_size_px:54});const be=m.view(b.projectId).evidence.at(-1);
    hypothesis(m,b.projectId,be,'Maybe intense music in series B',id,{kind:'series'});
    results.scenarios.scope={different_series_retarget_accepted:true,old_evidence_series:a.e.seriesId,new_preference_series:m.view(b.projectId).preferences[0].scope.id,support_ids:m.view(b.projectId).preferences[0].support.length,confidence:m.view(b.projectId).preferences[0].confidence};
  }
  results.forbidden_fetch_attempts=forbiddenRequests;
  fs.writeFileSync(output,JSON.stringify(results,null,2));
  console.log(JSON.stringify({...results,contexts:'Saved in results artifact for offline token measurement'},null,2));
} finally {fs.rmSync(temp,{recursive:true,force:true})}
