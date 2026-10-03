"""Opt-in benchmark observer; no Hermes core or creative behavior changes.

Observe all OpenAI SDK inference requests, including direct limit summaries
and auxiliary calls. Persist numeric usage and the Jev manifest line only.
"""
import inspect
import hashlib
import json
import math
import os
import threading
import time
from urllib.parse import urlparse


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def get(value, key, default=None):
    return value.get(key, default) if isinstance(value, dict) else getattr(value, key, default)


class GuardStopped(RuntimeError):
    pass


class CostGuard:
    def __init__(self, output, stop, model="z-ai/glm-5.2", cap=.15, early=.10):
        self.output, self.stop, self.model = output, stop, model
        self.cap, self.early = cap, early
        self.actual = self.conservative = 0.0
        self.lock = threading.RLock()

    def halt(self, reason):
        self.stop(86)
        raise GuardStopped(reason)  # test callbacks return; os._exit does not

    def preflight(self, model, provider):
        if model != self.model or provider != "openrouter":
            self.record({"task": "route_blocked", "model": model, "provider": provider,
                         "estimated_cost_usd": 0, "stop_reason": "unexpected_model_route"})
        with self.lock:
            if self.actual >= self.cap or self.conservative >= self.early:
                self.halt("budget_already_reached")

    def record(self, row):
        with self.lock:
            actual, estimated = row.get("provider_cost_usd"), row.get("estimated_cost_usd")
            available = [v for v in (actual, estimated) if numeric(v)]
            self.actual += actual if numeric(actual) else 0
            self.conservative += max(available) if available else 0
            reason = row.get("stop_reason")
            if not reason and not available:
                reason = "cost_unavailable"
            elif not reason and self.actual >= self.cap:
                reason = "hard_provider_cost_cap"
            elif not reason and self.conservative >= self.early:
                reason = "early_cost_safety_stop"
            row = {**row, "guard_cumulative_usd": self.conservative, "stop_reason": reason}
            with open(self.output, "a", encoding="utf-8") as stream:
                stream.write(json.dumps(row) + "\n")
                stream.flush()
            if reason:
                self.halt(reason)


def call_role():
    frames = inspect.stack(context=0)
    if any(f.function == "handle_max_iterations" for f in frames):
        return "iteration_summary"
    if any(f.filename.endswith(("conversation_loop.py", "chat_completion_helpers.py")) for f in frames):
        return "main"
    return "auxiliary"


