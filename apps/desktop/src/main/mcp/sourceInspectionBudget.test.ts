import {randomUUID} from 'node:crypto'
import {it,expect,vi} from 'vitest'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {startMcpHost} from './index'
import {freshActor} from '../state/__tests__/pbt/harness'
vi.mock('electron',()=>({app:{isPackaged:true}}))
vi.mock('./auth',()=>({loadOrInitAuth:()=>({token:'synthetic-source-budget',port:0}),saveAuth:()=>{},rotateToken:(a:unknown)=>a}))
it('keeps discovery bounded across reconnects, permits ordinary editing and resets on a new accepted request',async()=>{
 const actor=freshActor(),ts={actor,mcpCall:(n:string,a:string)=>actor.mcpCall(n,a)} as any
 const host=await startMcpHost({mcpCatalog:async()=>'{"tools":[]}'} as any,{getTsHost:()=>ts});const clients:Client[]=[]
 const connect=async()=>{const c=new Client({name:'synthetic-source-budget',version:'1'},{});clients.push(c);await c.connect(new StreamableHTTPClientTransport(new URL(host.getInfo().url),{requestInit:{headers:{Authorization:`Bearer ${host.getInfo().bearer_token}`}}}));return c}
 try{
  host.setEditingBrief('Edit the known food scenes; leave unreadable venue names unresolved.')
  let c=await connect()
  const invalid={media_id:'missing-synthetic-source',source_t_us:'0',question:'Is she eating?'}
  for(let i=0;i<14;i++){const r=await c.callTool({name:'vision_inspect',arguments:invalid});expect(JSON.stringify(r)).toContain('Unknown media_id');expect(JSON.stringify(r)).not.toContain('Source inspection budget reached')}
  const media=randomUUID();expect(actor.dispatch('add_media',{id:media,kind:'Video',duration_us:1000000,with_audio:false}).ok).toBe(true)
  const args={...invalid,media_id:media}
  for(let i=0;i<12;i++){const r:any=await c.callTool({name:'vision_inspect',arguments:args});expect(JSON.stringify(r)).not.toContain('Source inspection budget reached')}
  await c.close();c=await connect()
  const blocked:any=await c.callTool({name:'vision_inspect',arguments:args});expect(blocked.isError).toBe(true);expect(JSON.stringify(blocked)).toContain('Source inspection budget reached')
  const edit:any=await c.callTool({name:'add_text_layer',arguments:{content:'Confirmed name',t_start_us:'0',duration_us:'2000000'}});expect(edit.isError).not.toBe(true)
  expect((await c.callTool({name:'get_timeline_context',arguments:{}}) as any).isError).not.toBe(true)
  host.setEditingBrief('New request: inspect the new source.')
  expect(JSON.stringify(await c.callTool({name:'vision_inspect',arguments:args}))).not.toContain('Source inspection budget reached')
 }finally{for(const c of clients)await c.close();await host.close()}
})
