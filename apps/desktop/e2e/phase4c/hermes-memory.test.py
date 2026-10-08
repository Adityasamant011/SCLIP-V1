"""Exercise installed Hermes persistence, without constructing a model client."""
import json, os, subprocess, tempfile, unittest
from pathlib import Path
import socket
socket.create_connection = lambda *a, **k: (_ for _ in ()).throw(AssertionError('network forbidden'))
from tools.memory_tool import MemoryStore
from agent.memory_manager import MemoryManager
from agent.style_memory_provider import SclipStyleMemoryProvider

class InstalledMemory(unittest.TestCase):
    def test_restart_update_remove_and_profile_isolation(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ['HERMES_HOME'] = directory
            store = MemoryStore(); store.load_from_disk()
            self.assertTrue(store.add('user', 'Prefer direct edits, with pauses before revelations.')['success'])
            self.assertNotIn('revelations', store.format_for_system_prompt('user') or '') # frozen session snapshot
            reopened = MemoryStore(); reopened.load_from_disk()
            self.assertIn('revelations', reopened.format_for_system_prompt('user'))
            code = "from tools.memory_tool import MemoryStore; s=MemoryStore(); s.load_from_disk(); print(s.format_for_system_prompt('user'))"
            restarted = subprocess.check_output([os.sys.executable, '-c', code], env=os.environ, text=True)
            self.assertIn('revelations', restarted)
            self.assertTrue(reopened.replace('user', 'Prefer direct edits', 'Prefer energetic editing for this series.')['success'])
            updated = MemoryStore(); updated.load_from_disk()
            self.assertNotIn('revelations', updated.format_for_system_prompt('user'))
            os.environ['HERMES_HOME'] = str(Path(directory) / 'other-creator')
            other = MemoryStore(); other.load_from_disk()
            self.assertFalse(other.format_for_system_prompt('user'))
            os.environ['HERMES_HOME'] = directory
            self.assertTrue(updated.remove('user', 'energetic')['success'])
            cleared = MemoryStore(); cleared.load_from_disk()
            self.assertFalse(cleared.format_for_system_prompt('user'))

    def test_native_style_provider_prefetch_is_offline_but_not_creator_scoped(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ['HERMES_HOME'] = directory
            memories = Path(directory) / 'memories'; memories.mkdir()
            (memories / 'creator-style-profile.json').write_text(json.dumps({'rules': [{'id':'synthetic', 'category':'caption','targetProperty':'fontSize','value':72,'confidence':.7,'scope':{'aspectRatio':'16:9'},'projectsObserved':['one','two']}]}))
            (Path(directory) / 'active_project.json').write_text(json.dumps({'projectId':'new-project','metadata':{'aspectRatio':'16:9'}}))
            provider = SclipStyleMemoryProvider(); provider.initialize('different-session', hermes_home=directory)
            manager = MemoryManager(); manager.add_provider(provider)
            self.assertIn('72', manager.prefetch_all('Edit this footage'))
            # The installed schema has no creator id, project/series override, evidence IDs or counterexamples.
            self.assertIn('adhere', provider.system_prompt_block())
            manager.shutdown_all()

if __name__ == '__main__': unittest.main()
