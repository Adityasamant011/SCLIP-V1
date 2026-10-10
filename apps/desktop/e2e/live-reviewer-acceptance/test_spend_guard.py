import asyncio
import copy
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import httpx
from spend_guard import MODEL, SpendGuard, StopSpending, install_http_guard, strip_child_credentials

CATALOG = {'id': MODEL, 'context_length': 1050000, 'pricing': {
    'prompt': '0.0000001', 'completion': '0.0000005', 'input_cache_read': '0.00000001',
    'input_cache_write': '0.000000125', 'web_search': '0.01',
    'overrides': [{'min_prompt_tokens': 272000, 'prompt': '0.0000002',
                   'completion': '0.00000075', 'input_cache_write': '0.00000025'}]}}

def body(**kw):
    return {'model': MODEL, 'messages': [{'role': 'user', 'content': 'Synthetic request'}],
            'max_tokens': 4096, 'provider': {'only': ['openai']}, **kw}

def response(cost='0.002', **usage):
    return httpx.Response(200, json={'id': 'gen-test', 'model': MODEL,
        'choices': [{'message': {'role': 'assistant', 'content': 'Done'}, 'finish_reason': 'stop', 'index': 0}],
        'usage': {'prompt_tokens': 1000, 'completion_tokens': 100,
                  'completion_tokens_details': {'reasoning_tokens': 80}, 'cost': cost, **usage}})

