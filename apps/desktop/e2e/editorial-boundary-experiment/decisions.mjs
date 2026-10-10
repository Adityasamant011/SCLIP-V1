// Collect explicit visible assistant records only. Never infer a decision from tools.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
const required = ['id', 'boundary', 'state_version', 'sources', 'evidence_refs',
  'rendered_speech', 'omitted_context', 'decision', 'reason', 'operation', 'post_repair']

export function collectDecisions(messages) {
  const records = [], errors = []
  for (const [message_index, message] of messages.entries()) {
    // Tool observations and hidden reasoning fields are never parsed as decisions.
    if (message.role !== 'assistant' || typeof message.content !== 'string') continue
    const text = stripVTControlCharacters(message.content)
    for (const match of text.matchAll(/```sclip-boundary-decision\s*\n([\s\S]*?)```/g)) {
      let record
      try { record = JSON.parse(match[1]) } catch { errors.push({message_index, error:'invalid JSON', raw:match[1]}); continue }
      const missing_fields = required.filter(k => !Object.hasOwn(record ?? {}, k))
      const issues = [...missing_fields.map(k => `missing ${k}`)]
      if (!['opening','ending','join'].includes(record?.boundary)) issues.push('invalid boundary')
      if (!['KEEP','CHANGE','UNCERTAIN'].includes(record?.decision)) issues.push('invalid decision')
      for (const key of ['id','state_version','rendered_speech','omitted_context','reason']) {
        if (typeof record?.[key] !== 'string' || !record[key].trim()) issues.push(`invalid ${key}`)
      }
      for (const key of ['sources','evidence_refs']) if (!Array.isArray(record?.[key])) issues.push(`invalid ${key}`)
      records.push({message_index, record, format_issues:issues}) // Missing fields stay missing.
    }
  }
  return {records, errors, note:'Observable metadata only; no editorial quality or repair-success judgment'}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw Error('Provide observable assistant messages JSON and a new output path')
  fs.writeFileSync(output, JSON.stringify(collectDecisions(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', {flag:'wx'})
}
