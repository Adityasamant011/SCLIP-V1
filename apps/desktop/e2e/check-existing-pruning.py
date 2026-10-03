"""Local regression of the installed compressor, not a new context engine.

Usage: Hermes python e2e/check-existing-pruning.py /path/to/hermes-source
Synthetic disposable SQLite only; network denied; no production settings changed.
"""
import copy
import json
import socket
import sqlite3
import sys
import tempfile
from pathlib import Path

def deny_network(*args, **kwargs):
    raise RuntimeError("Network disabled for offline pruning validation")

socket.socket.connect = deny_network
socket.create_connection = deny_network
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
from agent.context_compressor import ContextCompressor, _estimate_msg_budget_tokens
from hermes_state import SessionDB

def compressor(threshold, db, session):
    c = ContextCompressor(model="z-ai/glm-5.2", config_context_length=1048576,
        proactive_prune_tokens=threshold, protect_first_n=2, protect_last_n=20,
        proactive_prune_min_result_chars=8000, proactive_prune_min_reclaim_tokens=4096,
        quiet_mode=True)
    # Fail if the supposedly deterministic path calls a summarizer.
    c._generate_summary = deny_network
    c.bind_session_state(db, session)
    return c

history = [{"role": "user", "content": "Preserve the source message; no outside media. Work remains unfinished."}]
for i in range(32):
    name = "skill_view" if i == 30 else "mcp__weftcut__get_media_context"
    content = (f"source-window-{i}: exact synthetic evidence. " * 3000) if i < 18 else f"Recent evidence {i}; current layer id L-{i}; next action belongs to Hermes."
    if name == "skill_view":
        content = "# weftcut\nKeep awareness of the whole user goal. Choose your own order. " * 200
    history.extend([
        {"role": "assistant", "content": "", "tool_calls": [{"id": f"call_{i}", "type": "function", "function": {"name": name, "arguments": '{"name":"weftcut"}' if name == "skill_view" else json.dumps({"media_id": "source-id", "start_us": i * 1000000})}}]},
        {"role": "tool", "tool_call_id": f"call_{i}", "name": name, "content": content},
    ])

reports = []
with tempfile.TemporaryDirectory(prefix="sclip-pruning-validation-") as tmp:
    for threshold in [48000, 80000, 120000]:
        db_path = Path(tmp) / f"{threshold}.db"
        db = SessionDB(db_path=db_path)
        session = f"synthetic-prune-{threshold}"
        db.create_session(session, source="tool", model_config={"model": "z-ai/glm-5.2", "unchanged": "sentinel"})
        db.append_messages_batch(session, copy.deepcopy(history))
        before = db.get_messages_as_conversation(session)
        c = compressor(threshold, db, session)
        after, count = c.prune_tool_results_only(before, current_tokens=180000)
        assert count > 0, "Fixture must exercise a committed prune"
        assert len(before) == len(after)
        assert before[0]["content"] == after[0]["content"]
        assert [(m.get("role"), m.get("content"), m.get("tool_calls"), m.get("tool_call_id")) for m in before[-20:]] == [(m.get("role"), m.get("content"), m.get("tool_calls"), m.get("tool_call_id")) for m in after[-20:]]
        assert [m.get("tool_call_id") for m in before] == [m.get("tool_call_id") for m in after]
        assert [m.get("tool_calls") for m in before] == [m.get("tool_calls") for m in after]
        archived = db.get_messages(session, include_compacted=True)
        assert any(m["content"] == history[2]["content"] for m in archived), "Original evidence must remain recoverable"
        db.close()
        resumed_db = SessionDB(db_path=db_path)
        resumed = compressor(threshold, resumed_db, session)
        loaded = resumed_db.get_messages_as_conversation(session)
        assert [m["content"] for m in loaded] == [m["content"] for m in after]
        assert resumed._proactive_prune_rearm_tokens == c._proactive_prune_rearm_tokens
        again, second_count = resumed.prune_tool_results_only(loaded, current_tokens=1000000)
        assert again is loaded and second_count == 0
        config = json.loads(resumed_db.get_session(session)["model_config"])
        assert config["unchanged"] == "sentinel" and config["model"] == "z-ai/glm-5.2"
        resumed_db.close()
        reports.append({"threshold": threshold, "pruned_results": count, "pairing": "PASS", "recent_evidence_and_skill": "PASS", "user_goal": "PASS", "archive_recovery": "PASS", "sqlite_restart": "PASS", "rearm": "PASS"})
