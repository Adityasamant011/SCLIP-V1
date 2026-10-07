/**
 * End-to-end Hermes test with text-only Nemotron calling the new local `vision_inspect` tool.
 *
 * Verifies that:
 *  1. Hermes (configured with text-only Nemotron) discovers and calls `vision_inspect`.
 *  2. `vision_inspect` executes locally via the VisionSidecar (MLX).
 *  3. Hermes reads the structured JSON output and provides a truthful response about the frame.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { type Server as HttpServer } from 'node:http'
import { spawn } from 'node:child_process'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { Backend } from '@weftcut/core'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

import { freshActor } from '../state/__tests__/pbt/harness.js'
import { initEval } from '../../renderer/eval/index.js'
import { buildMcpServer } from '../mcp/server.js'
import type { TsActorHost } from '../state/ts-actor-host.js'
import { AgentActivityService } from '../agent/activity.js'
import { disposeVisionRuntime } from './visionRuntime.js'

describe.skipIf(process.env.SCLIP_ALLOW_PROVIDER_TESTS !== '1')('End-to-End Hermes vision_inspect Test', () => {
  beforeAll(async () => {
    await initEval()
  })

  afterAll(async () => {
    await disposeVisionRuntime()
  })

  it('Hermes text-only model inspects frame via local vision_inspect tool and answers truthfully', async () => {
    const userData = path.join(os.homedir(), 'Library', 'Application Support', 'Sclip')
    const cacheDir = path.join(userData, 'data', 'cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    const backend = new Backend(userData, cacheDir, () => {})
    const actor = freshActor()
    const hybridDeps = {
      actor,
      compute: {} as TsActorHost['hybridDeps']['compute'],
      enqueueDerivatives: async () => {},
      enqueueWorkspaceCopy: async () => {},
      workspaceDir: () => null,
      readFile: () => '',
      snapshotComposition: () => ({ width: 1080, height: 1920, duration_us: 0 }),
    }

    const tsHost = {
      actor,
      mcpCall: (name, argsJson) => actor.mcpCall(name, argsJson),
      motifTool: () => ({ error: 'not supported in test' }),
      hybridDeps,
      mcpHybridDeps: hybridDeps,
      agent: new AgentActivityService(actor, () => {}),
      handleInvoke: async () => null,
      refreshMotifCatalog: () => {},
      start: () => {},
      stop: () => {},
    } as TsActorHost

    const appExpress = express()
    appExpress.use(express.json())
    const servers = new Set<Server>()
    const transports = new Map<string, StreamableHTTPServerTransport>()
    const toolCalls: Array<{ name: string; args: any }> = []

    appExpress.post('/mcp', async (req, res) => {

      // Capture tool calls from HTTP request body if present
      if (req.body && req.body.method === 'tools/call') {
        toolCalls.push({ name: req.body.params?.name, args: req.body.params?.arguments })
      }

      const sid = req.headers['mcp-session-id'] as string | undefined
      let transport = sid ? transports.get(sid) : undefined
      if (transport) {
        await transport.handleRequest(req, res, req.body)
        return
      }
      if (!sid && isInitializeRequest(req.body)) {
        const connectionId = randomUUID()
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => connectionId,
          onsessioninitialized: (id) => {
            transports.set(id, transport!)
          },
          enableDnsRebindingProtection: false,
        })
        transport.onclose = () => {
          const sessionId = transport!.sessionId
          if (sessionId) transports.delete(sessionId)
        }
        const newServer = buildMcpServer(backend, {
          getTsHost: () => tsHost,
          connectionId,
          toolFilter: (name) => ['vision_inspect', 'inspect_timeline_frame', 'get_timeline_context'].includes(name),
        })
        servers.add(newServer)
        await newServer.connect(transport as any)
        await transport.handleRequest(req, res, req.body)
        return
      }
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request' }, id: null })
    })

    const httpServer: HttpServer = await new Promise((resolve) => {
      const s = appExpress.listen(0, '127.0.0.1', () => resolve(s))
    })
    const port = (httpServer.address() as any).port
    const mcpUrl = `http://127.0.0.1:${port}/mcp`

    let helperDir: string | null = null
    try {
      const python = '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
      helperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-hermes-vision-'))
      const helperPath = path.join(helperDir, 'launcher.cjs')
      await build({
        entryPoints: [path.join(import.meta.dirname, 'hermesBenchmarkLauncher.ts')],
        outfile: helperPath,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        external: ['electron'],
        logLevel: 'silent',
      })
      const electronBinary = createRequire(import.meta.url)('electron') as string

      const logFile = `/tmp/hermes_vision_test_${Date.now()}.log`
      const logStream = fs.createWriteStream(logFile, { flags: 'a' })

      const prompt = `Use the vision_inspect tool to inspect the image frame located at '/tmp/test-frame-current.png'.
Ask the question: "Is a person's face clearly visible in this image? If not, what is visible?"
Review the evidence returned by vision_inspect and summarize truthfully whether the speaker is visible.`

      const run = await new Promise<{ output: string }>((resolve, reject) => {
        let stdout = ''
        let stderr = ''
        const child = spawn(electronBinary, [helperPath], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } as NodeJS.ProcessEnv,
          cwd: '/Users/adityasamant/SCLIP V1/editor',
        })
        child.stdin?.end(JSON.stringify({
          userDataPath: userData,
          python,
          cwd: '/Users/adityasamant/SCLIP V1/editor',
          mcpUrl,
          mcpToken: 'test-token',
          projectId: actor.snapshot().project_id,
          prompt,
          maxTurns: 5,
          transcriptsDir: '/tmp',
          toolsets: 'web,skills,todo,memory,clarify,weftcut',
        }))
        const deadline = setTimeout(() => {
          child.kill('SIGTERM')
          reject(new Error(`Hermes timed out after 90s. Check ${logFile}`))
        }, 90_000)

        child.stdout?.on('data', (d) => {
          const s = String(d)
          stdout += s
          logStream.write(s)
        })
        child.stderr?.on('data', (d) => {
          const s = String(d)
          stderr += s
          logStream.write(s)
        })
        child.on('close', (code) => {
          clearTimeout(deadline)
          logStream.end()
          if (code === 0) resolve({ output: stdout })
          else reject(new Error(`Hermes exited with code ${code}: ${stderr}\n${stdout}`))
        })
      })

      console.log('Hermes Output:', run.output)
      console.log('Tool calls made:', toolCalls.map(t => t.name))

      // Assert that vision_inspect was called
      const calledVisionInspect = toolCalls.some(t => t.name === 'vision_inspect')
      expect(calledVisionInspect).toBe(true)

      // Assert that Hermes truthfully reports the result
      const outputLower = run.output.toLowerCase()
      const truthReported = ['not visible', 'no face', 'hand', 'microphone', 'mic', 'cannot see', 'off-screen'].some(w => outputLower.includes(w))
      expect(truthReported).toBe(true)
    } finally {
      if (helperDir) fs.rmSync(helperDir, { recursive: true, force: true })
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
    }
  }, 120_000)
})
