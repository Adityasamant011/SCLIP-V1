// Metadata/configuration only. No model/agent construction or inference endpoint.
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { stringify } from 'yaml'
import { loadAllKeys } from '../../src/main/keys'
import { resolveHermesProviderEnvironment } from '../../src/main/sclip/hermesSettings'
import { cleanRoutingEnvironment } from '../acceptance-routing/config.mjs'

const MODEL = 'openai/gpt-6-luna'
const BASE = 'https://openrouter.ai/api/v1'
const out = path.resolve('.scratch/live-reviewer-4b3')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-4b3-metadata-'))
app.setName('Sclip')
app.setPath('userData', profile)
app.whenReady().then(async () => {
  try {
    // Decryption cleanup, if any, affects this encrypted disposable copy only.
    fs.copyFileSync(path.join(os.homedir(), 'Library/Application Support/Sclip/cloud_keys.json'), path.join(profile, 'cloud_keys.json'))
    fs.chmodSync(path.join(profile, 'cloud_keys.json'), 0o600)
    const keys = loadAllKeys()
    const auth = resolveHermesProviderEnvironment({ provider: 'openrouter', model: MODEL } as any, tag => keys[tag], {})
    const key = auth.OPENROUTER_API_KEY
    if (!key || !/^sk-or-[!-~]+$/.test(key) || /\s/.test(key)) throw Error('Credential unavailable')
    const config = {
      model: { provider: 'openrouter', default: MODEL, base_url: BASE, max_tokens: 4096 },
      fallback_model: [], fallback_providers: [],
      provider_routing: { only: ['openai'], order: ['openai'], ignore: ['openai/flex', 'openai/fast'], require_parameters: true, allow_fallbacks: false },
      memory: { memory_enabled: false }, compression: { enabled: false },
      auxiliary: { title_generation: { enabled: false }, background_review: { enabled: false }, free_only: true },
      display: { show_reasoning: false }, agent: { max_turns: 16, reasoning_effort: 'high', api_max_retries: 1 },
    }
    fs.writeFileSync(path.join(profile, 'config.yaml'), stringify(config), { mode: 0o600 })
    const python = `import os,json,socket
def blocked(*a,**kw): raise RuntimeError('Network forbidden in runtime configuration check')
socket.socket.connect=blocked
socket.create_connection=blocked
from hermes_cli.config import load_config
from hermes_cli.runtime_provider import resolve_runtime_provider
from hermes_cli.fallback_config import get_fallback_chain
from hermes_constants import resolve_reasoning_config
from openai import OpenAI
cfg=load_config()
r=resolve_runtime_provider(requested='openrouter',target_model=cfg['model']['default'])
assert r['api_key'] == os.environ['OPENROUTER_API_KEY'] and r['api_key']
assert r['base_url']=='https://openrouter.ai/api/v1'
c=OpenAI(api_key=r['api_key'],base_url=r['base_url'])
assert c.auth_headers['Authorization']=='Bearer '+r['api_key']
c.close()
assert not get_fallback_chain(cfg)
assert resolve_reasoning_config(cfg,cfg['model']['default']).get('effort')=='high'
print(json.dumps({'provider':r['provider'],'model':cfg['model']['default'],'base_url':r['base_url'],'api_mode':r.get('api_mode'),'reasoning':resolve_reasoning_config(cfg,cfg['model']['default']),'credential_present':True,'model_fallback':False,'provider_routing':cfg['provider_routing'],'max_tokens':cfg['model']['max_tokens'],'max_turns':cfg['agent']['max_turns'],'memory_enabled':False,'auxiliary_config_disabled':True,'inference_requests':0}))`
    const p = spawnSync('/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python', ['-c', python], {
      cwd: '/Users/adityasamant/SCLIP/hermes-agent-src',
      env: { ...cleanRoutingEnvironment(process.env), ...auth, HERMES_HOME: profile, PYTHONDONTWRITEBYTECODE: '1' },
      encoding: 'utf8', timeout: 30000,
    })
    const runtime = p.status === 0 ? JSON.parse(p.stdout.trim()) : { status: 'FAILED_OFFLINE_CONFIG_CHECK', diagnostics_withheld: true }
    if (process.env.SCLIP_4B3_CONFIG_ONLY === '1') {
      fs.writeFileSync(path.join(out, 'normal-config-check.json'), JSON.stringify(runtime, null, 2))
      console.log(JSON.stringify(runtime))
      fs.rmSync(profile, { recursive: true, force: true })
      app.exit(p.status === 0 ? 0 : 1)
      return
    }
    const get = async (endpoint: string) => {
      const r = await fetch(BASE + '/' + endpoint, { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(20000) })
      if (!r.ok) return { status: r.status, data: null }
      return { status: r.status, data: (await r.json() as any).data }
    }
    const [k, m, e] = await Promise.all([get('key'), process.env.SCLIP_4B3_KEY_ONLY === '1' ? Promise.resolve({status: 'NOT_REPEATED', data: []}) : get('models'), process.env.SCLIP_4B3_KEY_ONLY === '1' ? Promise.resolve({status: 'NOT_REPEATED', data: null}) : get('models/' + MODEL + '/endpoints')])
    const report = {
      checked_at: new Date().toISOString(), model: MODEL, base: BASE, runtime,
      metadata_http: { key: k.status, models: m.status, endpoints: e.status },
      key: k.data ? { limit: k.data.limit, usage: k.data.usage, remaining: k.data.limit_remaining, limit_reset: k.data.limit_reset, usage_daily: k.data.usage_daily, usage_weekly: k.data.usage_weekly, usage_monthly: k.data.usage_monthly, include_byok_in_limit: k.data.include_byok_in_limit, byok_usage: k.data.byok_usage, returned_field_names: Object.keys(k.data).sort() } : null,
      models: (m.data ?? []).filter((v: any) => v.id === MODEL).map((v: any) => ({ id: v.id, name: v.name, context_length: v.context_length, top_provider: v.top_provider, pricing: v.pricing, supported_parameters: v.supported_parameters, architecture: v.architecture })),
      endpoints: e.data?.endpoints?.map((v: any) => ({ name: v.name, tag: v.tag, provider_name: v.provider_name, status: v.status, context_length: v.context_length, max_completion_tokens: v.max_completion_tokens, pricing: v.pricing, supported_parameters: v.supported_parameters })) ?? [],
      inference_requests: 0, allowance_modified: false,
    }
    fs.writeFileSync(path.join(out, process.env.SCLIP_4B3_KEY_ONLY === '1' ? 'normal-post-key.json' : 'normal-preflight.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
    fs.rmSync(profile, { recursive: true, force: true })
    app.exit(0)
  } catch {
    console.error('Metadata/configuration preflight failed; no credentials or dependency diagnostics emitted')
    app.exit(1)
  } finally { fs.rmSync(profile, { recursive: true, force: true }) }
})
