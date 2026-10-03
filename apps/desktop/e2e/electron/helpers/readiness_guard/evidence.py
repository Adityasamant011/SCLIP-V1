"""Read-only benchmark DB projection. No credential/config/header export."""
import json
import os
import re
import math
import sqlite3
import sys


def clean(text):
    for key, value in os.environ.items():
        if ("KEY" in key or "TOKEN" in key) and value and len(value) >= 8:
            text = text.replace(value, "[REDACTED]")
    return re.sub(r"(?i)(?:bearer\s+[\w.-]+|sk-[\w-]+)", "[REDACTED]", text)


def parsed(value):
    if isinstance(value, str):
        if value.startswith('<untrusted_tool_result '):
            # Hermes wraps external evidence in a fixed trust delimiter. Only
            # decode JSON after its warning/blank line; never export the prose.
            value = value.split('\n\n', 1)[-1].rsplit('\n</untrusted_tool_result>', 1)[0]
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return {}
    return value if isinstance(value, (dict, list)) else {}


def safe_args(value, depth=0):
    value = parsed(value)
    if not isinstance(value, dict) or depth > 6:
        return {}
    result = {}
    for key, item in value.items():
        if not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]{0,60}', key) or re.search(r'key|token|secret|password|auth|header', key, re.I):
            continue
        if key in {"arguments", "plan"}:
            result[key] = safe_args(item, depth + 1)
        elif isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item):
            result[key] = item  # include malformed numeric range aliases too
        elif isinstance(item, dict):
            result[key] = safe_args(item, depth + 1)
        elif key in {"sections", "clips", "mapping"} and isinstance(item, list):
            result[key] = [safe_args(i, depth + 1) for i in item if isinstance(i, dict)][:100]
        elif key in {"layer_ids", "caption_layer_ids", "caption_track_ids"} and isinstance(item, list):
            result[key] = [i for i in item if isinstance(i, str) and re.fullmatch(r"[\da-f-]{36}", i)][:100]
        elif key.endswith("_range_us") and isinstance(item, list):
            result[key] = [i for i in item if isinstance(i, (int, float)) and not isinstance(i, bool) and math.isfinite(i)][:2]
        elif key in {"dry_run", "reapply"} and isinstance(item, bool):
            result[key] = item
        elif key == "media_ids" and isinstance(item, list):
            result[key] = [i for i in item if isinstance(i, str) and re.fullmatch(r"[\da-f-]{36}", i)][:4]
        elif key in {"media_id", "layer_id", "track_id", "composition_id", "audio_layer_id", "link_id", "checkpoint_id"} and isinstance(item, str) and re.fullmatch(r"[\da-f-]{36}", item):
            result[key] = item
        elif key in {"query", "request", "detail", "name", "uri", "kind", "action", "id", "section_id", "plan_clip_id", "status"} and isinstance(item, str):
            result[key] = clean(item)[:2000]
        else:
            result.setdefault('_omitted_fields', []).append(key)
    return result


def bodies(value, depth=0):
    value = parsed(value)
    if depth > 6:
        return
    if isinstance(value, list):
        for part in value:
            yield from bodies(part, depth + 1)
    elif isinstance(value, dict):
        yield value
        for key in ("content", "contents", "text", "result"):
            if key in value:
                yield from bodies(value[key], depth + 1)


def project(db_path):
    db = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    usage = [dict(r) for r in db.execute("SELECT session_id,model,billing_provider,task,api_call_count,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,estimated_cost_usd,actual_cost_usd,cost_status,cost_source FROM session_model_usage")]
    sessions = [{"id": r["id"], "model": r["model"], "reasoning_config": parsed(r["model_config"]).get("reasoning_config")}
                for r in db.execute("SELECT id,model,model_config FROM sessions")]
    tools, results, turn = [], [], 0
    for r in db.execute("SELECT timestamp,role,tool_calls,tool_name,content FROM messages ORDER BY timestamp,id"):
        if r["role"] == "assistant":
            turn += 1
        if r["tool_calls"]:
            for call in parsed(r["tool_calls"]):
                fn = call.get("function", {})
                tools.append({"turn": turn, "timestamp": r["timestamp"], "name": fn.get("name"), "arguments": safe_args(fn.get("arguments"))})
        if r["role"] == "tool":
            result = {"turn": turn, "timestamp": r["timestamp"], "name": r["tool_name"], "response_chars": len(r["content"] or "")}
            for body in bodies(r["content"]):
                if "caption_layer_ids" in body or "mapping" in body:
                    result["mechanics"] = safe_args(body)
                if isinstance(body.get("errors"), list) and "valid" in body:
                    result["plan_validation"] = {"valid": body["valid"],
                        "errors": [clean(e)[:1000] for e in body["errors"] if isinstance(e, str)][:60]}
                transcript = body.get('transcript')
                if not isinstance(transcript, dict) and isinstance(body.get('segments'), list):
                    transcript = body  # original media://.../transcript resource
                if isinstance(transcript, dict):
                    segments = transcript.get("segments", [])
                    result.update({"source_range": body.get("range") or {'start_us': transcript.get('in_us'), 'end_us': transcript.get('out_us')}, "segment_count": len(segments),
                                   "transcript_chars": sum(len(s.get("text", "")) for s in segments),
                                   "transcript_bytes": sum(len(s.get("text", "").encode("utf-8")) for s in segments),
                                   "segment_ranges": [{"start_us": s.get("t_start_us"), "end_us": s.get("t_end_us")} for s in segments]})
                if isinstance(body.get("passages"), list):
                    coverage = []
                    for c in body.get('coverage', []):
                        if isinstance(c, dict):
                            coverage.append({k: safe_args(v) if isinstance(v, dict) else clean(v) if isinstance(v, str) else v
                                             for k, v in c.items() if k in {'media_id', 'status', 'is_full_source', 'cached_range', 'requested_range', 'detail_reference'}})
                    result.update({"coverage": coverage, "status": body.get("status"),
                                   "passages": [{k: clean(v) if isinstance(v, str) else v for k, v in p.items()
                                                 if k in {"id", "media_id", "start_us", "end_us", "text", "preceding", "following", "context_reference", "reference", "judgments"}}
                                                for p in body["passages"]]})
            results.append(result)
    db.close()
    return {"usage": usage, "sessions": sessions, "tool_calls": tools, "tool_results": results}


if __name__ == "__main__":
    print(json.dumps(project(sys.argv[1])))
