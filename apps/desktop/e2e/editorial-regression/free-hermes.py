"""One opt-in regression session, exact verified free route; no creative hints."""
import json, os, runpy, sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'acceptance-routing'))
from hermes_acceptance import install_auxiliary_disable
install_auxiliary_disable()
from hermes_cli.config import load_config
from hermes_cli.fallback_config import get_fallback_chain
from hermes_cli.runtime_provider import resolve_runtime_provider
cfg = load_config()
model = 'nvidia/nemotron-3.5-lightning:free'
route = resolve_runtime_provider(requested='openrouter', target_model=model)
assert cfg['model']['default'] == model
assert route['provider'] == 'openrouter' and route['base_url'] == 'https://openrouter.ai/api/v1'
assert route['api_key'] == os.environ.get('OPENROUTER_API_KEY') and route['api_key']
assert not get_fallback_chain(cfg)
assert cfg['provider_routing']['only'] == ['nvidia/nvfp4']
assert cfg['memory']['memory_enabled'] is False
assert cfg['compression']['enabled'] is False
assert cfg['auxiliary']['title_generation']['enabled'] is False
assert cfg['auxiliary']['background_review']['enabled'] is False
assert os.environ.get('SCLIP_COMPLETE_REGRESSION_FREE') == '1'
assert sys.argv[1:3] == ['-m', 'hermes_cli.main']
args = sys.argv[3:]
assert args[args.index('-m') + 1] == model
print('REGRESSION_ROUTE ' + json.dumps({'model':model,'base':route['base_url'],'auth_present':True,'fallback':False,'auxiliary':False}), flush=True)
if os.environ.get('SCLIP_REGRESSION_CONFIG_ONLY') == '1':
    print('REGRESSION_CONFIG_ONLY_OK', flush=True)
    sys.exit(0)
# Fail closed for any attempted model switch/extra completion in this process.
from openai.resources.chat.completions import Completions, AsyncCompletions
call_count = 0
original = Completions.create
async_original = AsyncCompletions.create
def create(self, *a, **k):
    global call_count
    assert k.get('model') == model
    provider = k.get('extra_body', {}).get('provider', {})
    assert provider.get('only') == ['nvidia/nvfp4']
    provider['allow_fallbacks'] = False
    call_count += 1
    print('REGRESSION_MODEL_CALL '+json.dumps({'call':call_count,'model':model}),flush=True)
    result=original(self,*a,**k)
    usage=getattr(result,'usage',None)
    if usage: print('REGRESSION_USAGE '+json.dumps({'call':call_count,'id':getattr(result,'id',None),'usage':usage.model_dump()}),flush=True)
    return result
async def async_create(self, *a, **k):
    assert k.get('model') == model
    provider = k.get('extra_body', {}).get('provider', {})
    assert provider.get('only') == ['nvidia/nvfp4']
    provider['allow_fallbacks'] = False
    return await async_original(self, *a, **k)
Completions.create = create
AsyncCompletions.create = async_create
import cli
from clarify_observer import install_clarify_observer
from tools.clarify_gateway import resolve_clarify_timeout
install_clarify_observer(cli, resolve_clarify_timeout)
sys.argv = ['hermes_cli.main', *args]
runpy.run_module('hermes_cli.main', run_name='__main__')
