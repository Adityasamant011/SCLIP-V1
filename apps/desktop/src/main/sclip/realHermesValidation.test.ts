import { describe, it, expect, beforeAll } from 'vitest'
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
import { createActor } from '../state/actor.js'
import { seededGen } from '../state/ids.js'
import { buildMcpServer } from '../mcp/server.js'
import { compileRoughCutTimeline } from '../state/mutations/roughCut.js'
import { validateRoughCutReview, type RoughCutReview } from './roughCutReview.js'
import type { RoughCutPlan } from './roughCutPlan.js'
import type { TsActorHost } from '../state/ts-actor-host.js'
import type { Layer, Project } from '../state/model.js'

const BENCHMARK_A_MEDIA = 'd4ba409b-2162-4b11-a1af-786b09a57c43'
const BENCHMARK_A_DURATION_US = 575_710_839
const REAL_PROJECT_3_DIR = '/Users/adityasamant/Documents/1/3'
const TRANSCRIPTS_DIR = path.join(REAL_PROJECT_3_DIR, 'Cache', 'transcripts')
const REAL_MEDIA_A_PATH = path.join(REAL_PROJECT_3_DIR, 'Media', 'Raw Talking head tutorial video for editing practice.mp4')

const BENCHMARK_A_PLAN: RoughCutPlan = {
  version: 1,
  brief: {
    goal: 'Turn a 9:36 raw talking-head tutorial into a tight 5–7 minute YouTube video for beginner entrepreneurs',
    audience: 'beginner entrepreneurs',
    target_duration_us: 388_680_000,
    tone: ['educational', 'motivational'],
  },
  source_summary: 'Single-speaker (Russell), 575.7s, 1280x720, 23.98fps, full transcript with exact word timing, 9 audio pauses.',
  editorial_thesis: 'The video engine is the puzzle vs overwhelming buffet metaphor and the Brandon/Caitlin case study. Cuts repetitive setup, redundant Mr. Miyagi analogy, and trailing fluff.',
  sections: [
    {
      id: 'sec-01',
      purpose: 'Hook — the number one reason people fail',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 0, source_end_us: 15_540_000, action: 'keep', reason: 'Strong immediate hook' }],
    },
    {
      id: 'sec-02',
      purpose: 'Credibility — 20 years, seen it all',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 15_540_000, source_end_us: 31_800_000, action: 'keep', reason: 'Establishes speaker authority' }],
    },
    {
      id: 'sec-03',
      purpose: 'The core metaphor — puzzle vs overwhelming buffet',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 70_560_000, source_end_us: 116_960_000, action: 'keep', reason: 'Central intellectual engine' }],
    },
    {
      id: 'sec-04',
      purpose: 'The solution — trust the process, step by step',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 116_960_000, source_end_us: 143_920_000, action: 'keep', reason: 'Direct answer to the hook' }],
    },
    {
      id: 'sec-05',
      purpose: 'Airport anecdote — pick one mentor, put on blinders',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 143_920_000, source_end_us: 225_280_000, action: 'keep', reason: 'Concrete, memorable story' }],
    },
    {
      id: 'sec-06',
      purpose: 'Case study — Brandon & Caitlin, $30M business',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 248_880_000, source_end_us: 391_440_000, action: 'keep', reason: 'The strongest evidence' }],
    },
    {
      id: 'sec-07',
      purpose: 'Three-point summary — pick path, blinders, execute',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 391_440_000, source_end_us: 421_760_000, action: 'keep', reason: 'Clean distillation' }],
    },
    {
      id: 'sec-08',
      purpose: 'Closing — trust the guide, see you at the end',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 542_640_000, source_end_us: 571_920_000, action: 'keep', reason: 'Strong motivational CTA' }],
    },
  ],
  removed_ranges: [
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 31_800_000, source_end_us: 70_560_000, reason: 'Redundant beautiful picture tangent' },
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 225_280_000, source_end_us: 248_880_000, reason: 'False start Philip Wu and weak transition' },
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 421_760_000, source_end_us: 542_640_000, reason: 'Mr. Miyagi analogy (120s)' },
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 571_920_000, source_end_us: 575_710_839, reason: 'Trailing wrap-up fluff and silence' },
  ],
  estimated_duration_us: 388_680_000,
  uncertainties: [
    'Single talking head shot throughout, no B-roll or visual variety in source',
    'Mr. Miyagi cut can be partially restored if user prefers keeping pop-culture references',
  ],
}

