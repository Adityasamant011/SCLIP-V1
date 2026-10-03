import json
import pathlib
import tempfile
import unittest
import asyncio
from types import SimpleNamespace
from unittest.mock import patch
import httpx
from openai import OpenAI, AsyncOpenAI
from openai._base_client import SyncAPIClient, AsyncAPIClient
from agent.usage_pricing import normalize_usage
from sitecustomize import CostGuard, GuardStopped, instrument_sdk


class GuardTest(unittest.TestCase):
    def test_normal_cost_keeps_running(self):
        with tempfile.TemporaryDirectory() as root:
            stops = []
            file = str(pathlib.Path(root) / "usage.jsonl")
            guard = CostGuard(file, stops.append)
            guard.record({"task": "main", "model": "z-ai/glm-5.2", "provider": "openrouter",
                          "provider_cost_usd": .003, "estimated_cost_usd": .004})
            self.assertEqual(stops, [])
            self.assertEqual(json.loads(pathlib.Path(file).read_text())["guard_cumulative_usd"], .004)

    def test_stop_paths(self):
        for row in [
            {"provider_cost_usd": .15},
            {"estimated_cost_usd": .10},
            {},
        ]:
            with self.subTest(row=row), tempfile.TemporaryDirectory() as root:
                stops = []
                guard = CostGuard(str(pathlib.Path(root) / "usage.jsonl"), stops.append)
                with self.assertRaises(GuardStopped):
                    guard.record(row)
                self.assertEqual(stops, [86])

    def test_cumulative_stop(self):
        with tempfile.TemporaryDirectory() as root:
            stops = []
            guard = CostGuard(str(pathlib.Path(root) / "usage.jsonl"), stops.append)
            guard.record({"estimated_cost_usd": .06})
            with self.assertRaises(GuardStopped):
                guard.record({"estimated_cost_usd": .04})
            self.assertEqual(stops, [86])

    def test_wrong_model_blocked_before_dispatch(self):
        with tempfile.TemporaryDirectory() as root:
            guard = CostGuard(str(pathlib.Path(root) / "usage.jsonl"), lambda code: None,
                              model="test/model:free")
            with self.assertRaises(GuardStopped):
                guard.preflight("z-ai/glm-5.2", "openrouter")


class SDKBoundaryTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory()
        self.addCleanup(self.root.cleanup)
        self.file = pathlib.Path(self.root.name) / "usage.jsonl"
        self.guard = CostGuard(str(self.file), lambda code: None)
        self.original_sync, self.original_async = SyncAPIClient.request, AsyncAPIClient.request
        self.addCleanup(self.restore)
        instrument_sdk(self.guard, normalize_usage,
                       lambda *a, **kw: SimpleNamespace(amount_usd=.004, source="synthetic"),
                       SyncAPIClient, AsyncAPIClient)
        self.requests = []

    def restore(self):
        SyncAPIClient.request, AsyncAPIClient.request = self.original_sync, self.original_async

    def rows(self):
        return [json.loads(line) for line in self.file.read_text().splitlines()]

    def response(self, request):
        body = json.loads(request.content)
        self.requests.append(body)
        usage = {"prompt_tokens": 100, "completion_tokens": 20,
                 "prompt_tokens_details": {"cached_tokens": 25},
                 "completion_tokens_details": {"reasoning_tokens": 8}, "cost": .003}
        if request.url.path.endswith("/responses"):
            return httpx.Response(200, json={"id": "r", "object": "response", "model": body["model"],
                                            "output": [], "usage": {"input_tokens": 100, "output_tokens": 20,
                                            "input_tokens_details": {"cached_tokens": 25}, "cost": .003}})
        value = {"id": "c", "object": "chat.completion", "created": 1, "model": body["model"],
                 "choices": [{"index": 0, "message": {"role": "assistant", "content": "answer"},
                              "finish_reason": "stop"}], "usage": usage}
        if body.get("stream"):
            chunks = [{"id": "c", "object": "chat.completion.chunk", "created": 1, "model": body["model"],
                       "choices": [{"index": 0, "delta": {"content": "answer"}, "finish_reason": None}]},
                      {"id": "c", "object": "chat.completion.chunk", "created": 1, "model": body["model"],
                       "choices": [], "usage": usage}]
            data = "".join("data: " + json.dumps(c) + "\n\n" for c in chunks) + "data: [DONE]\n\n"
            return httpx.Response(200, text=data, headers={"Content-Type": "text/event-stream"})
        return httpx.Response(200, json=value)

    def client(self):
        return OpenAI(base_url="https://openrouter.ai/api/v1", api_key="synthetic-secret-never-output",
                      max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(self.response)))

    def test_normal_summary_auxiliary_same_boundary_no_double_counting(self):
        with self.client() as client:
            normal = client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
            def handle_max_iterations():
                return client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
            summary = handle_max_iterations()
            title = client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
        self.assertEqual(normal.choices[0].message.content, "answer")
        self.assertEqual(summary.choices[0].message.content, title.choices[0].message.content)
        self.assertEqual(len(self.rows()), 3)
        self.assertEqual(self.rows()[1]["task"], "iteration_summary")
        self.assertAlmostEqual(self.rows()[-1]["guard_cumulative_usd"], .012)
        self.assertEqual(self.rows()[0]["uncached_input_tokens"], 75)
        self.assertNotIn("synthetic-secret", self.file.read_text())
        self.assertNotIn("answer", self.file.read_text())

    def test_stream_content_and_close_preserved_one_receipt(self):
        with self.client() as client:
            with client.chat.completions.create(model="z-ai/glm-5.2", messages=[], stream=True) as stream:
                chunks = list(stream)
        self.assertEqual(chunks[0].choices[0].delta.content, "answer")
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual(self.rows()[0]["cache_read_tokens"], 25)

    def test_summary_enforces_cap_and_blocks_later_requests(self):
        self.guard.early = .005
        with self.client() as client:
            client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
            def handle_max_iterations():
                return client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
            with self.assertRaises(GuardStopped):
                handle_max_iterations()
            with self.assertRaises(GuardStopped):
                client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
        self.assertEqual(len(self.requests), 2)
        self.assertEqual(self.rows()[-1]["task"], "iteration_summary")

    def test_missing_usage_fails_closed(self):
        with self.client() as client, patch.object(self, "response", return_value=httpx.Response(200, json={})):
            # Replace transport too; its callback was previously bound.
            client._client = httpx.Client(transport=httpx.MockTransport(self.response))
            with self.assertRaises(GuardStopped):
                client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
        self.assertEqual(self.rows()[-1]["stop_reason"], "response_usage_missing")

    def test_missing_usage_on_exact_free_route_is_recorded_without_fabricated_tokens(self):
        self.guard.model = "test/model:free"
        with self.client() as client, patch.object(self, "response", return_value=httpx.Response(200, json={})):
            client._client = httpx.Client(transport=httpx.MockTransport(self.response))
            client.chat.completions.create(model="test/model:free", messages=[])
        row = self.rows()[-1]
        self.assertEqual(row["usage_status"], "response_usage_missing")
        self.assertEqual(row["estimated_cost_usd"], 0.0)
        self.assertNotIn("input_tokens", row)
        self.assertIsNone(row["stop_reason"])

    def test_async_chat_stream_and_responses_captured(self):
        async def run():
            async with AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key="synthetic",
                                   http_client=httpx.AsyncClient(transport=httpx.MockTransport(self.response))) as client:
                await client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
                stream = await client.chat.completions.create(model="z-ai/glm-5.2", messages=[], stream=True)
                async with stream:
                    chunks = [c async for c in stream]
                self.assertEqual(chunks[0].choices[0].delta.content, "answer")
                await client.responses.create(model="z-ai/glm-5.2", input="synthetic")
        asyncio.run(run())
        self.assertEqual(len(self.rows()), 3)
        self.assertEqual(self.rows()[-1]["endpoint"], "/responses")

    def test_free_route_blocks_paid_fallback_before_network(self):
        self.guard.model = "test/model:free"
        with self.client() as client:
            with self.assertRaises(GuardStopped):
                client.chat.completions.create(model="z-ai/glm-5.2", messages=[])
        self.assertEqual(self.requests, [])

    def test_unknown_model_inference_endpoint_cannot_bypass_guard(self):
        from openai._models import FinalRequestOptions
        with self.client() as client:
            options = FinalRequestOptions.construct(method='post', url='/responses', json_data={'input': 'synthetic'})
            with self.assertRaises(GuardStopped):
                client.request(dict, options)
        self.assertEqual(self.requests, [])

    def test_provider_exception_is_accounting_unknown_and_stops(self):
        with self.client() as client:
            client._client.close()
            client._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(403, json={'error': {'message': 'synthetic'}})))
            with self.assertRaises(GuardStopped):
                client.chat.completions.create(model='z-ai/glm-5.2', messages=[])
        self.assertEqual(self.rows()[-1]['stop_reason'], 'request_failed_usage_unknown')

    def test_premature_stream_close_without_usage_fails_closed(self):
        with self.client() as client:
            stream = client.chat.completions.create(model='z-ai/glm-5.2', messages=[], stream=True)
            next(stream)
            with self.assertRaises(GuardStopped):
                stream.close()
        self.assertEqual(self.rows()[-1]['stop_reason'], 'response_usage_missing')

    def test_provider_exception_on_free_route_does_not_halt(self):
        self.guard.model = "test/model:free"
        with self.client() as client:
            client._client.close()
            client._client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(503, json={'error': {'message': 'Upstream overloaded'}})))
            with self.assertRaises(Exception) as ctx:
                client.chat.completions.create(model='test/model:free', messages=[])
            self.assertNotIsInstance(ctx.exception, GuardStopped)
        row = self.rows()[-1]
        self.assertEqual(row['usage_status'], 'request_failed_usage_unknown')
        self.assertEqual(row['estimated_cost_usd'], 0.0)
        self.assertIsNone(row.get('stop_reason'))


if __name__ == "__main__":
    unittest.main()
