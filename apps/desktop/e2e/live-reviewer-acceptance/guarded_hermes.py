"""Opt-in Phase 4B.3 only. Normal Hermes CLI/skill, isolated cost controls."""
import json
import os
import runpy
import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'acceptance-routing'))
from spend_guard import SpendGuard, StopSpending, MODEL, BASE, install_http_guard, install_network_boundary, strip_child_credentials

checking = os.environ.get('SCLIP_4B3_CONFIG_ONLY') == '1'
if not checking and os.environ.get('SCLIP_PHASE4B3_PAID_OPT_IN') != '1':
    raise RuntimeError('Explicit paid opt-in required')
assert sys.argv[1:3] == ['-m', 'hermes_cli.main']
args = sys.argv[3:]
assert args[args.index('-m') + 1] == MODEL
assert args[args.index('--provider') + 1] == 'openrouter'
key = os.environ.get('OPENROUTER_API_KEY')
assert key and key.startswith('sk-or-')
snapshot = json.loads(Path(os.environ['SCLIP_4B3_PREFLIGHT']).read_text())
guard = SpendGuard(snapshot['models'][0], ledger=None if checking else os.environ['SCLIP_4B3_LEDGER'])
install_http_guard(guard, key)
install_network_boundary()
strip_child_credentials()
from hermes_acceptance import install_auxiliary_disable
install_auxiliary_disable()
from hermes_cli.config import load_config
from hermes_cli.fallback_config import get_fallback_chain
from hermes_cli.runtime_provider import resolve_runtime_provider
from hermes_constants import resolve_reasoning_config
cfg = load_config()
route = resolve_runtime_provider(requested='openrouter', target_model=MODEL)
assert route['provider'] == 'openrouter' and route['base_url'] == BASE
assert route['api_key'] == key
assert cfg['model']['default'] == MODEL
assert not get_fallback_chain(cfg)
assert cfg['provider_routing']['only'] == ['openai']
assert resolve_reasoning_config(cfg, MODEL)['effort'] == 'high'
assert cfg['compression']['enabled'] is False and cfg['memory']['memory_enabled'] is False
assert cfg['auxiliary']['title_generation']['enabled'] is False
assert cfg['auxiliary']['background_review']['enabled'] is False
assert cfg['agent']['api_max_retries'] == 1
assert os.environ.get('SCLIP_BACKGROUND_JEV_AUTHORIZED', '0') != '1'
if checking:
    print('PHASE4B3_CONFIG_ONLY_OK ' + json.dumps({'model':MODEL, 'reasoning':'high', 'base':BASE,
          'real_credential_present':True, 'fallback':False, 'auxiliary':False, 'inference_requests':0}), flush=True)
    sys.exit(0)

# Fresh metadata before any editorial request. No account/key writes.
import httpx
with httpx.Client(timeout=20) as c:
    current = c.get(BASE+'/key',headers={'Authorization':'Bearer '+key})
    current.raise_for_status()
    data = current.json()['data']
    # Provider allowance and this experiment's admission ceiling are separate.
    # Never change the key limit or depend on an obsolete exact dollar value.
    assert data['limit_reset'] is None
    assert data['limit_remaining'] >= float(guard.cap)
    catalog = c.get(BASE+'/models',headers={'Authorization':'Bearer '+key})
    catalog.raise_for_status()
    model = next(m for m in catalog.json()['data'] if m['id'] == MODEL)
    assert model['context_length'] == guard.context and model['pricing'] == snapshot['models'][0]['pricing']
    print('PHASE4B3_BUDGET_READY '+json.dumps({'limit':data['limit'],'usage':data['usage'],
          'remaining':data['limit_remaining'],'limit_reset':data['limit_reset'],
          'request_guard_cap':str(guard.cap),'model':MODEL,'reasoning':'high'}),flush=True)

import cli
from clarify_observer import install_clarify_observer
from tools.clarify_gateway import resolve_clarify_timeout
install_clarify_observer(cli, resolve_clarify_timeout)
sys.argv = ['hermes_cli.main', *args]
try:
    runpy.run_module('hermes_cli.main', run_name='__main__')
finally:
    print('PHASE4B3_SPENDING '+json.dumps(guard.snapshot()),flush=True)
