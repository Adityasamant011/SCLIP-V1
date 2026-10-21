import test from 'node:test'
import assert from 'node:assert/strict'
import { createGateway } from '../worker.mjs'
import { DEFAULT_MODEL } from '../policy.mjs'
const env = { SUPABASE_URL:'https://auth.example.invalid', SUPABASE_ANON_KEY:'public', SUPABASE_SERVICE_ROLE_KEY:'server-secret',
  OPENROUTER_API_KEY:'owner-inference-secret', MANAGED_AI_ENABLED:'true', MANAGED_DAILY_CAP_MICRO_USD:'1000000', PUBLIC_ORIGIN:'https://sclip.example.invalid' }
const body = { model:DEFAULT_MODEL,messages:[{ role:'user',content:'Create an animated title' }] }
function fixture(options = {}) {
  const calls = []; const jobs = []
  const account = { user_id:'user-one',plan:'managed',paid_until:new Date(Date.now()+60000).toISOString(),blocked:false,...options.account }
  const gateway = createGateway(async (url,init = {}) => {
    calls.push({ url:String(url),...init })
    if (String(url).endsWith('/auth/v1/user')) return options.badAuth ? Response.json({}, { status:401 }) : Response.json({ id:'user-one',email:'user@example.invalid',email_confirmed_at:'2026-01-01' })
    if (String(url).includes('/sclip_accounts?') && init.method === 'GET') return Response.json([account])
    if (String(url).includes('/rpc/sclip_reserve') && options.noBalance) return Response.json({}, { status:400 })
    if (String(url).includes('/rest/v1/')) return Response.json(null)
    if (String(url).includes('openrouter.ai')) {
      if (options.transportFailure) throw new Error('ambiguous network failure')
      if (options.response) return options.response()
      return Response.json({ id:'gen-test',choices:[],usage:options.missingCost ? {} : { cost:0.001 } })
    }
    throw new Error('Unexpected network request')
  })
  const invoke = (path = '/v1/chat/completions',payload = body,override = {}) => gateway.fetch(new Request(`https://sclip.example.invalid${path}`, {
    method:payload === undefined ? 'GET':'POST',headers:{ Authorization:`Bearer ${'session-token-'.repeat(4)}`,'Content-Type':'application/json' },
    ...(payload === undefined ? {} : { body:JSON.stringify(payload) }),
  }),{ ...env,...override },{ waitUntil:p => jobs.push(p) })
  return { calls,jobs,invoke }
}
test('unpaid, wrong-plan and blocked accounts never reach a paid provider',async () => {
  for (const account of [{ plan:'none' },{ plan:'byok' },{ blocked:true }]) {
    const f=fixture({ account }); const response=await f.invoke()
    assert.equal(response.status,402); assert.ok(!f.calls.some(c => c.url.includes('openrouter.ai')))
  }
})
test('unfunded managed service rejects inference and sales',async () => {
  const f=fixture()
  assert.equal((await f.invoke(undefined,undefined,{ MANAGED_AI_ENABLED:'false' })).status,503)
  assert.equal((await f.invoke('/v1/checkout',{ plan:'managed' },{ MANAGED_DAILY_CAP_MICRO_USD:'0' })).status,503)
  assert.ok(!f.calls.some(c => c.url.includes('openrouter.ai') || c.url.includes('api.stripe.com')))
})
test('invalid authentication and exhausted reservations prevent provider calls',async () => {
  for (const options of [{ badAuth:true },{ noBalance:true }]) {
    const f=fixture(options); assert.ok((await f.invoke()).status>=400)
    assert.ok(!f.calls.some(c => c.url.includes('openrouter.ai')))
  }
})
test('reserve precedes inference and actual receipt settles the same request',async () => {
  const f=fixture(); const response=await f.invoke(); assert.equal(response.status,200)
  const reserve=f.calls.findIndex(c => c.url.includes('/rpc/sclip_reserve'))
  const provider=f.calls.findIndex(c => c.url.includes('openrouter.ai'))
  const settle=f.calls.findIndex(c => c.url.includes('/rpc/sclip_settle'))
  assert.ok(reserve<provider && provider<settle)
  const reserved=JSON.parse(f.calls[reserve].body); const settled=JSON.parse(f.calls[settle].body)
  assert.equal(reserved.p_user,'user-one'); assert.equal(settled.p_request,reserved.p_request); assert.equal(settled.p_actual,1000)
  assert.ok(!(await response.text()).includes('owner-inference-secret'))
})
test('missing cost stays held; transport failure is not refunded',async () => {
  const f=fixture({ missingCost:true }); await f.invoke()
  assert.equal(JSON.parse(f.calls.find(c => c.url.includes('/rpc/sclip_settle')).body).p_actual,null)
  const g=fixture({ transportFailure:true }); assert.equal((await g.invoke()).status,503)
  assert.ok(!g.calls.some(c => c.url.includes('/rpc/sclip_settle')))
})
test('known provider rejection releases the reservation, ambiguous failure retains it',async () => {
  for (const status of [429,502]) {
    const f=fixture({ response:() => Response.json({ error:'private provider details' },{ status }) })
    const response=await f.invoke(); assert.equal(response.status,503)
    const settle=f.calls.find(c => c.url.includes('/rpc/sclip_settle'))
    if (status===429) assert.equal(JSON.parse(settle.body).p_actual,0)
    else assert.equal(settle,undefined)
    assert.ok(!(await response.text()).includes('private provider details'))
  }
})
test('SSE content stays streamed while split usage receipts settle in the background',async () => {
  const f=fixture({ response:() => new Response(new ReadableStream({ start(c) {
    for (const part of ['data: {"id":"gen-stream","choices":[]}\n\n','data: {"usage":{"co','st":0.002}}\n\ndata: [DONE]\n\n']) c.enqueue(new TextEncoder().encode(part))
    c.close()
  } }),{ headers:{ 'Content-Type':'text/event-stream' } }) })
  const response=await f.invoke('/v1/chat/completions',{ ...body,stream:true })
  assert.equal(response.status,200); assert.ok((await response.text()).includes('[DONE]'))
  await Promise.all(f.jobs)
  const settlements=f.calls.filter(c => c.url.includes('/rpc/sclip_settle')).map(c=>JSON.parse(c.body))
  assert.equal(settlements[0].p_actual,null); assert.equal(settlements.at(-1).p_actual,2000)
})
test('invalid model and unsigned webhook never invoke billing or inference',async () => {
  const f=fixture()
  assert.equal((await f.invoke('/v1/chat/completions',{ ...body,model:'other' })).status,400)
  assert.equal((await f.invoke('/v1/stripe/webhook',{ id:'evt_forged' })).status,400)
  assert.ok(!f.calls.some(c => c.url.includes('openrouter.ai') || c.url.includes('api.stripe.com')))
})
async function signedRequest(event,secret='webhook-secret') {
  const raw=JSON.stringify(event); const t=Math.floor(Date.now()/1000)
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{ name:'HMAC',hash:'SHA-256' },false,['sign'])
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`)))].map(b=>b.toString(16).padStart(2,'0')).join('')
  return new Request('https://sclip.example.invalid/v1/stripe/webhook',{ method:'POST',headers:{ 'Stripe-Signature':`t=${t},v1=${signature}` },body:raw })
}
function billingFixture(invoiceOverride={}) {
  const calls=[]
  const invoice={ id:'in_verified',customer:'cus_verified',status:'paid',amount_paid:1900,currency:'usd',billing_reason:'subscription_cycle',
    parent:{ subscription_details:{ subscription:'sub_verified' } },lines:{ has_more:false,data:[{ quantity:1,pricing:{ price_details:{ price:'price_managed' } },period:{ start:1767225600,end:1769904000 } }] },...invoiceOverride }
  const request=async(url,init={})=>{
    calls.push({ url:String(url),...init })
    if(String(url).endsWith('/invoices/in_verified')) return Response.json(invoice)
    if(String(url).endsWith('/subscriptions/sub_verified')) return Response.json({ id:'sub_verified',items:{ data:[{ quantity:1,price:{ id:'price_managed',currency:'usd',unit_amount:1900,recurring:{ interval:'month',interval_count:1 } } }] } })
    if(String(url).includes('/sclip_accounts?')) return Response.json([{ user_id:'trusted-db-user' }])
    if(String(url).endsWith('/rpc/sclip_record_payment')) return Response.json(null)
    throw new Error('Unexpected request')
  }
  const gateway=createGateway(request)
  const invoke=async()=>gateway.fetch(await signedRequest({ id:'evt_verified',type:'invoice.paid',data:{ object:{ id:'in_verified',metadata:{ sclip_user_id:'untrusted-event-user' } } } }),{
    ...env,STRIPE_WEBHOOK_SECRET:'webhook-secret',STRIPE_MANAGED_PRICE_ID:'price_managed',STRIPE_BYOK_PRICE_ID:'price_byok',STRIPE_SECRET_KEY:'stripe-server-secret',
  })
  return { calls,invoke }
}
test('signed paid invoice is re-fetched and grants only the DB-bound customer period',async()=>{
  const f=billingFixture(); assert.equal((await f.invoke()).status,200)
  const grant=JSON.parse(f.calls.find(c=>c.url.endsWith('/rpc/sclip_record_payment')).body)
  assert.equal(grant.p_user,'trusted-db-user');assert.equal(grant.p_allowance,12000000);assert.equal(grant.p_invoice,'in_verified')
  assert.equal(grant.p_start,'2026-01-01T00:00:00.000Z')
})
test('signed invoice still cannot grant credit for underpayment, failed payment, wrong currency or a proration',async()=>{
  for(const override of [{ amount_paid:1899 },{ status:'open' },{ currency:'eur' },{ billing_reason:'subscription_update' },{ lines:{ has_more:true,data:[] } }]) {
    const f=billingFixture(override);await f.invoke()
    assert.ok(!f.calls.some(c=>c.url.endsWith('/rpc/sclip_record_payment')))
  }
})
test('recovery page has no owner keys, a restrictive CSP and no stored URL token',async()=>{
  const gateway=createGateway(()=>{ throw new Error('No network expected') })
  const response=await gateway.fetch(new Request('https://sclip.example.invalid/account/recovery'),env)
  assert.equal(response.status,200)
  assert.ok(response.headers.get('Content-Security-Policy').includes("default-src 'none'"))
  const html=await response.text()
  assert.ok(html.includes('history.replaceState'));assert.ok(!html.includes('owner-inference-secret'));assert.ok(!html.includes('server-secret'))
})
