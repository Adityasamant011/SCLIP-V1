import { DEFAULT_MODEL, ALLOWANCE_MICRO_USD, Refusal, refuse, paid, prepareCompletion, prepareDecision, verifyStripe, usageCost } from './policy.mjs'
import { recoveryPage } from './recovery.mjs'

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const idOf = value => typeof value === 'string' ? value : value?.id
const managedReady = env => env.MANAGED_AI_ENABLED === 'true' && !!env.OPENROUTER_API_KEY && Number.isSafeInteger(Number(env.MANAGED_DAILY_CAP_MICRO_USD)) && Number(env.MANAGED_DAILY_CAP_MICRO_USD) > 0

async function boundedText(request, limit = 160_000) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const parts = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) refuse(413, 'body_limit', 'Request is too large.')
      parts.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const joined = new Uint8Array(size); let offset = 0
  for (const part of parts) { joined.set(part, offset); offset += part.length }
  return new TextDecoder().decode(joined)
}
async function input(request) {
  try { return JSON.parse(await boundedText(request)) }
  catch (e) { if (e instanceof Refusal) throw e; refuse(400, 'invalid_json', 'Send a valid JSON request.') }
}
export function createGateway(request = fetch) {
  async function db(env, path, body, method = 'POST', prefer) {
    const res = await request(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000), redirect: 'error',
    })
    if (!res.ok) refuse(503, 'account_limit', 'Account service refused this operation. Check payment, available allowance and beta limits.')
    return res.status === 204 ? null : res.text().then(text => text ? JSON.parse(text) : null)
  }
  async function stripe(env, path, values, key) {
    const res = await request(`https://api.stripe.com/v1/${path}`, {
      method: values ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Stripe-Version': '2025-06-30.basil', ...(values ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(values ? { body: new URLSearchParams(values) } : {}), signal: AbortSignal.timeout(15_000), redirect: 'error',
    })
    if (!res.ok) refuse(503, 'billing_unavailable', 'Billing is temporarily unavailable.')
    return res.json()
  }
  async function identify(req, env) {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!/^Bearer \S{20,8192}$/.test(authorization)) refuse(401, 'sign_in', 'Sign in to Sclip.')
    const res = await request(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization }, signal: AbortSignal.timeout(8_000), redirect: 'error' })
    if (!res.ok) refuse(401, 'sign_in', 'Your session expired. Sign in again.')
    const user = await res.json()
    if (!user.id || !user.email_confirmed_at) refuse(403, 'verify_email', 'Verify your email before choosing a plan.')
    return user
  }
  async function accountFor(env, user) {
    await db(env, 'sclip_accounts?on_conflict=user_id', { user_id: user.id }, 'POST', 'resolution=ignore-duplicates,return=minimal')
    const rows = await db(env, `sclip_accounts?user_id=eq.${encodeURIComponent(user.id)}&select=*`, undefined, 'GET')
    if (!rows?.[0]) refuse(503, 'account_unavailable', 'Account is unavailable.')
    return rows[0]
  }
  async function webhook(req, env) {
    const raw = await boundedText(req, 1_000_000)
    if (!await verifyStripe(raw, req.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET)) refuse(400, 'signature', 'Invalid webhook signature.')
    const event = JSON.parse(raw)
    const obj = event.data?.object
    if (event.type === 'invoice.paid') {
      // Re-fetch authoritative invoice/subscription. Redirects and client
      // metadata never grant credits. Accept only full monthly USD invoices.
      const invoice = await stripe(env, `invoices/${encodeURIComponent(obj.id)}`)
      const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription ?? invoice.subscription)
      if (!subscriptionId || !['subscription_create','subscription_cycle'].includes(invoice.billing_reason)) return json({ received: true })
      const sub = await stripe(env, `subscriptions/${encodeURIComponent(subscriptionId)}`)
      const item = sub.items?.data?.[0]
      const price = item?.price
      const plan = price?.id === env.STRIPE_BYOK_PRICE_ID ? 'byok' : price?.id === env.STRIPE_MANAGED_PRICE_ID ? 'managed' : null
      if (!plan || sub.items.data.length !== 1 || item.quantity !== 1 || price.currency !== 'usd' ||
          price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 ||
          price.unit_amount !== (plan === 'byok' ? 500 : 1900) || invoice.status !== 'paid' ||
          invoice.currency !== 'usd' || invoice.amount_paid < price.unit_amount) refuse(400, 'invoice_policy', 'Invoice does not match an approved plan.')
      // Use invoice line period rather than subscription's newest cycle. This
      // keeps delayed invoices from granting the wrong month or adding twice.
      if (invoice.lines?.has_more || invoice.lines?.data?.length !== 1) refuse(400, 'invoice_lines', 'Unexpected invoice lines.')
      const line = invoice.lines.data[0]
      const linePrice = line.pricing?.price_details?.price ?? idOf(line.price)
      if (linePrice !== price.id || line.quantity !== 1 || !line.period?.start || !line.period?.end) refuse(400, 'invoice_period', 'Invalid invoice period.')
      const customers = await db(env, `sclip_accounts?stripe_customer_id=eq.${encodeURIComponent(idOf(invoice.customer))}&select=user_id`, undefined, 'GET')
      if (!customers?.[0]) refuse(503, 'customer_pending', 'Customer binding is not ready. Retry delivery.')
      await db(env, 'rpc/sclip_record_payment', { p_event: event.id, p_invoice: invoice.id,
        p_user: customers[0].user_id, p_subscription: sub.id, p_plan: plan,
        p_start: new Date(line.period.start * 1000).toISOString(), p_end: new Date(line.period.end * 1000).toISOString(),
        p_allowance: plan === 'managed' ? ALLOWANCE_MICRO_USD : 0 })
    } else if (['charge.refunded', 'charge.dispute.created'].includes(event.type)) {
      const charge = await stripe(env, `charges/${encodeURIComponent(event.type === 'charge.refunded' ? obj.id : idOf(obj.charge))}`)
      await db(env, `sclip_accounts?stripe_customer_id=eq.${encodeURIComponent(idOf(charge.customer))}`, { blocked: true }, 'PATCH', 'return=minimal')
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = await stripe(env, `subscriptions/${encodeURIComponent(obj.id)}`)
      if (sub.status === 'canceled') await db(env, `sclip_accounts?stripe_subscription_id=eq.${encodeURIComponent(sub.id)}`, { plan: 'none' }, 'PATCH', 'return=minimal')
    }
    return json({ received: true })
  }
  async function completion(req, env, ctx, user, account) {
    if (!managedReady(env)) refuse(503, 'managed_paused', 'Sclip AI is not funded or enabled yet. Use your own AI connection.')
    if (!paid(account) || account.plan !== 'managed') refuse(402, 'managed_plan', 'An active Sclip AI plan is required.')
    const decision = new URL(req.url).pathname === '/v1/decisions'
    const { body, reserve } = (decision ? prepareDecision : prepareCompletion)(await input(req))
    if (decision) {
      // Decisions lacks the completion endpoint's provider price ceiling.
      // Validate the published fixed-model tariff before accepting any charge.
      const catalog = await request('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(8_000), redirect:'error' })
      if (!catalog.ok) refuse(503,'decision_pricing','Jev pricing could not be verified.')
      const model = (await catalog.json()).data?.find(m => m.id === 'typesafe/jev-1.13')
      if (!model || !Number.isFinite(Number(model.pricing?.prompt)) || Number(model.pricing.prompt)>0.000001 || Number(model.pricing.prompt)<0 || Number(model.pricing.completion)!==0 || Number(model.pricing.request ?? 0)!==0) refuse(503,'decision_pricing','Jev is paused until its pricing is reviewed.')
    }
    const requestId = crypto.randomUUID()
    await db(env, 'rpc/sclip_reserve', { p_user: user.id, p_request: requestId, p_amount: reserve, p_daily_cap: Number(env.MANAGED_DAILY_CAP_MICRO_USD) })
    const settle = async data => {
      const cost = usageCost(data, reserve)
      await db(env, 'rpc/sclip_settle', { p_request: requestId, p_actual: cost?.actual ?? null,
        p_provider: typeof data?.id === 'string' ? data.id.slice(0,200) : null })
    }
    let upstream
    try {
      upstream = await request(decision ? 'https://openrouter.ai/api/alpha/decisions' : 'https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Sclip' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(120_000), redirect: 'error',
      })
    } catch { refuse(503, 'inference_uncertain', 'AI connection interrupted. Usage is held until reconciled; retrying can incur another charge.') }
    if (!upstream.ok) {
      // These rejection codes indicate no generation was accepted. Ambiguous
      // provider failures keep their hold rather than creating free retries.
      if ([400,401,402,403,404,413,422,429].includes(upstream.status)) await db(env, 'rpc/sclip_settle', { p_request: requestId, p_actual: 0, p_provider: null })
      await upstream.body?.cancel()
      refuse(503, 'provider_unavailable', 'The AI provider refused the request. No model fallback was used.')
    }
    if (!body.stream) {
      const data = JSON.parse(await boundedText(upstream, 2_000_000))
      await settle(data)
      return json(data)
    }
    if (!upstream.body || !upstream.headers.get('Content-Type')?.includes('text/event-stream')) refuse(503, 'stream_invalid', 'Provider returned an invalid stream; usage remains held.')
    const [client, audit] = upstream.body.tee()
    // Preserve streaming for Hermes. Settlement continues if the UI cancels;
    // uncertain/disconnected usage remains held and is never silently refunded.
    ctx.waitUntil((async () => {
      const reader = audit.getReader(); const decoder = new TextDecoder()
      let pending = ''; let receipt = null; let providerId = null
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })
          if (pending.length > 2_000_000) throw new Error('stream limit')
          let pos
          while ((pos = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0,pos).trim(); pending = pending.slice(pos+1)
            if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') continue
            try {
              const chunk = JSON.parse(line.slice(5))
              if (chunk.id && !providerId) {
                providerId = chunk.id
                await db(env,'rpc/sclip_settle',{ p_request:requestId,p_actual:null,p_provider:String(providerId).slice(0,200) })
              }
              if (usageCost(chunk, reserve)) receipt = chunk
            } catch { /* heartbeat or non-JSON SSE */ }
          }
        }
      } finally { reader.releaseLock(); await settle(receipt ?? { id: providerId }) }
    })().catch(() => { /* A failed settlement is retained as a visible held row. */ }))
    return new Response(client, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Sclip-Request-ID': requestId } })
  }
  return {
    async fetch(req, env, ctx = { waitUntil() {} }) {
      try {
        const url = new URL(req.url); const path = url.pathname
        if (req.method === 'GET' && path === '/account/recovery') return recoveryPage(env)
        if (req.method === 'GET' && ['/','/billing/return'].includes(path)) return new Response('Sclip: return to the app and select Refresh account. Payment is verified by the server.', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
        if (path === '/v1/config' && req.method === 'GET') return json({ supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY,
          managedEnabled: managedReady(env), sharedStockEnabled: env.SHARED_STOCK_ENABLED === 'true', defaultModel: DEFAULT_MODEL })
        if (path === '/v1/stripe/webhook' && req.method === 'POST') return await webhook(req, env)
        const user = await identify(req, env)
        const account = await accountFor(env, user)
        if (path === '/v1/account' && req.method === 'GET') {
          const periods = await db(env, `sclip_credit_periods?user_id=eq.${encodeURIComponent(user.id)}&ends_at=gt.${encodeURIComponent(new Date().toISOString())}&order=ends_at.desc&limit=1&select=allowance,spent,reserved,ends_at`, undefined, 'GET')
          return json({ email: user.email, plan: account.plan, paidUntil: account.paid_until, active: paid(account), blocked: account.blocked,
            credit: periods?.[0] ?? null, managedEnabled: managedReady(env), sharedStockEnabled: env.SHARED_STOCK_ENABLED === 'true', defaultModel: DEFAULT_MODEL })
        }
        if (path === '/v1/checkout' && req.method === 'POST') {
          const { plan } = await input(req)
          if (!['byok','managed'].includes(plan)) refuse(400, 'plan', 'Choose a supported plan.')
          if (account.blocked) refuse(403, 'billing_review', 'Contact support before purchasing another plan.')
          if (plan === 'managed' && !managedReady(env)) refuse(503, 'managed_paused', 'Managed AI sales are paused until funding is ready.')
          if (paid(account)) refuse(409, 'already_subscribed', 'Manage your existing subscription in billing.')
          const customer = account.stripe_customer_id || (await stripe(env, 'customers', { email: user.email, 'metadata[sclip_user_id]': user.id }, `sclip-customer-${user.id}`)).id
          if (!account.stripe_customer_id) await db(env, `sclip_accounts?user_id=eq.${encodeURIComponent(user.id)}`, { stripe_customer_id: customer }, 'PATCH', 'return=minimal')
          const existing = await stripe(env, `subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`)
          if (existing.has_more || existing.data?.some(s => !['canceled','incomplete_expired'].includes(s.status))) refuse(409, 'subscription_exists', 'Manage your existing subscription or contact support.')
          const origin = new URL(env.PUBLIC_ORIGIN).origin
          const session = await stripe(env, 'checkout/sessions', { mode: 'subscription', customer,
            'line_items[0][price]': plan === 'byok' ? env.STRIPE_BYOK_PRICE_ID : env.STRIPE_MANAGED_PRICE_ID,
            'line_items[0][quantity]': '1', client_reference_id: user.id,
            'subscription_data[metadata][sclip_user_id]': user.id,
            success_url: `${origin}/billing/return`, cancel_url: `${origin}/billing/return` }, `sclip-checkout-${user.id}-${Math.floor(Date.now()/3600000)}`)
          return json({ url: session.url })
        }
        if (path === '/v1/portal' && req.method === 'POST') {
          if (!account.stripe_customer_id) refuse(409, 'no_subscription', 'Choose a plan first.')
          return json({ url: (await stripe(env, 'billing_portal/sessions', { customer: account.stripe_customer_id, return_url: `${new URL(env.PUBLIC_ORIGIN).origin}/billing/return` })).url })
        }
        if (path === '/v1/models' && req.method === 'GET') {
          if (!paid(account)) refuse(402, 'payment_required', 'Choose a paid Sclip plan before using AI.')
          return json({ data: [{ id: DEFAULT_MODEL, object: 'model', owned_by: 'z-ai' }] })
        }
        if (['/v1/chat/completions','/v1/decisions'].includes(path) && req.method === 'POST') return await completion(req, env, ctx, user, account)
        const stock = path.match(/^\/v1\/stock\/(pexels|pixabay)\/(image|video)$/)
        if (stock && req.method === 'GET') {
          if (!paid(account)) refuse(402, 'payment_required', 'Choose a paid Sclip plan before shared stock search.')
          if (env.SHARED_STOCK_ENABLED !== 'true') refuse(503, 'stock_paused', 'Shared stock is not enabled. Connect your own stock API key.')
          const [, provider, kind] = stock
          const key = provider === 'pexels' ? env.PEXELS_API_KEY : env.PIXABAY_API_KEY
          if (!key) refuse(503, 'stock_unconfigured', 'This stock provider is not configured. Connect your own key.')
          const query = (url.searchParams.get('q') ?? '').trim()
          const orientation = url.searchParams.get('orientation') ?? ''
          if (!query || query.length > 180 || !['','landscape','portrait','square'].includes(orientation)) refuse(400, 'stock_query', 'Enter a short stock search query.')
          // Fixed provider routes only: no arbitrary URL fetch or owner key exposure.
          const target = new URL(provider === 'pexels' ? kind === 'video' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search'
            : kind === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/')
          target.searchParams.set(provider === 'pexels' ? 'query' : 'q', query)
          target.searchParams.set('per_page','10')
          if (orientation) target.searchParams.set('orientation', provider === 'pexels' ? orientation : orientation === 'portrait' ? 'vertical' : 'horizontal')
          if (provider === 'pixabay') target.searchParams.set('key',key)
          const cacheKey = new Request(`${new URL(env.PUBLIC_ORIGIN).origin}${path}?q=${encodeURIComponent(query.toLowerCase())}&orientation=${orientation}`)
          const cache = globalThis.caches?.default
          const cached = await cache?.match(cacheKey)
          if (cached) return cached
          await db(env,'rpc/sclip_take_stock_quota',{ p_user: user.id, p_provider: provider })
          const response = await request(target.href, { headers: provider === 'pexels' ? { Authorization: key } : {}, signal: AbortSignal.timeout(8_000), redirect: 'error' })
          if (!response.ok) refuse(503, 'stock_provider', 'Stock provider is unavailable or its quota was reached.')
          const body = await boundedText(response, 2_000_000)
          JSON.parse(body)
          const result = new Response(body,{ headers: { 'Content-Type':'application/json', 'Cache-Control':'public, max-age=86400' } })
          if (cache) ctx.waitUntil(cache.put(cacheKey,result.clone()))
          return result
        }
        // Managed Jev and any unknown paid endpoint deliberately fail closed.
        refuse(404, 'route_unavailable', 'This operation is not enabled.')
      } catch (error) {
        return json({ error: { code: error instanceof Refusal ? error.code : 'service_unavailable',
          message: error instanceof Refusal ? error.message : 'Sclip service is temporarily unavailable.' } }, error instanceof Refusal ? error.status : 503)
      }
    },
  }
}
export default createGateway()
