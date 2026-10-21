import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloudAccount, validateCloudOrigin } from './cloudAccount'
import { readHermesProfile, setManagedHermesEndpoint, writeHermesProfile } from './hermesRuntime'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const owned: CloudAccount[] = []
afterEach(() => { owned.splice(0).forEach(c => c.close()); vi.restoreAllMocks() })
function fixture() {
  let secret: string | undefined
  const request = vi.fn<typeof fetch>(async url => {
    if (String(url).endsWith('/v1/config')) return Response.json({ supabaseUrl:'https://auth.example.invalid',supabaseAnonKey:'public',managedEnabled:true })
    if (String(url).includes('/auth/v1/token')) return Response.json({ access_token:'private-access-token',refresh_token:'private-refresh-token',expires_in:3600 })
    if (String(url).endsWith('/auth/v1/logout')) return Response.json({})
    if (String(url).endsWith('/v1/account')) return Response.json({ email:'tester@example.invalid',plan:'managed',active:true,managedEnabled:true,credit:{ allowance:12000000,spent:1000,reserved:0 } })
    if (String(url).endsWith('/v1/chat/completions')) return Response.json({ choices:[],usage:{ cost:0.001 } })
    throw new Error('Unexpected request')
  })
  const client = new CloudAccount({ gatewayUrl:'https://sclip.example.invalid',enforcePayment:true,readSecret:()=>secret,writeSecret:v=>{ secret=v },clearSecret:()=>{ secret=undefined },request })
  owned.push(client)
  return { client,request,read:()=>secret,seed:(v:unknown)=>{ secret=JSON.stringify(v) } }
}
describe('Sclip account security', () => {
  it('rejects HTTP, embedded credentials, paths and queries as cloud origins', () => {
    for (const url of ['http://cloud.invalid','https://u:p@cloud.invalid','https://cloud.invalid/v1','https://cloud.invalid/?key=secret']) expect(()=>validateCloudOrigin(url)).toThrow()
    expect(validateCloudOrigin('https://cloud.invalid')).toBe('https://cloud.invalid')
  })
  it('requires accounts in packaged builds while leaving development explicitly separate', async () => {
    const opts={ readSecret:()=>undefined,writeSecret:()=>{},clearSecret:()=>{} }
    const production=new CloudAccount({ ...opts,enforcePayment:true })
    await expect(production.assertAiAccess()).rejects.toThrow('not enabled')
    await expect(new CloudAccount({ ...opts,enforcePayment:false }).assertAiAccess()).resolves.toBeUndefined()
  })
  it('stores a session through the secret store and never returns tokens in account IPC views', async () => {
    const f=fixture(); await f.client.signIn('tester@example.invalid','test-password')
    expect(f.read()).toContain('private-refresh-token')
    expect(JSON.stringify(await f.client.view())).not.toContain('private-')
    await expect(f.client.assertAiAccess(true)).resolves.toBeUndefined()
    await f.client.signOut(); expect(f.read()).toBeUndefined()
    await expect(f.client.token()).rejects.toThrow('Sign in')
  })
  it('refreshes expiring sessions once for concurrent callers', async () => {
    const f=fixture(); f.seed({ access_token:'old',refresh_token:'refresh',expires_at:1 })
    const tokens=await Promise.all([f.client.token(),f.client.token(),f.client.token()])
    expect(tokens).toEqual(['private-access-token','private-access-token','private-access-token'])
    expect(f.request.mock.calls.filter(([u])=>String(u).includes('grant_type=refresh_token'))).toHaveLength(1)
  })
  it('a late account response cannot restore paid access after logout',async()=>{
    const f=fixture(); await f.client.signIn('tester@example.invalid','test-password')
    const original=f.request.getMockImplementation()!
    let complete!: (response:Response)=>void
    let entered!: ()=>void
    const started=new Promise<void>(resolve=>{ entered=resolve })
    f.request.mockImplementation(async(url,init)=>{
      if(String(url).endsWith('/v1/account')) { entered(); return new Promise<Response>(resolve=>{ complete=resolve }) }
      return original(url,init)
    })
    const pending=f.client.view(); await started; await f.client.signOut()
    complete(Response.json({ plan:'managed',active:true,managedEnabled:true }))
    await expect(pending).rejects.toThrow('Account changed')
    await expect(f.client.assertAiAccess()).rejects.toThrow('Sign in')
  })
  it('loopback proxy rejects missing credentials and forwards only its fixed managed routes', async () => {
    const f=fixture(); await f.client.signIn('tester@example.invalid','test-password')
    const base=await f.client.startProxy()
    expect((await fetch(`${base}/models`)).status).toBe(401)
    const headers={ Authorization:`Bearer ${f.client.managedEnvironment().OPENAI_API_KEY}`,'Content-Type':'application/json' }
    expect((await fetch(`${base}/other`,{ headers })).status).toBe(404)
    const response=await fetch(`${base}/chat/completions`,{ method:'POST',headers,body:JSON.stringify({ model:'z-ai/glm-5.3-flash',messages:[{ role:'user',content:'hello' }] }) })
    expect(response.status).toBe(200)
    const call=f.request.mock.calls.find(([u])=>String(u).endsWith('/v1/chat/completions'))
    expect((call?.[1]?.headers as Record<string,string>).Authorization).toBe('Bearer private-access-token')
    expect(f.request.mock.calls.some(([u])=>String(u).includes('openrouter.ai'))).toBe(false)
  })
  it('managed selection persists identity while Hermes receives a custom loopback adapter', () => {
    const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-managed-test-'))
    try {
      setManagedHermesEndpoint('http://127.0.0.1:12345/v1')
      writeHermesProfile(home,7777,{ provider:'sclip-managed',model:'z-ai/glm-5.3-flash',maxIterations:100 })
      const config=fs.readFileSync(path.join(home,'config.yaml'),'utf8')
      expect(config).toContain('provider: custom'); expect(config).toContain('sclip_managed_ai: true')
      expect(readHermesProfile(home).provider).toBe('sclip-managed')
      writeHermesProfile(home,7777,{ provider:'ollama',model:'local-test' })
      expect(readHermesProfile(home).provider).toBe('ollama')
      expect(readHermesProfile(home).customBaseUrl).toBeUndefined()
    } finally { fs.rmSync(home,{ recursive:true,force:true }) }
  })
})