class Receipt:
    def __init__(self, guard, client, options, normalize, price):
        self.guard, self.normalize, self.price = guard, normalize, price
        self.started = time.monotonic()
        self.done, self.raw = False, None
        body = get(options, "json_data", {}) or {}
        apply_test_only_skill_variant(body)
        self.model, self.base_url = body.get("model"), str(client.base_url)
        self.provider = "openrouter" if urlparse(self.base_url).hostname == "openrouter.ai" else "unsupported"
        self.endpoint, self.role = get(options, "url", ""), call_role()
        observe_protocol(body, self.role)
        guard.preflight(self.model, self.provider)
        if self.endpoint not in ("/chat/completions", "/responses"):
            guard.record({"task": self.role, "model": self.model, "provider": self.provider,
                          "stop_reason": "unsupported_inference_endpoint"})
        self.mode = "codex_responses" if self.endpoint == "/responses" else "chat_completions"
        self.api_key = getattr(client, "api_key", None)
        self.manifest = []
        for tool in body.get("tools", []):
            fn = tool.get("function", tool)
            if fn.get("name") == "tool_search":
                self.manifest.extend(line[:180] for line in fn.get("description", "").splitlines()
                                     if line.startswith("- mcp__weftcut__evaluate_source_passages:"))

    def observe(self, value):
        usage = get(value, "usage") or get(get(value, "response", {}), "usage")
        if usage:
            self.raw = usage

    def finish(self, failure=None):
        if self.done:
            return
        self.done = True
        row = {"task": self.role, "model": self.model, "provider": self.provider,
               "endpoint": self.endpoint, "source": "sdk_request_boundary", "jev_manifest": self.manifest,
               "latency_ms": round((time.monotonic() - self.started) * 1000)}
        if failure:
            if self.model.endswith(":free"):
                self.guard.record({**row, "usage_status": failure,
                                   "estimated_cost_usd": 0.0,
                                   "cost_source": "explicit_free_route"})
            else:
                self.guard.record({**row, "stop_reason": failure})
            return
        if self.raw is None:
            if self.model.endswith(":free"):
                # OpenRouter's explicit free route has zero billed inference
                # cost even when an auxiliary response omits token usage.
                # Preserve that observability gap in the receipt rather than
                # misreporting token counts or aborting the editing session.
                self.guard.record({**row, "usage_status": "response_usage_missing",
                                   "estimated_cost_usd": 0.0,
                                   "cost_source": "explicit_free_route"})
            else:
                self.guard.record({**row, "stop_reason": "response_usage_missing"})
            return
        usage = self.normalize(self.raw, provider=self.provider, api_mode=self.mode)
        if self.model.endswith(":free"):
            amount, source = 0.0, "explicit_free_route"
        else:
            result = self.price(self.model, usage, provider=self.provider, base_url=self.base_url, api_key=self.api_key)
            amount = float(result.amount_usd) if result.amount_usd is not None else None
            source = result.source
        actual = get(self.raw, "cost")
        self.guard.record({**row, "input_tokens": usage.prompt_tokens,
                           "uncached_input_tokens": usage.input_tokens,
                           "cache_read_tokens": usage.cache_read_tokens,
                           "cache_write_tokens": usage.cache_write_tokens,
                           "output_tokens": usage.output_tokens, "reasoning_tokens": usage.reasoning_tokens,
                           "provider_cost_usd": actual if numeric(actual) else None,
                           "estimated_cost_usd": amount, "cost_source": source})


class ObservedStream:
    def __init__(self, stream, receipt):
        self.stream, self.receipt, self.iterator = stream, receipt, iter(stream)

    def __getattr__(self, name):
        return getattr(self.stream, name)

    def __iter__(self):
        return self

    def __next__(self):
        try:
            value = next(self.iterator)
        except StopIteration:
            self.receipt.finish()
            raise
        except Exception as exc:
            print(f"[READINESS_GUARD_STREAM_ERR] {type(exc).__name__}: {exc}", flush=True)
            self.receipt.finish("stream_failed_usage_unknown")
            raise
        self.receipt.observe(value)
        return value

    def close(self):
        try:
            self.stream.close()
        finally:
            self.receipt.finish()

    def __enter__(self):
        self.stream.__enter__()
        return self

    def __exit__(self, *args):
        try:
            return self.stream.__exit__(*args)
        finally:
            self.receipt.finish()


class ObservedAsyncStream:
    def __init__(self, stream, receipt):
        self.stream, self.receipt, self.iterator = stream, receipt, stream.__aiter__()

    def __getattr__(self, name):
        return getattr(self.stream, name)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            value = await self.iterator.__anext__()
        except StopAsyncIteration:
            self.receipt.finish()
            raise
        except Exception as exc:
            print(f"[READINESS_GUARD_ASYNC_STREAM_ERR] {type(exc).__name__}: {exc}", flush=True)
            self.receipt.finish("stream_failed_usage_unknown")
            raise
        self.receipt.observe(value)
        return value

    async def close(self):
        try:
            await self.stream.close()
        finally:
            self.receipt.finish()

    async def __aenter__(self):
        await self.stream.__aenter__()
        return self

    async def __aexit__(self, *args):
        try:
            return await self.stream.__aexit__(*args)
        finally:
            self.receipt.finish()


