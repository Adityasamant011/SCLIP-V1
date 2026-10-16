"""Fault injection: background model resolution must never download weights."""
import ast
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

class OfflineModelResolution(unittest.TestCase):
    def test_cache_miss_cannot_fall_back_to_network(self):
        source = Path(__file__).with_name('vlm_worker.py')
        tree = ast.parse(source.read_text())
        functions = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_local_model_path']
        scope = {'os': os}
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), scope)
        fake = types.ModuleType('huggingface_hub')
        fake.snapshot_download = Mock(side_effect=FileNotFoundError('not cached'))
        with patch.dict(sys.modules, {'huggingface_hub': fake}):
            with self.assertRaises(FileNotFoundError): scope['_local_model_path']('synthetic/model')
            fake.snapshot_download.assert_called_once_with(repo_id='synthetic/model', local_files_only=True, allow_patterns=['*.json', '*.jsonl', '*.safetensors', '*.py', '*.model', '*.tiktoken', '*.txt', '*.jinja'])
            fake.snapshot_download.reset_mock()
            self.assertEqual(scope['_local_model_path'](str(source.parent)), str(source.parent))
            fake.snapshot_download.assert_not_called()

if __name__ == '__main__': unittest.main()
