#!/usr/bin/env python3
"""Deterministic PTY fixture; never imports Hermes or calls a model."""
import json
import os
import sys
import termios

attrs = termios.tcgetattr(sys.stdin)
attrs[3] &= ~termios.ECHO
termios.tcsetattr(sys.stdin, termios.TCSANOW, attrs)

def send(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)
    print("." * 100, flush=True)  # Drain the production redactor's small tail.

send({"ready": True, "background": os.environ.get("HERMES_TUI_BACKGROUND"), "credential": os.environ.get("OPENROUTER_API_KEY")})
for line in sys.stdin:
    size = os.get_terminal_size()
    send({"input": line.rstrip("\n"), "cols": size.columns, "rows": size.lines})