def observe_protocol(body, role):
    """Test-only whitelist of the actual SDK request, never user/source text."""
    output = os.environ.get("SCLIP_READINESS_PROTOCOL_FILE")
    if not output or role != "main" or os.path.exists(output):
        return
    selected = {"tool_search", "tool_describe", "tool_call"}
    tools = []
    for tool in body.get("tools", []):
        fn = tool.get("function", tool)
        if fn.get("name") in selected:
            tools.append({"name": fn.get("name"), "description": fn.get("description"),
                          "parameters": fn.get("parameters")})
    guidance = []
    for message in body.get("messages", []):
        if message.get("role") not in ("system", "developer"):
            continue
        content = message.get("content", "")
        if not isinstance(content, str):
            continue
        lines = content.splitlines()
        for i, line in enumerate(lines):
            if any(term in line.lower() for term in (
                "tool_search", "tool_describe", "tool_call", "weftcut",
                "evaluate_source_passages", "apply_rough_cut_plan",
                "get_media_context", "transcript", "semantic discovery",
            )):
                guidance.append({"line": i + 1, "text": line[:1200]})
    snapshot = {"role": role, "model": body.get("model"), "endpoint": "sdk_request_boundary",
                "test_only_skill_variant": os.environ.get("SCLIP_TEST_ONLY_SKILL_VARIANT"),
                "system_developer_sha256": hashlib.sha256(json.dumps(
                    [m.get("content") for m in body.get("messages", []) if m.get("role") in ("system", "developer")],
                    sort_keys=True, default=str).encode()).hexdigest(),
                "guidance": guidance[:160], "bridge_tools": tools,
                "tool_names": [t.get("function", t).get("name") for t in body.get("tools", [])]}
    with open(output, "x", encoding="utf-8") as stream:
        json.dump(snapshot, stream, indent=2)


def apply_test_only_skill_variant(body):
    """One counterfactual line in disposable model-facing skill context only."""
    variant = os.environ.get("SCLIP_TEST_ONLY_SKILL_VARIANT")
    lines = {
        "deferred-procedure": "Before calling a deferred tool whose structured parameters are not already in context, inspect its complete schema using `tool_describe`.",
        "semantic-tradeoff": "For broad semantic discovery across a long transcript, semantic passage search can reduce full-source scanning; original transcript reads remain available for verification and context.",
    }
    if variant not in lines:
        return
    for message in body.get("messages", []):
        content = message.get("content")
        if message.get("role") == "system" and isinstance(content, str) and "# Driving WeftCut" in content:
            if lines[variant] not in content:
                message["content"] = content + "\n\n[Test-only diagnostic skill note] " + lines[variant]
            return


def install_test_only_deferred_guard():
    """Counterfactual: return schema for missing nested required fields."""
    if os.environ.get("SCLIP_TEST_ONLY_DEFERRED_GUARD") != "1":
        return
    from tools import tool_search
    from tools.registry import registry, tool_error
    original = tool_search.validate_deferred_call_args

    def missing_nested(value, schema, route="arguments"):
        if not isinstance(schema, dict) or not isinstance(value, (dict, list)):
            return []
        if isinstance(value, list):
            return [missing for i, item in enumerate(value)
                    for missing in missing_nested(item, schema.get("items", {}), f"{route}[{i}]")]
        absent = [f"{route}.{key}" for key in schema.get("required", []) if key not in value]
        for key, item in value.items():
            absent.extend(missing_nested(item, schema.get("properties", {}).get(key, {}), f"{route}.{key}"))
        return absent

    def guarded(name, args):
        base = original(name, args)
        if base is not None:
            return base
        definition = registry.get_schema(name)
        if not isinstance(definition, dict):
            return None
        fn = definition.get("function", definition)
        params = fn.get("parameters", {})
        missing = missing_nested(args, params)
        if not missing:
            return None
        return tool_error(
            f"Deferred tool '{name}' was NOT invoked: missing nested required fields: {', '.join(missing[:12])}.",
            parameters=params,
            hint="Load the complete schema with tool_describe before retrying this selected tool.",
        )

    tool_search.validate_deferred_call_args = guarded
    print("SCLIP_TEST_ONLY_DEFERRED_GUARD_ACTIVE", flush=True)


