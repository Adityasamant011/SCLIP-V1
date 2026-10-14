import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto'
export function assertHermesBundle(root){
 const fail=message=>{throw Error('afterPack(hermes): '+message)}
 const manifestPath=path.join(root,'runtime-manifest.json');if(!fs.existsSync(manifestPath))fail('pinned runtime manifest is missing')
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));if(manifest.schema!==1||!manifest.source_revision||!manifest.python_version||!manifest.hermes_version||!manifest.files)fail('invalid runtime provenance')
 const rejectBytecode=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='__pycache__'||/\.py[co]$/.test(entry.name))fail('bytecode cache cannot be sealed into the runtime');if(entry.isDirectory())rejectBytecode(path.join(dir,entry.name))}};rejectBytecode(root)
 for(const rel of ['hermes','launcher.py','runtime-pin.json','HERMES-LICENSE.txt','python/bin/python3','app/hermes_cli/main.py'])if(!fs.existsSync(path.join(root,rel)))fail('required resource missing: '+rel)
 for(const [rel,expected]of Object.entries(manifest.files)){
  const file=path.resolve(root,rel);if(!file.startsWith(path.resolve(root)+path.sep))fail('manifest path escapes runtime')
  if(typeof expected==='string'){if(!fs.existsSync(file)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)fail('resource integrity mismatch: '+rel)}
  else if(!fs.lstatSync(file).isSymbolicLink()||path.isAbsolute(expected.symlink)||fs.readlinkSync(file)!==expected.symlink)fail('invalid portable symlink: '+rel)
 }
 return {hermes_version:manifest.hermes_version,python_version:manifest.python_version,source_revision:manifest.source_revision,files:Object.keys(manifest.files).length}
}
export default function afterPackHermes(context){if(context.electronPlatformName!=='darwin')return;const root=path.join(context.packager.getResourcesDir(context.appOutDir),'hermes');const proof=assertHermesBundle(root);console.log('  • afterPack(hermes): pinned native runtime '+JSON.stringify(proof))}
