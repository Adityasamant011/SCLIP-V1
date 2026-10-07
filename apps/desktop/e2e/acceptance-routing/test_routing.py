"""Offline regressions; synthetic credentials only; network is forbidden."""
import asyncio
import os
import socket
import unittest
from types import SimpleNamespace
from unittest.mock import patch


def offline(*args, **kwargs):
    raise AssertionError('No network/inference permitted in deterministic routing tests')

socket.socket.connect = offline
socket.create_connection = offline

from hermes_cli.runtime_provider import _resolve_openrouter_runtime
from hermes_cli.fallback_config import get_fallback_chain
from agent.chat_completion_helpers import _provider_preferences_for_agent
from hermes_acceptance import install_auxiliary_disable

class RoutingTests(unittest.TestCase):
    def test_reproduce_ignored_local_url(self):
        with patch.dict(os.environ, {'OPENAI_BASE_URL':'http://127.0.0.1:9999/v1'}, clear=True), \
             patch('hermes_cli.runtime_provider._getenv', side_effect=lambda k,d='':os.environ.get(k,d)), \
             patch('hermes_cli.runtime_provider._get_model_config',return_value={'provider':'openrouter','base_url':'http://127.0.0.1:9999/v1'}):
            r=_resolve_openrouter_runtime(requested_provider='openrouter')
            self.assertEqual(r['base_url'],'https://openrouter.ai/api/v1')

    def test_supported_openrouter_key_path(self):
        with patch('hermes_cli.runtime_provider._getenv', side_effect=lambda k,d='':'synthetic-secret-only' if k=='OPENROUTER_API_KEY' else d), \
             patch('hermes_cli.runtime_provider._get_model_config',return_value={'provider':'openrouter'}):
            r=_resolve_openrouter_runtime(requested_provider='openrouter')
            self.assertEqual(r['base_url'],'https://openrouter.ai/api/v1')
            self.assertEqual(r['api_key'],'synthetic-secret-only')

    def test_no_fallback_in_either_config_generation(self):
        self.assertEqual(get_fallback_chain({'fallback_model':[],'fallback_providers':[]}),[])

    def test_actual_request_provider_preferences(self):
        agent=SimpleNamespace(providers_allowed=['openai'],providers_ignored=['openai/flex','openai/fast'],providers_order=['openai'],provider_sort=None,provider_require_parameters=True,provider_data_collection=None)
        self.assertEqual(_provider_preferences_for_agent(agent),{'only':['openai'],'ignore':['openai/flex','openai/fast'],'order':['openai'],'require_parameters':True})

    def test_all_sync_auxiliary_entrypoints_fail_before_client_creation(self):
        aux=install_auxiliary_disable()
        for name in ('call_llm','resolve_provider_client','get_text_auxiliary_client','get_async_text_auxiliary_client','resolve_vision_provider_client'):
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError,'disabled for isolated acceptance'):
                getattr(aux,name)(task='any-task')

    def test_async_auxiliary_fails_before_client_creation(self):
        aux=install_auxiliary_disable()
        with self.assertRaisesRegex(RuntimeError,'disabled for isolated acceptance'):
            asyncio.run(aux.async_call_llm(task='any-task',messages=[]))

if __name__=='__main__':
    unittest.main()
