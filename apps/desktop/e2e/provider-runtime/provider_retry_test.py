"""Offline acceptance tests against the installed Hermes conversation loop.
Run with Hermes's Python and HERMES_RUNTIME_ROOT pointing to its source checkout.
No provider client, editing tool, or session persistence is allowed to run.
"""
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.environ['HERMES_RUNTIME_ROOT'])
_test_home = tempfile.TemporaryDirectory(prefix='sclip-hermes-retry-')
os.environ['HERMES_HOME'] = _test_home.name
from run_agent import AIAgent


def error(status, message):
    err = Exception(message)
    if status:
        err.status_code = status
    return err


def success():
    msg = SimpleNamespace(content='Recovered', tool_calls=None, reasoning_content=None, reasoning=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=msg, finish_reason='stop')], model='synthetic', usage=None)


class ProviderRetryTests(unittest.TestCase):
    def run_request(self, failures):
        with patch('run_agent.get_tool_definitions', return_value=[]), patch('run_agent.check_toolset_requirements', return_value={}), patch('run_agent.OpenAI'), patch('agent.agent_init.fetch_model_metadata', return_value={}):
            agent = AIAgent(api_key='synthetic-key', base_url='https://openrouter.ai/api/v1', provider='openrouter', api_mode='chat_completions', model='synthetic', quiet_mode=True, skip_context_files=True, skip_memory=True)
        agent.client = MagicMock()
        agent.client.chat.completions.create.side_effect = failures
        agent._cached_system_prompt = 'Synthetic test'
        agent._use_prompt_caching = False
        agent.compression_enabled = False
        agent.save_trajectories = False
        self.assertEqual(agent._api_max_retries, 3)
        with patch('agent.conversation_loop.jittered_backoff', return_value=0), patch.object(agent, '_persist_session'), patch.object(agent, '_save_trajectory'), patch.object(agent, '_cleanup_task_resources'), patch.object(agent, '_execute_tool_calls') as tools:
            result = agent.run_conversation('Synthetic request')
        tools.assert_not_called()
        return result, agent.client.chat.completions.create

    def test_transient_once_then_success(self):
        for status, message in [(429, 'Rate limited'), (500, 'Internal error'), (502, 'Unavailable'), (503, 'Service temporarily overloaded'), (504, 'Gateway timeout'), (None, 'Connection reset'), (None, 'Transient timeout')]:
            with self.subTest(status=status, message=message):
                result, requests = self.run_request([error(status, message), success()])
                self.assertFalse(result.get('failed', False), result.get('error'))
                self.assertEqual(result['final_response'], 'Recovered')
                self.assertEqual(requests.call_count, 2)
                self.assertEqual(requests.call_args_list[0], requests.call_args_list[1])

    def test_persistent_overload_stops(self):
        result, requests = self.run_request(error(503, 'Service temporarily overloaded'))
        self.assertTrue(result['failed'])
        self.assertEqual(requests.call_count, 3)
        self.assertIn('after 3 retries', result['final_response'])

    def test_nonretryable_auth_and_configuration(self):
        for status, message in [(401, 'Invalid API key'), (403, 'Forbidden'), (400, 'Invalid request configuration')]:
            with self.subTest(status=status):
                result, requests = self.run_request(error(status, message))
                self.assertTrue(result['failed'])
                self.assertEqual(requests.call_count, 1)


if __name__ == '__main__':
    with patch('requests.sessions.Session.request', side_effect=AssertionError('Offline test attempted network')):
        unittest.main()
