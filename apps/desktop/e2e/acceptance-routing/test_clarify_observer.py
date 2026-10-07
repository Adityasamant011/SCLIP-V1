import unittest
from types import SimpleNamespace
from tools.clarify_gateway import resolve_clarify_timeout
from clarify_observer import install_clarify_observer

class ObserverTests(unittest.TestCase):
    def test_reads_effective_runtime_config_at_entry_and_preserves_callback(self):
        calls=[]
        class FakeCLI:
            session_id='same-session'
            def _clarify_callback(self,*args,**kwargs):
                calls.append((args,kwargs))
                return 'original-timeout-result'
        runtime=SimpleNamespace(HermesCLI=FakeCLI,CLI_CONFIG={'agent':{'clarify_timeout':120}})
        events=[];install_clarify_observer(runtime,resolve_clarify_timeout,events.append)
        # Configuration changed after observer installation: read actual current value.
        runtime.CLI_CONFIG['clarify']={'timeout':7}
        self.assertEqual(FakeCLI()._clarify_callback('arbitrary creative question',choices=['A','B']),'original-timeout-result')
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0],(('arbitrary creative question',),{'choices':['A','B']}))
        self.assertEqual([e['event'] for e in events],['clarify_waiting','clarify_returned'])
        self.assertTrue(all(e['effective_timeout_s']==7 for e in events))
        self.assertTrue(all(e['session_id']=='same-session' for e in events))
        self.assertNotIn('question',events[0])

    def test_effective_120_and_unlimited_are_not_reinterpreted(self):
        self.assertEqual(resolve_clarify_timeout({'agent':{'clarify_timeout':120}}),120)
        self.assertEqual(resolve_clarify_timeout({'agent':{'clarify_timeout':0}}),0)

    def test_exception_is_preserved_and_observed_without_answer(self):
        class FakeCLI:
            session_id='same-session'
            def _clarify_callback(self,*args,**kwargs):
                raise ValueError('original failure')
        runtime=SimpleNamespace(HermesCLI=FakeCLI,CLI_CONFIG={'agent':{'clarify_timeout':120}})
        events=[];install_clarify_observer(runtime,resolve_clarify_timeout,events.append)
        with self.assertRaisesRegex(ValueError,'original failure'):
            FakeCLI()._clarify_callback('question')
        self.assertEqual(events[-1]['outcome'],'interrupted')

if __name__=='__main__':
    unittest.main()