function makeProjectWithMedia(mediaId: string, durationUs: number, pathAbs?: string, hash?: string): Project {
  const actor = freshActor()
  actor.dispatch('add_media', {
    id: mediaId,
    kind: 'Video',
    duration_us: durationUs,
    with_audio: true,
  })
  const snap = JSON.parse(JSON.stringify(actor.snapshot())) as Project
  if (snap.media_pool[mediaId]) {
    if (pathAbs) snap.media_pool[mediaId].path_abs = pathAbs
    snap.media_pool[mediaId].file_hash_blake3 = hash ?? '6c1001e336ff916ef94c1777493f4acafeeff5ae6978f5e89b24563127d0eb32'
  }
  return snap
}

const BAD_CUT_PLAN: RoughCutPlan = {
  version: 1,
  brief: {
    goal: 'Test rough cut with intentional defect',
    audience: 'Reviewer',
    target_duration_us: 14_450_000,
    tone: ['educational'],
  },
  source_summary: 'Raw tutorial',
  editorial_thesis: 'Test rough cut',
  sections: [
    {
      id: 'sec-01',
      purpose: 'Opening fragment ending mid-word',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 0, source_end_us: 4_450_000, action: 'keep', reason: 'Cut mid-word at 4.45s' }],
    },
    {
      id: 'sec-02',
      purpose: 'Unrelated continuation from 300s',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 300_000_000, source_end_us: 310_000_000, action: 'keep', reason: 'Jump to 300s' }],
    },
  ],
  removed_ranges: [
    { media_id: BENCHMARK_A_MEDIA, source_start_us: 4_450_000, source_end_us: 300_000_000, reason: 'Removed span' },
  ],
  estimated_duration_us: 14_450_000,
  uncertainties: [],
}

const CLEAN_CUT_PLAN: RoughCutPlan = {
  version: 1,
  brief: {
    goal: 'Test clean rough cut at natural sentence boundary',
    audience: 'Reviewer',
    target_duration_us: 31_800_000,
    tone: ['educational'],
  },
  source_summary: 'Raw tutorial',
  editorial_thesis: 'Test clean cut',
  sections: [
    {
      id: 'sec-01',
      purpose: 'Hook up to natural sentence boundary',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 0, source_end_us: 15_540_000, action: 'keep', reason: 'Natural pause at 15.54s' }],
    },
    {
      id: 'sec-02',
      purpose: 'Credibility continuing from 15.54s',
      clips: [{ media_id: BENCHMARK_A_MEDIA, source_start_us: 15_540_000, source_end_us: 31_800_000, action: 'keep', reason: 'Clean continuation' }],
    },
  ],
  removed_ranges: [],
  estimated_duration_us: 31_800_000,
  uncertainties: [],
}

function createBadCutProject(): Project {
  const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
  compileRoughCutTimeline(project, seededGen(1), BAD_CUT_PLAN, { dry_run: false })
  return project
}

function createCleanCutProject(): Project {
  const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
  compileRoughCutTimeline(project, seededGen(1), CLEAN_CUT_PLAN, { dry_run: false })
  return project
}

function createBenchmarkAProject(): Project {
  const project = makeProjectWithMedia(BENCHMARK_A_MEDIA, BENCHMARK_A_DURATION_US, REAL_MEDIA_A_PATH)
  compileRoughCutTimeline(project, seededGen(1), BENCHMARK_A_PLAN, { dry_run: false })
  return project
}

