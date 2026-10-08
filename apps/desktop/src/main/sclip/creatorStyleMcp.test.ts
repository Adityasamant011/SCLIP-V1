import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildMcpServer } from '../mcp/server'
import { createActor } from '../state/actor'
import { blankProject } from '../state/model'
import { seededGen } from '../state/ids'
import { CreatorStyleStore } from './creatorStyle'

describe('Real MCP creator memory integration without inference', () => {
  it('discovers, retrieves and persists Hermes-authored hypotheses, with no timeline mutations', async () => {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creator-mcp-'))
    const store=new CreatorStyleStore(directory),idGen=seededGen(),actor=createActor({initial:blankProject(idGen,'synthetic'),idGen})
    const projectId=actor.snapshot().project_id
    store.user(projectId,{action:'explicit',text:'Prefer natural editing unless this brief requests otherwise'})
    const server=buildMcpServer({mcpCatalog:async()=>' {"tools": []}'} as any,{getTsHost:()=>({actor} as any),creatorStyleStore:store})
    const client=new Client({name:'fake-Hermes',version:'1'},{}),[a,b]=InMemoryTransport.createLinkedPair()
    await server.connect(a);await client.connect(b)
    const before=actor.snapshot(), history=actor.historyView(100)
    try {
      const tool=(await client.listTools()).tools.find(t=>t.name==='creator_style_memory')!
      expect(tool.description).toContain('YOU interpret'); expect(tool.inputSchema.additionalProperties).toBe(false)
      const read:any=await client.callTool({name:tool.name,arguments:{action:'context'}})
      const packet=JSON.parse(read.content[0].text)
      expect(packet.context).toContain('Prefer natural editing')
      const result:any=await client.callTool({name:tool.name,arguments:{action:'hypothesis',creator_id:packet.binding.creatorId,expected_revision:store.view(projectId).revision,hypothesis:'Perhaps natural framing matters',dimension:'visual',evidence_ids:[store.view(projectId).preferences[0]!.support[0]]}})
      expect(result.isError).not.toBe(true)
      expect(new CreatorStyleStore(directory).view(projectId).preferences.at(-1)).toMatchObject({hypothesis:'Perhaps natural framing matters',status:'candidate'})
      const invalid:any=await client.callTool({name:tool.name,arguments:{action:'hypothesis',creator_id:packet.binding.creatorId,expected_revision:store.view(projectId).revision,hypothesis:'Unsupported',dimension:'pacing',evidence_ids:['invented']}})
      expect(invalid.isError).toBe(true)
      expect(actor.snapshot()).toBe(before);expect(actor.historyView(100)).toEqual(history)
    } finally {await client.close();await server.close();fs.rmSync(directory,{recursive:true,force:true})}
  })
})
