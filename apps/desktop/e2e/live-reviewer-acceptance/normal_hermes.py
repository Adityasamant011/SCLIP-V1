"""Isolated acceptance entrypoint: native Hermes streaming, no financial wrapper.

Only disables nonessential auxiliary inference in this disposable process and
observes clarification timing. Primary SDK/HTTP/socket methods are untouched.
"""
import json
import os
from pathlib import Path
import runpy
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'acceptance-routing'))
from hermes_acceptance import install_auxiliary_disable

MODEL = 'openai/gpt-6-luna'
BASE = 'https://openrouter.ai/api/v1'

def validate():
    from hermes_cli.config import load_config
    from hermes_cli.fallback_config import get_fallback_chain
    from hermes_cli.runtime_provider import resolve_runtime_provider
    from hermes_constants import resolve_reasoning_config
    cfg = load_config()
    route = resolve_runtime_provider(requested='openrouter', target_model=MODEL)
    assert route['provider'] == 'openrouter' and route['base_url'] == BASE
    assert route['api_key'] and route['api_key'] == os.environ.get('OPENROUTER_API_KEY')
    assert cfg['model']['default'] == MODEL and not get_fallback_chain(cfg)
    assert cfg['provider_routing']['only'] == ['openai']
    assert cfg['provider_routing']['allow_fallbacks'] is False
    assert resolve_reasoning_config(cfg, MODEL)['effort'] == 'high'
    assert cfg['agent']['api_max_retries'] == 1
    assert not cfg['auxiliary']['title_generation']['enabled']
    assert not cfg['auxiliary']['background_review']['enabled']
    assert not cfg['memory']['memory_enabled'] and not cfg['compression']['enabled']
    assert os.environ.get('SCLIP_BACKGROUND_JEV_AUTHORIZED', '0') != '1'
    return {'model': MODEL, 'base': BASE, 'reasoning': 'high',
            'credential_present': True, 'fallback': False, 'auxiliary_paid_inference': False,
            'primary_transport': 'native streaming', 'request_interception': False}

def main():
    checking = os.environ.get('SCLIP_4B3_CONFIG_ONLY') == '1'
    if not checking and os.environ.get('SCLIP_PHASE4B3_PAID_OPT_IN') != '1':
        raise RuntimeError('Explicit paid opt-in required')
    assert sys.argv[1:3] == ['-m', 'hermes_cli.main']
    args = sys.argv[3:]
    assert args[args.index('-m') + 1] == MODEL
    assert args[args.index('--provider') + 1] == 'openrouter'
    install_auxiliary_disable()
    result = validate()
    if checking:
        print('PHASE4B3_CONFIG_ONLY_OK ' + json.dumps(result), flush=True)
        return
    import cli
    from clarify_observer import install_clarify_observer
    from tools.clarify_gateway import resolve_clarify_timeout
    install_clarify_observer(cli, resolve_clarify_timeout)
    print('PHASE4B3_NORMAL_TRANSPORT ' + json.dumps(result), flush=True)
    sys.argv = ['hermes_cli.main', *args]
    runpy.run_module('hermes_cli.main', run_name='__main__')

if __name__ == '__main__':
    main()