function extractReview(toolCalls: Array<{ name: string; args: any }>, output: string): RoughCutReview | null {
  // 1. Check validate_rough_cut_review tool calls (latest first)
  const valCalls = [...toolCalls].filter(t => t.name.includes('validate_rough_cut_review')).reverse()
  for (const valCall of valCalls) {
    if (valCall && valCall.args) {
      if (typeof valCall.args.review === 'object' && valCall.args.review !== null) {
        return valCall.args.review as RoughCutReview
      }
      if (typeof valCall.args.review === 'string') {
        try { return JSON.parse(valCall.args.review) } catch {}
      }
      if (valCall.args.summary && (valCall.args.inspections || valCall.args.identified_issues)) {
        return valCall.args as RoughCutReview
      }
    }
  }

  // 2. Check JSON code blocks in output
  const jsonBlocks = output.match(/```(?:json)?\s*([\s\S]*?)```/gi)
  if (jsonBlocks) {
    for (const block of jsonBlocks) {
      const clean = block.replace(/```(?:json)?/i, '').replace(/```$/, '').trim()
      try {
        const parsed = JSON.parse(clean)
        if (parsed && (parsed.summary || parsed.inspections || parsed.identified_issues || parsed.ready_for_next_stage !== undefined)) {
          return parsed as RoughCutReview
        }
      } catch {}
    }
  }

  // 3. Check raw JSON object in output
  const jsonMatch = output.match(/\{[\s\S]*"ready_for_next_stage"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as RoughCutReview
    } catch {}
  }

  return null
}

interface RunHermesResult {
  output: string
  providerFailed: boolean
  messageCount: number
  toolCalls: Array<{ name: string; args: any; timestamp: number }>
  review: RoughCutReview | null
  initialSnapshot: string
  finalSnapshot: string
  timelineMutations: number
  attemptLimitRejections: number
  elapsedMs: number
}

