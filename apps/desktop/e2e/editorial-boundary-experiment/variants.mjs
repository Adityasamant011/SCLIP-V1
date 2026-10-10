// Acceptance-only skill staging. No imports of production startup or provider clients.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { assertSkillLayout, assertSkillVersions, readSkillVersion } from '../../scripts/build-skills-lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO = path.resolve(HERE, '../../../..')
export const REFERENCE = 'references/editing-knowledge/speech-boundary-decisions.md'
export const ANCHOR = '**Review — inspect the actual current result.**'
const sha = data => createHash('sha256').update(data).digest('hex')
const variants = ['baseline', 'boundary']
function checkVariant(variant) { assert(variants.includes(variant), 'Select baseline or boundary explicitly') }

export function treeHashes(dir) {
  const entries = {}
  function walk(base, rel = '') {
    for (const e of fs.readdirSync(base, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      assert(!e.isSymbolicLink(), 'Skill trees must not contain symlinks')
      const name = path.join(rel, e.name), at = path.join(base, e.name)
      if (e.isDirectory()) walk(at, name)
      else { assert(e.isFile()); entries[name.split(path.sep).join('/')] = sha(fs.readFileSync(at)) }
    }
  }
  walk(dir)
  return entries
}

export function prepareExperiment(root, baselineBundle = path.join(REPO, 'apps/desktop/out/skills/weftcut'),
  hermesPython = path.join(process.env.SCLIP_HERMES_SOURCE ?? path.join(os.homedir(), 'SCLIP/hermes-agent-src'), '.venv/bin/python')) {
  root = path.resolve(root)
  assert(!fs.existsSync(root), 'Never overwrite an experiment or existing profile')
  treeHashes(baselineBundle) // Refuse links before copying anything.
  const main = fs.readFileSync(path.join(baselineBundle, 'SKILL.md'), 'utf8')
  const version = readSkillVersion(main)
  assert(version, 'Use the tested version-stamped build:skills bundle')
  assert(!main.includes('Speech-boundary comparison (isolated experiment)'), 'Baseline must be unmodified')
  assert.equal(main.split(ANCHOR).length, 2, 'Review anchor changed; review the variant offline')
  const addition = fs.readFileSync(path.join(HERE, 'skill-addition.md'), 'utf8')
  const reference = fs.readFileSync(path.join(REPO, 'skills/weftcut', REFERENCE))
  // All validation above precedes creation. A failed preparation is never a live run.
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  const manifests = {}
  for (const variant of variants) {
    const bundle = path.join(root, 'variants', variant), skill = path.join(bundle, 'weftcut')
    fs.mkdirSync(bundle, { recursive: true })
    fs.cpSync(baselineBundle, skill, { recursive: true })
    // Baseline has exactly the prior files; the new optional reference is intervention-only.
    fs.rmSync(path.join(skill, REFERENCE), { force: true })
    if (variant === 'boundary') {
      fs.writeFileSync(path.join(skill, 'SKILL.md'), main.replace(ANCHOR, addition + '\n' + ANCHOR))
      fs.mkdirSync(path.dirname(path.join(skill, REFERENCE)), { recursive: true })
      fs.writeFileSync(path.join(skill, REFERENCE), reference)
    }
    assertSkillLayout(bundle); assertSkillVersions(bundle, ['weftcut'], version)
    manifests[variant] = treeHashes(skill)
    fs.mkdirSync(path.join(root, 'runs', variant, 'profile', 'sclip-hermes'), { recursive: true, mode: 0o700 })
    // Executable adapter for request.python in the existing benchmark launcher.
    // Every path is shell-quoted; model, prompt, routing and original argv pass through.
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
    fs.writeFileSync(path.join(root, 'runs', variant, 'hermes-python'),
      `#!/bin/sh\nexec ${quote(hermesPython)} ${quote(path.join(HERE, 'hermes_variant.py'))} --experiment-root ${quote(root)} --variant ${quote(variant)} -- "$@"\n`, { mode: 0o700 })
  }
  const result = { schema: 1, version, variants: manifests,
    baseline_main_sha256: sha(main), difference: ['SKILL.md', REFERENCE],
    provider_inference: 'NOT_STARTED', footage: 'UNASSIGNED', sessions: 'NOT_STARTED' }
  fs.writeFileSync(path.join(root, 'experiment.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  return result
}

export function activateVariant(root, variant, home) {
  checkVariant(variant)
  const suppliedRoot = path.resolve(root)
  root = fs.realpathSync(root)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'experiment.json')))
  assert.equal(manifest.schema, 1)
  const expected = path.join(root, 'runs', variant, 'profile', 'sclip-hermes')
  assert([expected, path.join(suppliedRoot, 'runs', variant, 'profile', 'sclip-hermes')].includes(path.resolve(home)),
    'Only the prepared disposable arm profile can be changed')
  assert.equal(fs.realpathSync(home), expected, 'Symlinked Hermes profile is forbidden')
  home = expected // Normalize macOS /var -> /private/var without accepting other targets.
  const source = path.join(root, 'variants', variant, 'weftcut')
  assert.deepEqual(treeHashes(source), manifest.variants[variant], 'Prepared skill changed; prepare a new comparison')
  const skills = path.join(home, 'skills'), dest = path.join(skills, 'weftcut')
  if (fs.existsSync(skills)) assert.equal(fs.realpathSync(skills), skills, 'Symlinked skills directory is forbidden')
  if (fs.existsSync(dest)) {
    assert.equal(fs.realpathSync(dest), dest, 'Symlinked skill is forbidden')
    treeHashes(dest)
  }
  fs.mkdirSync(skills, { recursive: true })
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(source, dest, { recursive: true })
  assert.deepEqual(treeHashes(dest), manifest.variants[variant])
  return { variant, version: manifest.version, skill_sha256: manifest.variants[variant]['SKILL.md'], files: manifest.variants[variant] }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, root, variant, home] = process.argv.slice(2)
  assert(root, 'An explicit new disposable experiment directory is required')
  const result = action === 'prepare' ? prepareExperiment(root) :
    action === 'activate' ? activateVariant(root, variant, home) : assert.fail('Use prepare or activate')
  console.log(JSON.stringify(result))
}
