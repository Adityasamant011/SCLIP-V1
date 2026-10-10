"""Single-experiment HTTP admission, not product routing or a billing service.

Uses the advertised entire input context as its bound: no approximate tokenizer
or guessed chat/tool framing overhead. Cache writes and paid server tools are
disabled. Unknown routes/shapes/costs fail closed. An uncertain attempt keeps
its maximum reservation, even if an SDK/Hermes retry follows it.
"""
import contextvars
import hashlib
import ipaddress
import json
import os
import socket
import threading
from decimal import Decimal
from pathlib import Path

MODEL = 'openai/gpt-6-luna'
BASE = 'https://openrouter.ai/api/v1'
permit = contextvars.ContextVar('accepted_http_dispatch', default=False)


class StopSpending(RuntimeError):
    pass


class SpendGuard:
    def __init__(self, catalog, ceiling='0.25', ledger=None):
        self.cap = Decimal(str(ceiling))
        if not self.cap.is_finite() or not 0 < self.cap <= Decimal('0.25'):
            raise StopSpending('Invalid experiment authorization')
        if catalog['id'] != MODEL or catalog['context_length'] != 1050000:
            raise StopSpending('Unverified model/context contract')
        pricing = catalog['pricing']
        allowed = {'prompt', 'completion', 'input_cache_read', 'input_cache_write', 'web_search', 'request', 'image', 'overrides', 'discount'}
        if set(pricing) - allowed:
            raise StopSpending('Unknown provider fee')
        rates = [pricing, *pricing.get('overrides', [])]
        self.input_rate = max(Decimal(str(p['prompt'])) for p in rates)
        self.output_rate = max(Decimal(str(p['completion'])) for p in rates)
        self.request_fee = max(Decimal(str(p.get('request', 0))) for p in rates)
        if any(not v.is_finite() or v < 0 for v in (self.input_rate, self.output_rate, self.request_fee)):
            raise StopSpending('Invalid pricing')
        if self.input_rate > Decimal('0.0000002') or self.output_rate > Decimal('0.00000075'):
            raise StopSpending('Price schedule changed')
        self.context = catalog['context_length']
        # Additional conservative 5.5% reserve. Credit-purchase fees are not
        # inference charges; this still covers a possible proportional uplift.
        self.fee_factor = Decimal('1.055')
        self.used = Decimal(0)
        self.calls = []
        self.lock = threading.RLock()
        self.ledger = Path(ledger) if ledger else None
        self.stopped = False
        if self.ledger:
            self.ledger.parent.mkdir(parents=True, exist_ok=True)
            with self.ledger.open('x') as f:
                json.dump(self.snapshot(), f)

    def snapshot(self):
        return {'ceiling_usd': str(self.cap), 'committed_and_reserved_usd': str(self.used),
                'stopped': self.stopped, 'calls': self.calls}

    def save(self):
        if self.ledger:
            temp = self.ledger.with_suffix('.tmp')
            with temp.open('w') as f:
                json.dump(self.snapshot(), f, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp, self.ledger)

    def prepare(self, body):
        allowed = {'model', 'messages', 'tools', 'tool_choice', 'temperature', 'top_p',
                   'presence_penalty', 'frequency_penalty', 'stop', 'stream', 'stream_options',
                   'max_tokens', 'max_completion_tokens', 'n', 'seed', 'response_format',
                   'reasoning', 'reasoning_effort', 'provider', 'usage', 'prompt_cache_key',
                   'prompt_cache_options', 'verbosity', 'user', 'session_id', 'plugins'}
        if set(body) - allowed or body.get('model') != MODEL:
            raise StopSpending('Unknown request field or alternate model')
        if body.get('plugins') or body.get('stream') or body.get('n', 1) != 1:
            raise StopSpending('Plugins, streaming and multiple completions prohibited')
        def contains_cache_marker(value):
            if isinstance(value, dict):
                return bool({'cache_control', 'prompt_cache_breakpoint'} & set(value)) or any(contains_cache_marker(v) for v in value.values())
            return isinstance(value, list) and any(contains_cache_marker(v) for v in value)
        if contains_cache_marker(body):
            raise StopSpending('Explicit cache writes prohibited')
        if any(t.get('type') != 'function' for t in body.get('tools', [])):
            raise StopSpending('Paid hosted tools prohibited')
        for msg in body.get('messages', []):
            content = msg.get('content')
            if content is not None and not isinstance(content, str):
                if not isinstance(content, list) or any(p.get('type') != 'text' or set(p) != {'type', 'text'} for p in content):
                    raise StopSpending('Unbounded multimodal or cache-breakpoint input')
        if not isinstance(body.get('messages'), list) or not body['messages']:
            raise StopSpending('Missing messages')
        raw = body.get('max_completion_tokens', body.get('max_tokens'))
        if type(raw) is not int or not 0 < raw <= 4096:
            raise StopSpending('Missing/excessive aggregate completion/reasoning limit')
        if 'max_tokens' in body and body['max_tokens'] != raw:
            raise StopSpending('Conflicting output limits')
        p = body.get('provider', {})
        if p.get('only') != ['openai'] or p.get('allow_fallbacks') is True:
            raise StopSpending('Provider is not pinned')
        body['provider'] = {**p, 'only': ['openai'], 'order': ['openai'],
                            'allow_fallbacks': False, 'require_parameters': True,
                            'max_price': {'prompt': float(self.input_rate * 1000000),
                                          'completion': float(self.output_rate * 1000000),
                                          'request': float(self.request_fee), 'image': 0}}
        # Supported OpenRouter/OpenAI control, no creative/content changes.
        body['prompt_cache_options'] = {'mode': 'explicit'}
        body.pop('plugins', None)
        body.pop('max_tokens', None)
        body['max_completion_tokens'] = raw  # visible + reasoning + formatting
        if body.get('reasoning_effort', 'high') != 'high' or body.get('reasoning', {}).get('effort', 'high') != 'high':
            raise StopSpending('Reasoning effort changed')
        body['reasoning'] = {'enabled': True, 'effort': 'high'}
        bound = (self.context * self.input_rate + raw * self.output_rate + self.request_fee) * self.fee_factor
        with self.lock:
            if self.stopped or self.used + bound > self.cap:
                self.stopped = True
                self.save()
                raise StopSpending('Next request maximum would exceed remaining experiment authorization')
            self.used += bound
            entry = {'attempt': len(self.calls) + 1, 'request_sha256': hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
                     'input_bound_tokens': self.context, 'aggregate_output_bound_tokens': raw,
                     'maximum_usd': str(bound), 'charged_or_reserved_usd': str(bound), 'status': 'reserved'}
            self.calls.append(entry)
            self.save()  # failure here means nothing dispatched
        return entry

    def settle(self, entry, response):
        with self.lock:
            try:
                data = response.json()
                usage = data['usage']
                cost = Decimal(str(usage['cost']))
                if response.status_code != 200 or not cost.is_finite() or cost < 0:
                    raise ValueError()
                if data.get('model') != MODEL or not data.get('id'):
                    raise ValueError()
                if usage['prompt_tokens'] > self.context or usage['completion_tokens'] > entry['aggregate_output_bound_tokens']:
                    raise ValueError()
                if usage.get('prompt_tokens_details', {}).get('cache_write_tokens', 0):
                    raise ValueError()
                if cost > Decimal(entry['maximum_usd']):
                    raise ValueError()
            except (KeyError, ValueError, TypeError):
                entry['status'] = 'uncertain_full_reservation_retained'
                self.save()
                return
            self.used += cost - Decimal(entry['charged_or_reserved_usd'])
            entry.update(status='settled', charged_or_reserved_usd=str(cost), response_id=data['id'],
                         prompt_tokens=usage['prompt_tokens'], completion_tokens=usage['completion_tokens'],
                         reasoning_tokens=usage.get('completion_tokens_details', {}).get('reasoning_tokens'))
            self.save()


