import { beginModelUse } from "../model-usage";
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type CallToolRequest,
  type ReadResourceRequest,
  type GetPromptRequest,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js'
import { captureMotifFrameB64 } from '../motif/capture.js'
import { routeMcpTool, HYBRID_TOOLS } from './mutationTools.js'
import { shapeMotifMcpResult } from './motifResult.js'
import { runHybrid } from '../state/hybrids.js'
import { CLIP_SLICE_TOOLS, resolveClipSliceArgs, resolvePauseComputeArgs, TWO_SLICE_TOOLS, resolveTwoSliceArgs } from '../state/clip-slice-forward.js'
import { serveProjectResource, buildResourceInjection } from '../state/resource-views.js'
import type { TsActorHost } from '../state/ts-actor-host.js'
import type { ActorHandle, ChangeEvent } from '../state/actor.js'
import { mergeMcpCatalog, mergeMcpResources } from './mcpCatalog.js'
import type { CatalogTool } from './mcpCatalog.js'
import { MCP_TOOL_DEFS } from '../state/mcp-commands.js'
import { MOTIF_TOOL_DEFS, MOTIF_RESOURCE_DEFS } from './motifToolDefs.js'
import { withLog, NO_MCP_LOG, type McpCommitWindow, type McpLogDeps, type McpRowSummary } from './withLog.js'
import { validateRoughCutPlan } from '../sclip/roughCutPlan.js'
import { buildEditorialEvidencePacket } from '../sclip/editorialEvidencePacket.js'
import { changedAVRelationships } from '../sclip/mediaRelationships.js'
import { evidenceCoverage, toolDimensions } from '../sclip/evidenceModalities.js'
import { buildTimelineContext } from '../sclip/timelineContext.js'
import { openingSourceWindow, openingTranscriptEvidence } from '../sclip/openingContext.js'
import { inspectTimelineFrame } from '../sclip/timelineFrame.js'
import { renderComposedTimelineRange } from '../sclip/rangeRender.js'
import { validateRoughCutReview } from '../sclip/roughCutReview.js'
import { EvidenceCoordinateError, timelineTime, validateEvidenceTime, validateTimelineRange, reviewState } from '../sclip/evidenceCoordinates.js'
import { RevisionLoopGuard, ReviewProtocolError } from '../sclip/revisionLoopGuard.js'
import { inspectTimelineRangeVisuals, subjectObservations, VISUAL_EVIDENCE_SEMANTICS } from '../sclip/timelineVisualEvidence.js'
import { getVisionRuntime } from '../sclip/visionRuntime.js'
import { compactMediaContext } from '../sclip/compactTranscript.js'
import { calculateVideoFit } from '../sclip/framingGeometry.js'
import { locateLayer } from '../state/mutations/helpers.js'
import { quantizeParam } from '../state/quantize.js'
import { SOURCE_PASSAGE_TOOL } from '../sclip/sourcePassageEvaluation.js'
import type { SourceObservationIndex } from '../sclip/sourceObservationIndex.js'
import { externalMediaService as defaultExternalMediaService, ExternalMediaService } from '../media/external/externalMediaService.js'
import { downloadExternalMediaCandidate } from '../media/external/downloader.js'
import { buildAttributionObligation, attachAttributionMetadata } from '../media/external/attribution.js'
import type { VisualIntent } from '../media/external/types.js'

type Backend = import('@weftcut/core').Backend

const REVISION_CONTROL_TOOL = {
  name: 'revision_control',
  description: 'Bounded action-oriented review. Deliberate review launches are already active across reconnects; status shows the stage. Use begin only for an ad-hoc review in an ordinary editing session. Four initial evidence calls plus one reasoned two-call extension; Use record_issue for at most three prioritized current-timeline issues; you do not need a nested RoughCutReview. Select one returned issue_id, checkpoint before mutation, promptly repair using ordinary tools, reinspect the changed timeline, then finish resolved or honestly unresolved. At most three mutations per issue. Diagnosis cannot consume the repair/verification budget. This guard supplies no editorial decision.',
  inputSchema: { type: 'object', properties: {
    action: { type: 'string', enum: ['begin', 'status', 'extend_inspection', 'select_issue', 'finish_issue', 'finalize', 'conclude_no_repair', 'reground', 'complete'] },
    evidence_id: { type: 'string', description: 'Receipt id from fresh current timeline evidence.' }, issue_id: { type: 'string' }, status: { type: 'string', enum: ['resolved', 'unresolved'] }, reason: { type: 'string' },
  }, required: ['action'] },
} as const

const EDITORIAL_PACKET_TOOL = { name: 'get_editorial_evidence_packet', description:'Compact current editorial observation index: state identity, timeline/source ranges, video/audio relationships, cached speech and word boundaries, text, technical facts, visual evidence entry points. No editorial verdict or repair prescription. Reacquire after changes; use targeted deeper tools for omitted evidence.', inputSchema:{type:'object',properties:{start_us:{type:'integer',minimum:0},end_us:{type:'integer',minimum:1},composition_id:{type:'string'},transcripts_dir:{type:'string'}},additionalProperties:false} } as const

const RECORD_ISSUE_TOOL = {
  name: 'record_issue',
  description: 'Register YOUR editorial issue during an active review. Supply flat description, severity, repairable, declared evidence_dimensions (list each relevant modality for multimodal claims), observed evidence_receipt_ids, and affected_range_us or layer_ids. Sclip derives state identity, provenance and layer bounds; no nested inspections or RoughCutReview required. At least one fresh CURRENT_TIMELINE receipt must overlap the issue; source receipts may supplement it. Returns accepted and issue.id. If repairable, select that issue.id with revision_control select_issue, checkpoint, then use your chosen ordinary editing tools and reinspect. You are authorized to make justified repairs autonomously; do not ask permission. Infrastructure never chooses the issue or repair.',
  inputSchema: { type: 'object', properties: {
    description: { type: 'string' }, severity: { type: 'string', enum: ['minor', 'moderate', 'critical'] },
    repairable: { type: 'boolean', description: 'Your judgment whether a justified repair can be made.' },
    evidence_dimensions: { type:'array',items:{type:'string',enum:['visual','audio','speech','text','geometry','timeline']},minItems:1,description:'Observable dimensions YOU claim require observation, not editorial issue categories. Fresh verification must cover every declared dimension.' },
    evidence_receipt_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
    affected_range_us: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 2, maxItems: 2, description: 'Affected current TIMELINE range. May omit if layer_ids supplied.' },
    layer_ids: { type: 'array', items: { type: 'string' }, description: 'Current composition layers affected; Sclip derives their bounds if range omitted.' },
  }, required: ['description', 'severity', 'repairable', 'evidence_receipt_ids', 'evidence_dimensions'], additionalProperties: false },
} as const
const WITHDRAW_ISSUE_TOOL = {
  name: 'withdraw_issue',
  description: 'Explicitly withdraw/reclassify YOUR registered issue after reconsideration. Supply its issue_id, editorial reason and fresh current evidence_receipt_ids overlapping the issue. This removes its repairable classification, permitting a consistent no-repair conclusion. Does not edit or choose your judgment. A committed repair must first be reinspected.',
  inputSchema: { type: 'object', properties: { issue_id: { type: 'string' }, reason: { type: 'string' }, evidence_receipt_ids: { type: 'array', items: { type: 'string' }, minItems: 1 } }, required: ['issue_id', 'reason', 'evidence_receipt_ids'], additionalProperties: false },
} as const

const MEDIA_CONTEXT_TOOL = {
  name: 'get_media_context',
  description: 'Read cached source-media evidence. Overview returns availability/counts; segments returns exact chronological transcript text and source times without verbose word arrays or other modalities, preferred for source understanding, story discovery, and surrounding context; range returns actual transcript segment text, source timestamps and word timing, plus available visual/audio facts, reserved for when precise word-level cut boundaries are needed. Pass source-time bounds as flat start_us/end_us fields, never a nested range object. Supplying start_us or end_us selects range unless detail is explicit. Range/segments windows are at most 60 seconds. Original word timing and other modalities remain available via range. Missing modalities report not_generated. Does not transcribe or edit.',
  inputSchema: { type: 'object', properties: {
    media_id: { type: 'string', description: 'Imported media pool item UUID.' },
    start_us: { type: 'integer', minimum: 0, description: 'Source-media time in microseconds. Range default: 0.' },
    end_us: { type: 'integer', minimum: 1, description: 'Exclusive source-media end. Range default: up to 60 seconds after start, limited by source duration.' },
    detail: { type: 'string', enum: ['overview', 'range', 'segments'], description: 'Overview = counts/status; segments = compact exact text/source times (preferred for exploration and narrative context); range = detailed text/word timing and modalities (reserve for precise cut boundaries). Defaults to range when time bounds supplied, otherwise overview.' },
  }, required: ['media_id'], additionalProperties: false },
} as const

const RANGE_VISUALS_TOOL = {
  name: 'inspect_timeline_range_visuals',
  description: 'Inspect representative CURRENT_TIMELINE visuals across a shot/range instead of assuming one frame represents it. Captures 2–5 composed frames (default 5), from start through end-exclusive, and observes each independently through the existing local vision runtime, bounded to 2–5 requests. Returns labelled timeline samples, geometric coverage, current layer state/source mappings, and uncertain subject/content observations. Geometry is not good framing: wall/light can cover the canvas fully. Hermes decides whether an issue exists and what repair to make. Samples cannot certify unsampled motion. Use this before a visual diagnosis and repeat over the affected range after repair.',
  inputSchema: { type: 'object', properties: { start_us: { type: 'integer', minimum: 0, description: 'TIMELINE start, not source time.' }, end_us: { type: 'integer', minimum: 1, description: 'Exclusive TIMELINE end, within current composition.' }, composition_id: { type: 'string' }, representative_samples: { type: 'integer', minimum: 2, maximum: 5 }, question: { type: 'string', description: 'Optional observable visual question; no editing instruction.' } }, required: ['start_us', 'end_us'], additionalProperties: false },
} as const

const VISION_INSPECT_TOOL = {
  name: 'vision_inspect',
  description: `Analyze what is visually visible on the composed timeline preview or an image, and answer a specific visual question about it using the Apple Silicon Metal GPU vision engine.
ALWAYS USE THIS TOOL when the user asks what is on the preview, what is on their screen right now, or asks any visual question about their video.
Do NOT use inspect_timeline_frame to answer questions about what is on screen — inspect_timeline_frame returns raw PNG bytes for external clients, whereas vision_inspect visually analyzes the pixels and returns natural language descriptions of the subjects, framing, actions, graphics, and visible content.
EVIDENCE ONLY — this tool never moves clips or makes edits. Hermes uses the evidence to decide what (if any) edit to request.
GOOD use: "What is currently visible on the preview?" or "Is the speaker's face visible in the current 9:16 crop?" → evidence of what is in frame.
BAD use: "Move the clip so the face is visible" — use update_layer_params with a VideoClip patch for that.
Provide timeline_t_us (TIMELINE time, never source time; legacy t_us is an alias), or media_id + source_t_us (original SOURCE_MEDIA frame), or image_path (reads a pre-rendered PNG/JPEG), or image_paths (multi-frame).
If t_us, image_path, and image_paths are all omitted, the tool automatically captures and inspects whatever frame is CURRENTLY displayed at the user's active playhead in the live Sclip desktop preview!`,
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The specific visual question to answer about the frame. Be precise.' },
      timeline_t_us: { type: 'integer', description: 'CURRENT_TIMELINE position, 0 <= time < composition duration. Never a source timestamp.' },
      t_us: { type: 'integer', description: 'Legacy alias for timeline_t_us; TIMELINE coordinates only.' },
      media_id: { type: 'string', description: 'For original SOURCE_MEDIA inspection; requires source_t_us and no timeline/image arguments.' },
      source_t_us: { type: 'integer', description: 'Original source-media position; requires media_id. Never used to inspect the edit.' },
      composition_id: { type: 'string', description: 'Composition to render. Defaults to the root composition.' },
      image_path: { type: 'string', description: 'Absolute path to a pre-rendered PNG or JPEG file.' },
      image_paths: { type: 'array', items: { type: 'string' }, description: 'Array of pre-rendered image paths for multi-frame analysis in a single request.' },
      resolution: { type: 'string', enum: ['auto', 'low', 'high', 'original'], description: 'Resolution profile. Defaults to auto (512px for subjects, 672px for text/OCR).' },
      max_tokens: { type: 'integer', description: 'Max output tokens. Defaults to 64 for fast concise evidence.' },
      context: { type: 'string', description: 'Optional: additional editing context to help the model focus.' },
    },
    required: ['question'],
  },
} as const