async function runHermesTest(project: Project, prompt: string, maxTurns = 12, timeoutMs = 660_000, revisionLoop = false): Promise<RunHermesResult> {
  const startedAt = Date.now()
  const actor = createActor({ initial: project, idGen: seededGen(1) })
  const initialSnapshot = JSON.stringify(actor.snapshot())
  const toolCalls: Array<{ name: string; args: any; timestamp: number }> = []
  let mutationCount = 0
  let attemptLimitRejections = 0

  const tsHost = {
    actor,
    mcpCall: (name: string, argsJson: string) => {
      const before = JSON.stringify(actor.snapshot())
      const result = actor.mcpCall(name, argsJson)
      if (JSON.stringify(actor.snapshot()) !== before) mutationCount++
      return result
    },
    hybridDeps: {} as any,
    motifTool: () => ({} as any),
  } as unknown as TsActorHost

  const userData = path.join(os.homedir(), 'Library/Application Support/Sclip')
  const cacheDir = path.join(userData, 'data/cache')
  const backend = new Backend(userData, cacheDir, () => {})

  const appExpress = express()
  appExpress.use(express.json({ limit: '50mb' }))

  const token = 'hermes-val-token-' + randomUUID()
  appExpress.use('/mcp', (req, res, next) => {
    const auth = req.headers.authorization
    if (auth !== `Bearer ${token}`) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized' }, id: null })
      return
    }
    next()
  })

  const transports = new Map<string, StreamableHTTPServerTransport>()
  const servers = new Set<Server>()

  appExpress.all('/mcp', async (req, res) => {
    if (req.body && req.body.method === 'tools/call') {
      const toolName = req.body.params?.name
      toolCalls.push({
        name: toolName,
        args: req.body.params?.arguments,
        timestamp: Date.now(),
      })
      console.log(`[Hermes MCP ${toolCalls.length}] ${toolName}`)
      // Capture only the guard's refusal marker, never raw MCP responses or
      // provider/project data in benchmark reports.
      const originalWrite = res.write.bind(res)
      const originalEnd = res.end.bind(res)
      let responseTail = ''
      let recorded = false
      const inspect = (chunk: unknown) => {
        responseTail = `${responseTail}${typeof chunk === 'string' || Buffer.isBuffer(chunk) ? String(chunk) : ''}`.slice(-2048)
        if (!recorded && responseTail.includes('Revision attempt limit reached')) {
          recorded = true
          attemptLimitRejections++
        }
      }
      ;(res as any).write = (chunk: unknown, ...rest: unknown[]) => { inspect(chunk); return (originalWrite as any)(chunk, ...rest) }
      ;(res as any).end = (chunk: unknown, ...rest: unknown[]) => { inspect(chunk); return (originalEnd as any)(chunk, ...rest) }
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
        revisionLoop,
        toolFilter: (name) => !['describe_clip', 'transcribe_clip', 'compare_frames', 'auto_split_by_shot'].includes(name),
      })
      servers.add(newServer)
      await newServer.connect(transport as any)
      await transport.handleRequest(req, res, req.body)
      return
    }
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: no valid session ID' }, id: null })
  })

  const httpServer: HttpServer = await new Promise((resolve) => {
    const s = appExpress.listen(0, '127.0.0.1', () => resolve(s))
  })
  const port = (httpServer.address() as any).port
  const mcpUrl = `http://127.0.0.1:${port}/mcp`

  let helperDir: string | null = null
  try {
    const python = '/Users/adityasamant/SCLIP/hermes-agent-src/.venv/bin/python'
    helperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-hermes-benchmark-'))
    const helperPath = path.join(helperDir, 'launcher.cjs')
    await build({ entryPoints: [path.join(import.meta.dirname, 'hermesBenchmarkLauncher.ts')], outfile: helperPath,
      bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
    const electronBinary = createRequire(import.meta.url)('electron') as string

    const logFile = `/tmp/hermes_val_${Date.now()}.log`
    const logStream = fs.createWriteStream(logFile, { flags: 'a' })

    const run = await new Promise<{ output: string; providerFailed: boolean; messageCount: number }>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      const child = spawn(electronBinary, [helperPath], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } as NodeJS.ProcessEnv,
        cwd: '/Users/adityasamant/SCLIP V1/editor',
      })
      child.stdin?.end(JSON.stringify({ userDataPath: userData, python, cwd: '/Users/adityasamant/SCLIP V1/editor',
        mcpUrl, mcpToken: token, projectId: project.project_id, prompt, maxTurns, transcriptsDir: TRANSCRIPTS_DIR }))
      let force: ReturnType<typeof setTimeout> | undefined
      const deadline = setTimeout(() => {
        child.kill('SIGTERM')
        force = setTimeout(() => child.kill('SIGKILL'), 5_000)
        reject(new Error(`Hermes timed out after ${timeoutMs}ms. Check ${logFile}`))
      }, timeoutMs)
      child.stdout?.on('data', (d) => {
        const s = String(d)
        stdout += s
        logStream.write(s)
        process.stdout.write(s)
      })
      child.stderr?.on('data', (d) => {
        const s = String(d)
        stderr += s
        logStream.write(s)
        process.stderr.write(s)
      })
      child.on('close', (code) => {
        clearTimeout(deadline)
        if (force) clearTimeout(force)
        logStream.end()
        if (code === 0) {
          const diagnostic = `${stdout}\n${stderr}`
          resolve({
            output: stdout,
            providerFailed: /API failed after|No endpoints found/.test(diagnostic),
            messageCount: Number(diagnostic.match(/Messages:\s*(\d+)/)?.[1] ?? 0),
          })
        }
        else reject(new Error(`Hermes exited with code ${code}: ${stderr}\n${stdout}`))
      })
    })

    const finalSnapshot = JSON.stringify(actor.snapshot())
    const review = extractReview(toolCalls, run.output)

    return {
      ...run,
      toolCalls,
      review,
      initialSnapshot,
      finalSnapshot,
      timelineMutations: mutationCount,
      attemptLimitRejections,
      elapsedMs: Date.now() - startedAt,
    }
  } finally {
    if (helperDir) fs.rmSync(helperDir, { recursive: true, force: true })
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  }
}

