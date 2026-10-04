"""Acceptance-only WORKFLOW / LIFECYCLE; no editorial decisions.

Installed inside the original Hermes process before CLI startup. Observes only
existing MCP results; the external Hermes checkout and Phase 3D stay unchanged.
"""
import json
import os
import runpy
from pathlib import Path

NORMAL, HARD = 16, 20


class ReviewContinuation:
    def __init__(self, identity, emit=lambda event: None):
        self.identity, self.emit = identity, emit
        self.state, self.issue = {}, None
        self.extending = self.stopped = False
        self.reason = None

    def stop(self, reason):
        if not self.stopped:
            self.stopped, self.reason = True, reason
            self.emit({'event': 'stop', 'reason': reason, 'issue_id': self.issue})

    def observe(self, state, identity=None):
        if identity is not None and identity != self.identity:
            self.stop('review_identity_changed')
            return
        self.state = state
        if self.extending:
            if self.issue in state.get('outcomes', {}) or not state.get('active_issue') or state.get('phase') == 'done':
                self.stop('issue_closed_or_chain_finished')
            elif state.get('active_issue') != self.issue:
                self.stop('selected_issue_changed')

    def remaining(self, used):
        if self.stopped:
            return 0
        if used < NORMAL:
            return NORMAL - used
        if used >= HARD:
            self.stop('hard_ceiling')
            return 0
        if not self.extending:
            issue = self.state.get('active_issue')
            eligible = (issue and self.state.get('phase') == 'repair'
                        and self.state.get('attempts', {}).get(issue, 0) > 0
                        and self.state.get('verification_pending') is True
                        and issue not in self.state.get('outcomes', {}))
            if not eligible:
                self.stop('normal_ceiling_no_pending_mutated_issue')
                return 0
            self.extending, self.issue = True, issue
            self.emit({'event': 'extension_started', 'issue_id': issue,
                       'normal_ceiling': NORMAL, 'hard_ceiling': HARD,
                       'review_identity': self.identity})
        return HARD - used

    def tool_allowed(self, name, args):
        if not self.extending:
            return True
        if self.stopped or name in ('record_issue', 'validate_rough_cut_review'):
            return False
        if name == 'revision_control':
            action = args.get('action')
            if action in ('begin', 'reground', 'extend_inspection', 'conclude_no_repair', 'finalize'):
                return False
            if action == 'select_issue' and args.get('issue_id') != self.issue:
                return False
        if name == 'withdraw_issue' and args.get('issue_id') != self.issue:
            return False
        return True


def install(controller, budget_class, client_class):
    original_consume, original_call = budget_class.consume, client_class.call_tool
    budget_class.remaining = property(lambda self: controller.remaining(self.used))

    def consume(self):
        if controller.remaining(self.used) <= 0:
            return False
        self.max_total = HARD
        return original_consume(self)

    budget_class.consume = consume
    # Refunded execute_code calls must still count toward this experiment's
    # hard provider-iteration ceiling. No editorial parameter is changed.
    budget_class.refund = lambda self: None

    async def call_tool(self, name, arguments=None, *args, **kwargs):
        arguments = arguments or {}
        if not controller.tool_allowed(name, arguments):
            from mcp.types import CallToolResult, TextContent
            controller.emit({'event': 'tool_blocked', 'tool': name})
            return CallToolResult(isError=True, content=[TextContent(type='text', text='Acceptance continuation permits only the existing selected issue; no new review campaign.')])
        try:
            result = await original_call(self, name, arguments, *args, **kwargs)
        except Exception:
            controller.stop('infrastructure_failure')
            raise
        for block in getattr(result, 'content', []):
            if getattr(block, 'type', None) != 'text':
                continue
            text = block.text.removeprefix('Revision execution state: ')
            try:
                data = json.loads(text)
            except (ValueError, TypeError):
                continue
            if not isinstance(data, dict):
                continue
            state = data.get('review_session', data)
            if isinstance(state, dict) and 'verification_pending' in state and 'active_issue' in state:
                controller.observe(state)
        return result
    client_class.call_tool = call_tool


def main():
    from agent.iteration_budget import IterationBudget
    from mcp.client.session import ClientSession
    from agent import chat_completion_helpers
    path = Path(os.environ['SCLIP_CONTINUATION_EVENTS'])
    def emit(event):
        with path.open('a') as f:
            f.write(json.dumps({'classification': 'WORKFLOW / LIFECYCLE', **event}) + '\n')
    controller = ReviewContinuation(os.environ['SCLIP_MCP_URL'], emit)
    install(controller, IterationBudget, ClientSession)
    # Preserve hard 20: suppress the CLI's extra paid budget-summary inference.
    # This is a harness status, never a model success or repair judgment.
    def ceiling_status(agent, messages, api_call_count):
        controller.stop(controller.reason or 'iteration_ceiling')
        emit({'event': 'ceiling_return', 'iterations': api_call_count,
              'extension_used': max(0, agent.iteration_budget.used - NORMAL),
              'verification_pending': controller.state.get('verification_pending')})
        return 'Acceptance lifecycle stopped; project and observable review state preserved. Harness makes no editorial success claim.'
    chat_completion_helpers.handle_max_iterations = ceiling_status
    try:
        runpy.run_module('hermes_cli.main', run_name='__main__')
    finally:
        controller.stop('hermes_explicit_stop_or_exit')


if __name__ == '__main__':
    main()