def install_test_only_require_describe():
    """Counterfactual protocol gate after (never before) the agent selects a tool."""
    if os.environ.get("SCLIP_TEST_ONLY_REQUIRE_DESCRIBE") != "1":
        return
    from tools import tool_search
    from tools.registry import registry, tool_error
    described = set()
    original_describe = tool_search.dispatch_tool_describe
    original_validate = tool_search.validate_deferred_call_args

    def observed_describe(args, **kwargs):
        result = original_describe(args, **kwargs)
        if isinstance(args, dict) and isinstance(args.get("name"), str) and '"parameters"' in result:
            described.add(args["name"])
        return result

    def gated(name, args):
        definition = registry.get_schema(name)
        fn = definition.get("function", definition) if isinstance(definition, dict) else {}
        params = fn.get("parameters", {}) if isinstance(fn, dict) else {}
        plan = params.get("properties", {}).get("plan", {})
        # Contract-shape criterion, not a hard-coded editor tool or choice.
        complex_contract = isinstance(plan, dict) and isinstance(plan.get("properties"), dict) and bool(plan.get("required"))
        if complex_contract and name not in described:
            print("SCLIP_TEST_ONLY_DESCRIBE_REQUIRED", name, flush=True)
            return tool_error(
                f"Deferred tool '{name}' was NOT invoked. Its nested plan contract must be loaded with tool_describe first.",
                hint="Call tool_describe with this exact tool name, then retry the selected invocation.",
            )
        return original_validate(name, args)

    tool_search.dispatch_tool_describe = observed_describe
    tool_search.validate_deferred_call_args = gated
    print("SCLIP_TEST_ONLY_REQUIRE_DESCRIBE_ACTIVE", flush=True)


def instrument_sdk(guard, normalize, price, sync_cls, async_cls):
    sync_original, async_original = sync_cls.request, async_cls.request

    def request(self, cast_to, options, **kwargs):
        body = get(options, "json_data", {})
        if (not isinstance(body, dict) or "model" not in body) and get(options, 'url') not in ('/chat/completions', '/responses'):
            return sync_original(self, cast_to, options, **kwargs)
        receipt = Receipt(guard, self, options, normalize, price)
        try:
            response = sync_original(self, cast_to, options, **kwargs)
        except Exception:
            receipt.finish("request_failed_usage_unknown")
            raise
        if kwargs.get("stream"):
            return ObservedStream(response, receipt)
        receipt.observe(response)
        receipt.finish()
        return response

    async def request_async(self, cast_to, options, **kwargs):
        body = get(options, "json_data", {})
        if (not isinstance(body, dict) or "model" not in body) and get(options, 'url') not in ('/chat/completions', '/responses'):
            return await async_original(self, cast_to, options, **kwargs)
        receipt = Receipt(guard, self, options, normalize, price)
        try:
            response = await async_original(self, cast_to, options, **kwargs)
        except Exception:
            receipt.finish("request_failed_usage_unknown")
            raise
        if kwargs.get("stream"):
            return ObservedAsyncStream(response, receipt)
        receipt.observe(response)
        receipt.finish()
        return response

    sync_cls.request, async_cls.request = request, request_async


def install():
    from openai._base_client import SyncAPIClient, AsyncAPIClient
    from agent.usage_pricing import normalize_usage, estimate_usage_cost
    guard = CostGuard(os.environ["SCLIP_READINESS_USAGE_FILE"], os._exit,
                      model=os.environ.get("SCLIP_READINESS_MODEL", "z-ai/glm-5.2"),
                      cap=float(os.environ.get("SCLIP_READINESS_CAP", ".15")),
                      early=float(os.environ.get("SCLIP_READINESS_EARLY_CAP", ".10")))
    instrument_sdk(guard, normalize_usage, estimate_usage_cost, SyncAPIClient, AsyncAPIClient)
    install_test_only_deferred_guard()
    install_test_only_require_describe()
    print("SCLIP_READINESS_COST_GUARD_ACTIVE", flush=True)


if os.environ.get("SCLIP_READINESS_GUARD") == "1":
    try:
        install()
    except Exception:
        print("SCLIP_READINESS_COST_GUARD_SETUP_FAILED", flush=True)
        os._exit(87)
