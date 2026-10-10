import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, newProject, tmpDir } from './helpers/driver'

test('Hermes native SSE → local MCP → streamed final response ($0) @serial', async () => {
  test.skip(!fs.existsSync('/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'), 'Requires local installed Hermes')
  test.setTimeout(120000)
  const userData=tmpDir('sclip-stream-offline-')
  const {app,page}=await launchApp({userDataDir:userData,env:{SCLIP_USER_DATA_DIR:userData,SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',OPENROUTER_API_KEY:'',OPENAI_API_KEY:''}})
  try{
    await newProject(page,{parentFolder:userData,name:'offline',canvas:{width:640,height:360,fpsNum:30,fpsDen:1}})
    const mcp=await page.evaluate(()=>(window as any).api.mcp.getInfo())
    const source='/Users/adityasamant/SCLIP/hermes-agent-src'
    const script=path.resolve('e2e/live-reviewer-acceptance/offline_streaming.py')
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/(API_KEY|API_TOKEN|HERMES_HOME)/.test(key)))
    const output=await new Promise<string>((resolve,reject)=>{
      const child=spawn(path.join(source,'.venv/bin/python'),[script],{cwd:source,env:{...env,HERMES_HOME:path.join(userData,'sclip-hermes'),SCLIP_MCP_URL:mcp.url,SCLIP_MCP_TOKEN:mcp.bearer_token,PYTHONDONTWRITEBYTECODE:'1'}})
      let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk)
      child.once('error',reject);child.once('close',code=>code===0?resolve(stdout):reject(new Error(stderr.slice(-3500))))
    })
    const result=JSON.parse(output.trim().split('\n').at(-1)!)
    expect(result.native_hermes_streaming).toBe('PASS');expect(result.actual_local_mcp_execution).toBe('PASS');expect(result.provider_requests).toBe(0)
    console.log('OFFLINE_STREAMING',JSON.stringify(result))
  }finally{await app.close()}
})