const CALCULATE_VIDEO_FIT_TOOL = {
  name: 'calculate_video_fit',
  description: 'Read-only canvas-fit arithmetic for an existing VideoClip. By default, ALWAYS use mode="cover" so the video completely fills the entire screen canvas (zero black bars, zero letterboxing/pillarboxing, and never a small floating video in a corner), unless the user explicitly requests an inset or picture-in-picture layout. Optional focus_x/focus_y (0..1) pans the crop to keep the subject or action centered. Returns an update_layer_params VideoClip patch. Apply with update_layer_params, then verify with vision_inspect.',
  inputSchema: { type: 'object', properties: {
    layer_id: { type: 'string', description: 'ID of the VideoClip layer to fit to canvas.' },
    mode: { type: 'string', enum: ['cover', 'contain'], default: 'cover', description: 'Fit mode. ALWAYS use "cover" to fill the entire screen, unless user explicitly asked for contain or inset.' },
    focus_x: { type: 'number', minimum: 0, maximum: 1, description: 'Optional horizontal focal point in original source coordinates; 0=left, 1=right, default center.' },
    focus_y: { type: 'number', minimum: 0, maximum: 1, description: 'Optional vertical focal point in original source coordinates; 0=top, 1=bottom, default center.' },
  }, required: ['layer_id', 'mode'], additionalProperties: false },
} as const

const GET_TIMELINE_CRITIQUE_TOOL = {
  name: 'get_timeline_critique',
  description: 'Read-only autonomous feedback from Sclip background audio/visual reviewer. Returns timestamped issues regarding off-screen captions, motif collisions, audio chops, or awkward silence. Call this after rough cutting or before declaring work complete.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const

const GET_SOURCE_UNDERSTANDING_TOOL = { name: 'get_source_understanding',description:'Compact source-wide coverage map and provenance. cached reads existing observations; coarse performs at most six local sampled-frame observations spread across the entire source, cached for reuse. Sampling cells are not scenes or continuous visual coverage. Missing speech/audio/text remains unknown; no editorial ranking or edit is generated.',inputSchema:{type:'object',properties:{media_id:{type:'string'},detail:{type:'string',enum:['cached','coarse']}},required:['media_id'],additionalProperties:false}} as const
const GET_SOURCE_SPEECH_CONTEXT_TOOL = { name: 'get_source_speech_context',description:'Read cached transcript and word timing in SOURCE time with bounded before/selected/after context. Does not transcribe or choose a cut. If unavailable, transcribe_clip on a Hermes-selected timeline layer then reacquire. Spoken-story/sentence/continuity claims cannot be established by visual samples alone.',inputSchema:{type:'object',properties:{media_id:{type:'string'},start_us:{type:'integer',minimum:0},end_us:{type:'integer',minimum:1},before_us:{type:'integer',minimum:0,maximum:10000000},after_us:{type:'integer',minimum:0,maximum:10000000}},required:['media_id','start_us','end_us'],additionalProperties:false}} as const
const SOURCE_UNDERSTANDING_TOOLS = [GET_SOURCE_UNDERSTANDING_TOOL, GET_SOURCE_SPEECH_CONTEXT_TOOL] as const

const GET_SOURCE_OBSERVATIONS_TOOL = {
  name: 'get_source_observations',
  description: 'Read bounded, cached visual observations from original imported source footage. Returns model observations with source timestamps and verified media metadata. Does not edit or infer semantic audio.',
  inputSchema: { type: 'object', properties: {
    media_id: { type: 'string' }, start_us: { type: 'integer', minimum: 0 },
    end_us: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 12 },
  }, required: ['media_id'], additionalProperties: false },
} as const

export const VIDEO_SEARCH_EXTERNAL_MEDIA_TOOL = {
  name: 'video_search_external_media',
  description: 'Search for real external B-roll visuals across authentic discovery sources (YouTube, Wikimedia Commons, Openverse) and stock fallback providers (Pexels, Pixabay). Returns normalized candidate metadata with provenance, license, and import mode. Read-only evidence tool.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term or keywords for external B-roll.' },
      media_type: { type: 'string', enum: ['video', 'image', 'either'], default: 'either', description: 'Filter media type. Images are valid first-class B-roll.' },
      provider: { type: 'string', enum: ['auto', 'youtube', 'wikimedia', 'openverse', 'pexels', 'pixabay'], default: 'auto', description: 'Provider selection. "auto" routes intelligently based on query specificity and intent.' },
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 10, description: 'Maximum candidates to return.' },
      orientation: { type: 'string', enum: ['landscape', 'portrait', 'square'], description: 'Desired media orientation.' },
      visual_intent: {
        type: 'object',
        properties: {
          purpose: { type: 'string', enum: ['visual_proof', 'cutaway', 'explanation', 'atmosphere', 'reference'] },
          subject: { type: 'string' },
          action: { type: 'string' },
          event: { type: 'string' },
          location: { type: 'string' },
          time_context: { type: 'string' },
          specificity: { type: 'string', enum: ['exact', 'specific', 'generic'] },
          authenticity: { type: 'string', enum: ['required', 'preferred', 'unnecessary'] },
          media_preference: { type: 'string', enum: ['video', 'image', 'either'] },
          duration_needed_us: { type: 'integer' },
          search_terms: { type: 'array', items: { type: 'string' } },
        },
        description: 'Lightweight structured context describing why the visual is needed.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
} as const

export const RESOLVE_VISUAL_INTENTS_TOOL = {
  name: 'resolve_visual_intents',
  description: 'Fast parallel discovery and visual candidate intelligence for bounded batches of VisualIntents (1 to 6). Evaluates candidates with local VLM (Qwen3-VL) via contact sheets, returning structured relevance, authenticity, and specificity judgments. Read-only evidence gathering tool; does not mutate timeline or auto-import.',
  inputSchema: {
    type: 'object',
    properties: {
      intents: {
        type: 'array',
        description: 'Bounded list of 1 to 6 visual intents to discover and evaluate in parallel.',
        items: {
          type: 'object',
          properties: {
            intent_id: { type: 'string' },
            timeline_start_us: { type: 'integer', minimum: 0 },
            timeline_end_us: { type: 'integer', minimum: 0 },
            subject: { type: 'string', description: 'Visual subject or topic to discover.' },
            event: { type: 'string', description: 'Factual event context if applicable.' },
            action: { type: 'string', description: 'Desired visual action.' },
            specificity: { type: 'string', enum: ['exact', 'specific', 'generic'] },
            authenticity: { type: 'string', enum: ['required', 'preferred', 'unnecessary'] },
            media_preference: { type: 'string', enum: ['video', 'image', 'either'] },
            duration_needed_us: { type: 'integer', minimum: 0 },
            search_terms: { type: 'array', items: { type: 'string' } },
          },
          required: ['subject'],
        },
        minItems: 1,
        maxItems: 6,
      },
    },
    required: ['intents'],
    additionalProperties: false,
  },
} as const

export const IMPORT_EXTERNAL_MEDIA_TOOL = {
  name: 'import_external_media',
  description: 'Import an external media candidate returned by video_search_external_media into the active project media pool. Strictly enforces license and import mode gates (only AUTO_IMPORT candidates can be downloaded). Once imported, the asset receives a normal media_id and can be inspected via get_source_observations.',
  inputSchema: {
    type: 'object',
    properties: {
      candidate_id: { type: 'string', description: 'The unique candidate_id from video_search_external_media.' },
    },
    required: ['candidate_id'],
    additionalProperties: false,
  },
} as const

const REVISION_INSPECTION_TOOLS = new Set([
  'get_editorial_evidence_packet', 'get_timeline_context', 'get_media_context', 'inspect_timeline_frame', 'render_timeline_range',
  'analyze_clip', 'describe_clip', 'compare_frames', 'detect_pauses', 'extract_clip_audio',
  'inspect_timeline_range_visuals', 'vision_inspect', 'get_timeline_critique', 'calculate_video_fit', 'get_param_track', 'get_source_observations', 'get_source_understanding', 'get_source_speech_context', 'evaluate_source_passages',
])
const REVISION_NONMUTATING_TOOLS = new Set([
  'revision_control', 'validate_rough_cut_review', 'validate_rough_cut_plan', 'dry_run',
  'checkpoint', 'list_checkpoints', 'undo', 'redo', 'restore_checkpoint',
  'begin_agent_session', 'end_agent_session', 'lock_history', 'unlock_history',
  'get_editorial_evidence_packet', 'get_timeline_context', 'inspect_timeline_frame', 'render_timeline_range', 'get_param_track',
  'inspect_timeline_range_visuals', 'vision_inspect', 'get_timeline_critique', 'video_search_external_media', 'resolve_visual_intents',
])
const isRevisionMutation = (name: string) => (name === 'import_external_media' || MCP_TOOL_DEFS.some((def) => def.name === name) || HYBRID_TOOLS.has(name)) && !REVISION_NONMUTATING_TOOLS.has(name)

function revisionToolError(message: string): ServerResult {
  return { isError: true, content: [{ type: 'text', text: message }] } as ServerResult
}

function validatedReview(result: ServerResult): boolean {
  if ('isError' in result && result.isError) return false
  const content = 'content' in result ? result.content : undefined
  if (!Array.isArray(content)) return false
  return content.some((item) => {
    if (item.type !== 'text') return false
    try { return JSON.parse(item.text)?.valid === true } catch { return false }
  })
}

function reviewIssueIds(raw: unknown): string[] {
  try {
    const review = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(review?.identified_issues)
      ? review.identified_issues.map((issue: { id?: unknown }) => issue.id).filter((id: unknown): id is string => typeof id === 'string')
      : []
  } catch { return [] }
}

interface Envelope {
  ok: boolean
  result?: unknown
  error?: { code: string; message: string; data?: unknown }
}
const CODE_MAP: Record<string, number> = {
  invalid_params: -32602, invalid_request: -32600, not_found: -32601, internal: -32603,
}

/** Map a parsed {ok,result|error} envelope to the SDK result (or throw the
 *  SDK-shaped error). The TS actor.mcpCall returns this same shape as Rust's reply(). */
function unwrapEnvelope(env: Envelope): unknown {
  if (env.ok) return env.result
  const err = env.error!
  const e = new Error(err.message) as Error & { code?: number; data?: unknown }
  e.code = CODE_MAP[err.code] ?? -32603
  e.data = err.data
  throw e
}
function unwrap(json: string): unknown { return unwrapEnvelope(JSON.parse(json) as Envelope) }

