#!/usr/bin/env python3
"""Offline gateway/PTY fixture. Never imports a model client or does inference."""
import json, os, sys
from pathlib import Path
if 'gateway' in sys.argv:
    from http.server import BaseHTTPRequestHandler, HTTPServer
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            self.send_response(200); self.end_headers(); self.wfile.write(b'{"data":[]}')
        def do_POST(self):
            if '/v1/runs' in self.path:
                self.send_response(500); self.end_headers(); self.wfile.write(b'{"error":"Inference forbidden"}'); return
            self.rfile.read(int(self.headers.get('Content-Length', 0)))
            self.send_response(200); self.end_headers(); self.wfile.write(b'{"id":"offline"}')
    HTTPServer(('127.0.0.1', int(os.environ['API_SERVER_PORT'])), Handler).serve_forever()
else:
    home = Path(os.environ['HERMES_HOME'])
    skills = sys.argv[sys.argv.index('--skills') + 1].split(',')
    # Observe what the actual production launcher supplied, not a parallel runtime.
    context = '\n'.join((home / 'skills' / name / 'SKILL.md').read_text() for name in skills if name.startswith('sclip-'))
    result = {'skills': skills, 'context': context, 'home': str(home),
              'continued_session': sys.argv[sys.argv.index('--continue') + 1],
              'config': (home / 'config.yaml').read_text()}
    (Path(os.environ['SCLIP_OFFLINE_PROBE_DIR']) / 'terminal-context.json').write_text(json.dumps(result))
    print('OFFLINE READY ' + '.' * 100, flush=True)
    for line in sys.stdin: print('OFFLINE RECEIVED ' + line.strip() + '.' * 100, flush=True)
