"""No weights, MLX or model calls: fake generation verifies API metadata."""
import importlib.util
import sys
import types
import unittest
from unittest.mock import patch
from pathlib import Path

class TerminationMetadata(unittest.TestCase):
    def test_generation_tokens_and_legacy_unknown(self):
        source = Path(__file__).with_name('vlm_worker.py')
        tree = __import__('ast').parse(source.read_text())
        fn = next(n for n in tree.body if isinstance(n, __import__('ast').FunctionDef) and n.name == '_run_inference')
        code = compile(__import__('ast').Module(body=[fn], type_ignores=[]), str(source), 'exec')
        fake = types.ModuleType('mlx_vlm'); fake.generate=lambda *a,**k: types.SimpleNamespace(text='synthetic',generation_tokens=12)
        prompts=types.ModuleType('mlx_vlm.prompt_utils');prompts.apply_chat_template=lambda *a,**k:'synthetic prompt'
        utils=types.ModuleType('mlx_vlm.utils');utils.load_config=lambda *a:{}
        scope={'Optional': __import__('typing').Optional,'_model':None,'_processor':None,'_model_id':'synthetic','MODEL_HF_ID':'synthetic','time':__import__('time'),'log':__import__('logging').getLogger('test')}
        exec(code,scope)
        with patch.dict(sys.modules,{'mlx_vlm':fake,'mlx_vlm.prompt_utils':prompts,'mlx_vlm.utils':utils}):
            self.assertEqual(scope['_run_inference'](['fake'],'question',None,12)[2],12)
            fake.generate=lambda *a,**k:'legacy synthetic'
            self.assertIsNone(scope['_run_inference'](['fake'],'question',None,12)[2])
if __name__=='__main__':unittest.main()