/** Per-call VLM config provider (describe_clip + media://{id}/description): the
 *  merged backend-config snapshot the stateless resolver reads (ADR 0024) keyed
 *  by backend tag, plus the user's SOFT preferred engine. VLM config is not held
 *  on the napi `Backend` like speech — it rides in with each call.
 *
 *  `preferred`, `language`, `fps` and `focus` ride along because the description
 *  cache is keyed by all four — `preferred` through the backend it resolves and
 *  that backend's model label: the tool that WRITES a cache entry and the
 *  resource that READS one have to name the same view or every source reads as
 *  undescribed. One provider, so they cannot disagree — and it is the app's
 *  Video-understanding settings, not this layer's guess.
 *  `null` = the caller has no UI to speak for (a bare-core read), which Rust
 *  resolves to no preference / `Language::DEFAULT_TAG` / `DEFAULT_FPS` /
 *  `Focus::General`. */
export type VlmProvider = () => {
  config: Record<string, unknown>
  preferred: string | null
  language: string | null
  fps: number | null
  focus: string | null
}
const NO_VLM: VlmProvider = () => ({
  config: {},
  preferred: null,
  language: null,
  fps: null,
  focus: null,
})

/** The baked peaks file `detect_pauses` must read for one SUBJECT Audio layer,
 *  or `null` for "the media's own" (spec Decision 11). Supplied by the host,
 *  because the bake state lives in main's audio-fx baker and nowhere else — it
 *  is a derivation, never project state (ADR 0063).
 *
 *  A build with no baker (every test harness, a bare-core call) answers `null`
 *  and reads the raw peaks, which is the same fallback a not-yet-baked layer
 *  takes. */
export type PeaksPathProvider = (subjectLayerId: string) => string | null
const NO_PEAKS_PATH: PeaksPathProvider = () => null

/** One clip-compute tool call: resolve the `{ layer, media }` slice from the
 *  actor (the sole state owner), inject the engine-selection hints the stateless
 *  Rust resolvers read, dispatch, and unwrap the envelope.
 *
 *  Exported because the renderer reaches the same tools through
 *  `backend:invoke`'s `clipCompute` route (`state/router.ts`), and both surfaces
 *  must be ONE code path: a human and an agent asking the same clip the same
 *  question have to get the same engine and the same slice, and two copies of
 *  this injection would be exactly how that stops being true.
 *
 *  Read/compute only — no arm here writes. The write half of a recipe (the SRT
 *  a transcript becomes, the layer a synthesis lands as) is a hybrid channel. */
export async function callClipComputeTool(
  backend: Backend,
  tsHost: TsActorHost,
  name: string,
  args: Record<string, unknown>,
  getPreferredEngine: () => string | null = () => null,
  getVlm: VlmProvider = NO_VLM,
  peaksPathFor: PeaksPathProvider = NO_PEAKS_PATH,
): Promise<ServerResult> {
  // `detect_pauses` takes its own resolver: the slice is the SUBJECT Audio
  // layer, not the layer the caller named, and the peaks file rides with it
  // (spec Decisions 1 and 11).
  const merged = name === 'detect_pauses'
    ? resolvePauseComputeArgs(args, tsHost.actor.snapshot(), peaksPathFor)
    : resolveClipSliceArgs(args, tsHost.actor.snapshot())
  // ADR 0064: inject the explicitly selected model backend. None stays unset;
  // native resolution does not choose another configured model implicitly.
  // An agent's explicit backend override remains authoritative.
  if (name === 'transcribe_clip' && merged.backend == null) {
    const pref = getPreferredEngine()
    if (pref && pref !== 'auto') merged.preferred_backend = pref
  }
  // Vision resolves against the selected profile's per-call configuration.
  if (name === 'describe_clip') {
    const vlm = getVlm()
    merged.vlm_config = vlm.config
    if (merged.backend == null && vlm.preferred && vlm.preferred !== 'auto') {
      merged.preferred_backend = vlm.preferred
    }
    // The UI language as the DEFAULT and not an override: `language` is an
    // advertised arg, so an agent asking for Japanese prose about a clip must
    // get it whatever the app's chrome is set to. Only an unset one is filled —
    // and filling it here rather than leaving it to Rust's own default is what
    // makes the renderer's runs land in the view the shot rows read back.
    if (merged.language == null && vlm.language) merged.language = vlm.language
    // The other two view axes take the same default-not-override rule, for the
    // same reason: an agent that asked for a specific sampling or focus keeps
    // it, and an omitted one is filled from the app's setting — which is what
    // makes a renderer run land in the view the shot rows read back.
    if (merged.fps == null && vlm.fps != null) merged.fps = vlm.fps
    if (merged.focus == null && vlm.focus) merged.focus = vlm.focus
  }
  const release = name === 'transcribe_clip' || name === 'describe_clip' ? beginModelUse() : () => {}
  try { return unwrap(await backend.mcpCallTool(name, JSON.stringify(merged))) as ServerResult }
  finally { release() }
}

/** CallTool routing (tsHost present): mutations → TS actor.mcpCall, hybrid →
 *  runHybrid, rust → backend (native reads/compute that take an injected state slice). */
