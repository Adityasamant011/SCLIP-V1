import { AssetJobs } from '../sclip/assetJobs.js'
import { runtimeTrace } from '../sclip/runtimeTrace.js'
import { CompletionCheckpoint } from '../sclip/completionCheckpoint.js'
import { validTurnEvent, type HermesLifecycleLease, type HermesTurnObserver } from '../sclip/hermesLifecycle.js'
import { verifyDelivery } from '../sclip/finalOutput.js'
import { randomBytes } from 'node:crypto'
import { setEditingBrief } from '../sclip/completionReview.js'
import { currentCritique } from '../sclip/reviewer/currentCritique.js'
import { completionDisposition, type CompletionReview } from '../sclip/completionReview.js'
import {evidenceCoverage} from '../sclip/evidenceModalities.js'
import { buildEditorialEvidencePacket } from '../sclip/editorialEvidencePacket.js'
import { reviewState } from '../sclip/evidenceCoordinates.js'
import express from 'express'
import { RevisionLoopGuard } from '../sclip/revisionLoopGuard.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { buildMcpServer, registeredMcpTools, type McpServerOptions } from './server.js'
import { loadOrInitAuth, saveAuth, rotateToken, type McpAuth } from './auth.js'
import { listenLoopback } from './bind.js'
import { NO_MCP_LOG, type McpLogEntryInput } from './withLog.js'
import type { AgentConnection, AgentConnectionSnapshot } from '../../shared/agent-activity.js'

type Backend = import('@weftcut/core').Backend

export interface McpInfoView {
  bind: string
  url: string
  bearer_token: string
}

export interface McpHost {
  setEditingBrief(brief: string | null, projectId?: string): void
  registerHermesTerminal(projectId: string, sessionId: string, handler: HermesTurnObserver): HermesLifecycleLease
  reviewDisposition(): ReturnType<typeof completionDisposition> | {status:string}
  getInfo(): McpInfoView
  getToolCount(): number
  connectionSnapshot(): AgentConnectionSnapshot
  resetToken(): string
  notifyChange(summary: unknown): void
  close(): Promise<void>
}

/** Host-level seams, forwarded verbatim to every per-session `buildMcpServer`. */
export type McpHostOptions = McpServerOptions

