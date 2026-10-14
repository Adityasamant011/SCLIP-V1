import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {assertHermesBundle} from './after-pack-hermes.mjs';import {safeSourcePath,launcherSource} from './stage-hermes-runtime.mjs'
import YAML from 'yaml'
import {FileMatcher} from 'app-builder-lib/out/fileMatcher.js'
test('mac package retains Hermes alongside sensing and licensing resources without duplicate keys',()=>{
 const config=YAML.parse(fs.readFileSync(new URL('../electron-builder.yml',import.meta.url),'utf8'),{uniqueKeys:true})
 assert(config.files.includes('!release/**'))
 const root=path.resolve('/disposable/project')
 const filter=new FileMatcher(root,'/unused',x=>x,config.files).createFilter()
 const fileStat={isDirectory:()=>false}
 assert.equal(filter(path.join(root,'release/mac-arm64/Sclip.app/Contents/Resources/app.asar.unpacked/node_modules/@weftcut/core/index.darwin-arm64.node'),fileStat),false)
 assert.equal(filter(path.join(root,'node_modules/@weftcut/core/index.darwin-arm64.node'),fileStat),true)
 const resources=config.mac.extraResources
 assert.equal(resources.filter(x=>x.to==='hermes').length,1)
 assert.equal(resources.filter(x=>x.to==='whisper').length,1)
 for(const required of ['vision/sidecar/vlm_worker.py','vision/sidecar/audio_analyzer.py','vision/sidecar/kokoro_tts_worker.py','native-decode/LICENSE.txt','native-decode/manifest.json'])assert(resources.some(x=>x.to===required),required)
})
test('pack refuses missing/corrupt resources and validates a portable manifest',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-pack-contract-'));try{assert.throws(()=>assertHermesBundle(dir),/manifest is missing/);const files={};for(const rel of ['hermes','launcher.py','runtime-pin.json','HERMES-LICENSE.txt','python/bin/python3','app/hermes_cli/main.py']){const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'fixture');files[rel]=createHash('sha256').update('fixture').digest('hex')}fs.writeFileSync(path.join(dir,'runtime-manifest.json'),JSON.stringify({schema:1,source_revision:'pinned',python_version:'3.11.15',hermes_version:'0.20.4',files}));assert.equal(assertHermesBundle(dir).hermes_version,'0.20.4');fs.mkdirSync(path.join(dir,'python/__pycache__'));assert.throws(()=>assertHermesBundle(dir),/bytecode cache/);fs.rmSync(path.join(dir,'python/__pycache__'),{recursive:true});fs.writeFileSync(path.join(dir,'app/hermes_cli/main.py'),'corrupt');assert.throws(()=>assertHermesBundle(dir),/integrity mismatch/)}finally{fs.rmSync(dir,{recursive:true,force:true})}})
test('runtime source paths cannot escape and launcher delegates to native Hermes',()=>{assert.throws(()=>safeSourcePath('/safe/source','../private'),/escapes/);assert.equal(safeSourcePath('/safe/source','hermes_cli/main.py'),'/safe/source/hermes_cli/main.py');assert(launcherSource().includes('runpy.run_module("hermes_cli.main"'));assert(!launcherSource().includes('/Users/'))})
