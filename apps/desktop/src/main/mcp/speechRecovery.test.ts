import {describe,it,expect,vi} from 'vitest'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {buildMcpServer,registeredMcpTools} from './server'
import {createToolFailureRecovery} from '../sclip/toolFailureRecovery'
import {RevisionLoopGuard} from '../sclip/revisionLoopGuard'
import {freshActor} from '../state/__tests__/pbt/harness'
vi.mock('electron',()=>({app:{isPackaged:true}}))
const backend={mcpCatalog:async()=>JSON.stringify({tools:[{name:'synthesize_speech',inputSchema:{type:'object',properties:{text:{type:'string'},voice:{type:'string'}},required:['text','voice']}}],resources:[]}),mcpCallTool:vi.fn(async()=>{throw Error('LayerNotFound')})} as any
describe('actual MCP speech discovery and failure recovery delivery',()=>{
 it('allows a speech audition while project mutations require verification',async()=>{
  const guard=new RevisionLoopGuard(),gate=vi.spyOn(guard,'beforeMutation').mockReturnValue('Verify the committed repair first')
  const actor=freshActor(),before=actor.snapshot(),compute=vi.fn(async()=>JSON.stringify({media_item:{path_abs:'/synthetic/audition.mp3'},duration_us:1000000,cached:true}))
  const ts={actor,mcpHybridDeps:{actor,compute:{synthesizeSpeechCompute:compute}}} as any
  const server=buildMcpServer(backend,{revisionGuard:guard,getTsHost:()=>ts}),client=new Client({name:'offline-preview',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair()
  await server.connect(a);await client.connect(b)
  try{
   const preview=await client.callTool({name:'synthesize_speech',arguments:{text:'Local audition',voice:'am_michael',preview_only:true}}) as any
   expect(preview.isError).not.toBe(true);expect(compute).toHaveBeenCalledTimes(1);expect(gate).not.toHaveBeenCalled();expect(actor.snapshot()).toEqual(before)
   const placement=await client.callTool({name:'synthesize_speech',arguments:{text:'Local audition',voice:'am_michael'}}) as any
   expect(placement.isError).toBe(true);expect(gate).toHaveBeenCalledTimes(1);expect(compute).toHaveBeenCalledTimes(1)
  }finally{await client.close();await server.close()}
 })
 it('exposes strict engine, preview and installed-voice discovery, with no creative defaults',async()=>{
  const voices=vi.fn(async()=>({engine:'kokoro-tts',voices:['af_heart','am_michael'],aliases:{nova:'af_nicole'}}))
  const tools=await registeredMcpTools(backend,{listSpeechVoices:voices}),speech=tools.find(t=>t.name==='synthesize_speech')!
  expect((speech.inputSchema as any).properties.engine.enum).toEqual(['kokoro','auto','openai'])
  expect((speech.inputSchema as any).properties.preview_only.type).toBe('boolean');expect(tools.some(t=>t.name==='list_speech_voices')).toBe(true)
  const server=buildMcpServer(backend,{listSpeechVoices:voices,triageToolFailure:createToolFailureRecovery()}),client=new Client({name:'offline-test',version:'1'})
  const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b)
  try{
   const result=await client.callTool({name:'list_speech_voices',arguments:{}}) as any
   expect(JSON.parse(result.content[0].text).voices).toEqual(['af_heart','am_michael']);expect(voices).toHaveBeenCalledTimes(1)
   const bad=await client.callTool({name:'list_speech_voices',arguments:{voice:'invented'}}) as any;expect(bad.isError).toBe(true);expect(voices).toHaveBeenCalledTimes(1)
   const failure=await client.callTool({name:'unknown_native',arguments:{}}) as any
   expect(failure.isError).toBe(true);const context=failure.content.map((x:any)=>{try{return JSON.parse(x.text).failure_recovery}catch{return null}}).find(Boolean)
   expect(context.category).toBe('missing_current_id');expect(context.automatic_retry).toBe(false)
  }finally{await client.close();await server.close()}
 })
 it('a failed auxiliary recovery handler cannot swallow the original tool error',async()=>{
  const server=buildMcpServer(backend,{triageToolFailure:async()=>{throw Error('auxiliary unavailable')}}),client=new Client({name:'offline-test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair()
  await server.connect(a);await client.connect(b)
  try{const result=await client.callTool({name:'unknown_native',arguments:{}}) as any;expect(result.isError).toBe(true);expect(result.content[0].text).toContain('LayerNotFound')}finally{await client.close();await server.close()}
 })
})
