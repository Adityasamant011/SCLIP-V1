import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareExperiment, activateVariant, treeHashes, REPO, REFERENCE, ANCHOR } from './variants.mjs'
import { stampSkillVersion } from '../../scripts/build-skills-lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-boundary-'))
  t.after(() => fs.rmSync(tmp, {recursive:true,force:true}))
  const built = path.join(tmp,'built/weftcut')
  fs.mkdirSync(built,{recursive:true})
  const baseline = stampSkillVersion(fs.readFileSync(path.join(REPO,'skills/weftcut/SKILL.md'),'utf8'),'0.1.8')
  fs.writeFileSync(path.join(built,'SKILL.md'),baseline)
  fs.writeFileSync(path.join(built,'motif-authoring.md'),'Fixture documentation')
  const root = path.join(tmp,'comparison')
  const manifest = prepareExperiment(root,built)
  return {tmp,built,baseline,root,manifest,home:variant=>path.join(root,'runs',variant,'profile/sclip-hermes')}
}

test('same baseline guidance, exactly one addition and one reference; default stays unchanged',t=>{
  const original = treeHashes(path.join(REPO,'skills/weftcut'))
  const f=fixture(t),a=path.join(f.root,'variants/baseline/weftcut'),b=path.join(f.root,'variants/boundary/weftcut')
  assert.equal(fs.readFileSync(path.join(a,'SKILL.md'),'utf8'),f.baseline)
  const addition=fs.readFileSync(path.join(HERE,'skill-addition.md'),'utf8')
  assert.equal(fs.readFileSync(path.join(b,'SKILL.md'),'utf8'),f.baseline.replace(ANCHOR,addition+'\n'+ANCHOR))
  assert(!fs.existsSync(path.join(a,REFERENCE)));assert(fs.existsSync(path.join(b,REFERENCE)))
  for(const [key,value] of Object.entries(f.manifest.variants.baseline)) if(key!=='SKILL.md') assert.equal(f.manifest.variants.boundary[key],value)
  assert.deepEqual(treeHashes(path.join(REPO,'skills/weftcut')),original)
})

test('post-launch refresh selection is idempotent, survives restart and preserves evidence/config',t=>{
  const f=fixture(t)
  for(const arm of ['baseline','boundary']) {
    const wrapper=path.join(f.root,'runs',arm,'hermes-python')
    assert(fs.statSync(wrapper).mode & 0o100)
    assert(fs.readFileSync(wrapper,'utf8').includes(`--variant '${arm}' -- "$@"`))
    const home=f.home(arm),evidence=path.join(home,'skills/session-evidence')
    fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'SKILL.md'),'Current facts')
    fs.writeFileSync(path.join(home,'config.yaml'),'memory:\n  memory_enabled: false\n')
    // Simulate the normal launcher refresh immediately before Python starts.
    fs.cpSync(f.built,path.join(home,'skills/weftcut'),{recursive:true})
    const first=activateVariant(f.root,arm,home)
    assert.deepEqual(activateVariant(f.root,arm,home),first)
    assert.equal(fs.readFileSync(path.join(evidence,'SKILL.md'),'utf8'),'Current facts')
    assert.equal(fs.readFileSync(path.join(home,'config.yaml'),'utf8'),'memory:\n  memory_enabled: false\n')
    fs.cpSync(f.built,path.join(home,'skills/weftcut'),{recursive:true})
    assert.deepEqual(activateVariant(f.root,arm,home),first)
  }
})

test('refuses overwrite, unknown arm, arbitrary user home, symlinks and altered frozen variant',t=>{
  const f=fixture(t)
  assert.throws(()=>prepareExperiment(f.root,f.built),/Never overwrite/)
  assert.throws(()=>activateVariant(f.root,'other',f.home('baseline')),/explicitly/)
  const unrelated=path.join(f.tmp,'personal');fs.mkdirSync(unrelated)
  assert.throws(()=>activateVariant(f.root,'baseline',unrelated),/Only the prepared/)
  assert.deepEqual(fs.readdirSync(unrelated),[])
  const dest=path.join(f.home('baseline'),'skills');fs.symlinkSync(unrelated,dest)
  assert.throws(()=>activateVariant(f.root,'baseline',f.home('baseline')),/Symlinked/)
  const at=path.join(f.root,'variants/boundary/weftcut/SKILL.md');fs.appendFileSync(at,'Changed')
  assert.throws(()=>activateVariant(f.root,'boundary',f.home('boundary')),/Prepared skill changed/)
})

const source=process.env.SCLIP_HERMES_SOURCE ?? path.join(os.homedir(),'SCLIP/hermes-agent-src')
const python=path.join(source,'.venv/bin/python')
test('generated launcher adapter preserves every argument with spaces, quotes and shell metacharacters',t=>{
  const f=fixture(t),fakePython=path.join(f.tmp,"fake python's interpreter"),output=path.join(f.tmp,'argv.json')
  fs.writeFileSync(fakePython,"#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.env.ARGUMENT_OUTPUT,JSON.stringify(process.argv.slice(2)))\n",{mode:0o700})
  const root=path.join(f.tmp,"second comparison's root")
  prepareExperiment(root,f.built,fakePython)
  const args=['-m','hermes_cli.main','chat','-q',"A natural brief with 'quotes' and $(literal text)."]
  const child=spawnSync(path.join(root,'runs/boundary/hermes-python'),args,{env:{PATH:process.env.PATH,ARGUMENT_OUTPUT:output},encoding:'utf8'})
  assert.equal(child.status,0,child.stderr)
  const forwarded=JSON.parse(fs.readFileSync(output))
  assert.deepEqual(forwarded.slice(-args.length),args)
  assert.equal(forwarded[forwarded.indexOf('--experiment-root')+1],root)
  assert.equal(forwarded[forwarded.indexOf('--variant')+1],'boundary')
})
test('installed Hermes actual preload and linked-reference lookup select each arm with networking blocked',
  {skip:!fs.existsSync(python)&&'Installed Hermes unavailable; set SCLIP_HERMES_SOURCE'},t=>{
  const f=fixture(t)
  for(const arm of ['baseline','boundary','baseline','boundary']) {
    const home=f.home(arm)
    const child=spawnSync(python,[path.join(HERE,'hermes_variant.py'),'--experiment-root',f.root,'--variant',arm,'--check'],{
      cwd:REPO,env:{PATH:process.env.PATH,HOME:path.dirname(home),HERMES_HOME:home,PYTHONPATH:source,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:45000})
    assert.equal(child.status,0,child.stderr+'\n'+child.stdout)
    const receipt=JSON.parse(child.stdout.trim().split('\n').at(-1))
    assert.equal(receipt.preload_verified,true);assert.equal(receipt.variant,arm)
    assert.equal(receipt.skill_sha256,f.manifest.variants[arm]['SKILL.md'])
    assert.equal(receipt.provider_inference_count,0)
    assert.deepEqual(receipt.loaded,['weftcut']);assert.deepEqual(receipt.missing,[])
  }
})
