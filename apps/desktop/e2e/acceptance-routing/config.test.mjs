import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceConfig, cleanRoutingEnvironment, MODEL, BASE} from './config.mjs';
test('pin normal route and remove both legacy and new fallback chains',()=>{
 const c=acceptanceConfig({model:{api_key:'discard',base_url:'http://localhost:9999'},fallback_model:[{model:'other'}],fallback_providers:[{provider:'other'}]},'/tmp');
 assert.deepEqual(c.model,{provider:'openrouter',default:MODEL,base_url:BASE,max_tokens:8192});
 assert.deepEqual(c.fallback_model,[]);assert.deepEqual(c.fallback_providers,[]);
 assert.deepEqual(c.provider_routing.only,['openai']);assert.deepEqual(c.provider_routing.ignore,['openai/flex','openai/fast']);
});
test('preserve product skill/system instructions while disabling nonessential automatic inference',()=>{
 const original={agent:{system_prompt:'unchanged'},mcp_servers:{weftcut:{url:'local'}},tools:{tool_search:true}};
 const c=acceptanceConfig(original,'/tmp');assert.equal(c.agent.system_prompt,original.agent.system_prompt);
 assert.deepEqual(c.mcp_servers,original.mcp_servers);assert.deepEqual(c.tools,original.tools);
 assert.equal(c.auxiliary.title_generation.enabled,false);assert.equal(c.auxiliary.background_review.enabled,false);assert.equal(c.compression.enabled,false);
 assert(!JSON.stringify(c).includes('key_limit'));assert(!('api_key' in c.model));
});
test('discard inherited proxy and credential overrides; keep unrelated local runtime config',()=>{
 const c=cleanRoutingEnvironment({OPENAI_BASE_URL:'proxy',OPENROUTER_BASE_URL:'proxy',CUSTOM_BASE_URL:'proxy',OPENROUTER_API_KEY:'dummy',OPENAI_API_KEY:'other',SCLIP_MCP_URL:'local'});
 assert.deepEqual(c,{SCLIP_MCP_URL:'local'});
});
