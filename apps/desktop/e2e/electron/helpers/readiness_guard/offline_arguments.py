"""Read only the final JSON argument candidate from a disposable Hermes DB."""
import json
import sqlite3
import sys


db = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro", uri=True)
rows = db.execute(
    "SELECT content FROM messages WHERE role='assistant' AND content IS NOT NULL "
    "ORDER BY timestamp DESC,id DESC LIMIT 8"
).fetchall()
candidate = None
for (content,) in rows:
    text = content.strip()
    if text.startswith("```"):
        text = "\n".join(text.splitlines()[1:-1]).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            candidate = parsed
            break
    except (ValueError, TypeError):
        pass
db.close()
print(json.dumps({"arguments": candidate, "parsed": candidate is not None}))
