// Playwright normally replaces the macOS keychain. Real authenticated tests
// explicitly opt out before loading the SAME built production main entry.
const app = require('electron').app
app.setName(require('../../../package.json').productName)
app.commandLine.removeSwitch('use-mock-keychain')
// Opt-in test-only measurement around the SAME production fetch/client. Keep
// numeric metadata only; do not retain headers, credentials or request text.
if (process.env.SCLIP_JEV_MEASURE === '1') {
  const originalFetch = globalThis.fetch
  const measurements = { requests: [], cumulative_cost: 0, cost_available: true, budget_stopped: false }
  const configuredCap = Number(process.env.SCLIP_JEV_COST_CAP_USD)
  const costCap = Number.isFinite(configuredCap) && configuredCap > 0 && configuredCap <= 0.04 ? configuredCap : 0.04
  globalThis.__sclipJevMeasurements = measurements
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://openrouter.ai/api/alpha/decisions') return originalFetch(url, options)
    if (!measurements.cost_available || measurements.cumulative_cost >= costCap) {
      measurements.budget_stopped = true
      throw new Error('Jev test cost safety stop')
    }
    const payload = JSON.parse(options.body)
    const row = { request_bytes: Buffer.byteLength(options.body), requested_model: payload.model,
      question_count: Object.keys(payload.questions ?? {}).length,
      candidate_count: payload.state?.passages?.length ?? null,
      status: null, input_tokens: null, cost: null, latency_ms: null }
    measurements.requests.push(row)
    const started = Date.now()
    const response = await originalFetch(url, options)
    row.status = response.status
    try {
      const body = await response.clone().json()
      const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
      row.input_tokens = numeric(body.usage?.input_tokens)
      row.cost = numeric(body.usage?.cost)
      if (row.cost === null) measurements.cost_available = false
      else measurements.cumulative_cost += row.cost
    } catch { measurements.cost_available = false }
    if (!measurements.cost_available || measurements.cumulative_cost >= costCap) measurements.budget_stopped = true
    row.latency_ms = Date.now() - started
    return response
  }
}
require('../../../out/main/index.js')
