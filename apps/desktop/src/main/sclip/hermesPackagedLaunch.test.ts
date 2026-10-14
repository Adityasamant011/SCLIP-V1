import {expect,it,vi} from 'vitest'
import fs from 'node:fs';import os from 'node:os';import path from 'node:path'
vi.mock('node-pty',()=>({spawn:vi.fn()}))
import {HermesRuntime} from './hermesRuntime'
import {HermesTerminalRuntime} from './hermesTerminalRuntime'
it('packaged gateway and terminal refuse developer overrides and require the bundled runtime',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-packaged-launch-')),source=path.join(dir,'developer-source');fs.mkdirSync(path.join(source,'.venv','bin'),{recursive:true});fs.writeFileSync(path.join(source,'.venv','bin','python'),'unused developer fixture')
 const common={isPackaged:true,resourcesPath:path.join(dir,'resources'),userDataPath:dir,executableOverride:'/usr/bin/false',sourceOverride:source,getMcpInfo:()=>({url:'http://127.0.0.1/mcp',bearer_token:'synthetic'}),getProviderEnvironment:()=>({})}
 try{
  const gateway=new HermesRuntime({...common,getGatewayToken:()=> 'synthetic'}),terminal=new HermesTerminalRuntime({...common,assertSession:async()=>{},onOutput:()=>{},onExit:()=>{}})
  for(const runtime of [gateway,terminal])expect(()=> (runtime as any).resolveLaunch()).toThrow('Bundled Hermes runtime is missing')
  const bundled=path.join(common.resourcesPath,'hermes','hermes');fs.mkdirSync(path.dirname(bundled),{recursive:true});fs.writeFileSync(bundled,'unused bundled fixture')
  for(const runtime of [gateway,terminal])expect((runtime as any).resolveLaunch().command).toBe(bundled)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
