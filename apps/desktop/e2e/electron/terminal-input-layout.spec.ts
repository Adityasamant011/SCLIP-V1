import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, invokeCmd, summary, tmpDir } from './helpers/driver'

// Actual component, xterm, PTY and Hermes composer helpers. No model.
test('Agent input stays visible through startup resize, wrapping and reattachment @serial', async () => {
  const source = process.env.SCLIP_HERMES_SOURCE ?? '/Users/adityasamant/SCLIP/hermes-agent-src'
  test.skip(!fs.existsSync(path.join(source, '.venv/bin/python')), 'Requires installed Hermes prompt_toolkit')
  test.setTimeout(90000)
  const root=tmpDir('sclip-input-layout-'), log=path.join(root,'input.json'), fixture=path.join(root,'composer')
  fs.writeFileSync(fixture, `#!/bin/sh\ncd '${source}'\nexport PYTHONPATH='${source}'\nexec '${source}/.venv/bin/python' '${path.resolve('e2e/electron/helpers/wrappingTerminal.py')}'\n`, {mode:0o700})
  const require=createRequire(import.meta.url), modulePath=path.join(root,'runtime.cjs')
  await build({entryPoints:[path.resolve('src/main/sclip/hermesTerminalRuntime.ts')],outfile:modulePath,bundle:true,platform:'node',format:'cjs',alias:{'node-pty':require.resolve('node-pty')},external:[require.resolve('node-pty')]})
  const browser=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {HermesTerminal} from './src/renderer/agent/HermesTerminal';import './src/renderer/agent/sclip.css';export function mount(){window.inputRoot=createRoot(document.getElementById('input-test'));window.inputRoot.render(React.createElement(HermesTerminal,{projectId:window.testProjectId,sessionId:'same'}));}export function unmount(){window.inputRoot.unmount();}`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',platform:'browser',format:'iife',globalName:'InputTest',write:false,outdir:root,
    plugins:[{name:'offline-ipc',setup(b){b.onResolve({filter:/ipc\/sclip$/},()=>({path:'offline-ipc',namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:`export const sclipOpenTerminal=(...a)=>window.inputOpen(...a);export const sclipTerminalInput=(...a)=>window.inputSend(...a);export const sclipTerminalResize=(...a)=>window.inputResize(...a);`}))}}]})
  const {app,page}=await launchApp({env:{OPENROUTER_API_KEY:'',OPENAI_API_KEY:'',SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0'}})
  page.on('pageerror', error => console.log('INPUT_ERROR', error.message))
  try {
    await invokeCmd(page,'project_new_workspace',{parentFolder:root,name:'input-only',width:640,height:360,fpsNum:30,fpsDen:1})
    await page.evaluate(id=>{(window as any).testProjectId=id},(await summary(page)).project_id)
    const mcp=await page.evaluate(()=>(window as any).api.mcp.getInfo())
    await app.evaluate((_electron,o)=>{
      const {HermesTerminalRuntime}=(process as any).getBuiltinModule('module').createRequire(o.modulePath)(o.modulePath)
      const target=_electron.BrowserWindow.getAllWindows()[0]!
      ;(globalThis as any).inputRuntime=new HermesTerminalRuntime({isPackaged:false,resourcesPath:'',userDataPath:o.root,executableOverride:o.fixture,getMcpInfo:()=>o.mcp,getProviderEnvironment:()=>({SCLIP_TEST_INPUT_LOG:o.log}),assertSession:async()=>{},onOutput:(event:unknown)=>target.webContents.send('evt:sclip:terminal_output',event),onExit:()=>{}})
    },{modulePath,root,fixture,mcp,log})
    let release!:()=>void, opens=0
    const gate=new Promise<void>(resolve=>{release=resolve})
    await page.exposeFunction('inputOpen',async(p:string,s:string,cols:number,rows:number)=>{
      if(++opens===1)await gate
      return app.evaluate(async(_e,o)=>(globalThis as any).inputRuntime.ensure(o.p,o.s,o.cols,o.rows),{p,s,cols,rows})
    })
    await page.exposeFunction('inputSend',(p:string,s:string,data:string)=>app.evaluate(async(_e,o)=>(globalThis as any).inputRuntime.input(o.p,o.s,o.data),{p,s,data}))
    await page.exposeFunction('inputResize',(p:string,s:string,cols:number,rows:number)=>app.evaluate(async(_e,o)=>(globalThis as any).inputRuntime.resize(o.p,o.s,o.cols,o.rows),{p,s,cols,rows}))
    await page.evaluate(files=>{
      const node=document.createElement('div');node.id='input-test';node.style.cssText='position:fixed;right:20px;top:100px;width:700px;height:450px;z-index:9999';document.body.appendChild(node)
      for(const f of files){if(f.path.endsWith('.css')){const style=document.createElement('style');style.textContent=f.text;document.head.appendChild(style)}else(0,eval)(f.text)}
      ;(window as any).InputTest.mount()
    },browser.outputFiles.map(f=>({path:f.path,text:f.text})))
    await expect.poll(()=>opens).toBe(1)
    const width=(value:number)=>page.evaluate(w=>{document.getElementById('input-test')!.style.width=`${w}px`},value)
    await width(300);await page.waitForTimeout(100);release()
    const state=()=>{try{return JSON.parse(fs.readFileSync(log,'utf8'))}catch{return {}}}
    await expect.poll(()=>state().cols,{timeout:15000}).toBeLessThan(45)
    const pid=state().pid
    await page.locator('#input-test .xterm-helper-textarea').focus()
    const text='Please keep the conversation visible while I write a longer request with enough detail. '.repeat(5)+'TAIL_VISIBLE'
    await page.keyboard.type(text.slice(0,70))
    await page.keyboard.insertText(text.slice(70))
    await expect.poll(()=>state().text).toBe(text)
    const checkCursor=async(tail='TAIL_VISIBLE')=>{
      const cursor=page.locator('#input-test .xterm-cursor')
      await expect(cursor).toBeVisible()
      const b=await cursor.boundingBox(),h=await page.locator('#input-test').boundingBox()
      expect(b!.x).toBeGreaterThanOrEqual(h!.x);expect(b!.x+b!.width).toBeLessThanOrEqual(h!.x+h!.width);expect(b!.y+b!.height).toBeLessThanOrEqual(h!.y+h!.height)
      await expect(page.locator('#input-test .xterm-rows')).toContainText(tail)
    }
    await checkCursor()
    for(const w of [800,280,500,300]){const old=state().cols;await width(w);await expect.poll(()=>state().cols).not.toBe(old);await checkCursor();expect(state().pid).toBe(pid)}
    await page.keyboard.press('ArrowLeft');await page.keyboard.press('Backspace');await page.keyboard.insertText('X')
    const edited=text.slice(0,-2)+'X'+text.slice(-1)
    await expect.poll(()=>state().text).toBe(edited)
    await page.evaluate(()=>(window as any).InputTest.unmount());await width(650);await page.evaluate(()=>(window as any).InputTest.mount())
    await expect.poll(()=>opens).toBe(2)
    await page.locator('#input-test .xterm-helper-textarea').focus();await page.keyboard.insertText('Z')
    await expect.poll(()=>state().text).toContain('XZ');expect(state().pid).toBe(pid)
    await checkCursor('TAIL_VISIBXZE')
    await page.screenshot({path:test.info().outputPath('long-input.png')})
    console.log('INPUT_LAYOUT',JSON.stringify({sameProcess:true,widths:[280,300,500,650,800],characters:text.length,providerCalls:0}))
  }catch(error){console.log('TERMINAL_CONTENT',await page.locator('#input-test').textContent());throw error}finally{await app.evaluate(()=>(globalThis as any).inputRuntime?.stopAll()).catch(()=>{});await app.close()}
})
