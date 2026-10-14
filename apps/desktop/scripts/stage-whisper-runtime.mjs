/** Build the supported macOS ARM CPU runtime from explicit, verified source archives.
 * Does not download, install dependencies, change versions or overwrite an existing output.
 * Build tools can be developer-installed; the resulting runtime may link only OS libraries. */
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
export const sha256=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
export function assertSystemLibraries(output){
 const dependencies=output.split('\n').slice(1).map(line=>line.trim().split(' (')[0]).filter(Boolean)
 for(const dependency of dependencies)if(!dependency.startsWith('/usr/lib/')&&!dependency.startsWith('/System/Library/'))throw Error('Portable Whisper links an external runtime: '+dependency)
 return dependencies
}
export function stageWhisper({archives,work,output,cmake,entitlements=path.resolve(here,'../../../node_modules/app-builder-lib/templates/entitlements.mac.plist'),pinFile=path.join(here,'runtime-pins/whisper-darwin-arm64.json')}){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('This build supports macOS ARM64 only')
 if(!archives||!work||!output||!cmake)throw Error('Explicit archive directory, work directory, output and CMake executable are required')
 const pin=JSON.parse(fs.readFileSync(pinFile,'utf8'))
 for(const dir of [work,output])if(fs.existsSync(dir)&&fs.readdirSync(dir).length)throw Error('Refusing nonempty build/output directory: '+dir)
 for(const source of pin.sources){const file=path.join(archives,`${source.name}-${source.version}.tar.gz`);if(sha256(file)!==source.sha256)throw Error('Source integrity mismatch: '+source.name)}
 fs.mkdirSync(work,{recursive:true});fs.mkdirSync(output,{recursive:true})
 // Upstream Git probes must not inherit the enclosing SCLIP checkout's commit.
 const env={...process.env,GIT_CEILING_DIRECTORIES:path.resolve(work)}
 const commands=[]
 const run=(file,args)=>{commands.push({file,args});return execFileSync(file,args,{env,encoding:'utf8',maxBuffer:32*1024*1024})}
 for(const source of pin.sources)run('/usr/bin/tar',['-xzf',path.resolve(archives,`${source.name}-${source.version}.tar.gz`),'-C',path.resolve(work)])
 const prefix=path.resolve(work,'prefix'),ggml=path.resolve(work,`ggml-${pin.ggml_version}`),whisper=path.resolve(work,`whisper.cpp-${pin.whisper_version}`)
 const common=['-DCMAKE_BUILD_TYPE=Release','-DCMAKE_OSX_ARCHITECTURES=arm64',`-DCMAKE_OSX_DEPLOYMENT_TARGET=${pin.minimum_macos}`,'-DBUILD_SHARED_LIBS=OFF']
 const configure=run(cmake,['-S',ggml,'-B',path.resolve(work,'ggml-build'),...common,'-DGGML_BACKEND_DL=OFF','-DGGML_NATIVE=OFF','-DGGML_METAL=OFF','-DGGML_OPENMP=OFF','-DGGML_BLAS=OFF','-DGGML_ACCELERATE=OFF','-DGGML_BUILD_TESTS=OFF','-DGGML_BUILD_EXAMPLES=OFF','-DCMAKE_INSTALL_PREFIX='+prefix])
 fs.writeFileSync(path.join(work,'ggml-configure.log'),configure)
 run(cmake,['--build',path.resolve(work,'ggml-build'),'--parallel','4'])
 run(cmake,['--install',path.resolve(work,'ggml-build')])
 run(cmake,['-S',whisper,'-B',path.resolve(work,'whisper-build'),...common,'-DWHISPER_USE_SYSTEM_GGML=ON','-DCMAKE_PREFIX_PATH='+prefix,'-DCMAKE_IGNORE_PREFIX_PATH=/opt/homebrew','-DWHISPER_BUILD_TESTS=OFF','-DWHISPER_BUILD_EXAMPLES=ON','-DWHISPER_BUILD_SERVER=OFF','-DWHISPER_CURL=OFF','-DWHISPER_SDL2=OFF'])
 run(cmake,['--build',path.resolve(work,'whisper-build'),'--target','whisper-cli','--parallel','4'])
 const binary=path.join(output,'whisper-cli');fs.copyFileSync(path.resolve(work,'whisper-build/bin/whisper-cli'),binary);fs.chmodSync(binary,0o755)
 const libraries=assertSystemLibraries(run('/usr/bin/otool',['-L',binary]))
 // Match the existing ad-hoc package signing options before hashing; the
 // measured repeat-sign operation preserves the executable's bytes.
 run('/usr/bin/codesign',['--sign','-','--force','--timestamp','--options','runtime','--entitlements',entitlements,binary])
 for(const [source,name]of [[whisper,'WHISPER-LICENSE.txt'],[ggml,'GGML-LICENSE.txt']])fs.copyFileSync(path.join(source,'LICENSE'),path.join(output,name))
 fs.copyFileSync(pinFile,path.join(output,'runtime-pin.json'))
 const manifest={schema:1,whisper_version:pin.whisper_version,ggml_version:pin.ggml_version,minimum_macos:pin.minimum_macos,execution:'cpu',sources:pin.sources,dependencies:libraries,build_commands:commands,cmake_version:run(cmake,['--version']).trim(),signing_entitlements_sha256:sha256(entitlements),files:{}}
 for(const name of fs.readdirSync(output))manifest.files[name]=sha256(path.join(output,name))
 fs.writeFileSync(path.join(output,'runtime-manifest.json'),JSON.stringify(manifest,null,2))
 return manifest
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1]
 const manifest=stageWhisper(args);console.log(JSON.stringify({version:manifest.whisper_version,dependencies:manifest.dependencies,files:manifest.files}))
}
