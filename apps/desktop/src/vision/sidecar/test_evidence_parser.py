"""Exercise the production function without importing/loading the VLM/server."""
import ast
import re
import unittest
from pathlib import Path
from typing import Optional

tree = ast.parse(Path(__file__).with_name('vlm_worker.py').read_text())
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_parse_response')
scope = {'re': re, 'Optional': Optional}
exec(compile(ast.Module(body=[function], type_ignores=[]), 'vlm_worker.py', 'exec'), scope)
parse = scope['_parse_response']


class EvidenceParserTest(unittest.TestCase):
    def test_does_not_invent_confidence(self):
        for text in ['Face is visible.', 'a' * 500, 'ERROR timeout', '']:
            self.assertIsNone(parse(text, '')['confidence'])

    def test_contradiction_is_unknown(self):
        result = parse('The face is visible but the face is not visible.', '')
        self.assertIsNone(result['subject_visible'])

    def test_negations(self):
        result = parse('The speaker is not centered. No face is visible. No caption is visible.', '')
        self.assertFalse(result['subject_visible'])
        self.assertIsNone(result['subject_position'])
        self.assertEqual(result['visible_content'], [])
        self.assertFalse(parse('The speaker is not properly framed.', '')['framing_ok'])

    def test_positive_subject_claim_not_full_head_proof(self):
        result = parse('The speaker is centered. The face is visible and well framed.', '')
        self.assertTrue(result['subject_visible'])
        self.assertEqual(result['subject_position'], 'center')
        self.assertTrue(result['framing_ok'])
        self.assertNotIn('head_complete', result)

    def test_unrelated_and_contradictory_positions(self):
        self.assertIsNone(parse('A centered title. The face is not visible.', '')['subject_position'])
        self.assertIsNone(parse('The speaker is upper left. The speaker is lower right.', '')['subject_position'])
        self.assertIsNone(parse('The face is visible, but it is cropped. Good framing.', '')['framing_ok'])
        self.assertEqual(parse('The head is visible.', '')['visible_content'], ['head'])


if __name__ == '__main__':
    unittest.main()
