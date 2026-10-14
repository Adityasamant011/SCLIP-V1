import fs from 'node:fs'
import path from 'node:path'
import {sha256,assertSystemLibraries} from './stage-whisper-runtime.mjs'
export function assertWhisperBundle(root){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'runtime-manifest.json'),'utf8'))
 if(manifest.schema!==1||manifest.whisper_version!=='1.9.1'||manifest.ggml_version!=='0.15.2'||manifest.execution!=='cpu')throw Error('afterPack(whisper): invalid supported runtime provenance')
 for(const name of ['whisper-cli','WHISPER-LICENSE.txt','GGML-LICENSE.txt','runtime-pin.json'])if(!manifest.files?.[name]||sha256(path.join(root,name))!==manifest.files[name])throw Error('afterPack(whisper): resource integrity mismatch: '+name)
 assertSystemLibraries('whisper-cli:\n'+manifest.dependencies.map(p=>'\t'+p).join('\n'))
 return {version:manifest.whisper_version,execution:manifest.execution}
}
export default function afterPackWhisper(context){
 if(context.electronPlatformName!=='darwin')return
 const root=path.join(context.packager.getResourcesDir(context.appOutDir),'whisper')
 console.log('  • afterPack(whisper): '+JSON.stringify(assertWhisperBundle(root)))
}
