import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('same-process review continuation: A–I lifecycle and real counter/MCP adapter', () => {
  const python = process.env.SCLIP_HERMES_PYTHON ?? '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
  const result = spawnSync(python, ['-B', fileURLToPath(new URL('./review_continuation_test.py', import.meta.url))], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /Ran 11 tests/)
})