class GuardTests(unittest.TestCase):
    def test_entire_context_long_rates_reasoning_and_fee_bound(self):
        g=SpendGuard(CATALOG); b=body(); entry=g.prepare(b)
        self.assertEqual(__import__('decimal').Decimal(entry['maximum_usd']), __import__('decimal').Decimal('0.22479096'))
        self.assertEqual(b['max_completion_tokens'],4096)
        self.assertEqual(b['prompt_cache_options'], {'mode':'explicit'})
        self.assertFalse(b['provider']['allow_fallbacks'])
        self.assertEqual(b['provider']['max_price']['request'],0)
        self.assertEqual(b['reasoning']['effort'],'high')

    def test_overauthorization_rejected_before_dispatch(self):
        g=SpendGuard(CATALOG); g.prepare(body())
        with self.assertRaises(StopSpending): g.prepare(body())
        self.assertEqual(len(g.calls),1)
        self.assertLessEqual(g.used,g.cap)

    def test_missing_unknown_or_excessive_parameters_fail_closed(self):
        for change in [{'max_tokens':None}, {'max_tokens':4097}, {'model':'another-model'},
                       {'plugins':[{'id':'web'}]}, {'tools':[{'type':'web_search'}]},
                       {'service_tier':'fast'}, {'stream':True}, {'n':2},
                       {'messages':[{'role':'user','content':[{'type':'image_url','image_url':{'url':'x'}}]}]}]:
            with self.subTest(change=change), self.assertRaises(StopSpending): SpendGuard(CATALOG).prepare(body(**change))

    def test_settled_cost_releases_reservation_not_spend(self):
        g=SpendGuard(CATALOG)
        for _ in range(12):
            e=g.prepare(body());g.settle(e,response())
        self.assertEqual(g.used,__import__('decimal').Decimal('0.024'))
        self.assertEqual(len(g.calls),12)
        with self.assertRaises(StopSpending):
            e=g.prepare(body());g.settle(e,response('0.01'));g.prepare(body())

    def test_uncertain_failure_keeps_maximum_before_retry(self):
        g=SpendGuard(CATALOG); e=g.prepare(body());g.settle(e,httpx.Response(500,json={'error':'unknown'}))
        with self.assertRaises(StopSpending):g.prepare(body())
        self.assertEqual(e['status'],'uncertain_full_reservation_retained')

    def test_invalid_cost_cache_and_output_do_not_release(self):
        for r in [response('NaN'),response('-1'),response('0.3'),response(completion_tokens=4097),
                  response(prompt_tokens_details={'cache_write_tokens':1}),httpx.Response(200,json={'usage':{}})]:
            g=SpendGuard(CATALOG);e=g.prepare(body());g.settle(e,r)
            self.assertEqual(g.used, __import__('decimal').Decimal(e['maximum_usd']))

    def test_http_sync_async_final_summary_and_sdk_retry_are_covered(self):
        g=SpendGuard(CATALOG)
        calls=[]
        def fake(req):
            wire=b''.join(req.stream)
            self.assertEqual(wire,req.content)
            self.assertEqual(len(wire),int(req.headers['content-length']))
            calls.append(json.loads(wire));return response()
        originals=install_http_guard(g,'fake-key')
        try:
            from openai import OpenAI
            client=OpenAI(api_key='fake-key',base_url='https://openrouter.ai/api/v1',max_retries=0,
                          http_client=httpx.Client(transport=httpx.MockTransport(fake)))
            client.chat.completions.create(**{k:v for k,v in body().items() if k!='provider'},extra_body={'provider':{'only':['openai']}})
            # Direct summary HTTP request has no tools and still goes through admission.
            with httpx.Client(transport=httpx.MockTransport(fake)) as c:
                c.post('https://openrouter.ai/api/v1/chat/completions',headers={'Authorization':'Bearer fake-key'},json=body())
                with self.assertRaises(StopSpending):c.post('https://api.openai.com/v1/chat/completions',json=body())
                with self.assertRaises(StopSpending):c.post('https://openrouter.ai/api/v1/embeddings',headers={'Authorization':'Bearer fake-key'},json={})
            async def check():
                async with httpx.AsyncClient(transport=httpx.MockTransport(fake)) as c:
                    await c.post('https://openrouter.ai/api/v1/chat/completions',headers={'Authorization':'Bearer fake-key'},json=body())
            asyncio.run(check());self.assertEqual(len(g.calls),3)
            self.assertEqual(len(calls),3)
            self.assertTrue(all(x['prompt_cache_options']=={'mode':'explicit'} for x in calls))
            # The SDK really attempts a retry; second HTTP send must be rejected.
            g2=SpendGuard(CATALOG)
            httpx.Client.send,httpx.AsyncClient.send=originals
            install_http_guard(g2,'fake-key')
            attempted=[]
            def failing(req):attempted.append(1);return httpx.Response(500,json={'error':{'message':'synthetic failure'}})
            client=OpenAI(api_key='fake-key',base_url='https://openrouter.ai/api/v1',max_retries=1,
                          http_client=httpx.Client(transport=httpx.MockTransport(failing)))
            with self.assertRaises(Exception):
                client.chat.completions.create(**{k:v for k,v in body().items() if k!='provider'},extra_body={'provider':{'only':['openai']}})
            self.assertEqual(len(attempted),1);self.assertEqual(len(g2.calls),1);self.assertTrue(g2.stopped)
        finally:httpx.Client.send,httpx.AsyncClient.send=originals

    def test_ledger_single_use_and_write_before_attempt(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'ledger.json';g=SpendGuard(CATALOG,ledger=p);g.prepare(body())
            self.assertEqual(json.loads(p.read_text())['calls'][0]['status'],'reserved')
            with self.assertRaises(FileExistsError):SpendGuard(CATALOG,ledger=p)
            with patch.object(g,'save',side_effect=OSError('disk')):
                g2=SpendGuard(CATALOG)
                with patch.object(g2,'save',side_effect=OSError('disk')),self.assertRaises(OSError):g2.prepare(body())

    def test_child_process_has_no_provider_credential(self):
        original=subprocess.Popen.__init__
        try:
            strip_child_credentials()
            out=subprocess.check_output(['/usr/bin/env'],env={'PATH':'/usr/bin','OPENROUTER_API_KEY':'do-not-print','SCLIP_MCP_TOKEN':'local-token'})
            self.assertNotIn(b'OPENROUTER_API_KEY',out);self.assertIn(b'SCLIP_MCP_TOKEN',out)
        finally:subprocess.Popen.__init__=original

    def test_raw_socket_bypass_blocked_in_disposable_process(self):
        code="from spend_guard import install_network_boundary; import socket; install_network_boundary(); socket.socket().connect(('192.0.2.1',443))"
        r=subprocess.run([__import__('sys').executable,'-c',code],capture_output=True,env={**os.environ,'PYTHONPATH':str(Path(__file__).parent)})
        self.assertNotEqual(r.returncode,0);self.assertIn(b'outside guarded HTTP',r.stderr)

if __name__=='__main__':unittest.main()
