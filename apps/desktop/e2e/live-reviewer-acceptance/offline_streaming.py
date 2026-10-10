"""Real installed Hermes + SDK SSE transport + local Sclip MCP; $0 inference.

HTTP mocking is confined to this test. The live entrypoint never imports it.
"""
import json
import os
import socket
from unittest.mock import patch
import httpx
from openai import OpenAI

# Fail closed for this offline test: only the existing local MCP may connect.
original_connect = socket.socket.connect
def local_only(self, address):
    if isinstance(address, tuple) and address[0] not in ('127.0.0.1', 'localhost', '::1'):
        raise RuntimeError('Offline streaming test prohibits external connections')
    return original_connect(self, address)
socket.socket.connect = local_only

from tools.mcp_tool import register_mcp_servers, shutdown_mcp_servers
from tools.registry import registry
from run_agent import AIAgent

names = register_mcp_servers({'weftcut': {'url': os.environ['SCLIP_MCP_URL'],
    'headers': {'Authorization': 'Bearer ' + os.environ['SCLIP_MCP_TOKEN']}, 'timeout': 30}})
name = 'mcp__weftcut__get_timeline_context'
assert name in names
defs = registry.get_definitions({name}, quiet=True)
requests = []
def sse(chunks):
    return ''.join('data: ' + json.dumps(chunk) + '\n\n' for chunk in chunks) + 'data: [DONE]\n\n'
def chunk(delta, finish=None):
    return {'id': 'offline', 'object': 'chat.completion.chunk', 'created': 0,
            'model': 'openai/gpt-6-luna',
            'choices': [{'index': 0, 'delta': delta, 'finish_reason': finish}]}
def respond(request):
    body = json.loads(request.content)
    requests.append(body)
    assert body['stream'] is True
    assert body['stream_options']['include_usage'] is True
    if len(requests) == 1:
        chunks = [chunk({'role': 'assistant', 'tool_calls': [{'index': 0, 'id': 'call_offline',
            'type': 'function', 'function': {'name': name, 'arguments': '{'}}]}),
            chunk({'tool_calls': [{'index': 0, 'function': {'arguments': '}'}}]}, 'tool_calls')]
    else:
        assert body['messages'][-1]['role'] == 'tool'
        assert body['messages'][-1]['tool_call_id'] == 'call_offline'
        chunks = [chunk({'role': 'assistant', 'content': 'Offline '}),
                  chunk({'content': 'stream complete.'}, 'stop')]
    chunks.append({'id': 'offline', 'object': 'chat.completion.chunk', 'created': 0,
                   'model': 'openai/gpt-6-luna', 'choices': [],
                   'usage': {'prompt_tokens': 10, 'completion_tokens': 5, 'total_tokens': 15}})
    return httpx.Response(200, headers={'content-type': 'text/event-stream'}, content=sse(chunks))

client = OpenAI(api_key='offline-not-a-provider-key', base_url='https://openrouter.ai/api/v1',
                max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(respond)))
try:
    with patch('agent.agent_init.fetch_model_metadata', return_value={}), \
         patch('run_agent.get_tool_definitions', return_value=defs), \
         patch('run_agent.check_toolset_requirements', return_value={}):
        agent = AIAgent(api_key='offline-not-a-provider-key', base_url='https://openrouter.ai/api/v1',
            model='openai/gpt-6-luna', provider='openrouter', quiet_mode=True,
            skip_context_files=True, skip_memory=True, skip_background_review=True,
            enabled_toolsets=['weftcut'])
    messages = [{'role': 'user', 'content': 'Synthetic offline transport test'}]
    with patch.object(agent, '_create_request_openai_client', return_value=client), \
         patch.object(agent, '_close_request_openai_client'):
        response = agent._interruptible_streaming_api_call({'model': 'openai/gpt-6-luna',
            'messages': messages, 'tools': defs, 'max_tokens': 100})
        tool = response.choices[0].message.tool_calls[0]
        assert tool.function.name == name and json.loads(tool.function.arguments) == {}
        result = agent._invoke_tool(tool.function.name, json.loads(tool.function.arguments),
                                    'offline-stream', tool_call_id=tool.id, messages=messages)
        assert 'error' not in json.loads(result), result
        assert 'timeline' in result.lower(), result
        messages += [{'role': 'assistant', 'content': None,
                      'tool_calls': [{'id': tool.id, 'type': 'function', 'function': {
                          'name': tool.function.name, 'arguments': tool.function.arguments}}]},
                     {'role': 'tool', 'tool_call_id': tool.id, 'content': result}]
        final = agent._interruptible_streaming_api_call({'model': 'openai/gpt-6-luna',
            'messages': messages, 'tools': defs, 'max_tokens': 100})
        assert final.choices[0].message.content == 'Offline stream complete.'
        assert final.usage.completion_tokens == 5
    print(json.dumps({'native_hermes_streaming': 'PASS', 'streamed_tool_arguments': 'PASS',
        'actual_local_mcp_execution': 'PASS', 'streamed_final_response': 'PASS',
        'standard_usage_chunk': 'PASS', 'mock_requests': len(requests), 'provider_requests': 0}))
finally:
    client.close()
    shutdown_mcp_servers()
