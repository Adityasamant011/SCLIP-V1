// Operator-only: preview held usage, then --apply confirmed provider receipts.
// Uses environment credentials; never run inside the desktop app or expose HTTP.
const apply = process.argv.includes('--apply')
const dbBase = process.env.SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const router = process.env.OPENROUTER_API_KEY
if (!dbBase || !service || !router) throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENROUTER_API_KEY in your private shell environment.')
const headers = { apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json' }
const response = await fetch(`${dbBase}/rest/v1/sclip_usage?state=eq.held&created_at=lt.${encodeURIComponent(new Date(Date.now()-300000).toISOString())}&select=request_id,provider_id&limit=100`,{ headers,signal:AbortSignal.timeout(10000),redirect:'error' })
if (!response.ok) throw new Error('Could not load held usage.')
for (const row of await response.json()) {
  if (!row.provider_id || !/^[\w-]{1,200}$/.test(row.provider_id)) { console.log(row.request_id,'HELD: receipt ID unavailable; inspect provider activity manually.');continue }
  const receipt = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(row.provider_id)}`,{ headers:{ Authorization:`Bearer ${router}` },signal:AbortSignal.timeout(10000),redirect:'error' })
  if (!receipt.ok) { console.log(row.request_id,'HELD: provider receipt unavailable.');continue }
  const data = (await receipt.json()).data
  if (data?.id !== row.provider_id || typeof data.total_cost !== 'number' || !Number.isFinite(data.total_cost) || data.total_cost<0) { console.log(row.request_id,'HELD: receipt could not be verified.');continue }
  const micro = Math.ceil(data.total_cost*1000000)
  if (apply) {
    const settled = await fetch(`${dbBase}/rest/v1/rpc/sclip_settle`,{ method:'POST',headers,body:JSON.stringify({ p_request:row.request_id,p_actual:micro,p_provider:row.provider_id }),signal:AbortSignal.timeout(10000),redirect:'error' })
    if (!settled.ok) throw new Error('Settlement failed; remaining usage stays held.')
  }
  console.log(row.request_id,apply?'SETTLED':'PREVIEW',micro,'micro USD')
}