export async function startMcpHost(backend: Backend, opts: McpHostOptions = {}): Promise<McpHost> {
  // Use the host's actual discovery options, including optional local senses.
  const toolCount = (await registeredMcpTools(backend, opts)).length
  let auth: McpAuth = loadOrInitAuth()
  const transports = new Map<string, StreamableHTTPServerTransport>()
  const servers = new Set<Server>()
  const reviews = new Map<string, { projectId: string; guard: RevisionLoopGuard }>()
  const connections = new Map<string, AgentConnection>()
  const completionReviews = new Map<string, CompletionReview>()
  const assetJobs=new AssetJobs()
  const reviewJobs=new AssetJobs(['inspect_audio_visual_alignment','inspect_timeline_range_visuals','inspect_rendered_audio','inspect_timeline_temporal_window','render_timeline_range'])
  opts={...opts,assetJobs,reviewJobs}
  const checkpoint = new CompletionCheckpoint(completionReviews,{
    current:()=>{const ts=opts.getTsHost?.();if(!ts?.actor||!ts.agent)return undefined;const activity=ts.agent.snapshot();return {actor:ts.actor,opening:activity.workspace_id,pending:activity.activities.some(a=>a.state==='running')||assetJobs.pending(activity.workspace_id)||reviewJobs.pending(activity.workspace_id),creatorKey:opts.creatorStyleStore?.sessionKey(ts.actor.snapshot().project_id)}},
    review:()=>opts.getReviewerSummary?.(true),
    verify:(project,requirements,signal)=>opts.verifyCompletionOutput?opts.verifyCompletionOutput(project,requirements,signal):verifyDelivery(project,requirements,opts.getActiveWindow??(()=>null),signal),
    endWork:binding=>{const agent=opts.getTsHost?.()?.agent,owned=agent?.snapshot().session?.connection_id;if(owned&&binding.connections.has(owned))agent!.end('agent',owned)},
  })
  const nativeTerminals=new Map<string,{token:string;binding:import('../sclip/completionCheckpoint.js').TerminalBinding;handler:HermesTurnObserver}>()
  let available = true
  const log = opts.log ?? NO_MCP_LOG

  /** One transport-lifecycle row. Every row this producer writes is `Mcp`, so
   *  the category is fixed here and callers name only what varies. Swallows:
   *  these fire from inside SDK transport callbacks, where a throw would skip
   *  the session cleanup that follows it. */
  const emitLifecycle = (
    level: McpLogEntryInput['level'],
    source: McpLogEntryInput['source'],
    message: string,
    details?: Record<string, unknown>,
  ): void => {
    try {
      log.emit({ level, category: { kind: 'Mcp' }, source, message, ...(details ? { details } : {}) })
    } catch (err) {
      console.error('[mcp] lifecycle log emit failed', err)
    }
  }

  const appExpress = express()
  appExpress.use(express.json({ limit: '50mb' }))

  // Constant-time compare: a plain `!==` leaks timing. Not a real attack surface
  // for a 256-bit localhost token, but timingSafeEqual is the correct form.
  const bearerOk = (header: string | undefined): boolean => {
    if (typeof header !== 'string') return false
    const got = Buffer.from(header)
    const want = Buffer.from(`Bearer ${auth.token}`)
    return got.length === want.length && timingSafeEqual(got, want)
  }
  appExpress.use('/mcp', (req, res, next) => {
    if (!bearerOk(req.headers.authorization)) {
      // The highest-value row this producer writes: a loopback port probed by
      // another local process, or by a page the user visited, is otherwise
      // completely invisible. `user_agent` is what tells those two apart. The
      // Authorization header is never recorded — not here, not in `details`.
      emitLifecycle('warn', { kind: 'System' }, 'MCP request rejected: unauthorized', {
        method: req.method,
        user_agent: req.headers['user-agent'] ?? null,
      })
      res
        .status(401)
        .json({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized' }, id: null })
      return
    }
    next()
  })

  appExpress.post('/mcp/terminal/:id',async (req,res)=>{
    const terminal=nativeTerminals.get(String(req.params.id)),token=req.headers['x-sclip-lifecycle']
    if(!terminal||typeof token!=='string'||Buffer.byteLength(token)!==Buffer.byteLength(terminal.token)||!timingSafeEqual(Buffer.from(token),Buffer.from(terminal.token))){res.status(403).json({error:'Unknown native terminal lifecycle'});return}
    if(req.body?.kind==='telemetry'){
      if(terminal.binding.closed||req.body.turn_id!==terminal.binding.activeTurn||typeof req.body.event!=='string') {res.status(409).json({error:'Stale telemetry'});return}
      const data=req.body.data&&typeof req.body.data==='object'?req.body.data:{}
      runtimeTrace.record(req.body.event,{...data,project_id:terminal.binding.projectId,opening:terminal.binding.opening,session_id:terminal.binding.sessionId,turn_id:terminal.binding.activeTurn})
      res.json({accepted:true});return
    }
    if(!validTurnEvent(req.body)){res.status(400).json({error:'Invalid native task metadata'});return}
    try{const feedback=await terminal.handler(req.body);runtimeTrace.record(`turn.${req.body.kind}`,{project_id:terminal.binding.projectId,opening:terminal.binding.opening,session_id:terminal.binding.sessionId,turn_id:terminal.binding.activeTurn,status:completionDisposition(terminal.binding.actor.snapshot(),completionReviews).status});res.json({accepted:true,...(feedback?.context?{context:feedback.context.slice(0,24000)}:{}),...(feedback?.action?{action:feedback.action,message:feedback.message?.slice(0,24000)}:{})})}catch{res.status(409).json({error:'Stale native task/project binding'})}
  })

  async function sourceMaps(snap: import('../state/model.js').Project, coarse: boolean) {
    if(!opts.sourceObservationIndex)return {status:'unavailable',reason:'Local source observations unavailable on this platform'}
    const media=Object.values(snap.media_pool).filter(m=>m.kind==='Video'&&m.metadata.duration_us).slice(0,4)
    const maps=[]
    for(const m of media) {
      try {maps.push(coarse ? await opts.sourceObservationIndex.coarseUnderstanding(m) : await opts.sourceObservationIndex.cachedUnderstanding(m))}
      catch {maps.push({media_id:m.id,status:'unavailable',reason:'Source evidence acquisition failed; use existing senses for targeted detail'})}
    }
    const omitted: string[]=[]
    while(Buffer.byteLength(JSON.stringify(maps))>9000 && maps.length) omitted.push(String((maps.pop() as any)?.identity?.media_id ?? 'unknown'))
    return {status:'bounded_source_index',omitted_media_ids:omitted,sources:maps,sources_total:Object.keys(snap.media_pool).length,source_limit:4}
  }

  // Intent is declared by the product launcher, never inferred from prompt text.
  appExpress.post('/mcp/evidence', async (req,res) => {
    const snap=opts.getTsHost?.()?.actor.snapshot()
    if (!snap || snap.project_id!==req.body?.project_id) {res.status(409).json({error:'Evidence requires current project'});return}
    const maps=await sourceMaps(snap,false)
    if(reviewState(snap)!==reviewState(opts.getTsHost?.()?.actor.snapshot())){res.status(409).json({error:'Project changed during source evidence acquisition; reacquire'});return}
    res.json({...buildEditorialEvidencePacket(snap,{transcriptsDir:req.body?.transcripts_dir},undefined,maps), background_review:{...currentCritique(snap,opts.getReviewerSummary),review_disposition:completionDisposition(snap,completionReviews)}})
  })
  appExpress.post('/mcp/reviews', async (req, res) => {
    const projectId = req.body?.project_id
    if (typeof projectId !== 'string' || opts.getTsHost?.()?.actor.snapshot().project_id !== projectId) {
      res.status(409).json({ error: 'Review requires the current authoritative project_id' }); return
    }
    for (const [id, review] of reviews) if (review.guard.status.phase === 'done') reviews.delete(id)
    if (reviews.size >= 32) { res.status(429).json({ error: 'Review session capacity reached' }); return }
    const id = randomUUID()
    const guard = new RevisionLoopGuard(true)
    reviews.set(id, { projectId, guard })
    emitLifecycle('info', { kind: 'System' }, 'Autonomous review initialized', { review_id: id, project_id: projectId, review_session: guard.status })
    const snap=opts.getTsHost!()!.actor.snapshot()
    const maps=await sourceMaps(snap,false)
    if(reviewState(snap)!==reviewState(opts.getTsHost?.()?.actor.snapshot())) {reviews.delete(id);res.status(409).json({error:'Project changed during source evidence acquisition; reacquire'});return}
    const packet=buildEditorialEvidencePacket(snap,{transcriptsDir:req.body?.transcripts_dir},undefined,maps)
    const receipt=guard.recordEvidence('get_editorial_evidence_packet','timeline',[0,snap.compositions[snap.root_id].duration_us],reviewState(snap),packet.observed_dimensions,'p0',evidenceCoverage('get_editorial_evidence_packet',packet,[0,snap.compositions[snap.root_id].duration_us]))
    res.json({ editorial_evidence_packet:{...packet,background_review:{...currentCritique(snap,opts.getReviewerSummary),review_disposition:completionDisposition(snap,completionReviews)},evidence_receipt:receipt}, review_id: id, url: `http://127.0.0.1:${port}/mcp?review_session=${id}`, review_session: guard.status })
  })

  appExpress.all('/mcp', async (req, res) => {
    const sid = req.headers['mcp-session-id'] as string | undefined
    let transport = sid ? transports.get(sid) : undefined
    if (transport) {
      const client = connections.get(sid!)
      if (client) client.last_activity_at = new Date().toISOString()
      // Existing session — route straight through.
      await transport.handleRequest(req, res, req.body)
      return
    }
    // No usable existing transport: only allow a fresh initialize request.
    if (!sid && isInitializeRequest(req.body)) {
      const nativeId=typeof req.query.native_terminal==='string'?req.query.native_terminal:undefined
      const native=nativeId?nativeTerminals.get(nativeId):undefined
      if(nativeId&&!native){res.status(409).json({error:'Unknown native terminal connection'});return}
      const connectionId = randomUUID()
      native?.binding.connections.add(connectionId)
      let newServer: Server | undefined
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => connectionId,
        onsessioninitialized: (id) => {
          transports.set(id, transport!)
        },
        // DNS-rebinding defense-in-depth: a malicious web page the user visits
        // can POST to our loopback port, so reject requests whose Host header
        // isn't our bind. The 256-bit bearer is still the primary gate; Origin
        // is left unrestricted so non-browser MCP clients (no/odd Origin) work.
        enableDnsRebindingProtection: true,
        allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
      })
      transport.onclose = () => {
        const sessionId = transport!.sessionId
        if (sessionId) transports.delete(sessionId)
        if (newServer) servers.delete(newServer)
        connections.delete(connectionId)
        opts.getTsHost?.()?.agent?.end('disconnected', connectionId)
        // `Debug`, not `Info`: a client reconnecting is routine, and at `Info` it
        // would flood the console's default filter.
        emitLifecycle('debug', { kind: 'System' }, 'MCP client disconnected',
          sessionId ? { session_id: sessionId } : undefined)
      }
      // Set BEFORE connect, for two reasons. `Protocol.connect` CHAINS an
      // existing onerror/onclose rather than replacing it, so ours has to be
      // in place first; and this is the only seam the DNS-rebinding rejection
      // has — the SDK writes its own 403 from inside `handleRequest`, so the
      // express handler above never sees one.
      transport.onerror = (err: Error) => {
        const detail = typeof err?.message === 'string' ? err.message : String(err)
        // LANDMINE: the discriminator is the SDK's own wording
        // (`server/webStandardStreamableHttp.js` → `Invalid Host header: <value>`).
        // Matching a message beats copying `allowedHosts` into our middleware,
        // where the copy would drift from the transport that actually enforces
        // it — the cost is that an SDK rewording demotes the rejection into the
        // generic row below rather than losing it. The sibling
        // `Invalid Origin header:` path is unreachable: `allowedOrigins` is
        // deliberately left unset (see the transport options above).
        if (detail.startsWith('Invalid Host header:')) {
          emitLifecycle('warn', { kind: 'System' }, 'MCP request rejected: host not allowed', { error: detail })
          return
        }
        // `onerror` is a superset hook — the transport reports every protocol
        // fault through it (unacceptable Accept, unparseable JSON, unknown
        // session). Its own row, so a rejected Host is never inferred from one
        // of those. `Warn`, not `Error`: the request failed, the app did not.
        emitLifecycle('warn', { kind: 'System' }, 'MCP transport error', { error: detail })
      }
      const reviewId = typeof req.query.review_session === 'string' ? req.query.review_session : undefined
      const review = reviewId ? reviews.get(reviewId) : undefined
      if (reviewId && !review) { res.status(404).json({ error: 'Unknown review session' }); return }
      newServer = buildMcpServer(backend, { ...opts, observeCompletion:()=>checkpoint.observe(), completionReviews, connectionId,
        ...(native ? {getRuntimeIdentity:()=>({project_id:native.binding.projectId,opening:native.binding.opening,session_id:native.binding.sessionId,turn_id:native.binding.activeTurn,request_id:String(native.binding.activeSerial??0)}),captureRequestAuthority: () => checkpoint.captureRequestAuthority(native.binding),authorizeTool:(name:string)=>checkpoint.admitTool(native.binding,name)} : {}),
        ...(review ? { revisionGuard: review.guard, reviewProjectId: review.projectId } : {}) })
      servers.add(newServer)
      // `getClientVersion()` is populated while the `initialize` REQUEST is
      // handled, which precedes the `notifications/initialized` that fires this
      // — so the row carries the real agent name, not `undefined`.
      newServer.oninitialized = () => {
        const client = newServer!.getClientVersion()
        const now = new Date().toISOString()
        connections.set(connectionId, { id: connectionId, client: client?.name ?? 'MCP', version: client?.version ?? '', connected_at: now, last_activity_at: now })
        const who = client ? `${client.name}/${client.version ?? '?'}` : 'unknown'
        emitLifecycle('info', { kind: 'System' }, `MCP client connected: ${who}`, {
          ...(client ? { client_info: client } : {}),
          ...(transport!.sessionId ? { session_id: transport!.sessionId } : {}),
        })
      }
      // Cast: the SDK declares Transport.onclose as a getter typed
      // `(() => void) | undefined`, which TS won't accept against the optional
      // `onclose?: () => void` of the `Transport` interface under
      // `exactOptionalPropertyTypes`. Runtime-compatible; narrow to Transport.
      await newServer.connect(transport as Transport)
      await transport.handleRequest(req, res, req.body)
      return
    }
    // Non-init request with no/stale session — reject without allocating.
    res
      .status(400)
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: no valid session ID' }, id: null })
  })

  // The stored port is only a hint; listenLoopback explains why it goes
  // stale and why re-picking is safe for connected clients.
  const { server: http, port } = await listenLoopback(appExpress, auth.port)
  auth = { ...auth, port }
  saveAuth(auth)

  const url = `http://127.0.0.1:${port}/mcp`
  console.log(`[mcp] listening ${url}`)
  // Pre-workspace by construction — the host binds at `app.whenReady()` — so
  // this row exists only because the producer-side deferred queue holds it until
  // a workspace opens (`src/main/deferredLog.ts`).
  emitLifecycle('info', { kind: 'System' }, `MCP host listening on 127.0.0.1:${port}`, { port })
  // Credentials are available through the connection settings, never logs.

  return {
    getToolCount() { return toolCount },
    connectionSnapshot(): AgentConnectionSnapshot {
      return { available, url, connections: [...connections.values()] }
    },
    registerHermesTerminal(projectId,sessionId,handler) {
      const binding=checkpoint.bind(projectId,sessionId),id=randomUUID(),token=randomBytes(32).toString('hex')
      nativeTerminals.set(id,{token,binding,handler})
      return {url:`${url}/terminal/${id}`,token,start:e=>checkpoint.start(binding,e),check:e=>checkpoint.check(binding,e),finish:(e,allow,cancelled)=>checkpoint.finish(binding,e,allow,cancelled),cancel:()=>checkpoint.cancel(binding),interrupt:(reason,cancelled)=>checkpoint.interrupt(binding,reason,cancelled),close:()=>{checkpoint.closeBinding(binding);nativeTerminals.delete(id)}}
    },
    setEditingBrief(brief,projectId) {checkpoint.observe(); const project=opts.getTsHost?.()?.actor.snapshot(); if(project&&(!projectId||project.project_id===projectId))setEditingBrief(project,completionReviews,brief) },
    reviewDisposition() { checkpoint.observe(); const project=opts.getTsHost?.()?.actor.snapshot(); return project ? completionDisposition(project,completionReviews) : {status:"not_considered_in_this_state"} },
    getInfo(): McpInfoView {
      return { bind: `127.0.0.1:${port}`, url, bearer_token: auth.token }
    },
    resetToken(): string {
      auth = rotateToken(auth)
      // `source = User`: the one lifecycle row a person causes rather than a
      // client. Neither the retired nor the new token appears in it.
      emitLifecycle('info', { kind: 'User' }, 'MCP bearer token rotated')
      return auth.token
    },
    notifyChange(summary): void {
      for (const server of servers) {
        server
          .notification({
            method: 'notifications/weftcut/change',
            params: summary as Record<string, unknown>,
          })
          .catch(() => {
            /* session may have closed */
          })
      }
    },
    async close(): Promise<void> {
      assetJobs.close();reviewJobs.close();checkpoint.close();nativeTerminals.clear()
      available = false
      reviews.clear()
      for (const t of transports.values()) await t.close().catch(() => {})
      http.close()
    },
  }
}
