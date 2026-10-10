"""Read visible assistant content from ONE prepared disposable session; never reasoning.

No provider imports, no inference, no personal Hermes database access.
"""
import argparse
import json
from pathlib import Path
import sqlite3
import subprocess


def export(root, variant, session_id):
    if variant not in ('baseline', 'boundary'):
        raise ValueError('Unknown arm')
    root = Path(root).resolve()
    manifest = json.loads((root / 'experiment.json').read_text())
    assert manifest['schema'] == 1 and variant in manifest['variants']
    arm = root / 'runs' / variant
    home = arm / 'profile/sclip-hermes'
    assert home.resolve() == home and not home.is_symlink()
    db_path = home / 'state.db'
    assert db_path.resolve() == db_path and not db_path.is_symlink()
    assert db_path.is_file(), 'Disposable session database is missing; never initialize one'
    with sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True) as db:
        assert db.execute('SELECT COUNT(*) FROM sessions WHERE id=?', (session_id,)).fetchone()[0] == 1
        # Explicit columns exclude reasoning/analysis even when the schema contains them.
        rows = db.execute("SELECT id, content FROM messages WHERE session_id=? AND role='assistant' "
                          'AND content IS NOT NULL ORDER BY timestamp,id', (session_id,)).fetchall()
    visible = [{'role': 'assistant', 'content': content, 'message_id': mid} for mid, content in rows]
    output = arm / 'observable-assistant.json'
    with output.open('x') as f:
        json.dump(visible, f, indent=2)
    decisions = arm / 'boundary-decisions.json'
    subprocess.run(['node', str(Path(__file__).with_name('decisions.mjs')), str(output), str(decisions)], check=True)
    return {'session_id': session_id, 'assistant_messages': len(visible), 'output': str(decisions)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--experiment-root', required=True)
    parser.add_argument('--variant', choices=['baseline', 'boundary'], required=True)
    parser.add_argument('--session-id', required=True)
    args = parser.parse_args()
    print(json.dumps(export(args.experiment_root, args.variant, args.session_id)))