def install_http_guard(guard, credential):
    """One choke point for all sync/async SDK sends, including automatic retry."""
    import httpx
    sync_send, async_send = httpx.Client.send, httpx.AsyncClient.send

    def admit(request):
        url = request.url
        if url.host in ('127.0.0.1', 'localhost', '::1'):
            if credential and credential in request.content.decode('utf8', errors='ignore'):
                raise StopSpending('Credential in local request')
            return None
        if url.scheme != 'https' or url.host != 'openrouter.ai' or url.port not in (None, 443):
            raise StopSpending('Unapproved external HTTP route')
        if request.headers.get('authorization') != 'Bearer ' + credential:
            raise StopSpending('Effective credential changed')
        if request.method == 'GET' and url.path in ('/api/v1/key', '/api/v1/models', '/api/v1/models/openai/gpt-6-luna/endpoints'):
            return None
        if request.method != 'POST' or url.path != '/api/v1/chat/completions':
            raise StopSpending('Unapproved inference/auxiliary route')
        body = json.loads(request.content)
        entry = guard.prepare(body)
        request._content = json.dumps(body).encode()
        request.stream = httpx.ByteStream(request._content)
        request.headers['content-length'] = str(len(request._content))
        return entry

    def send(self, request, *a, **kw):
        if kw.get('stream'):
            raise StopSpending('Unsettleable stream prohibited')
        entry = admit(request)
        token = permit.set(True)
        try:
            response = sync_send(self, request, *a, **kw)
        finally:
            permit.reset(token)
        if entry:
            guard.settle(entry, response)
        return response

    async def asend(self, request, *a, **kw):
        if kw.get('stream'):
            raise StopSpending('Unsettleable stream prohibited')
        entry = admit(request)
        token = permit.set(True)
        try:
            response = await async_send(self, request, *a, **kw)
        finally:
            permit.reset(token)
        if entry:
            guard.settle(entry, response)
        return response

    httpx.Client.send, httpx.AsyncClient.send = send, asend
    return sync_send, async_send


def install_network_boundary():
    """Prevent alternate HTTP libraries/raw sockets from bypassing admission."""
    import sys
    def audit(event, args):
        if event == 'socket.connect' and not permit.get():
            address = args[1]
            if isinstance(address, str):  # local Unix socket
                return
            try:
                if ipaddress.ip_address(address[0]).is_loopback:
                    return
            except ValueError:
                if address[0] == 'localhost':
                    return
            raise StopSpending('External socket outside guarded HTTP dispatch')
    sys.addaudithook(audit)


def strip_child_credentials():
    """Keep the model's terminal/file tools, without paid auth in subprocesses."""
    import subprocess
    original = subprocess.Popen.__init__
    def init(self, *a, **k):
        env = dict(os.environ if k.get('env') is None else k['env'])
        for name in list(env):
            if name.endswith(('API_KEY', 'API_TOKEN')) or name in ('OPENAI_AUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN'):
                env.pop(name, None)
        k['env'] = env
        return original(self, *a, **k)
    subprocess.Popen.__init__ = init
