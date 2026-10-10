import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectDecisions } from './decisions.mjs'
const record={id:'opening-a',boundary:'opening',state_version:'current',
  sources:[{media_id:'synthetic',layer_ids:['voice'],source_range_us:[2000000,4000000],timeline_range_us:[0,2000000]}],
  evidence_refs:['actual-mix'],rendered_speech:'This is the second.',omitted_context:'The procedure has two stages.',
  decision:'UNCERTAIN',reason:'The referenced stage may be explained visually.',operation:null,post_repair:null}
const message=r=>({role:'assistant',content:'```sclip-boundary-decision\n'+JSON.stringify(r)+'\n```'})

test('retains exact visible choices, uncertain recognition and post-repair updates without scoring',()=>{
  const changed={...record,decision:'CHANGE',operation:{name:'trim_layer',arguments:{layer_id:'voice',edge:'start',t_us:123456}},
    post_repair:{state_version:'new',evidence_refs:['fresh-mix'],observation:'Uncertain recognition persists.',judgment:'unresolved'}}
  const r=collectDecisions([message(record),message(changed)])
  assert.deepEqual(r.records.map(x=>x.record),[record,changed]);assert(r.records.every(x=>!x.format_issues.length))
  assert(!Object.hasOwn(r,'improved'));assert(!Object.hasOwn(r,'recommended_operation'))
})
test('does not invent missing records, fill absent fields, infer a decision from tools or expose reasoning',()=>{
  const r=collectDecisions([{role:'tool',content:message(record).content},
    {role:'assistant',content:'Finished',reasoning_content:message(record).content},message({decision:'KEEP',boundary:'ending'})])
  assert.equal(r.records.length,1);assert(r.records[0].format_issues.includes('missing state_version'))
  assert(!Object.hasOwn(r.records[0].record,'state_version'))
  assert.equal(collectDecisions([{role:'assistant',content:'Looks fine.'}]).records.length,0)
})
test('keeps no-repair and alternative choices without certifying their technical legality',()=>{
  for(const r of [{...record,decision:'KEEP',reason:'Intentional interruption matches the brief.'},
    {...record,decision:'CHANGE',operation:{name:'update_layer_params',arguments:{patch:{src_in_us:600000}}}},
    {...record,decision:'CHANGE',operation:{name:'apply_repair_transaction',arguments:{operations:[]}}}]) {
    // Collector does not certify technical legality or success; ProjectActor owns those checks.
    assert.deepEqual(collectDecisions([message(r)]).records[0].record,r)
  }
})
test('malformed JSON is reported, ANSI presentation is stripped, no replacement decision is synthesized',()=>{
  const r=collectDecisions([{role:'assistant',content:'```sclip-boundary-decision\n{broken}\n```'},
    {role:'assistant',content:'\x1b[33m'+message(record).content+'\x1b[0m'}])
  assert.equal(r.errors.length,1);assert.equal(r.records.length,1);assert.deepEqual(r.records[0].record,record)
})
