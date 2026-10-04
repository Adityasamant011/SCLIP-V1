import asyncio
import json
import sys
import unittest
from review_continuation import ReviewContinuation, install

sys.path.insert(0, '/Users/adityasamant/SCLIP/hermes-agent-src')
from agent.iteration_budget import IterationBudget
from mcp.types import CallToolResult, TextContent


def pending():
    return dict(active_issue='synthetic-issue', phase='repair', verification_pending=True,
                attempts={'synthetic-issue': 1}, outcomes={})


class ContinuationTests(unittest.TestCase):
    def controller(self, state=None):
        c = ReviewContinuation('synthetic-review')
        c.observe(state or pending())
        return c

    def test_A_no_mutation_stops(self):
        s = pending(); s['attempts'] = {}
        self.assertEqual(self.controller(s).remaining(16), 0)

    def test_B_resolved_or_already_verified_has_no_extension(self):
        for field, value in [('outcomes', {'synthetic-issue': 'resolved'}), ('verification_pending', False), ('active_issue', None)]:
            s = pending(); s[field] = value
            self.assertEqual(self.controller(s).remaining(16), 0)

    def test_C_pending_mutated_issue_extends(self):
        c = self.controller()
        self.assertEqual(c.remaining(16), 4)
        self.assertEqual(c.issue, 'synthetic-issue')

    def test_D_four_extra_hard_ceiling_with_real_counter(self):
        class Budget(IterationBudget): pass
        class Client:
            async def call_tool(self, name, arguments=None): pass
        c = self.controller(); install(c, Budget, Client)
        b = Budget(20)
        for i in range(20):
            self.assertTrue(b.consume()); b.refund()
        self.assertFalse(b.consume()); self.assertEqual(b.used, 20)
        self.assertEqual(b.remaining, 0)

    def test_E_resolved_stops_immediately(self):
        c = self.controller(); c.remaining(16)
        s = pending(); s.update(active_issue=None, verification_pending=False, outcomes={'synthetic-issue':'resolved'})
        c.observe(s); self.assertEqual(c.remaining(17), 0)
        self.assertFalse(c.tool_allowed('trim_layer', {'new_t_us':123}))

    def test_F_explicit_incomplete_or_stop(self):
        for reason in ['hermes_explicit_stop_or_exit', 'hermes_incomplete']:
            c = self.controller(); c.remaining(16); c.stop(reason)
            self.assertEqual(c.remaining(17), 0)
        c = self.controller(); c.remaining(16)
        s = pending(); s.update(active_issue=None, outcomes={'synthetic-issue':'unresolved'})
        c.observe(s); self.assertEqual(c.remaining(17), 0)

    def test_G_new_issue_and_campaign_blocked(self):
        c = self.controller(); c.remaining(16)
        self.assertFalse(c.tool_allowed('record_issue', {}))
        self.assertFalse(c.tool_allowed('revision_control', {'action':'select_issue','issue_id':'other'}))
        self.assertFalse(c.tool_allowed('revision_control', {'action':'begin'}))

    def test_H_identity_stays_same_or_fails_closed(self):
        c = self.controller(); c.remaining(16); c.observe(pending(), 'synthetic-review')
        self.assertEqual(c.remaining(17), 3)
        c.observe(pending(), 'other-review'); self.assertEqual(c.remaining(17), 0)

    def test_I_choices_preserved_not_generated(self):
        c = self.controller(); c.remaining(16)
        for tool, args in [('trim_layer', {'new_t_us':123}), ('update_layer_params', {'patch':{'src_in_us':456}}), ('render_timeline_range', {'start_us':789})]:
            before = json.dumps(args); self.assertTrue(c.tool_allowed(tool,args)); self.assertEqual(json.dumps(args),before)
        self.assertEqual(c.state, pending())
        self.assertNotIn('repair', c.__dict__)

    def test_J_real_mcp_result_adapter_and_same_loop(self):
        calls=[]
        class Budget(IterationBudget): pass
        class Client:
            async def call_tool(self,name,arguments=None):
                calls.append((name,arguments))
                state=pending()
                if name=='finish':state.update(active_issue=None,verification_pending=False,outcomes={'synthetic-issue':'resolved'})
                return CallToolResult(content=[TextContent(type='text',text='Revision execution state: '+json.dumps(state))])
        c=ReviewContinuation('synthetic-review'); install(c,Budget,Client)
        b=Budget(20); client=Client()
        for _ in range(16): self.assertTrue(b.consume())
        asyncio.run(client.call_tool('mutate', {'synthetic':True}))
        self.assertEqual(b.remaining,4)
        blocked=asyncio.run(client.call_tool('record_issue',{}))
        self.assertTrue(blocked.is_error);self.assertEqual(len(calls),1)
        self.assertTrue(b.consume());asyncio.run(client.call_tool('finish'))
        self.assertEqual(b.remaining,0);self.assertEqual(b.used,17)

    def test_K_evidence_does_not_auto_resolve(self):
        c=self.controller();c.remaining(16)
        s=pending();s['verification_pending']=False;c.observe(s)
        self.assertEqual(c.remaining(17),3)
        self.assertEqual(c.state['outcomes'],{})
        self.assertTrue(c.tool_allowed('revision_control',{'action':'finish_issue','status':'unresolved'}))


if __name__ == '__main__': unittest.main()