print(json.dumps({"results": reports, "model_calls": 0, "production_settings_changed": False, "selected_threshold": None, "note": "Mechanical preservation only; net billed savings and agent recall/completion require the later matched test."}, indent=2))

# Optional saved-session replay: source DB is opened read-only; all archive and
# resume writes happen in disposable SQLite. Never print source/chat content.
# Args: Hermes source, historical DB, session ID, forensic report with call table.
if len(sys.argv) == 5:
    source_db = sqlite3.connect(Path(sys.argv[2]).resolve().as_uri() + '?mode=ro', uri=True)
    rows = source_db.execute('SELECT role,content,tool_call_id,tool_calls,tool_name FROM messages WHERE session_id=? ORDER BY id', (sys.argv[3],)).fetchall()
    source_db.close()
    original = []
    for role, content, tool_call_id, tool_calls, tool_name in rows:
        msg = {'role': role, 'content': content or ''}
        if tool_call_id: msg['tool_call_id'] = tool_call_id
        if tool_calls: msg['tool_calls'] = json.loads(tool_calls)
        if tool_name: msg['name'] = tool_name
        original.append(msg)
    usage = {}
    for line in Path(sys.argv[4]).read_text().splitlines():
        cells = [x.strip() for x in line.split('|')]
        if len(cells) == 11 and cells[1].isdigit():
            usage[int(cells[1])] = int(cells[3].replace(',', ''))
    assert len(usage) == sum(m['role'] == 'assistant' for m in original), 'Historical usage/message counts must match'
    budget = lambda msgs: sum(_estimate_msg_budget_tokens(m) for m in msgs)
    tool_arguments = {}
    for msg in original:
        for call_info in msg.get('tool_calls') or []:
            try:
                args = json.loads(call_info['function'].get('arguments', '{}'))
                # Bounded source references only; no arbitrary tool arguments,
                # transcript bodies, prompts, config or credentials in reports.
                tool_arguments[call_info['id']] = {k: v for k, v in args.items()
                    if k in ['start_us', 'end_us', 'in_us', 'out_us'] and isinstance(v, int)}
            except (ValueError, KeyError, AttributeError):
                pass
    historical = []
    with tempfile.TemporaryDirectory(prefix='sclip-historical-prune-') as tmp:
        for threshold in [48000, 80000, 120000]:
            db_path = Path(tmp) / f'{threshold}.db'
            db = SessionDB(db_path=db_path)
            session = f'historical-copy-{threshold}'
            db.create_session(session, source='tool', model_config={'model': 'z-ai/glm-5.2', 'unchanged': 'sentinel'})
            c = compressor(threshold, db, session)
            history, events, call, removed, cumulative_reduction = [], [], 0, 0, 0
            for msg in original:
                if msg['role'] == 'assistant':
                    call += 1
                    candidate_input = max(0, usage[call] - removed)
                    before = copy.deepcopy(history)
                    history, count = c.prune_tool_results_only(history, current_tokens=candidate_input)
                    if count:
                        # Durable archive commits annotate every message with a
                        # private persistence flag; that is NOT a wire rewrite.
                        wire = lambda m: {k: m[k] for k in ['role', 'content', 'tool_calls', 'tool_call_id', 'name'] if k in m}
                        changed = [i for i, (a, b) in enumerate(zip(before, history)) if wire(a) != wire(b)]
                        assert len(before) == len(history)
                        # Hermes's documented lossless duplicate-result pass
                        # can replace a recent duplicate by a reference. Unique
                        # recent evidence must remain byte-identical.
                        recent_dedup = 0
                        recent_unique_changes = []
                        for a, b in zip(before[-20:], history[-20:]):
                            if wire(a) != wire(b):
                                if a['role'] == 'tool' and any(m.get('content') == a['content'] for m in history):
                                    recent_dedup += 1
                                else:
                                    recent_unique_changes.append({'role': a['role'], 'tool': a.get('name'),
                                        'before_chars': len(a['content']), 'after_chars': len(b['content'])})
                        assert [m.get('tool_call_id') for m in before] == [m.get('tool_call_id') for m in history]
                        assert all(a['content'] == b['content'] for a, b in zip(before, history) if a['role'] in ['user', 'assistant'])
                        reclaimed = budget(before) - budget(history)
                        removed += reclaimed
                        # Old unique evidence is no longer in active model context,
                        # even though its full archived body remains recoverable.
                        names = [before[i].get('name', '') for i in changed]
                        events.append({'before_call': call, 'input_before_proxy': candidate_input,
                            'input_after_proxy': max(0, candidate_input - reclaimed), 'results_changed': count,
                            'tool_names': names, 'reclaimed_message_tokens_proxy': reclaimed,
                            'rewritten_source_windows': [tool_arguments.get(before[i].get('tool_call_id'), {}) for i in changed if 'media_context' in before[i].get('name', '')],
                            'recent_lossless_duplicate_references': recent_dedup,
                            'recent_unique_changes': recent_unique_changes,
                            'source_result_refetch_risk_count': sum('media_context' in n or 'read_resource' in n for n in names),
                            'earliest_rewritten_message': min(changed),
                            'prefix_suffix_refill_tokens_proxy': budget(history[min(changed):]),
                            'note': 'Provider prefix before this message may survive; rewritten suffix must refill. Static prompt/tools/cache policy unmodeled.'})
                    cumulative_reduction += removed
                history.append(copy.deepcopy(msg))
                db.append_messages_batch(session, [copy.deepcopy(msg)])
            loaded = db.get_messages_as_conversation(session)
            assert [m['content'] for m in loaded] == [m['content'] for m in history]
            archived = db.get_messages(session, include_compacted=True)
            assert all(any(a['content'] == m['content'] for a in archived) for m in original)
            db.close()
            resumed_db = SessionDB(db_path=db_path)
            resumed = compressor(threshold, resumed_db, session)
            assert resumed._proactive_prune_rearm_tokens == c._proactive_prune_rearm_tokens
            assert [m['content'] for m in resumed_db.get_messages_as_conversation(session)] == [m['content'] for m in history]
            resumed_db.close()
            historical.append({'threshold': threshold, 'first_prune_call': events[0]['before_call'] if events else None,
                'events': events, 'final_message_tokens_proxy_before': budget(original),
                'final_message_tokens_proxy_after': budget(history),
                'cumulative_input_reduction_proxy': cumulative_reduction,
                'cache_read_reduction_if_removed_tokens_were_cached_proxy': cumulative_reduction,
                'one_time_rewritten_suffix_refill_proxy': sum(e['prefix_suffix_refill_tokens_proxy'] for e in events),
                'pairing_user_assistant_archive_resume': 'PASS',
                'unique_recent_evidence_preserved': not any(e['recent_unique_changes'] for e in events)})
    print(json.dumps({'historical_replay': historical, 'main_calls_in_saved_run': len(usage),
        'model_calls': 0, 'selected_threshold': None, 'production_profile_changed': False,
        'billed_savings': None, 'refetches_and_source_reasoning': 'NOT MEASURED: edited agent behavior cannot be replayed offline',
        'interpretation': 'Counterfactual token proxies only. Pruning removes active original evidence and breaks prefix caches; no threshold accepted without measured net cost and recall.'}, indent=2))
