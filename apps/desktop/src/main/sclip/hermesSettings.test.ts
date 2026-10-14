import { describe, expect, it, vi } from 'vitest'
import { configuredHermesKeys, credentialTags, resolveHermesProviderEnvironment, testHermesConnection, validateHermesProfile } from './hermesSettings.js'
import { createHermesOutputRedactor, hermesBaseEnvironment, redactHermesSecrets } from './hermesSecrets.js'
import { readHermesProfile, writeHermesProfile, initializeCreatorHermesControls } from './hermesRuntime.js'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SECRET = 'SCLIP_TEST_SECRET_DO_NOT_LEAK_12345'
const base = { provider: 'openrouter', model: 'nex-agi/nex-n2.5-pro:free', maxIterations: 30 }

describe('secure Hermes settings', () => {
  it('defaults to foreground learning and isolates inherited controls without copying credentials or memories',()=>{
    const dir=mkdtempSync(path.join(os.tmpdir(),'creator-controls-')),home=path.join(dir,'creator-b')
    try {
      writeFileSync(path.join(dir,'config.yaml'),'memory:\n  memory_enabled: true\n  user_profile_enabled: false\n  provider: private-provider\n  api_key: PRIVATE_SYNTHETIC_VALUE\n')
      initializeCreatorHermesControls(dir,home)
      const controls=readFileSync(path.join(home,'config.yaml'),'utf8')
      expect(controls).toContain('"user_profile_enabled":false');expect(controls).toContain('enabled: false')
      expect(controls).not.toContain('PRIVATE_SYNTHETIC_VALUE');expect(controls).not.toContain('private-provider')
      writeHermesProfile(home,0,base)
      expect(readFileSync(path.join(home,'config.yaml'),'utf8')).toContain('enabled: false')
      writeHermesProfile(dir,0,base)
      expect(readFileSync(path.join(dir,'config.yaml'),'utf8')).toContain('enabled: false')
    }finally{rmSync(dir,{recursive:true,force:true})}
  })
  it('preserves supported memory choices and disabled automatic inference on profile rewrite', () => {
    const dir=mkdtempSync(path.join(os.tmpdir(),'creator-config-'))
    try {
      writeFileSync(path.join(dir,'config.yaml'),'memory:\n  memory_enabled: true\n  user_profile_enabled: false\nskills:\n  creation_nudge_interval: 0\nauxiliary:\n  background_review:\n    enabled: false\n')
      writeHermesProfile(dir,1234,base)
      const output=readFileSync(path.join(dir,'config.yaml'),'utf8')
      expect(output).toContain('"memory_enabled":true');expect(output).toContain('"user_profile_enabled":false')
      expect(output).toContain('"creation_nudge_interval":0');expect(output).toContain('enabled: false')
    }finally{rmSync(dir,{recursive:true,force:true})}
  })
  it('grounds capability reporting in the runtime catalog while preserving user instructions and cwd', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sclip-capabilities-'))
    try {
      writeFileSync(path.join(dir, 'config.yaml'), 'terminal:\n  cwd: "/tmp/my-project"\nagent:\n  system_prompt: "Use concise replies."\n')
      writeHermesProfile(dir, 1234, base)
      const saved = readFileSync(path.join(dir, 'config.yaml'), 'utf8')
      expect(saved).toContain('Use concise replies.')
      expect(saved).toContain('current deferred tool_search/tool_describe catalog')
      expect(saved).toContain('installed skills are not proof of availability')
      expect(saved).toContain('Deferred MCP calls:')
      expect(saved).toContain('name and arguments at the top level')
      expect(saved).toContain('An argument/schema error is not a lost MCP connection')
      expect(saved).toContain('Do not launch another Hermes agent')
      expect(saved).toContain('cwd: "/tmp/my-project"')
      writeHermesProfile(dir, 5678)
      expect(readFileSync(path.join(dir, 'config.yaml'), 'utf8').split('Capability reporting:')).toHaveLength(2)
      expect(readFileSync(path.join(dir, 'config.yaml'), 'utf8').split('Deferred MCP calls:')).toHaveLength(2)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('uses the existing Hermes max_turns setting, migrating only the old Sclip default', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sclip-hermes-budget-'))
    try {
      expect(readHermesProfile(dir).maxIterations).toBe(100)
      writeFileSync(path.join(dir, 'config.yaml'), 'agent:\n  max_iterations: 30\n')
      expect(readHermesProfile(dir).maxIterations).toBe(100)
      writeHermesProfile(dir, 1234)
      expect(readFileSync(path.join(dir, 'config.yaml'), 'utf8')).toContain('max_turns: 100')
      expect(readFileSync(path.join(dir, 'config.yaml'), 'utf8')).not.toContain('max_iterations:')
      writeHermesProfile(dir, 1234, { maxIterations: 30 })
      expect(readHermesProfile(dir).maxIterations).toBe(30)
      writeFileSync(path.join(dir, 'config.yaml'), 'agent:\n  max_iterations: 42\n')
      expect(readHermesProfile(dir).maxIterations).toBe(42)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('keeps provider credentials separate, gives secure storage priority, and never puts a key in the safe view', () => {
    const keys = new Map([['sclip_openrouter', SECRET], ['openai', 'other-secret']])
    const read = (tag: string) => keys.get(tag)
    expect(configuredHermesKeys(read)).toMatchObject({ openrouter: true, 'openai-api': true, anthropic: false })
    expect(JSON.stringify(configuredHermesKeys(read))).not.toContain(SECRET)
    expect(resolveHermesProviderEnvironment(base, read, { OPENROUTER_API_KEY: 'fallback' })).toEqual({ OPENROUTER_API_KEY: SECRET })
    expect(resolveHermesProviderEnvironment({ ...base, provider: 'openai-api' }, read, {})).toEqual({ OPENAI_API_KEY: 'other-secret' })
    expect(credentialTags('openrouter')).toEqual(['sclip_openrouter', 'openrouter'])
    keys.delete('sclip_openrouter')
    expect(resolveHermesProviderEnvironment(base, read, { OPENROUTER_API_KEY: 'fallback' })).toEqual({ OPENROUTER_API_KEY: 'fallback' })
    expect(() => resolveHermesProviderEnvironment(base, read, {})).toThrow('OpenRouter API key is not configured')
  })

  it('rejects credential-bearing URLs and YAML-breaking model IDs', () => {
    expect(() => validateHermesProfile({ ...base, model: 'valid\napi_key: secret' })).toThrow('model')
    expect(() => validateHermesProfile({ ...base, customBaseUrl: 'https://user:secret@example.com/v1' })).toThrow('without credentials')
    expect(() => validateHermesProfile({ ...base, customBaseUrl: 'https://example.com/v1?key=secret' })).toThrow('without credentials')
  })

  it('does not leak provider errors or credentials through connection status', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ error: SECRET }), { status: 401 })) as unknown as typeof fetch
    const result = await testHermesConnection(base, () => SECRET, {}, request)
    expect(result).toEqual({ ok: false, message: 'Provider authentication failed.' })
    expect(JSON.stringify(result)).not.toContain(SECRET)
    const thrown = vi.fn(async () => { throw new Error(`Authorization: ${SECRET}`) }) as unknown as typeof fetch
    expect(JSON.stringify(await testHermesConnection(base, () => SECRET, {}, thrown))).not.toContain(SECRET)
  })

  it('does not treat OpenRouter public model listing as proof a key works', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('/key')
      ? new Response(JSON.stringify({ error: SECRET }), { status: 401 })
      : new Response(JSON.stringify({ data: [{ id: base.model }] }), { status: 200 })) as unknown as typeof fetch
    const result = await testHermesConnection(base, () => SECRET, {}, request)
    expect(result).toEqual({ ok: false, message: 'Provider authentication failed.' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('probes the configured base URL after authenticating the provider key', async () => {
    const request = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: base.model }] }), { status: 200 }))
    const result = await testHermesConnection({ ...base, customBaseUrl: 'https://gateway.example/v1' }, () => SECRET, {}, request)
    expect(result).toEqual({ ok: true, message: 'Connected successfully.' })
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      'https://openrouter.ai/api/v1/key',
      'https://gateway.example/v1/models',
    ])
  })

  it('only injects the selected key and redacts split terminal output', () => {
    const baseEnv = hermesBaseEnvironment({ OPENROUTER_API_KEY: SECRET, OPENAI_API_KEY: 'other', PATH: '/usr/bin' })
    expect(baseEnv).toEqual({ PATH: '/usr/bin' })
    const redactor = createHermesOutputRedactor([SECRET])
    const output = redactor.push(`prefix ${SECRET.slice(0, 12)}`) + redactor.push(`${SECRET.slice(12)} suffix`) + redactor.flush()
    expect(output).toContain('[REDACTED]')
    expect(output).not.toContain(SECRET)
    expect(redactHermesSecrets(`Authorization: ${SECRET}`, [SECRET])).not.toContain(SECRET)
    expect(redactHermesSecrets('Authorization: Bearer unexpected-secret', [])).not.toContain('unexpected-secret')
    expect(redactHermesSecrets('Bearer unexpected-secret', [])).not.toContain('unexpected-secret')
    expect(redactHermesSecrets('token=unguarded-value', [])).toBe('token=[REDACTED]')
  })

  it('shows ordinary PTY echo immediately while withholding split credentials', () => {
    const redactor = createHermesOutputRedactor([SECRET])
    expect(['h', 'e', 'l', 'l', 'o', '\r', '\n'].map(char => redactor.push(char)).join('')).toBe('hello\r\n')
    expect(redactor.push(SECRET.slice(0, 9))).toBe('')
    expect(redactor.push(SECRET.slice(9))).toBe('[REDACTED]')
    expect(redactor.flush()).toBe('')
  })

  it('redacts unknown bearer and token values split across PTY chunks', () => {
    const bearer = createHermesOutputRedactor([])
    const bearerOutput = bearer.push('Autho') + bearer.push('rization: Bearer abc') + bearer.push('123\r\nready> ') + bearer.flush()
    expect(bearerOutput).toBe('Authorization: [REDACTED]\r\nready> ')
    const token = createHermesOutputRedactor([])
    const tokenOutput = token.push('token=abc') + token.push('123 ') + token.flush()
    expect(tokenOutput).toBe('token=[REDACTED] ')
  })

  it('preserves redaction across every chunk size without delaying normal prompt text', () => {
    const known = `ready> ${SECRET} done\r\n`
    const unknown = 'Authorization: Bearer abc123\r\nready> '
    for (const sample of [known, unknown]) {
      for (let size = 1; size <= sample.length; size++) {
        const redactor = createHermesOutputRedactor([SECRET])
        let output = ''
        for (let offset = 0; offset < sample.length; offset += size) output += redactor.push(sample.slice(offset, offset + size))
        output += redactor.flush()
        expect(output).not.toContain(SECRET)
        expect(output).not.toContain('abc123')
        expect(output).toContain('ready> ')
        expect(output).toContain('[REDACTED]')
      }
    }
  })

  it('writes a secret-free profile with normal Hermes tools even from a restricted legacy profile', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sclip-hermes-profile-'))
    try {
      writeFileSync(path.join(dir, 'config.yaml'), `model:\n  provider: openrouter\n  default: ${base.model}\ntools:\n  tool_search: false\nagent:\n  max_iterations: 30\n  disabled_toolsets:\n    - terminal\n    - web\n`)
      writeHermesProfile(dir, 1234, base)
      const saved = readFileSync(path.join(dir, 'config.yaml'), 'utf8')
      expect(saved).toContain('tool_search: true')
      expect(saved).not.toContain('disabled_toolsets')
      expect(saved).not.toContain('    - terminal')
      expect(saved).not.toContain(SECRET)
      expect(saved).not.toContain('api_key:')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('does not return a credential-bearing legacy base URL to renderer settings', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sclip-hermes-profile-'))
    try {
      writeFileSync(path.join(dir, 'config.yaml'), `model:\n  provider: custom\n  default: local-model\n  base_url: "https://user:${SECRET}@gateway.example/v1"\n`)
      const profile = readHermesProfile(dir)
      expect(profile.customBaseUrl).toBeUndefined()
      expect(JSON.stringify(profile)).not.toContain(SECRET)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

it('disables unsolicited title inference and preserves an explicit no-compression test profile across rewrite and creator isolation',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'sclip-no-aux-')),home=path.join(dir,'creator')
 try{
  writeFileSync(path.join(dir,'config.yaml'),'compression:\n  enabled: false\nauxiliary:\n  title_generation:\n    enabled: false\n')
  writeHermesProfile(dir,0,base)
  const first=readFileSync(path.join(dir,'config.yaml'),'utf8')
  expect(first).toContain('title_generation:\n    enabled: false')
  expect(first).toContain('compression:\n  enabled: false')
  initializeCreatorHermesControls(dir,home);writeHermesProfile(home,0,base)
  const second=readFileSync(path.join(home,'config.yaml'),'utf8')
  expect(second).toContain('title_generation:\n    enabled: false')
  expect(second).toContain('compression:\n  enabled: false')
 }finally{rmSync(dir,{recursive:true,force:true})}
})

it('routes creator interpretations through canonical evidence-linked memory without requiring learning or choosing edits',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'creator-routing-profile-'))
 try{writeFileSync(path.join(dir,'config.yaml'),'agent:\n  system_prompt: Preserve this custom instruction\n');writeHermesProfile(dir,0,base);writeHermesProfile(dir,0,base);const text=readFileSync(path.join(dir,'config.yaml'),'utf8');expect(text).toContain('Preserve this custom instruction');expect(text.match(/Creator style routing:/g)).toHaveLength(1);expect(text).toContain('mcp__weftcut__creator_style_memory');expect(text).toContain('Decline learning when the evidence is insufficient');expect(text).toContain('Do not put creator style interpretations into generic memory');expect(text).toContain('Current user instructions override remembered preferences')}
 finally{rmSync(dir,{recursive:true,force:true})}
})
