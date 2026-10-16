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
  const gatewayLaunch = (gateway as any).resolveLaunch()
  expect(gatewayLaunch.command).toBe(bundled)
  expect(gatewayLaunch.cwd).toBe(path.join(common.userDataPath, 'hermes-workspace'))
  expect(fs.statSync(gatewayLaunch.cwd).mode & 0o777).toBe(0o700)

  const terminalA = (terminal as any).resolveLaunch('project-a', 'session-a', 'creator-a')
  const terminalB = (terminal as any).resolveLaunch('project-b', 'session-a', 'creator-a')
  const terminalNewCreator = (terminal as any).resolveLaunch('project-a', 'session-a', 'creator-b')
  const terminalNewSession = (terminal as any).resolveLaunch('project-a', 'session-b', 'creator-a')
  expect(terminalA.command).toBe(bundled)
  expect(terminalA.cwd).not.toContain(common.resourcesPath)
  expect(new Set([terminalA.cwd, terminalB.cwd, terminalNewCreator.cwd, terminalNewSession.cwd]).size).toBe(4)
  for (const launch of [terminalA, terminalB, terminalNewCreator, terminalNewSession]) {
   expect(fs.statSync(launch.cwd).isDirectory()).toBe(true)
  }
  const hermesSource = path.join(dir, 'hermes-source')
  const python = path.join(hermesSource, '.venv', 'bin', 'python')
  fs.mkdirSync(path.dirname(python), { recursive: true }); fs.writeFileSync(python, 'python fixture')
  const devCommon = { ...common, isPackaged: false, sourceOverride: hermesSource, executableOverride: undefined }
  const devGateway = (new HermesRuntime({ ...devCommon, getGatewayToken: () => 'synthetic' }) as any).resolveLaunch()
  const devTerminal = (new HermesTerminalRuntime({ ...devCommon, assertSession: async () => {}, onOutput: () => {}, onExit: () => {} }) as any).resolveLaunch('p', 's', 'c')
  expect(devGateway.args).toContain('-B')
  expect(devTerminal.args).toContain('-B')
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
