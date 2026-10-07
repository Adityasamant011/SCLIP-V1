"""Acceptance-only telemetry around the existing callback; no answers or decisions."""
import functools
import json
import time


def install_clarify_observer(cli_module, resolve_timeout, emit=None):
    emit = emit or (lambda event: print('SCLIP_ACCEPTANCE_EVENT ' + json.dumps(event), flush=True))
    original = cli_module.HermesCLI._clarify_callback

    @functools.wraps(original)
    def observed(self, *args, **kwargs):
        # Same shared resolver and actual CLI_CONFIG used by the callback now,
        # not a config file guess, default, or benchmark override.
        timeout = resolve_timeout(cli_module.CLI_CONFIG)
        started = time.monotonic()
        common = {'session_id': self.session_id, 'effective_timeout_s': timeout}
        emit({'event': 'clarify_waiting', **common})
        try:
            result = original(self, *args, **kwargs)
        except BaseException:
            emit({'event': 'clarify_returned', **common, 'outcome': 'interrupted',
                  'elapsed_s': time.monotonic() - started})
            raise
        emit({'event': 'clarify_returned', **common, 'outcome': 'returned',
              'elapsed_s': time.monotonic() - started})
        return result

    cli_module.HermesCLI._clarify_callback = observed
