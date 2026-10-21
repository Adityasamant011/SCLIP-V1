import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MODEL, prepareCompletion, prepareDecision, paid, usageCost, verifyStripe } from '../policy.mjs'
const base = () => ({ model:DEFAULT_MODEL, messages:[{ role:'user',content:'Edit my clip' }] })
test('only GLM Flash is accepted and client routing/credentials cannot override server policy', () => {
  assert.throws(() => prepareCompletion({ ...base(),model:'expensive/model' }))
  const { body } = prepareCompletion({ ...base(), provider:{ max_price:{ completion:999 } }, plugins:[{ id:'web' }], api_key:'injected', n:100 })
  assert.equal(body.provider.max_price.completion,4)
  assert.equal(body.provider.allow_fallbacks,false)
  assert.equal(body.plugins,undefined); assert.equal(body.n,undefined); assert.equal(body.api_key,undefined)
})
test('text evidence only, bounded context/output and function tools', () => {
  for (const max_tokens of [-1,0,8193,3.4]) assert.throws(() => prepareCompletion({ ...base(),max_tokens }))
  assert.throws(() => prepareCompletion({ ...base(),messages:[{ role:'user',content:[{ type:'image_url',image_url:{ url:'x' } }] }] }))
  assert.throws(() => prepareCompletion({ ...base(),messages:[{ role:'user',content:'x'.repeat(128001) }] }))
  assert.throws(() => prepareCompletion({ ...base(),tools:[{ type:'web_search' }] }))
  const prepared = prepareCompletion({ ...base(),tools:[{ type:'function',function:{ name:'edit',parameters:{ type:'object' } } }] })
  assert.equal(prepared.body.tools[0].function.name,'edit'); assert.ok(prepared.reserve>16384)
})
test('hidden message media fields are stripped', () => {
  const { body } = prepareCompletion({ ...base(),messages:[{ role:'user',content:'Hi',images:[{ url:'https://example.invalid' }] }] })
  assert.equal(body.messages[0].images,undefined)
})
test('Unicode byte budget is conservative and streaming requests include receipts', () => {
  const { reserve,body } = prepareCompletion({ ...base(),messages:[{ role:'user',content:'🎬'.repeat(100) }],stream:true })
  assert.ok(reserve >= new TextEncoder().encode(JSON.stringify(body)).length + 4096*4)
  assert.equal(body.stream_options.include_usage,true)
})
test('paid access excludes expired, blocked and unpaid accounts', () => {
  const account = { plan:'byok',paid_until:new Date(Date.now()+60000).toISOString() }
  assert.equal(paid(account),true)
  assert.equal(paid({ ...account,blocked:true }),false)
  assert.equal(paid({ ...account,plan:'none' }),false)
  assert.equal(paid({ ...account,paid_until:'2000-01-01' }),false)
})
test('uncertain usage is never silently treated as free', () => {
  for (const cost of [undefined,null,-1,NaN,Infinity,'0.1']) assert.equal(usageCost({ usage:{ cost } },100),null)
  assert.deepEqual(usageCost({ usage:{ cost:0.0001001 } },100),{ actual:101,exceedsReservation:true })
  assert.deepEqual(usageCost({ usage:{ cost:0 } },100),{ actual:0,exceedsReservation:false })
})
test('Jev requests are bounded and locked to the decisions model', () => {
  const input = { model:'typesafe/jev-1.13',state:{ title:'test' },questions:{ hook:{ type:'noul',instructions:'Check clarity',criteria:{ true:'clear',false:'unclear' } } } }
  assert.ok(prepareDecision(input).reserve>4096)
  assert.throws(() => prepareDecision({ ...input,model:'other/model' }))
  assert.throws(() => prepareDecision({ ...input,state:'x'.repeat(30001) }))
})
async function signature(raw,time,secret) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{ name:'HMAC',hash:'SHA-256' },false,['sign'])
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${time}.${raw}`)))
  return [...bytes].map(b => b.toString(16).padStart(2,'0')).join('')
}
test('Stripe signature checks exact body, timestamp, rotation signatures and secret',async () => {
  const raw = '{"id":"evt_test"}'; const now = Date.now(); const time = Math.floor(now/1000)
  const sig = await signature(raw,time,'secret')
  assert.equal(await verifyStripe(raw,`t=${time},v1=${'0'.repeat(64)},v1=${sig}`,'secret',now),true)
  assert.equal(await verifyStripe(raw+' ',`t=${time},v1=${sig}`,'secret',now),false)
  assert.equal(await verifyStripe(raw,`t=${time},v1=${sig}`,'wrong',now),false)
  assert.equal(await verifyStripe(raw,`t=${time},v1=${sig}`,'secret',now+301000),false)
})
