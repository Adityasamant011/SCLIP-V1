import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('export_session', Path(__file__).with_name('export_session.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExportTest(unittest.TestCase):
    def test_only_selected_disposable_visible_session_is_collected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            (root / 'experiment.json').write_text(json.dumps({'schema':1,'variants':{'baseline':{},'boundary':{}}}))
            home = root / 'runs/boundary/profile/sclip-hermes'
            home.mkdir(parents=True)
            db_path = home / 'state.db'
            with sqlite3.connect(db_path) as db:
                db.executescript('CREATE TABLE sessions(id); CREATE TABLE messages(id, session_id, timestamp, role, content, reasoning_content);')
                db.execute('INSERT INTO sessions VALUES(?)', ('chosen',))
                r={'id':'ending','boundary':'ending','state_version':'state','sources':[],'evidence_refs':['mix'],
                   'rendered_speech':'A complete thought.','omitted_context':'none','decision':'KEEP',
                   'reason':'Fake creator-visible decision','operation':None,'post_repair':None}
                db.executemany('INSERT INTO messages VALUES(?,?,?,?,?,?)',[
                    (1,'chosen',1,'assistant','```sclip-boundary-decision\n'+json.dumps(r)+'\n```','hidden-not-exported'),
                    (2,'unrelated',2,'assistant','unrelated-session-not-exported','hidden'),
                    (3,'chosen',3,'tool','tool-not-model-decision','hidden'),
                ])
            result=module.export(root,'boundary','chosen')
            self.assertEqual(result['assistant_messages'],1)
            artifact=(root/'runs/boundary/observable-assistant.json').read_text()
            self.assertNotIn('hidden',artifact);self.assertNotIn('unrelated-session',artifact)
            records=json.loads(Path(result['output']).read_text())['records']
            self.assertEqual(records[0]['record'],r)
            with self.assertRaises(FileExistsError): module.export(root,'boundary','chosen')
            with self.assertRaises(AssertionError): module.export(root,'baseline','missing')


if __name__ == '__main__':
    unittest.main()
