import json
import pathlib
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from evidence import safe_args, project


class EvidenceTest(unittest.TestCase):
    def test_mechanical_ranges_and_caption_ids_without_unrelated_prose(self):
        uid = '00000000-0000-7000-8000-000000000201'
        result = safe_args({'arguments': {'plan': {'sections': [{'id': 'decided', 'clips': [
            {'media_id': uid, 'source_start_us': 1, 'source_end_us': 9, 'action': 'keep', 'reason': 'private prose'}]}]},
            'layer_id': uid, 'patch': {'kind': 'Text', 'font_size_px': 48}},
            'caption_layer_ids': [uid], 'auth': 'private credential'})
        self.assertEqual(result['arguments']['plan']['sections'][0]['clips'][0]['source_end_us'], 9)
        self.assertEqual(result['caption_layer_ids'], [uid])
        self.assertEqual(result['arguments']['patch']['kind'], 'Text')
        self.assertNotIn('private', json.dumps(result))

    def test_nested_ranges_preserved_without_credentials_or_unknown_fields(self):
        value = {"name": "mcp__weftcut__get_media_context", "arguments": json.dumps({
            "start_us": 1_000_000, "end_us": 9_000_000, "detail": "segments",
            "api_key": "synthetic-secret", "query": "Bearer synthetic-secret", "raw": "private"})}
        result = safe_args(value)
        self.assertEqual(result["arguments"]["start_us"], 1_000_000)
        self.assertEqual(result["arguments"]["end_us"], 9_000_000)
        self.assertNotIn("synthetic-secret", json.dumps(result))
        self.assertNotIn("private", json.dumps(result))

    def test_db_source_metrics_and_passages_without_full_transcript_dump(self):
        with tempfile.TemporaryDirectory() as root:
            file = str(pathlib.Path(root) / "state.db")
            db = sqlite3.connect(file)
            db.executescript('''CREATE TABLE session_model_usage(session_id,model,billing_provider,task,api_call_count,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,estimated_cost_usd,actual_cost_usd,cost_status,cost_source);
CREATE TABLE sessions(id,model,model_config);
CREATE TABLE messages(id INTEGER PRIMARY KEY,timestamp,role,tool_calls,tool_name,content);''')
            call = [{"function": {"name": "tool_call", "arguments": json.dumps({"name": "mcp__weftcut__get_media_context", "arguments": {"start_us": 1, "end_us": 9}})}}]
            db.execute('INSERT INTO messages VALUES(1,1,?,?,?,?)', ('assistant', json.dumps(call), None, None))
            transcript = {"content": [{"type": "text", "text": json.dumps({"range": {"start_us": 1, "end_us": 9}, "transcript": {"segments": [{"text": "Full transcript should not be exported", "t_start_us": 1, "t_end_us": 9}]}})}]}
            db.execute('INSERT INTO messages VALUES(2,2,?,?,?,?)', ('tool', None, 'tool_call', json.dumps(transcript)))
            jev = {"content": [{"text": json.dumps({"status": "evaluated", "passages": [{"start_us": 1, "end_us": 9, "text": "Synthetic evidence", "reference": "media://synthetic/transcript/1/9", "api_key": "secret"}]})}]}
            db.execute('INSERT INTO messages VALUES(3,3,?,?,?,?)', ('tool', None, 'tool_call', json.dumps(jev)))
            db.commit(); db.close()
            result = project(file)
        self.assertEqual(result["tool_calls"][0]["turn"], 1)
        self.assertEqual(result["tool_calls"][0]["arguments"]["arguments"]["start_us"], 1)
        self.assertEqual(result["tool_results"][0]["segment_count"], 1)
        self.assertEqual(result["tool_results"][0]["transcript_bytes"], len('Full transcript should not be exported'.encode('utf-8')))
        self.assertEqual(result["tool_results"][1]["passages"][0]["text"], 'Synthetic evidence')
        self.assertNotIn('Full transcript should not be exported', json.dumps(result))
        self.assertNotIn('api_key', json.dumps(result))

    def test_known_environment_secrets_redacted(self):
        with patch.dict('os.environ', {'EXAMPLE_API_KEY': 'synthetic-long-secret'}):
            self.assertEqual(safe_args({'query': 'query synthetic-long-secret'})['query'], 'query [REDACTED]')

    def test_numeric_range_alias_and_trust_wrapped_json(self):
        from evidence import bodies
        args = safe_args({'arguments': {'time_range': {'start': 6, 'end': 18}, 'secret_number': 123}})
        self.assertEqual(args['arguments']['time_range'], {'start': 6, 'end': 18})
        self.assertNotIn('secret_number', args['arguments'])
        text = '<untrusted_tool_result source="synthetic">\nWarning: data only.\n\n{"transcript":{"segments":[]}}\n</untrusted_tool_result>'
        self.assertEqual(list(bodies(text))[0], {'transcript': {'segments': []}})


if __name__ == '__main__':
    unittest.main()