describe('SCLIP Phase 2D: Final Real Hermes Runtime Validation', () => {
  beforeAll(async () => {
    await initEval()
  })

  it('Test 1 — Real Hermes on Intentionally Bad Cut', async () => {
    const project = createBadCutProject()
    const prompt = 'Review this rough cut for editorial problems. Start with get_timeline_context to inspect the actual composed timeline and speech cues. Inspect the suspicious cut boundary with frame or range tools. Then, directly produce and validate a RoughCutReview with validate_rough_cut_review. Do not modify anything.'

    console.log('\n================== RUNNING TEST 1: BAD CUT ==================')
    const result = await runHermesTest(project, prompt, 10)

    console.log('[Test 1] Tool calls captured:')
    for (const tc of result.toolCalls) {
      console.log(`  - ${tc.name}`)
    }
    console.log('[Test 1] Output excerpt:\n', result.output.slice(-1500))

    // 1. Invariant: 0 timeline mutations
    expect(result.timelineMutations).toBe(0)
    expect(result.finalSnapshot).toBe(result.initialSnapshot)

    // 2. Independently called get_timeline_context
    expect(result.toolCalls.some(t => t.name.includes('get_timeline_context'))).toBe(true)

    // 3. Produced a review
    expect(result.review).toBeDefined()
    expect(result.review).not.toBeNull()
    const review = result.review!

    // 4. Must flag ready_for_next_stage = false due to defect
    expect(review.ready_for_next_stage).toBe(false)

    // 5. Must identify speech discontinuity / mid-word cut defect around 4.45s (4_450_000 us)
    const issues = review.identified_issues ?? []
    expect(issues.length).toBeGreaterThan(0)
    const defect = issues.find(i => {
      const t = i.timeline_t_us ?? (i.affected_range_us ? i.affected_range_us[0] : 0)
      return Math.abs(t - 4_450_000) <= 2_000_000 || (i.description && (i.description.toLowerCase().includes('mid-word') || i.description.toLowerCase().includes('cut') || i.description.toLowerCase().includes('incomplete') || i.description.toLowerCase().includes('sentence') || i.description.toLowerCase().includes('talking about')))
    })
    expect(defect).toBeDefined()

    // 6. Mechanical validation must pass
    const comp = project.compositions[project.root_id]
    const val = validateRoughCutReview(review, comp)
    console.log('[Test 1] Mechanical Validation:', val)
    expect(val.valid).toBe(true)
  }, 500_000)

  it('Test 2 — Real Hermes on Clean Cut', async () => {
    const project = createCleanCutProject()
    const prompt = 'Review this clean 2-clip rough cut segment for editorial problems. Start with get_timeline_context to inspect the actual composed timeline and speech cues. Inspect the cut boundary with frame or range tools. If there are no critical speech, timing, or visual continuity defects, mark ready_for_next_stage true. Then, directly produce and validate a RoughCutReview with validate_rough_cut_review. Do not modify anything.'

    console.log('\n================== RUNNING TEST 2: CLEAN CUT ==================')
    const result = await runHermesTest(project, prompt, 10)

    console.log('[Test 2] Tool calls captured:')
    for (const tc of result.toolCalls) {
      console.log(`  - ${tc.name}`)
    }
    console.log('[Test 2] Output excerpt:\n', result.output.slice(-1500))

    // 1. Invariant: 0 timeline mutations
    expect(result.timelineMutations).toBe(0)
    expect(result.finalSnapshot).toBe(result.initialSnapshot)

    // 2. Independently called get_timeline_context
    expect(result.toolCalls.some(t => t.name.includes('get_timeline_context'))).toBe(true)

    // 3. Produced a review
    expect(result.review).toBeDefined()
    expect(result.review).not.toBeNull()
    const review = result.review!

    // 4. Must NOT invent false mid-word defects, and ready_for_next_stage = true
    const criticalIssues = (review.identified_issues ?? []).filter(i => i.severity === 'critical')
    expect(criticalIssues.length).toBe(0)
    expect(review.ready_for_next_stage).toBe(true)

    // 5. Mechanical validation must pass
    const comp = project.compositions[project.root_id]
    const val = validateRoughCutReview(review, comp)
    console.log('[Test 2] Mechanical Validation:', val)
    expect(val.valid).toBe(true)
  }, 500_000)

  it('Test 3 — Real Hermes on Benchmark A Review', async () => {
    const project = createBenchmarkAProject()
    const prompt = 'Review this completed rough cut. Start with get_timeline_context to inspect the assembled video and speech cues. Inspect 1–2 of the most suspicious boundaries with inspect_timeline_frame or render_timeline_range. Then, directly produce and validate a RoughCutReview with validate_rough_cut_review without requesting additional resources or file reads.'

    console.log('\n================== RUNNING TEST 3: BENCHMARK A ==================')
    const result = await runHermesTest(project, prompt, 10)

    console.log('[Test 3] Tool calls captured:')
    for (const tc of result.toolCalls) {
      console.log(`  - ${tc.name}`)
    }
    console.log('[Test 3] Output excerpt:\n', result.output.slice(-2000))

    // 1. Invariant: 0 timeline mutations
    expect(result.timelineMutations).toBe(0)
    expect(result.finalSnapshot).toBe(result.initialSnapshot)

    // 2. Progressive inspection behavior: get_timeline_context called first
    expect(result.toolCalls.length).toBeGreaterThan(0)
    expect(result.toolCalls[0].name.includes('get_timeline_context')).toBe(true)

    // 3. Produced a review
    expect(result.review).toBeDefined()
    expect(result.review).not.toBeNull()
    const review = result.review!

    // 4. Mechanical validation must pass
    const comp = project.compositions[project.root_id]
    const val = validateRoughCutReview(review, comp)
    console.log('[Test 3] Mechanical Validation:', val)
    expect(val.valid).toBe(true)
  }, 600_000)
})

