// Packaged runtime integration in a disposable profile. The only provider is an
// unreachable loopback endpoint; native prompt capture runs before inference.
import { _electron as electron, expect } from '@playwright/test'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

const executable=process.env.SCLIP_LEARNING_EXECUTABLE
assert(executable,'Select the candidate executable explicitly')
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-prompt-runtime-'))
const out=path.resolve('.scratch/creator-learning-20261019');fs.mkdirSync(out,{recursive:true})
fs.writeFileSync(path.join(root,'recents.json'),JSON.stringify({entries:[],reopen_on_launch:false,last_new_project_parent:root}))
fs.mkdirSync(path.join(root,'sclip-hermes'))
fs.writeFileSync(path.join(root,'sclip-hermes/config.yaml'),'model:\n  provider: custom\n  default: offline-only\n  base_url: http://127.0.0.1:1/v1\nauxiliary:\n  background_review:\n    enabled: false\n  title_generation:\n    enabled: false\n')
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(API_KEY|API_TOKEN|HERMES_HOME|SCLIP_HERMES_SOURCE|SCLIP_HERMES_EXECUTABLE)/.test(k)))
let app,client,page
const logs=[]
const launch=async()=>{
 app=await electron.launch({executablePath:executable,args:[`--user-data-dir=${root}`],env:{...env,SCLIP_USER_DATA_DIR:root,SCLIP_JEV_ENABLED:'0',SCLIP_BACKGROUND_JEV_AUTHORIZED:'0',SCLIP_BACKGROUND_PERCEPTION_AUTHORIZED:'0',WEFTCUT_SUPPRESS_ELEVATION_NOTICE:'1'}})
 app.process().stderr.on('data',b=>logs.push(String(b)))
 page=await app.firstWindow({timeout:60000});await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>!!window.api?.backend)
}
const invoke=(cmd,args={})=>page.evaluate(({cmd,args})=>window.api.backend.invoke(cmd,args),{cmd,args})
try{
 await launch()
 await page.getByRole('button',{name:'New project',exact:true}).click()
 await page.getByLabel('Project name',{exact:true}).fill('prompt-learning-smoke')
 await page.getByRole('button',{name:'Create',exact:true}).click()
 await expect(page.locator('.startup-screen')).toHaveCount(0)
 const project=await invoke('project_summary'),mcp=await page.evaluate(()=>window.api.mcp.getInfo())
 client=new Client({name:'synthetic-learning-smoke',version:'1'},{});await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url),{requestInit:{headers:{Authorization:`Bearer ${mcp.bearer_token}`}}}))
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert(!r.isError,JSON.stringify(r.content));return JSON.parse(r.content[0].text)}
 const tools=(await client.listTools()).tools,tool=tools.find(t=>t.name==='creator_style_memory')
 assert(tool.inputSchema.properties.action.enum.includes('observations'));assert(tool.inputSchema.properties.action.enum.includes('review'))
 const made=await client.callTool({name:'add_text_layer',arguments:{content:'Synthetic caption proposal',t_start_us:0,duration_us:2000000,font_size_px:76}})
 assert(!made.isError)
 await page.getByRole('button',{name:/^Synthetic caption proposal Track/}).click()
 const attribute=page.getByText('Attribute',{exact:true});if(await attribute.count())await attribute.first().click()
 const font=page.getByLabel('Font size (px)',{exact:true});await expect(font).toBeVisible({timeout:20000})
 await font.fill('44');await font.press('Enter')
 await expect.poll(async()=>(await invoke('sclip_creator_style',{action:'view'})).evidence.filter(e=>e.kind==='correction').length).toBe(1)
 await expect.poll(async()=>(await invoke('sclip_get_hermes_status')).runtimeState,{timeout:45000}).toBe('ready')
 const session=await invoke('sclip_create_project_session',{projectId:project.project_id,name:'native-prompt'})
 const binding={projectId:project.project_id,sessionId:session.id}
 await invoke('sclip_open_terminal',binding)
 await expect.poll(async()=>(await invoke('sclip_open_terminal',binding)).history.includes('\x1b[?2004h'),{timeout:45000}).toBe(true)
 await invoke('sclip_terminal_input',{...binding,data:'no\r'})
 await expect.poll(async()=>(await invoke('sclip_creator_style',{action:'view'})).evidence.some(e=>e.kind==='user_prompt'&&e.data.quote==='no'),{timeout:45000}).toBe(true)
 const view=await invoke('sclip_creator_style',{action:'view'}),prompt=view.evidence.find(e=>e.kind==='user_prompt'),correction=view.evidence.find(e=>e.kind==='correction')
 assert(prompt.data.project.layer_count>0);assert(prompt.data.precedingAgentOperations.length>0)
 const packet=await call('creator_style_memory',{action:'context'})
 const observed=await call('creator_style_memory',{action:'observations',creator_id:packet.binding.creatorId,expected_revision:packet.revision})
 assert(observed.observations.some(e=>e.id===prompt.id));assert(observed.observations.some(e=>e.id===correction.id))
 await call('creator_style_memory',{action:'review',creator_id:packet.binding.creatorId,expected_revision:packet.revision,evidence_ids:[prompt.id],outcome:'insufficient',reason:'A short reaction alone does not establish which aspect needs correction.'})
 assert.equal((await invoke('sclip_creator_style',{action:'view'})).preferences.length,0)
 await invoke('project_save');await client.close();client=undefined;await app.close();app=undefined
 await launch();await page.locator('.startup-recent-item').filter({hasText:'prompt-learning-smoke'}).click()
 await expect(page.locator('.startup-screen')).toHaveCount(0)
 const reopened=await invoke('sclip_creator_style',{action:'view'})
 assert(reopened.evidence.some(e=>e.id===prompt.id&&e.review?.outcome==='insufficient'));assert(reopened.evidence.some(e=>e.id===correction.id))
 const asar=path.join(path.dirname(executable),'../Resources/app.asar')
 const result={status:'PASS',executable,asar_sha256:createHash('sha256').update(fs.readFileSync(asar)).digest('hex'),manual_ui_correction:true,native_accepted_short_prompt:true,authored_project_context:true,canonical_observation_pagination:true,explicit_non_learning_review:true,restart_persistence:true,preferences_invented:reopened.preferences.length,external_provider_requests:0}
 fs.writeFileSync(path.join(out,'packaged-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(error){fs.writeFileSync(path.join(out,'packaged-smoke-console.log'),logs.join(''));if(page)fs.writeFileSync(path.join(out,'packaged-smoke-ui.txt'),await page.locator('body').innerText().catch(()=>''));throw error}
finally{await client?.close().catch(()=>{});await app?.close().catch(()=>{});fs.rmSync(root,{recursive:true,force:true})}