export async function handleCallTool(
  backend: Backend,
  getTsHost: () => TsActorHost | null,
  name: string,
  args: Record<string, unknown>,
  getPreferredEngine: () => string | null = () => null,
  getVlm: VlmProvider = NO_VLM,
  peaksPathFor: PeaksPathProvider = NO_PEAKS_PATH,
  getActiveWindow: () => import('electron').BrowserWindow | null = () => null,
  getReviewerSummary?: (immediate?: boolean) => import('../sclip/reviewer/reviewerTypes.js').TimelineReviewSummary,
  sourceObservationIndex?: SourceObservationIndex,
  externalMediaService?: ExternalMediaService,
  enableExternalMedia?: boolean,
): Promise<ServerResult> {
  // Final delivery belongs to the user, including for clients with an old
  // cached catalog. Short temporary QA rendering remains available below.
  if (name === 'export_timeline') return revisionToolError('Final export is user-only. Use the Sclip Export UI; render_timeline_range remains available for temporary QA.')
  if (name === 'get_timeline_critique') {
    const summary = getReviewerSummary ? getReviewerSummary() : {
      commit_id: '',
      status: 'clean',
      updated_at: Date.now(),
      total_issues: 0,
      critical_count: 0,
      warning_count: 0,
      suggestion_count: 0,
      issues: [],
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ...summary, coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', availability: getReviewerSummary ? 'available' : 'not_generated' }, null, 2) }] } as ServerResult
  }
  if (name === 'get_source_understanding' || name === 'get_source_speech_context') {
    try {
      if(!sourceObservationIndex) throw new Error('Source observation index unavailable')
      const media=getTsHost()?.actor.snapshot().media_pool[String(args.media_id)]
      if(!media)throw new Error('Current imported media_id required')
      const result=name==='get_source_speech_context' ? await sourceObservationIndex.speechContext(media,Number(args.start_us),Number(args.end_us),args.before_us as number|undefined,args.after_us as number|undefined) : args.detail==='coarse' ? await sourceObservationIndex.coarseUnderstanding(media) : await sourceObservationIndex.cachedUnderstanding(media)
      return {content:[{type:'text',text:JSON.stringify(result)}]} as ServerResult
    } catch(e) {return revisionToolError(e instanceof Error?e.message:String(e))}
  }
  if (name === 'get_source_observations') {
    try {
      if (!sourceObservationIndex) throw new Error('Source observation index is unavailable.')
      const tsHost = getTsHost()
      const mediaId = typeof args.media_id === 'string' ? args.media_id : ''
      const media = tsHost?.actor.snapshot().media_pool[mediaId]
      if (!media) throw new Error(`Imported source media not found: ${mediaId}`)
      const result = await sourceObservationIndex.retrieve(
        media,
        typeof args.start_us === 'number' ? args.start_us : 0,
        typeof args.end_us === 'number' ? args.end_us : undefined,
        typeof args.limit === 'number' ? args.limit : 8,
      )
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, coordinate_space: 'source', evidence_origin: 'SOURCE_MEDIA', media_id: mediaId }) }] } as ServerResult
    } catch (error) {
      return revisionToolError(error instanceof Error ? error.message : String(error))
    }
  }
  const tsHost = getTsHost()
  if (tsHost?.agent && ['begin_agent_session', 'end_agent_session', 'lock_history', 'unlock_history'].includes(name)) {
    try {
      let result: unknown = {}
      if (name === 'begin_agent_session') {
        if (typeof args.reason !== 'string') throw new Error('reason must be a string')
        result = tsHost.agent.begin(args.reason)
      } else if (name === 'end_agent_session') {
        if (getReviewerSummary) {
          const summary = getReviewerSummary()
          if (summary && summary.critical_count > 0 && args.force !== true) {
            const issuesText = summary.issues
              .filter((i) => i.severity === 'critical')
              .map((i) => `- [${i.category}] at ${(i.t_us / 1e6).toFixed(1)}s: ${i.description} -> Suggested action: ${i.suggested_action}`)
              .join('\n')
            throw new Error(
              `Background AI Reviewer detected ${summary.critical_count} critical issue(s) that should be resolved before ending session:\n${issuesText}\n\nFix these issues or call end_agent_session with force: true if intentionally keeping this state.`,
            )
          }
        }
        tsHost.agent.end('agent')
      } else if (name === 'lock_history') {
        if (typeof args.reason !== 'string') throw new Error('reason must be a string')
        tsHost.agent.lock(args.reason)
      } else tsHost.agent.unlock()
      return { content: [{ type: 'text', text: JSON.stringify(result) }] } as ServerResult
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] } as ServerResult
    }
  }
  if (tsHost) {
    if (name === 'calculate_video_fit') {
      try {
        if (typeof args.layer_id !== 'string' || (args.mode !== 'cover' && args.mode !== 'contain')) throw new Error('layer_id and mode (cover or contain) are required')
        const snapshot = tsHost.actor.snapshot()
        const located = locateLayer(snapshot, args.layer_id)
        if (!located || located.layer.params.kind !== 'VideoClip') throw new Error('layer_id must name an existing VideoClip')
        const params = located.layer.params
        const media = snapshot.media_pool[params.media]
        const sourceWidth = media?.metadata.video?.width
        const sourceHeight = media?.metadata.video?.height
        if (!sourceWidth || !sourceHeight) throw new Error('source video dimensions are unavailable; cannot calculate a fit')
        const transform = params.transform
        if (params.crop || params.flip_h || params.flip_v || transform.position.mode !== 'XY' ||
            transform.scale_x.mode !== 'Static' || transform.scale_y.mode !== 'Static' ||
            transform.rotation_deg.mode !== 'Static' || transform.rotation_deg.value !== 0 ||
            transform.position.x.mode !== 'Static' || transform.position.y.mode !== 'Static') {
          throw new Error('layer has crop, flip, path, rotation or animated transform; calculate_video_fit will not overwrite it')
        }
        const geometry = calculateVideoFit({
          sourceWidth, sourceHeight,
          canvasWidth: located.comp.width, canvasHeight: located.comp.height,
          mode: args.mode,
          focusX: args.focus_x as number | undefined,
          focusY: args.focus_y as number | undefined,
        })
        const patch = {
          kind: 'VideoClip' as const,
          x: quantizeParam('x', geometry.x),
          y: quantizeParam('y', geometry.y),
          scale_x: quantizeParam('scale_x', geometry.scale_x),
          scale_y: quantizeParam('scale_y', geometry.scale_y),
        }
        return { content: [{ type: 'text', text: JSON.stringify({ layer_id: args.layer_id, mode: args.mode, patch, current_transform: { x: transform.position.x.value, y: transform.position.y.value, scale_x: transform.scale_x.value, scale_y: transform.scale_y.value }, proposed_differs_from_current: patch.x !== transform.position.x.value || patch.y !== transform.position.y.value || patch.scale_x !== transform.scale_x.value || patch.scale_y !== transform.scale_y.value, visible_source_rect_estimate: geometry.visible_source_rect, note: 'Geometric fit arithmetic only. Compare current_transform with patch before applying. A full canvas does not prove good composition or visible subject; content like a wall/light can fill it. Hermes chooses whether to apply any change and inspects representative rendered evidence.' }) }] } as ServerResult
      } catch (error) {
        return revisionToolError(error instanceof Error ? error.message : String(error))
      }
    }
    if (name === 'validate_rough_cut_plan') {
      const snap = tsHost.actor.snapshot()
      let planObj = args.plan
      if (typeof planObj === 'string') {
        try { planObj = JSON.parse(planObj) } catch (e) {
          return { content: [{ type: 'text', text: JSON.stringify({ valid: false, errors: ['Failed to parse plan JSON: ' + (e instanceof Error ? e.message : String(e))], calculated_duration_us: 0, clip_count: 0, removed_count: 0 }) }] } as unknown as ServerResult
        }
      }
      const res = validateRoughCutPlan(planObj, snap.media_pool)
      return { content: [{ type: 'text', text: JSON.stringify(res) }] } as unknown as ServerResult
    }
    if (name === 'get_editorial_evidence_packet') {
      const snapshot=tsHost.actor.snapshot()
      const sourceMaps=[]
      if(sourceObservationIndex) for(const media of Object.values(snapshot.media_pool).slice(0,1)) {try{sourceMaps.push(await sourceObservationIndex.cachedUnderstanding(media))}catch{}}
      const packet = buildEditorialEvidencePacket(snapshot, { compositionId:args.composition_id as string | undefined, transcriptsDir:args.transcripts_dir as string | undefined, range:args.start_us!==undefined||args.end_us!==undefined ? {start_us:Number(args.start_us??0),end_us:Number(args.end_us??tsHost.actor.snapshot().compositions[String(args.composition_id??tsHost.actor.snapshot().root_id)].duration_us)} : undefined }, undefined, {sources:sourceMaps,source_limit:1,sources_total:Object.keys(snapshot.media_pool).length})
      return { content:[{type:'text',text:JSON.stringify(packet)}] } as ServerResult
    }
    if (name === 'get_timeline_context') {
      const snap = tsHost.actor.snapshot()
      const compId = (args.composition_id as string | undefined) ?? snap.root_id
      const startUs = typeof args.start_us === 'number' ? args.start_us : undefined
      const endUs = typeof args.end_us === 'number' ? args.end_us : undefined
      const transcriptsDir = args.transcripts_dir as string | undefined
      try {
        const duration = snap.compositions[compId]?.duration_us ?? 0
        if (startUs !== undefined || endUs !== undefined) validateTimelineRange(startUs ?? 0, endUs ?? duration, duration, compId)
        const res = buildTimelineContext(snap, {
          compositionId: compId,
          range: startUs !== undefined || endUs !== undefined ? { start_us: startUs ?? 0, end_us: endUs ?? duration } : undefined,
          transcriptsDir,
        })
        const opening = openingSourceWindow(res)
        let openingContext: unknown = null
        if (opening && (!startUs || startUs === 0)) {
          try {
            const evidence = await handleCallTool(backend, getTsHost, 'get_media_context', {
              media_id: opening.media_id, detail: 'range', start_us: opening.evidence_start_us,
              end_us: Math.min(opening.evidence_end_us, snap.media_pool[opening.media_id]?.metadata.duration_us ?? opening.evidence_end_us),
            })
            const item = (evidence as any).content?.find((value: any) => value.type === 'text')
            openingContext = openingTranscriptEvidence(opening, item && !('isError' in evidence && evidence.isError) ? JSON.parse(item.text).transcript : null)
          } catch { openingContext = openingTranscriptEvidence(opening, null) }
        }
        const counts: Record<string, number> = {}
        for (const track of snap.compositions[compId].tracks) for (const layer of track.layers) {
          counts[layer.params.kind] = (counts[layer.params.kind] ?? 0) + 1
        }
        const grounded = { ...res, coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', time_mapping: 'Layer t_start_us/t_end_us are timeline; source_start_us/source_end_us are original media. Convert explicitly, never interchange.', layer_counts_by_kind: counts, opening_context: openingContext }
        const win = getActiveWindow?.()
        let playheadUs: number | null = null
        if (win && !win.isDestroyed()) {
          try {
            playheadUs = await win.webContents.executeJavaScript('window.__weftcutPreview?.getPlayheadUs ? window.__weftcutPreview.getPlayheadUs() : null')
          } catch {}
        }
        const enriched = typeof playheadUs === 'number' ? { ...grounded, playhead_us: playheadUs } : grounded
        return { content: [{ type: 'text', text: JSON.stringify(enriched) }] } as unknown as ServerResult
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] } as unknown as ServerResult
      }
    }
    if (name === 'inspect_timeline_frame') {
      const snap = tsHost.actor.snapshot()
      const tUs = timelineTime(args)
      const compId = (args.composition_id as string | undefined) ?? snap.root_id
      const format = (args.format as 'base64' | 'data_url') ?? 'base64'
      try {
        const res = await inspectTimelineFrame(snap, {
          t_us: tUs,
          composition_id: compId,
          format,
          getActiveWindow,
          requireLiveCompositor: true,
        })
        return {
          content: [
            { type: 'image', data: res.pngBase64, mimeType: 'image/png' },
            {
              type: 'text',
              text: JSON.stringify({
                coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', timeline_t_us: res.t_us,
                t_us: res.t_us,
                composition_id: res.composition_id,
                width: res.width,
                height: res.height,
                source: res.source,
                note: 'Raw image bytes returned. To ask questions and receive natural language visual evidence about what is visible in this frame, use vision_inspect.',
              }),
            },
          ],
        } as unknown as ServerResult
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] } as unknown as ServerResult
      }
    }
    if (name === 'inspect_timeline_range_visuals') {
      try { return { content: [{ type: 'text', text: JSON.stringify(await inspectTimelineRangeVisuals(tsHost.actor.snapshot(), args, getActiveWindow)) }] } as ServerResult }
      catch (e) { return revisionToolError(e instanceof Error ? e.message : String(e)) }
    }
    if (name === 'vision_inspect') {
      const question = typeof args.question === 'string' ? args.question.trim() : ''
      if (!question) {
        return { isError: true, content: [{ type: 'text', text: 'question is required' }] } as unknown as ServerResult
      }
      const context = typeof args.context === 'string' ? args.context.trim() : undefined
      const resolution = typeof args.resolution === 'string' ? args.resolution as 'auto' | 'low' | 'high' | 'original' : undefined
      const maxTokens = typeof args.max_tokens === 'number' ? args.max_tokens : undefined

      let imagePaths: string[] = []
      if (Array.isArray(args.image_paths) && args.image_paths.length > 0) {
        imagePaths = args.image_paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      } else if (typeof args.image_path === 'string' && args.image_path.trim().length > 0) {
        imagePaths = [args.image_path.trim()]
      }

      let tempImagePath: string | null = null
      let factualEvidence: unknown = undefined
      let provenance: Record<string, unknown> = { coordinate_space: 'image', evidence_origin: 'EXTERNAL_IMAGE' }

      if (args.source_t_us !== undefined || args.media_id !== undefined) {
        if (imagePaths.length || args.t_us !== undefined || args.timeline_t_us !== undefined || args.composition_id !== undefined) throw new EvidenceCoordinateError({ code: 'MIXED_COORDINATE_SPACES', correction: 'Use either media_id + source_t_us OR timeline_t_us; never both.' })
        const snap = tsHost.actor.snapshot()
        const mediaId = String(args.media_id ?? '')
        const media = snap.media_pool[mediaId]
        if (!media) throw new Error('Source inspection requires an existing media_id')
        const sourceTime = validateEvidenceTime('source', args.source_t_us, media.metadata.duration_us ?? 0, { media_id: mediaId })
        const uri = `media://${mediaId}/frame/${sourceTime}`
        const raw: any = await handleReadResource(backend, getTsHost, uri, getVlm)
        const frame = raw.contents?.find((c: any) => typeof c.blob === 'string' && c.mimeType?.startsWith('image/'))
        if (!frame) throw new Error('Source frame resource returned no image; no visual evidence generated')
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-source-frame-'))
        tempImagePath = path.join(tmpDir, frame.mimeType === 'image/png' ? 'frame.png' : 'frame.jpg')
        fs.writeFileSync(tempImagePath, Buffer.from(frame.blob, 'base64'))
        imagePaths = [tempImagePath]
        provenance = { coordinate_space: 'source', evidence_origin: 'SOURCE_MEDIA', media_id: mediaId, source_t_us: sourceTime, resource_uri: uri }
      }
      if (imagePaths.length && (args.timeline_t_us !== undefined || args.t_us !== undefined)) throw new EvidenceCoordinateError({ code: 'MIXED_COORDINATE_SPACES', correction: 'Image paths do not establish timeline provenance. Use timeline_t_us to inspect the current composition.' })
      if (imagePaths.length === 0) {
        const snap = tsHost.actor.snapshot()
        const tUs = timelineTime(args)
        const compId = (args.composition_id as string | undefined) ?? snap.root_id
        try {
          const res = await inspectTimelineFrame(snap, {
            t_us: tUs,
            composition_id: compId,
            format: 'base64',
            getActiveWindow,
            requireLiveCompositor: true,
          })
          const tmpDir = path.join(process.env.TMPDIR || '/tmp', 'sclip-vision-frames')
          factualEvidence = res.factualEvidence
          provenance = { coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', composition_id: compId, timeline_t_us: res.t_us }
          fs.mkdirSync(tmpDir, { recursive: true })
          tempImagePath = path.join(tmpDir, `frame_${res.t_us}_${Date.now()}_${randomUUID().slice(0, 8)}.png`)
          const png = Buffer.from(res.pngBase64, 'base64')
          fs.writeFileSync(tempImagePath, png)
          // Opt-in forensic capture of the exact bytes this request gives Qwen.
          // Never changes the image path or the production inference path.
          const forensicPng = process.env.SCLIP_VISION_FORENSIC_PNG
          if (forensicPng) {
            fs.writeFileSync(forensicPng, png)
            fs.writeFileSync(`${forensicPng}.json`, JSON.stringify({ t_us: res.t_us, composition_id: compId, source: res.source, width: res.width, height: res.height }))
          }
          imagePaths = [tempImagePath]
        } catch (e) {
          return { isError: true, content: [{ type: 'text', text: e instanceof EvidenceCoordinateError ? e.message : `Failed to inspect frame at timeline_t_us=${tUs ?? 'current_playhead'}: ${e instanceof Error ? e.message : String(e)}` }] } as unknown as ServerResult
        }
      }

      try {
        const auditDir = process.env.SCLIP_EVIDENCE_AUDIT_DIR
        if (auditDir && tempImagePath) {
          fs.mkdirSync(auditDir, { recursive: true })
          const evidencePath = path.join(auditDir, `${provenance.coordinate_space}-${provenance.timeline_t_us ?? provenance.source_t_us}-${randomUUID()}.${provenance.coordinate_space === 'source' ? 'jpg' : 'png'}`)
          fs.copyFileSync(tempImagePath, evidencePath)
          fs.writeFileSync(`${evidencePath}.json`, JSON.stringify({ ...provenance, composed_frame_facts: factualEvidence }))
          provenance.evidence_file = evidencePath
        }
        const runtime = getVisionRuntime()
        const result = await runtime.analyze({
          imagePaths: imagePaths.length > 1 ? imagePaths : undefined,
          imagePath: imagePaths.length === 1 ? imagePaths[0] : undefined,
          question,
          context: `${context ?? ''} ${VISUAL_EVIDENCE_SEMANTICS}`,
          resolution,
          maxTokens,
        })
        if (!result.ok) {
          return { isError: true, content: [{ type: 'text', text: result.error ?? 'Vision analysis failed' }] } as unknown as ServerResult
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...provenance,
                question,
                description: result.description,
                confidence: result.confidence,
                confidence_basis: 'uncalibrated_local_model_observation',
                latency_ms: result.latencyMs,
                model: result.model,
                visible_content: result.visibleContent,
                framing_ok: result.framingOk,
                subject_visible: result.subjectVisible,
                subject_position: result.subjectPosition,
                resolution_used: result.resolutionUsed,
                input_frames: result.inputFrames,
                cached: result.cached,
                composed_frame_facts: factualEvidence,
                subject_observations: subjectObservations(result),
                evidence_semantics: VISUAL_EVIDENCE_SEMANTICS,
              }, null, 2),
            },
          ],
        } as unknown as ServerResult
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] } as unknown as ServerResult
      } finally {
        if (tempImagePath && fs.existsSync(tempImagePath)) {
          try { fs.unlinkSync(tempImagePath) } catch { /* ignore */ }
        }
      }
    }
    if (name === 'render_timeline_range') {
      const snap = tsHost.actor.snapshot()
      const startUs = Number(args.start_us)
      const endUs = Number(args.end_us)
      if (isNaN(startUs) || isNaN(endUs)) {
        return { isError: true, content: [{ type: 'text', text: 'start_us and end_us must be valid numbers' }] } as unknown as ServerResult
      }
      const compId = (args.composition_id as string | undefined) ?? snap.root_id
      try {
        validateTimelineRange(startUs, endUs, snap.compositions[compId]?.duration_us ?? 0, compId)
        const res = await renderComposedTimelineRange(snap, {
          start_us: startUs,
          end_us: endUs,
          composition_id: compId,
          getActiveWindow,
        })
        return { content: [{ type: 'text', text: JSON.stringify({ ...res, coordinate_space: 'timeline', evidence_origin: 'CURRENT_TIMELINE', composition_id: compId, timeline_range_us: [startUs, endUs] }) }] } as unknown as ServerResult
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] } as unknown as ServerResult
      }
    }
    if (name === 'validate_rough_cut_review') {
      const snap = tsHost.actor.snapshot()
      let reviewObj = args.review
      if (typeof reviewObj === 'string') {
        try { reviewObj = JSON.parse(reviewObj) } catch (e) {
          return { content: [{ type: 'text', text: JSON.stringify({ valid: false, errors: ['Failed to parse review JSON: ' + (e instanceof Error ? e.message : String(e))], inspections_count: 0, issues_count: 0, has_critical_issues: false }) }] } as unknown as ServerResult
        }
      }
      const compId = (args.composition_id as string | undefined) ?? snap.root_id
      const comp = snap.compositions[compId]
      if (!comp) {
        return { isError: true, content: [{ type: 'text', text: `Composition not found: ${compId}` }] } as unknown as ServerResult
      }
      if (typeof reviewObj === 'object' && reviewObj !== null) {
        const ro = reviewObj as Record<string, unknown>
        if (!ro.composition_id && compId) ro.composition_id = compId
        if (!ro.project_id && snap.project_id) ro.project_id = snap.project_id
        if (ro.clip_count === undefined || ro.clip_count === null) {
          ro.clip_count = comp.tracks.reduce((acc, t) => acc + t.layers.filter(l => l.params.kind === 'VideoClip').length, 0)
        }
        if (ro.total_duration_us === undefined || ro.total_duration_us === null) {
          ro.total_duration_us = comp.duration_us
        }
      }
      const res = validateRoughCutReview(reviewObj, comp)
      return { content: [{ type: 'text', text: JSON.stringify(res) }] } as unknown as ServerResult
    }
    if (name === 'video_search_external_media') {
      if (enableExternalMedia === false) {
        return revisionToolError('External B-roll discovery is disabled in Sclip V1. Enable with SCLIP_ENABLE_EXTERNAL_BROLL=1.')
      }
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (!query) {
        return revisionToolError('query is required for video_search_external_media')
      }
      const service = externalMediaService ?? defaultExternalMediaService
      const projectId = tsHost.actor.snapshot().project_id ?? 'default'
      try {
        const result = await service.search({
          query,
          media_type: (args.media_type as 'video' | 'image' | 'either') ?? 'either',
          provider: (args.provider as any) ?? 'auto',
          limit: typeof args.limit === 'number' ? args.limit : 10,
          orientation: args.orientation as any,
          visual_intent: args.visual_intent as VisualIntent | undefined,
          project_id: projectId,
        })
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } as ServerResult
      } catch (e) {
        return revisionToolError(`External search failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (name === 'resolve_visual_intents') {
      if (enableExternalMedia === false) {
        return revisionToolError('External B-roll discovery is disabled in Sclip V1. Enable with SCLIP_ENABLE_EXTERNAL_BROLL=1.')
      }
      const rawIntents = Array.isArray(args.intents) ? args.intents : []
      if (rawIntents.length === 0) {
        return revisionToolError('intents array must contain at least 1 visual intent')
      }
      const service = externalMediaService ?? defaultExternalMediaService
      const projectId = tsHost.actor.snapshot().project_id ?? 'default'
      try {
        const response = await service.resolveVisualIntents(rawIntents as any, {
          project_id: projectId,
        })
        return {
          content: [
            { type: 'text', text: response.hermes_compact_summary },
            { type: 'text', text: JSON.stringify(response, null, 2) },
          ],
        } as unknown as ServerResult
      } catch (e) {
        return revisionToolError(`resolve_visual_intents failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (name === 'import_external_media') {
      if (enableExternalMedia === false) {
        return revisionToolError('External B-roll discovery is disabled in Sclip V1. Enable with SCLIP_ENABLE_EXTERNAL_BROLL=1.')
      }
      const candidateId = typeof args.candidate_id === 'string' ? args.candidate_id.trim() : ''
      if (!candidateId) {
        return revisionToolError('candidate_id is required for import_external_media')
      }
      const service = externalMediaService ?? defaultExternalMediaService
      const candidate = service.getCandidate(candidateId)
      if (!candidate) {
        return revisionToolError(`Candidate "${candidateId}" was not found in the search cache. Run video_search_external_media first.`)
      }
      if (candidate.import_mode !== 'AUTO_IMPORT') {
        return revisionToolError(
          `Candidate "${candidate.candidate_id}" cannot be imported automatically (import_mode: ${candidate.import_mode}, rights_status: ${candidate.rights_status}). Direct download is prohibited. ${candidate.source_page_url}`,
        )
      }
      if (!candidate.direct_media_url) {
        return revisionToolError(`Candidate "${candidate.candidate_id}" has no direct media URL for download.`)
      }
      try {
        const wsDir = tsHost.mcpHybridDeps.workspaceDir()
        const targetDir = wsDir ? path.join(wsDir, 'Media') : path.join(os.tmpdir(), 'sclip-external-media')
        const dl = await downloadExternalMediaCandidate(candidate, targetDir)
        const mediaId = String(await runHybrid('import_media', { path: dl.filePath }, tsHost.mcpHybridDeps))
        const snap = tsHost.actor.snapshot()
        const importedItem = snap.media_pool[mediaId]
        const obligation = buildAttributionObligation(candidate, mediaId)
        if (importedItem) {
          attachAttributionMetadata(importedItem, obligation, dl.provenancePath)
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                media_id: mediaId,
                candidate_id: candidate.candidate_id,
                provider: candidate.provider,
                title: candidate.title,
                media_type: candidate.media_type,
                duration_us: importedItem?.metadata.duration_us ?? (candidate.duration ? Math.round(candidate.duration * 1_000_000) : null),
                rights_status: candidate.rights_status,
                import_mode: candidate.import_mode,
                license: candidate.license,
                attribution: candidate.attribution,
                attribution_required: candidate.attribution_required,
                export_obligation_status: obligation.export_obligation_status,
                source_page_url: candidate.source_page_url,
                local_path: dl.filePath,
                provenance_path: dl.provenancePath,
                note: 'External asset successfully imported into project media pool. Use get_source_observations to inspect visual contents and select the exact useful range before placing on the timeline.',
              }, null, 2),
            },
          ],
        } as ServerResult
      } catch (e) {
        return revisionToolError(`Failed to import external media candidate "${candidateId}": ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (name === 'apply_repair_transaction') {
      const out = tsHost.mcpCall(name, JSON.stringify(args))
      return out.ok ? out.result as ServerResult : { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: out.error }) }] } as ServerResult
    }
    const route = routeMcpTool(name)
    if (route === 'ts') {
      const out = unwrapEnvelope(tsHost.mcpCall(name, JSON.stringify(args)))
      return out as ServerResult
    }
    if (route === 'hybrid') {
      // Native-compute → TS-write. import_media returns the new media
      // id; shape it as the Rust tool does (ToolResult::text(id) → text content).
      const result = await runHybrid(name, args, tsHost.mcpHybridDeps)
      return { content: [{ type: 'text', text: String(result) }] } as unknown as ServerResult
    }
    if (route === 'motif') {
      // Catalog-read + authoring + install, served in TS. The raw value
      // is shaped to the Rust-faithful ToolResult (list_motifs strips html, etc.).
      const raw = tsHost.motifTool(name, args)
      return shapeMotifMcpResult(name, raw) as unknown as ServerResult
    }
    // Clip compute routes to 'rust', but the Rust core holds no state — the
    // slice is resolved here from the actor and forwarded.
    //
    // Two-slice compute (compare_frames) resolves BOTH nested { a, b } clip
    // slices. Kept separate from the single-slice call below, which reads a
    // top-level `layer_id`.
    if (TWO_SLICE_TOOLS.has(name)) {
      const merged = resolveTwoSliceArgs(args, tsHost.actor.snapshot())
      return unwrap(await backend.mcpCallTool(name, JSON.stringify(merged))) as ServerResult
    }
    if (CLIP_SLICE_TOOLS.has(name)) {
      const result = await callClipComputeTool(backend, tsHost, name, args, getPreferredEngine, getVlm, peaksPathFor)
      // Only the MCP response is compacted. The native transcript/cache and
      // renderer transcription/caption path keep their full result unchanged.
      if (name === 'transcribe_clip' && !('isError' in result && result.isError) && 'content' in result && Array.isArray(result.content)) {
        const text = result.content.find(c => c.type === 'text')
        if (text?.type === 'text' && text.text.length > 50_000) {
          const transcript = JSON.parse(text.text)
          const slice = resolveClipSliceArgs(args, tsHost.actor.snapshot())
          const mediaId = (slice.media as { id: string } | null)?.id
          return { content: [{ type: 'text', text: JSON.stringify({
            status: 'available', backend: transcript.backend, language: transcript.language,
            word_timing: transcript.word_timing, segment_count: transcript.segments?.length,
            media_id: mediaId, response: 'cached_transcript_summary',
            message: 'Transcription completed and is cached. Retrieve actual text and word timing with get_media_context({media_id,start_us,end_us}) in source-time windows of at most 60 seconds. For a bounded caption request, transcribe_clip accepts t_start_us/t_end_us and returns the normal segments/SRT.',
          }) }] } as ServerResult
        }
      }
      if ('content' in result && Array.isArray(result.content) && !('isError' in result && result.isError)) {
        result.content.push({ type: 'text', text: JSON.stringify({ coordinate_space: ['transcribe_clip', 'detect_pauses', 'extract_clip_audio'].includes(name) ? 'timeline' : 'source', evidence_origin: 'SOURCE_MEDIA', layer_id: args.layer_id, note: 'analyze/describe output source-absolute times; transcribe/pause output owning-composition times. Source-derived evidence does not show current visual composition.' }) })
      }
      return result
    }
    if (name === 'get_media_context') {
      const unsupported = Object.keys(args).filter(key => !['media_id', 'detail', 'start_us', 'end_us'].includes(key))
      if (unsupported.length) {
        throw new Error(`get_media_context does not accept ${unsupported.join(', ')}. Use flat start_us and end_us fields in source microseconds, not a nested range object.`)
      }
      const snap = tsHost.actor.snapshot()
      const mediaId = (args as { media_id?: string }).media_id ?? ''
      const media = snap.media_pool[mediaId] ?? null
      const detail = args.detail ?? (args.start_us !== undefined || args.end_us !== undefined ? 'range' : 'overview')
      if (detail !== 'overview' && detail !== 'range' && detail !== 'segments') throw new Error('detail must be overview, range or segments')
      const startUs = args.start_us ?? 0
      const endUs = args.end_us ?? (detail !== 'overview' ? Math.min(Number(startUs) + 60_000_000, media?.metadata.duration_us ?? Number(startUs) + 60_000_000) : media?.metadata.duration_us)
      if (!Number.isSafeInteger(startUs) || Number(startUs) < 0 ||
          (endUs !== undefined && (!Number.isSafeInteger(endUs) || Number(endUs) <= Number(startUs))) ||
          (detail !== 'overview' && Number(endUs) - Number(startUs) > 60_000_000)) {
        throw new Error('Use a valid source-time range of at most 60 seconds (start_us/end_us in microseconds).')
      }
      const result = unwrap(await backend.mcpCallTool(name, JSON.stringify({ ...args, detail: detail === 'segments' ? 'range' : detail, start_us: startUs, end_us: endUs, media }))) as ServerResult
      const final: any = detail === 'segments' ? compactMediaContext(result) : result
      const body = final.content?.find((c: any) => c.type === 'text')
      if (body) body.text = JSON.stringify({ ...JSON.parse(body.text), coordinate_space: 'source', evidence_origin: 'SOURCE_MEDIA', media_id: mediaId })
      return final
    }
    // route === 'rust' → fall through (other reads are served by the backend).
  }
  if (name === 'preview_motif_draft') {
    const a = args as { id?: string; motif_id?: string; t_sec?: number; props?: unknown; width?: number; height?: number }
    const motifId = a.id ?? a.motif_id ?? ''
    const b64 = await captureMotifFrameB64({
      motifId, tSec: a.t_sec ?? 0, propsJson: JSON.stringify(a.props ?? {}),
      width: a.width ?? 480, height: a.height ?? 480, settleRafs: null, contentHash: '',
    })
    return { content: [{ type: 'image', data: b64, mimeType: 'image/png' }] } as unknown as ServerResult
  }
  return unwrap(await backend.mcpCallTool(name, JSON.stringify(args))) as ServerResult
}

/** ReadResource routing (tsHost present): project:// state views served in TS from
 *  the actor (sole state owner); the Rust-compute resources (project://compiled,
 *  media://*, composition://meter) forwarded to the backend with an injected
 *  slice. */
export async function handleReadResource(
  backend: Backend,
  getTsHost: () => TsActorHost | null,
  uri: string,
  getVlm: VlmProvider = NO_VLM,
): Promise<ServerResult> {
  const sourceFrame = /^media:\/\/([^/]+)\/frame\/([^/]+)$/.exec(uri)
  if (sourceFrame) {
    const media = getTsHost()?.actor.snapshot().media_pool[sourceFrame[1]!]
    if (!media) throw new Error('Source frame media_id does not exist')
    validateEvidenceTime('source', Number(sourceFrame[2]), media.metadata.duration_us ?? 0, { media_id: sourceFrame[1] })
  }
  const tsHost = getTsHost()
  if (tsHost) {
    if (uri === 'motifs://current') {
      const raw = tsHost.motifTool('list_motifs', {}) as Array<Record<string, unknown>>
      const list = raw.map((e) => { const { html: _html, ...rest } = e; return rest })
      return { contents: [{ uri: 'motifs://current', mimeType: 'application/json', text: JSON.stringify(list) }] } as unknown as ServerResult
    }
    if (uri === 'timeline://context' || uri.startsWith('timeline://context?')) {
      const q = uri.indexOf('?')
      const compParam = q === -1 ? null : new URLSearchParams(uri.slice(q + 1)).get('composition')
      const compId = compParam ?? tsHost.actor.snapshot().root_id
      const ctx = buildTimelineContext(tsHost.actor.snapshot(), { compositionId: compId })
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(ctx, null, 2) }] } as unknown as ServerResult
    }
    if (uri.startsWith('timeline://') && uri.includes('/frame/')) {
      const parts = uri.replace('timeline://', '').split('/frame/')
      const compId = parts[0]
      const tUs = parseInt(parts[1], 10)
      if (!isNaN(tUs)) {
        const frameRes = await inspectTimelineFrame(tsHost.actor.snapshot(), {
          t_us: tUs,
          composition_id: compId || undefined,
        })
        return {
          contents: [{
            uri,
            mimeType: 'image/png',
            blob: frameRes.pngBase64,
          }],
        } as unknown as ServerResult
      }
    }
    const served = serveProjectResource(uri, tsHost.actor)
    if (served) return served
    // project://compiled / media://* / composition://meter stay Rust compute —
    // inject the project / MediaItem / nothing the stateless reader now needs.
    const vlm = getVlm()
    const injection = buildResourceInjection(uri, tsHost.actor.snapshot(), vlm.config, {
      language: vlm.language,
      fps: vlm.fps,
      focus: vlm.focus,
      // The preference too, and for the same reason the other three ride along:
      // the backend it resolves and that backend's model label are hashed into
      // the description cache key, so a read that walked the plain availability
      // order would answer out of a view no gesture ever writes.
      preferred: vlm.preferred,
    })
    const resource: any = unwrap(await backend.mcpReadResource(uri, injection))
    if (uri.startsWith('media://') && Array.isArray(resource.contents)) resource.contents.push({ uri, mimeType: 'application/json', text: JSON.stringify({ coordinate_space: 'source', evidence_origin: 'SOURCE_MEDIA', media_id: uri.slice(8).split('/')[0], ...(sourceFrame ? { source_t_us: Number(sourceFrame[2]) } : {}) }) })
    return resource as ServerResult
  }
  return unwrap(await backend.mcpReadResource(uri)) as ServerResult
}

/** Collect the `ChangeEvent`s one MCP call commits, so its log row can carry the
 *  change summary the history panel renders instead of the mechanical tool name.
 *  The window is opened and closed by `withLog`, which owns the timing that makes
 *  it exclusive.
 *
 *  `close()` unsubscribes FIRST, so a throw while folding the row still ends the
 *  collection. Several commits fold to the LAST summary plus a count: the row is
 *  one line, and the last change is the one the call ended on.
 *
 *  The label key is read back out of history rather than widened onto
 *  `ChangeEvent`, which would ripple through `mapChangeEvent` into the renderer
 *  bridge for no gain. Matched by `op_id`, never by position: a commit that never
 *  reaches history — `undo`, `restore_checkpoint` and the rest of
 *  `broadcastUnrecorded` — must not borrow the key of whatever sits on top of the
 *  stack. Those legitimately have no key and carry their summary text alone. */
function openCommitWindow(actor: ActorHandle): McpCommitWindow {
  // Opt-in benchmark evidence only; no effect on tool execution or decisions.
  const auditDir = process.env.SCLIP_REVIEW_EVIDENCE_DIR ? undefined : process.env.SCLIP_MCP_AUDIT_DIR
  const before = auditDir ? JSON.stringify(actor.snapshot()) : undefined
  const collected: ChangeEvent[] = []
  const stopCollecting = actor.subscribe((e) => { collected.push(e) })
  return {
    close: () => {
      stopCollecting()
      const last = collected[collected.length - 1]
      if (last === undefined) return null
      const recorded = actor.historyView(1).ops.find((o) => o.op_id === last.op_id)
      if (auditDir && before) {
        try {
          fs.mkdirSync(auditDir, { recursive: true })
          fs.writeFileSync(path.join(auditDir, `${last.op_id}.json`), JSON.stringify({
            commits: collected.map(e => ({ op_id: e.op_id, summary: e.summary })),
            before: JSON.parse(before), after: actor.snapshot(),
          }), { flag: 'wx' })
        } catch (error) { console.error('[mcp] benchmark audit failed', error) }
      }
      const row: McpRowSummary = { message: last.summary, commits: collected.length }
      if (recorded?.label_key !== undefined) row.i18n_key = recorded.label_key
      if (recorded?.label_args !== undefined) row.i18n_args = recorded.label_args
      return row
    },
  }
}

/** One media frame as a `data:` URL the renderer can put straight in an `img`
 *  src, read through the SAME `media://{id}/frame/{t_us}` resource an agent
 *  reads: Rust extracts the frame once and caches it per `(file_hash, t_us)`,
 *  so the shot-review surface's cover frames cost one extract each however
 *  often they are re-shown.
 *
 *  Exported for the renderer's frame channel (`index.ts`), the way
 *  `callClipComputeTool` is — a second extraction call site would be a second
 *  cache key convention waiting to disagree with this one.
 *
 *  `t_us` is truncated because the resource path parses an integer; a
 *  fractional microsecond would be refused as a malformed URI rather than
 *  rounded. */
export async function readMediaFrameDataUrl(
  backend: Backend,
  getTsHost: () => TsActorHost | null,
  mediaId: string,
  tUs: number,
): Promise<string> {
  const uri = `media://${mediaId}/frame/${Math.trunc(tUs)}`
  const res = await handleReadResource(backend, getTsHost, uri)
  const content = (res as { contents?: Array<{ blob?: string; mimeType?: string }> }).contents?.[0]
  if (typeof content?.blob !== 'string') throw new Error(`${uri} returned no image`)
  return `data:${content.mimeType ?? 'image/jpeg'};base64,${content.blob}`
}

/** The two refusals `media://{id}/description` answers with when the DEFAULT
 *  view simply holds nothing: no description has been computed at that key yet,
 *  or no engine is configured to have computed one. Both mean "not described" to
 *  a reader, which is why `readMediaDescription` folds them into `null` instead
 *  of throwing — a Panel column has one empty state, and a backend that is not
 *  set up is the describe dialog's news to break, not a shot row's.
 *
 *  Matched on the leading phrase and unanchored: the media id and the backend
 *  tag are interpolated into both sentences, and the resource errors are prose
 *  with no structured code to key on. Every OTHER failure — an unknown media id,
 *  an unreadable cache file — still throws, because those are real. */
const NOT_DESCRIBED = /no description computed yet for media|no video-understanding backend/

/** The cached description for one source under the view the app's settings name
 *  — the resolver's backend at the configured sampling, focus and UI language —
 *  or `null` when nothing is cached there, read through the SAME
 *  `media://{id}/description` resource an agent reads.
 *
 *  Exported for the renderer's description channel (`index.ts`), the way
 *  `readMediaFrameDataUrl` is. This resource serves ONE view, and the injection
 *  is what makes it the right one: the same provider fills the tool's omitted
 *  view arguments, so what a gesture writes is what a Panel reopened in a later
 *  session finds.
 *
 *  `getVlm` is not optional here as it is on the frame read: the resource needs
 *  the merged backend config to resolve which backend's cache key to look
 *  under, and an empty config would report every source as undescribed. */
export async function readMediaDescription(
  backend: Backend,
  getTsHost: () => TsActorHost | null,
  mediaId: string,
  getVlm: VlmProvider,
): Promise<unknown | null> {
  const uri = `media://${mediaId}/description`
  let res: ServerResult
  try {
    res = await handleReadResource(backend, getTsHost, uri, getVlm)
  } catch (err) {
    if (NOT_DESCRIBED.test(String(err))) return null
    throw err
  }
  const content = (res as { contents?: Array<{ text?: string }> }).contents?.[0]
  if (typeof content?.text !== 'string') throw new Error(`${uri} returned no body`)
  return JSON.parse(content.text)
}

/** `withLog`'s `observe` seam for one session: which tools' commits may be
 *  attributed to their call, and the actor to watch for them.
 *
 *  Only the `'ts'` route qualifies, and by ROUTE rather than by tool name: it is
 *  the only route that commits inside `handleCallTool`'s synchronous prefix. The
 *  `async` hybrids are excluded because two overlapping ones would each see the
 *  other's commit, and a row attributed to the wrong tool is worse than a
 *  mechanical one. Exported for the gate, which drives the same predicate the
 *  session does rather than a copy of it. */
export function mcpCommitObserver(getTsHost: () => TsActorHost | null): (tool: string) => McpCommitWindow | null {
  return (tool: string) => {
    if (routeMcpTool(tool) !== 'ts') return null
    // No host and even a 'ts' tool is forwarded to the backend, where there is
    // no actor to watch.
    const tsHost = getTsHost()
    return tsHost ? openCommitWindow(tsHost.actor) : null
  }
}

/** The injectable seams of one MCP session. An options bag rather than trailing
 *  positionals: `log` is the fourth and every one of them is optional, and each
 *  omitted seam must keep the behaviour it had before it existed. */
export interface McpServerOptions {
  connectionId?: string
  getTsHost?: () => TsActorHost | null
  /** Active desktop preview for composition-faithful frame inspection. */
  getActiveWindow?: () => import('electron').BrowserWindow | null
  getPreferredEngine?: () => string | null
  getVlm?: VlmProvider
  /** Resolves a subject Audio layer to the baked peaks file `detect_pauses`
   *  must read. Omitted → the raw media peaks, the pre-bake behaviour. */
  peaksPathFor?: PeaksPathProvider
  /** LogBus emit + workspace identity for the six request handlers. Omitted →
   *  no rows at all, which is what a `buildMcpServer` without a bus wants.
   *
   *  `observe` is not the caller's to set — the session builds it below from its
   *  own routing table and actor — so it is typed out rather than left as a knob
   *  that would be accepted and silently overwritten. */
  log?: Omit<McpLogDeps, 'observe'>
  /** Optional filter to constrain advertised tools (e.g. headless test environments). */
  toolFilter?: (name: string) => boolean
  /** Feature rollback / matched evidence comparison; default preserves compact reads. */
  compactSourceEvidence?: boolean
  /** Optional read-only Jev evidence helper; absent means not advertised. */
  evaluateSourcePassages?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>
  /** Auto-enter the bounded Phase 2E protocol for a dedicated revision run. */
  revisionLoop?: boolean
  /** Shared across connections of one deliberately started autonomous review. */
  revisionGuard?: RevisionLoopGuard
  reviewProjectId?: string
  /** Real-time summary from background audio/visual reviewer. */
  getReviewerSummary?: (immediate?: boolean) => import('../sclip/reviewer/reviewerTypes.js').TimelineReviewSummary
  sourceObservationIndex?: SourceObservationIndex
  externalMediaService?: ExternalMediaService
  /** Enable external B-roll discovery tools (video_search_external_media, resolve_visual_intents, import_external_media).
   *  Frozen/disabled by default in Sclip V1. Can also be enabled via SCLIP_ENABLE_EXTERNAL_BROLL=1 environment variable. */
  enableExternalMedia?: boolean
}

/** The same merged catalog advertised to Hermes by tools/list. */
export async function registeredMcpTools(backend: Backend, opts: McpServerOptions = {}): Promise<CatalogTool[]> {
  const rust = (JSON.parse(await backend.mcpCatalog()) as { tools: Array<{ name: string }> }).tools
  const mediaContextTool = opts.compactSourceEvidence === false ? {
    ...MEDIA_CONTEXT_TOOL,
    description: 'Read cached source-media evidence. Overview returns availability/counts; range returns actual transcript segment text, source timestamps and word timing, plus available visual/audio facts. Pass source-time bounds as flat start_us/end_us fields, never a nested range object. Supplying start_us or end_us selects range unless detail is explicit. Range windows are at most 60 seconds. Missing modalities report not_generated. Does not transcribe or edit.',
    inputSchema: { ...MEDIA_CONTEXT_TOOL.inputSchema, properties: { ...MEDIA_CONTEXT_TOOL.inputSchema.properties,
      detail: { type: 'string', enum: ['overview', 'range'], description: 'Overview = counts/status; range = detailed text/word timing and modalities. Defaults to range when time bounds supplied, otherwise overview.' },
    } },
  } : MEDIA_CONTEXT_TOOL
  const externalEnabled = opts.enableExternalMedia ?? (process.env.SCLIP_ENABLE_EXTERNAL_BROLL === '1')
  const externalTools = externalEnabled
    ? [VIDEO_SEARCH_EXTERNAL_MEDIA_TOOL, RESOLVE_VISUAL_INTENTS_TOOL, IMPORT_EXTERNAL_MEDIA_TOOL]
    : []
  const all = mergeMcpCatalog(rust, [
    ...MCP_TOOL_DEFS,
    ...MOTIF_TOOL_DEFS,
    EDITORIAL_PACKET_TOOL,
    REVISION_CONTROL_TOOL,
    RECORD_ISSUE_TOOL,
    WITHDRAW_ISSUE_TOOL,
    mediaContextTool,
    VISION_INSPECT_TOOL,
    RANGE_VISUALS_TOOL,
    CALCULATE_VIDEO_FIT_TOOL,
    GET_TIMELINE_CRITIQUE_TOOL,
    ...externalTools,
    ...(opts.sourceObservationIndex ? [GET_SOURCE_OBSERVATIONS_TOOL,...SOURCE_UNDERSTANDING_TOOLS] : []),
    ...(opts.evaluateSourcePassages ? [SOURCE_PASSAGE_TOOL] : []),
  ]).filter(t => t.name !== 'export_timeline')
  return opts.toolFilter ? all.filter(t => opts.toolFilter!(t.name)) : all
}

export function buildMcpServer(backend: Backend, opts: McpServerOptions = {}): Server {
  const revisionGuard = opts.revisionGuard ?? new RevisionLoopGuard(opts.revisionLoop === true)
  const getTsHost = opts.getTsHost ?? (() => null)
  const getPreferredEngine = opts.getPreferredEngine ?? (() => null)
  const getVlm = opts.getVlm ?? NO_VLM
  const peaksPathFor = opts.peaksPathFor ?? NO_PEAKS_PATH
  // `observe` is the session's to supply, not the caller's: it is the one log
  // seam that needs the routing table and the actor. An un-instrumented build
  // gets no window at all — nothing would read it, and the subscribe/unsubscribe
  // per call would be pure churn.
  const log: McpLogDeps = opts.log ? { ...opts.log, observe: mcpCommitObserver(getTsHost) } : NO_MCP_LOG
  const server = new Server(
    { name: 'weftcut', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  )
  // One Server per session (`mcp/index.ts`), so this closure resolves to the
  // client that opened *this* session — `undefined` until it has initialized.
  const clientInfo = (): { name: string; version?: string } | undefined => server.getClientVersion()

  const emitReviewState = (tool: string) => {
    if (revisionGuard.status.phase === 'idle') return
    try { opts.log?.emit({ level: 'debug', category: { kind: 'Mcp' }, source: { kind: 'System' }, message: 'Review lifecycle', details: { review_tool: tool, review_session: revisionGuard.status } }) } catch {}
  }
  const connectionId = opts.connectionId ?? randomUUID()
  const track: typeof withLog = (method, handler, deps, client) => withLog(method, (req, extra) => {
    const service = getTsHost()?.agent
    if (!service) return handler(req, extra)
    const params = (req.params ?? {}) as Record<string, unknown>
    const tool = method === 'tools/call' ? String(params.name ?? '') : method
    const read = method !== 'tools/call' || tool === 'evaluate_source_passages' || tool === 'video_search_external_media' || tool === 'resolve_visual_intents' || /^(get_|list_|read_|ping$|view_|analyze_|describe_|transcribe_|compare_|detect_)/.test(tool)
    return service.run(connectionId, clientInfo()?.name ?? 'MCP', tool,
      method === 'tools/call' ? params.arguments ?? {} : params, read, () => handler(req, extra))
  }, deps, client)

  // Every handler goes through withLog: the funnel is what keeps a newly added
  // tool logged with nothing to remember. See `docs/status-log.md`.
  server.setRequestHandler(ListToolsRequestSchema, track('tools/list', async () => {
    const tools = await registeredMcpTools(backend, opts)
    return { tools } as unknown as ServerResult
  }, log, clientInfo))
  server.setRequestHandler(CallToolRequestSchema, track('tools/call', async (req: CallToolRequest, extra) => {
    try {
      const name = req.params.name
      const args = (req.params.arguments ?? {}) as Record<string, unknown>
      if (opts.reviewProjectId && getTsHost()?.actor.snapshot().project_id !== opts.reviewProjectId) return revisionToolError('Review project changed; start a new deliberate review for the current project.')
      const externalEnabled = opts.enableExternalMedia ?? (process.env.SCLIP_ENABLE_EXTERNAL_BROLL === '1')
      if ((name === 'video_search_external_media' || name === 'resolve_visual_intents' || name === 'import_external_media') && !externalEnabled) {
        return revisionToolError('External B-roll discovery is disabled in Sclip V1. Enable with SCLIP_ENABLE_EXTERNAL_BROLL=1.')
      }
      if (name === 'get_media_context' && args.detail === 'segments' && opts.compactSourceEvidence === false) {
        return revisionToolError('Compact source evidence is disabled; use overview or range. No source detail was removed.')
      }
      if (name === 'evaluate_source_passages') {
        if (!opts.evaluateSourcePassages) return revisionToolError('Jev source evaluation is disabled; ordinary source tools remain available.')
        const evidence = await opts.evaluateSourcePassages(args, (extra as { signal?: AbortSignal }).signal)
        return { content: [{ type: 'text', text: JSON.stringify(evidence) }] } as ServerResult
      }
      if (name === 'record_issue' || name === 'withdraw_issue') {
        const snap = getTsHost()?.actor.snapshot()
        if (!snap) throw new ReviewProtocolError({ code: 'CURRENT_PROJECT_REQUIRED', correction: 'Open a current project before review.' })
        const comp = snap.compositions[snap.root_id]!
        const layers = new Map<string, [number, number]>(comp.tracks.flatMap(track => track.layers.map(layer => [layer.id, [layer.t_start_us, layer.t_end_us]] as [string, [number, number]])))
        const result = name === 'record_issue' ? revisionGuard.recordIssue(args, reviewState(snap), comp.duration_us, layers) : revisionGuard.withdrawIssue(args, reviewState(snap))
        const auditDir = process.env.SCLIP_REVIEW_EVIDENCE_DIR
        if (auditDir) { try { fs.mkdirSync(auditDir, { recursive: true }); fs.writeFileSync(path.join(auditDir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ tool: name, args, result })) } catch {} }
        emitReviewState(name)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] } as ServerResult
      }
      if (name === 'revision_control') {
        let status: ReturnType<RevisionLoopGuard['begin']>
        switch (args.action) {
          case 'begin': status = revisionGuard.status.phase === 'idle' ? revisionGuard.begin() : revisionGuard.status; break
          case 'status': status = revisionGuard.status; break
          case 'extend_inspection': status = revisionGuard.extendInspection(args.reason); break
          case 'select_issue': status = revisionGuard.selectIssue(args.issue_id, reviewState(getTsHost()?.actor.snapshot())); break
          case 'finish_issue': status = revisionGuard.finishIssue(args.status, reviewState(getTsHost()?.actor.snapshot())); break
          case 'finalize': status = revisionGuard.finalize(); break
          case 'complete': status = revisionGuard.complete(); break
          case 'reground': status = revisionGuard.reground(args.reason, reviewState(getTsHost()?.actor.snapshot())); break
          case 'conclude_no_repair': status = revisionGuard.concludeNoRepair(args.reason, args.evidence_id, reviewState(getTsHost()?.actor.snapshot())); break
          default: return revisionToolError('Unknown revision_control action')
        }
        const auditDir = process.env.SCLIP_REVIEW_EVIDENCE_DIR
        if (auditDir) { try { fs.mkdirSync(auditDir, { recursive: true }); fs.writeFileSync(path.join(auditDir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ tool: name, args, review_session: status })) } catch {} }
        emitReviewState(name)
        return { content: [{ type: 'text', text: JSON.stringify(status) }] } as ServerResult
      }
      if (REVISION_INSPECTION_TOOLS.has(name)) {
        const refusal = revisionGuard.beforeInspection(name, args)
        if (refusal) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: refusal, review_session: revisionGuard.status }) }] } as ServerResult
      }
      const mutation = isRevisionMutation(name)
      if (mutation) {
        const refusal = revisionGuard.beforeMutation(reviewState(getTsHost()?.actor.snapshot()))
        if (refusal) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: refusal, review_session: revisionGuard.status }) }] } as ServerResult
      }
      if (name === 'validate_rough_cut_review' && revisionGuard.status.phase !== 'idle') {
        const review = typeof args.review === 'string' ? JSON.parse(args.review) : args.review
        const refusal = revisionGuard.validateEvidence(review, reviewState(getTsHost()?.actor.snapshot()))
        if (refusal) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, code: 'INVALID_REVIEW_RECORD', errors: [refusal], correction: 'Use record_issue with flat description, severity, repairable, evidence_receipt_ids and affected_range_us or layer_ids; do not build nested inspections.', review_session: revisionGuard.status }) }] } as ServerResult
      }
      const evidenceState = reviewState(getTsHost()?.actor.snapshot())
      const auditBefore = mutation ? getTsHost()?.actor.snapshot() : undefined
      const before = mutation ? reviewState(getTsHost()?.actor.snapshot()) : null
      const result = await handleCallTool(backend, getTsHost, name, args, getPreferredEngine, getVlm, peaksPathFor, opts.getActiveWindow, opts.getReviewerSummary, opts.sourceObservationIndex, opts.externalMediaService, externalEnabled)
      if (mutation && before !== reviewState(getTsHost()?.actor.snapshot())) {
        const auditDir = process.env.SCLIP_MCP_AUDIT_DIR
        if (auditDir && auditBefore) {
          try { fs.mkdirSync(auditDir, { recursive: true }); fs.writeFileSync(path.join(auditDir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ tool: name, args, issue_id: revisionGuard.status.active_issue, before: auditBefore, after: getTsHost()?.actor.snapshot() })) } catch {}
        }
        const afterSnapshot = getTsHost()?.actor.snapshot()
        if (auditBefore && afterSnapshot) {
          const notes = changedAVRelationships(auditBefore, afterSnapshot)
          if (notes.length) (result as any).content.push({type:'text',text:JSON.stringify({relationship_changes:notes,interpretation:'Observed relative source mappings; offsets can be intentional. Hermes decides whether these support its claim.'})})
        }
        revisionGuard.mutationCommitted(reviewState(afterSnapshot))
        getVisionRuntime().clearCache?.()

      }
      if (name === 'restore_checkpoint' && !('isError' in result && result.isError)) {
        revisionGuard.checkpointRestored(String(args.checkpoint_id), evidenceState, reviewState(getTsHost()?.actor.snapshot()))
        getVisionRuntime().clearCache?.()
      }
      if (['inspect_timeline_range_visuals', 'vision_inspect', 'inspect_timeline_frame', 'get_timeline_context', 'render_timeline_range', 'get_media_context'].includes(name)) {
        const text = (result as any).content?.find((c: any) => c.type === 'text')
        let evidence: any = {}; try { evidence = text ? JSON.parse(text.text) : {} } catch {}
        try { opts.log?.emit({ level: 'debug', category: { kind: 'Mcp' }, source: { kind: 'System' }, message: 'Evidence coordinate validation', details: { inspected_tool: name, coordinate_space: evidence.coordinate_space ?? (name === 'get_media_context' || args.source_t_us !== undefined ? 'source' : 'timeline'), timeline_t_us: args.timeline_t_us ?? args.t_us, source_t_us: args.source_t_us, accepted: !('isError' in result && result.isError), ...(evidence.code ? { rejection: evidence } : {}) } }) } catch {}
      }
      if (name === 'checkpoint' && !('isError' in result && result.isError)) revisionGuard.checkpointCreated()
      if (REVISION_INSPECTION_TOOLS.has(name) && !('isError' in result && result.isError)) {
        if (evidenceState !== reviewState(getTsHost()?.actor.snapshot())) return revisionToolError('Timeline changed while gathering evidence. Reacquire current evidence before diagnosis or repair.')
        if (revisionGuard.status.phase !== 'idle') {
          const body = (result as any).content?.find((c: any) => c.type === 'text')
          let data: any = {}; try { data = body ? JSON.parse(body.text) : {} } catch {}
          const timeline = ['get_editorial_evidence_packet', 'inspect_timeline_range_visuals', 'get_timeline_context', 'inspect_timeline_frame', 'render_timeline_range', 'get_timeline_critique'].includes(name) || data.coordinate_space === 'timeline'
          const space = timeline ? 'timeline' : 'source'
          const comp = getTsHost()?.actor.snapshot().compositions[String(args.composition_id ?? getTsHost()?.actor.snapshot().root_id)]
          const t = data.timeline_t_us ?? args.timeline_t_us ?? args.t_us
          const range: [number, number] = timeline ? typeof t === 'number' ? [t, t] : [Number(args.start_us ?? 0), Number(args.end_us ?? comp?.duration_us ?? 0)] : [Number(args.source_t_us ?? args.start_us ?? 0), Number(args.source_t_us ?? args.end_us ?? 0)]
          const receipt = revisionGuard.recordEvidence(name, space, range, reviewState(getTsHost()?.actor.snapshot()), toolDimensions(name, data), undefined, evidenceCoverage(name,data,range))
          revisionGuard.inspectionCompleted(name, args)
          ;(result as any).content.push({ type: 'text', text: JSON.stringify({ evidence_receipt: receipt }) })
        }
      }
      if (name === 'validate_rough_cut_review' && validatedReview(result)) {
        const review = typeof args.review === 'string' ? JSON.parse(args.review) : args.review as any
        const ranges = Object.fromEntries((review?.identified_issues ?? []).map((issue: any) => [issue.id, issue.affected_range_us]))
        revisionGuard.reviewValidated(reviewIssueIds(args.review), ranges, reviewState(getTsHost()?.actor.snapshot()))
        const auditDir = process.env.SCLIP_REVIEW_EVIDENCE_DIR
        if (auditDir) { try { fs.mkdirSync(auditDir, { recursive: true }); fs.writeFileSync(path.join(auditDir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ tool: name, review, review_session: revisionGuard.status })) } catch {} }
      }
      if (revisionGuard.status.phase !== 'idle' && Array.isArray((result as any).content)) {
        emitReviewState(name)
        ;(result as any).content.push({ type: 'text', text: `Revision execution state: ${JSON.stringify(revisionGuard.status)}` })
      }
      return result
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: e instanceof ReviewProtocolError ? JSON.stringify({ ...e.details, review_session: revisionGuard.status }) : e instanceof EvidenceCoordinateError ? e.message : `Tool '${req.params.name}' error: ${e instanceof Error ? e.message : String(e)}` }] } as unknown as ServerResult
    }
  }, log, clientInfo))
  server.setRequestHandler(ListResourcesRequestSchema, track('resources/list', async () => {
    const cat = JSON.parse(await backend.mcpCatalog()) as { resources: Array<{ uri: string }> }
    return { resources: mergeMcpResources(cat.resources, MOTIF_RESOURCE_DEFS) } as unknown as ServerResult
  }, log, clientInfo))
  server.setRequestHandler(ReadResourceRequestSchema, track('resources/read', async (req: ReadResourceRequest) => {
    try {
      if (opts.reviewProjectId && getTsHost()?.actor.snapshot().project_id !== opts.reviewProjectId) throw new Error('Review project changed')
      if (revisionGuard.status.phase !== 'idle') {
        const refusal = revisionGuard.beforeInspection(req.params.uri.startsWith('media://') ? 'get_media_context' : 'get_timeline_context', {})
        if (refusal) throw new Error(JSON.stringify({ error: refusal, review_session: revisionGuard.status }))
      }
      const resourceState = reviewState(getTsHost()?.actor.snapshot())
      const result: any = await handleReadResource(backend, getTsHost, req.params.uri, getVlm)
      if (revisionGuard.status.phase !== 'idle') {
        const snap = getTsHost()?.actor.snapshot()
        if (resourceState !== reviewState(snap)) throw new Error('Timeline changed while reading evidence. Reacquire current evidence.')
        const timeline = req.params.uri === 'project://current' || req.params.uri.startsWith('project://tracks')
        // Resource state alone does not verify speech or rendered visual dimensions.
        const receipt = revisionGuard.recordEvidence('resources/read', timeline ? 'timeline' : 'source', [0, snap?.compositions[snap.root_id]?.duration_us ?? 0], reviewState(snap), ['timeline','text'])
        result.contents.push({ uri: req.params.uri, mimeType: 'application/json', text: JSON.stringify({ evidence_receipt: receipt, review_session: revisionGuard.status }) })
      }
      return result
    } catch (e) {
      return { contents: [{ uri: req.params.uri, mimeType: 'text/plain', text: `Error reading resource: ${e instanceof Error ? e.message : String(e)}` }] } as unknown as ServerResult
    }
  }, log, clientInfo))
  server.setRequestHandler(ListPromptsRequestSchema, track('prompts/list', async () => {
    return { prompts: JSON.parse(await backend.mcpListPrompts()) } as unknown as ServerResult
  }, log, clientInfo))
  server.setRequestHandler(GetPromptRequestSchema, track('prompts/get', async (req: GetPromptRequest) => {
    try {
      return unwrap(
        await backend.mcpGetPrompt(req.params.name, JSON.stringify(req.params.arguments ?? {})),
      ) as ServerResult
    } catch (e) {
      return { description: 'Prompt error', messages: [{ role: 'user', content: { type: 'text', text: `Prompt '${req.params.name}' not available: ${e instanceof Error ? e.message : String(e)}` } }] } as unknown as ServerResult
    }
  }, log, clientInfo))

  return server
}