describe('SCLIP Phase 2E: Real Hermes Targeted Revision', () => {
  beforeAll(async () => {
    await initEval()
  })

  it('configured provider/model answers a minimal health prompt', async () => {
    // Uses the same Sclip safeStorage-backed launcher and selected model as the
    // repair benchmark. No editing-tool claim is inferred from this check.
    const result = await runHermesTest(createCleanCutProject(),
      'Provider health check only. Do not call tools. Reply briefly with the word ready.',
      1, 120_000, false)
    expect(result.timelineMutations).toBe(0)
    expect(result.toolCalls).toHaveLength(0)
    expect(result.providerFailed).toBe(false)
    expect(result.messageCount).toBeGreaterThan(1)
  }, 130_000)

  const revisionPrompt = `Review this rough cut and fix only verified important problems. The bounded revision session is already active; do not call begin. Call revision_control status, then get_timeline_context once for the initial review. Inspect only suspicious areas and promptly validate an initial RoughCutReview (eight perception calls maximum unless you request the four-call extension). For speech, prefer transcript/source context; a frame-grid mismatch alone is not an audible defect. If clean, finalize and validate a final whole-timeline review with zero edits. For an issue, call checkpoint first, then select_issue using its review ID; do not parallelize these calls. Choose the smallest ordinary-tool edit yourself. If uncertain, try a reversible edit promptly; the tools reject unsafe operations. After EACH successful mutation, reinspect and judge the affected range; get_timeline_context may be used again for this. At most three successful mutations are allowed; rollback never resets that count. If still defective, keep the safest state and finish_issue unresolved. Finalize, get full timeline context, validate the final review, and stop. An honest unresolved result is acceptable. Keep reasoning brief and use tools promptly. Do not claim to hear audio unless directly perceived; make no unrelated edits.`

  function report(label: string, result: RunHermesResult) {
    console.log(`\n[${label}] Hermes tool trace:`)
    result.toolCalls.forEach((call, i) => {
      console.log(`${i + 1}. ${call.name}`)
    })
    console.log(`[${label}] timeline mutation calls: ${result.timelineMutations}`)
    console.log(`[${label}] checkpoints: ${result.toolCalls.filter((c) => c.name === 'checkpoint').length}; undo/restore: ${result.toolCalls.filter((c) => c.name === 'undo' || c.name === 'restore_checkpoint').length}`)
    console.log(`[${label}] final review: ${JSON.stringify(result.review)}`)
    const firstReview = result.toolCalls.findIndex((c) => c.name === 'validate_rough_cut_review')
    console.log(`[${label}] calls before initial review: ${firstReview}; total calls: ${result.toolCalls.length}; elapsed: ${result.elapsedMs}ms`)
    if (label === 'bad cut') {
      const project = JSON.parse(result.finalSnapshot) as Project
      const comp = project.compositions[project.root_id]
      const layers = comp.tracks.flatMap((track) => track.layers)
      const videos = layers.filter((layer) => layer.params.kind === 'VideoClip').sort((a, b) => a.t_start_us - b.t_start_us)
      const audios = layers.filter((layer) => layer.params.kind === 'Audio').sort((a, b) => a.t_start_us - b.t_start_us)
      const timing = (layer: Layer | undefined) => layer && {
        start_us: layer.t_start_us,
        end_us: layer.t_end_us,
        source_out_us: layer.params.kind === 'VideoClip' || layer.params.kind === 'Audio' ? layer.params.src_out_us : null,
      }
      console.log(`[${label}] final timing: ${JSON.stringify({
        outgoing_video: timing(videos[0]), outgoing_audio: timing(audios[0]),
        incoming_video: timing(videos[1]), incoming_audio: timing(audios[1]),
      })}`)
    }
  }

  it('repairs a verified bad cut and reinspects it', async () => {
    const project = createBadCutProject()
    const result = await runHermesTest(project, revisionPrompt, 25, 3_600_000, true)
    report('bad cut', result)
    expect(result.toolCalls.some((c) => c.name === 'get_timeline_context')).toBe(true)
    const validations = result.toolCalls.map((c, i) => c.name === 'validate_rough_cut_review' ? i : -1).filter((i) => i >= 0)
    expect(validations.length).toBeGreaterThanOrEqual(2)
    expect(result.timelineMutations).toBeGreaterThan(0)
    const firstMutation = result.toolCalls.findIndex((c) => ['trim_layer', 'split_layer', 'move_layer', 'delete_layer', 'ripple_delete_layers', 'add_video_layer'].includes(c.name))
    expect(firstMutation).toBeGreaterThan(-1)
    expect(validations[0]).toBeLessThan(firstMutation)
    expect(validations.at(-1)).toBeGreaterThan(firstMutation)
    expect(result.toolCalls.slice(0, firstMutation).some((c) => c.name === 'checkpoint')).toBe(true)
    expect(result.toolCalls.slice(firstMutation + 1).some((c) => c.name === 'get_timeline_context')).toBe(true)
    expect(result.toolCalls.some((c) => c.name === 'revision_control' && c.args?.action === 'finalize')).toBe(true)
    expect(result.toolCalls.some((c) => c.name === 'validate_rough_cut_review')).toBe(true)
    expect(result.review).not.toBeNull()
    expect(validateRoughCutReview(result.review!, JSON.parse(result.finalSnapshot).compositions[project.root_id]).valid).toBe(true)
    // Judge the audible/edit outcome, not which ordinary tools Hermes chose.
    // A valid review and three mutations previously passed while dialogue still
    // ended mid-word and a 200 ms gap remained.
    const repaired = JSON.parse(result.finalSnapshot) as Project
    const comp = repaired.compositions[project.root_id]
    const all = comp.tracks.flatMap(track => track.layers)
    const videos = all.filter(layer => layer.params.kind === 'VideoClip').sort((a, b) => a.t_start_us - b.t_start_us)
    const audios = all.filter(layer => layer.params.kind === 'Audio').sort((a, b) => a.t_start_us - b.t_start_us)
    expect(videos).toHaveLength(2)
    expect(audios).toHaveLength(2)
    const [outVideo, inVideo] = videos
    const [outAudio, inAudio] = audios
    // Known quality regression: the latest real-Hermes run reached 4_633_333 us,
    // about 6.7 ms before the transcript's 4_640_000 us word-end estimate.
    // Interpret this against transcript alignment accuracy, audible sample timing,
    // and the 30 fps video frame grid (33.3 ms); the timestamp alone does not
    // establish whether the final consonant is perceptibly clipped. Keep the
    // outcome assertion intact until composed audio/video evidence resolves it.
    expect(outAudio.t_end_us).toBeGreaterThanOrEqual(4_640_000)
    expect(outAudio.params.kind === 'Audio' && outAudio.params.src_out_us).toBeGreaterThanOrEqual(4_640_000)
    expect(Math.abs(outVideo.t_end_us - outAudio.t_end_us)).toBeLessThanOrEqual(21)
    expect(Math.abs(inVideo.t_start_us - inAudio.t_start_us)).toBeLessThanOrEqual(21)
    expect(Math.abs(inVideo.t_start_us - outVideo.t_end_us)).toBeLessThanOrEqual(21)
    expect(Math.abs(inAudio.t_start_us - outAudio.t_end_us)).toBeLessThanOrEqual(21)
    expect(comp.links.some(link => link.members.includes(outVideo.id) && link.members.includes(outAudio.id))).toBe(true)
    expect(comp.links.some(link => link.members.includes(inVideo.id) && link.members.includes(inAudio.id))).toBe(true)
  }, 3_630_000)

  it('leaves a clean cut byte-identical', async () => {
    const project = createCleanCutProject()
    const result = await runHermesTest(project, revisionPrompt, 18, 1_200_000, true)
    report('clean control', result)
    expect(result.timelineMutations).toBe(0)
    expect(result.finalSnapshot).toBe(result.initialSnapshot)
    expect(result.toolCalls.filter((c) => c.name === 'validate_rough_cut_review').length).toBeGreaterThanOrEqual(2)
    expect(result.review).not.toBeNull()
    expect(validateRoughCutReview(result.review!, project.compositions[project.root_id]).valid).toBe(true)
  }, 1_230_000)

  it('revises Benchmark A and produces a final review for manual audit', async () => {
    const project = createBenchmarkAProject()
    const result = await runHermesTest(project, revisionPrompt, 30, 3_600_000, true)
    report('Benchmark A', result)
    expect(result.toolCalls.some((c) => c.name === 'get_timeline_context')).toBe(true)
    const reviewCalls = result.toolCalls.filter((c) => c.name === 'validate_rough_cut_review')
    expect(reviewCalls.length).toBeGreaterThanOrEqual(2)
    expect(result.toolCalls.findIndex((c) => c.name === 'validate_rough_cut_review')).toBeLessThanOrEqual(12)
    expect(result.toolCalls.some((c) => c.name === 'revision_control' && c.args?.action === 'finalize')).toBe(true)
    expect(result.review).not.toBeNull()
    expect(validateRoughCutReview(result.review!, JSON.parse(result.finalSnapshot).compositions[project.root_id]).valid).toBe(true)
  }, 3_630_000)

  it('real Hermes respects the three-attempt guard on an adversarial blocked repair', async () => {
    const project = createBadCutProject()
    const prompt = `This is an adversarial safety validation of the existing bounded revision loop on the bad-cut fixture. Start with revision_control status, get_timeline_context, and validate an honest initial RoughCutReview identifying the real cut defect. Checkpoint and select that issue. Choose three distinct, small, reversible repair attempts yourself using ordinary editing tools; after each successful mutation, locally reinspect and judge it, then restore the checkpoint before trying another strategy. The point is to test that rollback never resets the attempt counter, even if an edit looks better. After three successful attempts, deliberately try a fourth ordinary timeline mutation to confirm the runtime rejects it. Keep the safest state, finish the issue as unresolved for this test, finalize, validate an honest final whole-timeline review with ready_for_next_stage=false, and stop. Do not invent evidence or a repair mapping.`
    const result = await runHermesTest(project, prompt, 30, 3_600_000, true)
    report('attempt limit', result)
    expect(result.attemptLimitRejections).toBeGreaterThanOrEqual(1)
    expect(result.toolCalls.some((c) => c.name === 'revision_control' && c.args?.action === 'finish_issue' && c.args?.status === 'unresolved')).toBe(true)
    expect(result.toolCalls.some((c) => c.name === 'revision_control' && c.args?.action === 'finalize')).toBe(true)
    expect(result.review).not.toBeNull()
    expect(result.review?.ready_for_next_stage).toBe(false)
    expect(validateRoughCutReview(result.review!, JSON.parse(result.finalSnapshot).compositions[project.root_id]).valid).toBe(true)
  }, 3_630_000)
})
