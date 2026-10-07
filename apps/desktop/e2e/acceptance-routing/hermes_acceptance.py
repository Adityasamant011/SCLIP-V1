"""Acceptance-only Python entrypoint; no request proxy or credential storage.

The existing Electron launcher supplies the real selected credential in env.
No configuration-only universal auxiliary disable exists in this Hermes build:
its explicit auxiliary provider can fall back to the main paid model. Disable
auxiliary entrypoints in this process only, before CLI imports bind aliases.
"""
import asyncio
import json
import os
import runpy
import socket
import sys


def install_auxiliary_disable():
    import agent.auxiliary_client as aux

    def disabled(*args, **kwargs):
        raise RuntimeError('Nonessential auxiliary inference disabled for isolated acceptance')

    async def async_disabled(*args, **kwargs):
        return disabled()

    for name in ('call_llm', 'resolve_provider_client', 'get_text_auxiliary_client',
                 'get_async_text_auxiliary_client', 'resolve_vision_provider_client'):
        setattr(aux, name, disabled)
    aux.async_call_llm = async_disabled
    return aux


def validate_route():
    from hermes_cli.config import load_config
    from hermes_cli.fallback_config import get_fallback_chain
    from hermes_cli.runtime_provider import resolve_runtime_provider
    cfg = load_config()
    route = resolve_runtime_provider(requested='openrouter', target_model=cfg['model']['default'])
    assert cfg['model']['default'] == 'openai/gpt-5.6-luna-pro'
    assert route['provider'] == 'openrouter'
    assert route['base_url'] == 'https://openrouter.ai/api/v1'
    assert route['api_key'] and route['api_key'] == os.environ.get('OPENROUTER_API_KEY')
    assert route['api_key'] != 'local-budget-proxy-only'
    from openai import OpenAI
    client = OpenAI(api_key=route['api_key'], base_url=route['base_url'])
    assert client.auth_headers['Authorization'] == 'Bearer ' + route['api_key']
    client.close()
    assert not get_fallback_chain(cfg)
    assert cfg['provider_routing']['only'] == ['openai']
    assert cfg['provider_routing']['ignore'] == ['openai/flex', 'openai/fast']
    assert cfg['auxiliary']['title_generation']['enabled'] is False
    assert cfg['auxiliary']['background_review']['enabled'] is False
    assert cfg['compression']['enabled'] is False
    return {'base_url':route['base_url'], 'model':cfg['model']['default'],
            'real_injected_credential_present':True, 'model_fallback':False,
            'provider_candidates':['openai'], 'auxiliary_paid_inference':False}


def main():
    check = sys.argv[1:] == ['--check']
    if check:
        # A route check is incapable of making any network connection, even by accident.
        def offline(*args, **kwargs):
            raise RuntimeError('Network prohibited during acceptance configuration check')
        socket.socket.connect = offline
        socket.create_connection = offline
    aux = install_auxiliary_disable()
    result = validate_route()
    if check:
        for fn in (aux.call_llm, aux.resolve_provider_client, aux.get_text_auxiliary_client,
                   aux.get_async_text_auxiliary_client, aux.resolve_vision_provider_client):
            try:
                fn(task='title_generation')
            except RuntimeError as exc:
                assert 'disabled for isolated acceptance' in str(exc)
            else:
                raise AssertionError('Auxiliary inference was not disabled')
        try:
            asyncio.run(aux.async_call_llm(task='title_generation', messages=[]))
        except RuntimeError as exc:
            assert 'disabled for isolated acceptance' in str(exc)
        print(json.dumps(result))
        return
    if os.environ.get('SCLIP_PAID_HOLDOUT_OPT_IN') != '1':
        raise RuntimeError('A separate explicitly authorized paid holdout is required')
    assert sys.argv[1:3] == ['-m', 'hermes_cli.main']
    args = sys.argv[3:]
    assert args[args.index('--provider')+1] == 'openrouter'
    assert args[args.index('-m')+1] == result['model']
    sys.argv = ['hermes_cli.main', *args]
    runpy.run_module('hermes_cli.main', run_name='__main__')


if __name__ == '__main__':
    main()
