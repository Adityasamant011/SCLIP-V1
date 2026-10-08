"""Existing Hermes file memory, synthetic temporary home; no agent/inference."""
import json
import os
from pathlib import Path
import socket
import sys
import tempfile

source = Path('/Users/adityasamant/SCLIP/hermes-agent-src')
output = Path(__file__).with_name('native-memory-probe-results.json')
calls = []
def forbidden(*args, **kwargs):
    calls.append('network')
    raise RuntimeError('Network forbidden in memory probe')
socket.create_connection = forbidden
socket.socket.connect = forbidden
with tempfile.TemporaryDirectory(prefix='sclip-native-memory-research-') as home:
    os.environ['HERMES_HOME'] = home
    sys.path.insert(0, str(source))
    from tools.memory_tool import MemoryStore
    text = 'Synthetic creator prefers restrained typography.'
    first = MemoryStore()
    first.load_from_disk()
    assert first.add('user', text)['success']
    assert not first.format_for_system_prompt('user')
    restarted = MemoryStore()
    restarted.load_from_disk()
    assert text in restarted.format_for_system_prompt('user')
    duplicate = restarted.add('user', text)
    assert duplicate['success']
    assert len(restarted.user_entries) == 1
    assert restarted.remove('user', text)['success']
    assert not restarted.user_entries
    assert text in restarted.format_for_system_prompt('user')
    fresh = MemoryStore()
    fresh.load_from_disk()
    assert not fresh.format_for_system_prompt('user')
    assert fresh.apply_batch('user', [
        {'action':'add','content':'Synthetic old preference'},
        {'action':'replace','old_text':'Synthetic old preference','content':'Synthetic revised preference'},
    ])['success']
    prior = list(fresh.user_entries)
    rejected = fresh.apply_batch('user', [
        {'action':'add','content':'Synthetic extra'},
        {'action':'remove','old_text':'Nonexistent entry'},
    ])
    assert not rejected['success']
    assert fresh.user_entries == prior
    results = {
        'source':str(source), 'temporary_home_only':True, 'model_calls':0,
        'network_attempts':len(calls), 'persistent_reload':'PASS',
        'exact_duplicate_prevention':'PASS', 'atomic_memory_batch':'PASS',
        'removed_text_remains_in_loaded_prompt_snapshot':True,
        'new_instance_excludes_removed_text':True,
        'limits':{'memory_characters':first.memory_char_limit,'user_characters':first.user_char_limit},
        'scope_limit':'Home-scoped free text; no Sclip structured provenance in native records',
    }
    output.write_text(json.dumps(results, indent=2)+'\n')
    print(json.dumps(results, indent=2))
