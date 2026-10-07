import { describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildMcpServer } from './server'
import { Backend } from '@weftcut/core'
import { createActor } from '../state/actor'
import { blankProject } from '../state/model'
import { uuidV7Gen } from '../state/ids'
import type { TsActorHost } from '../state/ts-actor-host'
import type { HybridDeps } from '../state/hybrids'
import { initEval } from '../../renderer/eval/index.js'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

interface ToolAuditRecord {
  name: string
  purpose: string
  classification: 'read_only' | 'state_mutating' | 'external_compute' | 'session_control'
  category: string
  inputSchema: any
  hasValidation: boolean
  invalidInputTest: {
    status: 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED'
    errorMsg?: string
  }
  executionTest: {
    status: 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED'
    mutatesState?: boolean
    detail?: string
  }
  prerequisites: string
  failureBehavior: string
  discoverableByHermes: boolean
}

describe('Legacy MCP handler fixture audit', () => {
  it('records fixture outcomes and rejects uncategorized catalog additions', async () => {
    await initEval()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-mcp-audit-full-'))
    const cfgDir = path.join(tmpDir, 'cfg')
    const cacheDir = path.join(tmpDir, 'cache')
    fs.mkdirSync(cfgDir, { recursive: true })
    fs.mkdirSync(cacheDir, { recursive: true })

    const backend = new Backend(cfgDir, cacheDir, () => {})

    // Set up actor
    const idGen = uuidV7Gen()
    const project = blankProject(idGen, 'audit-project')
    const rootComp = project.compositions[project.root_id]!
    const trackA = rootComp.tracks[0]!.id
    const trackB = rootComp.tracks[1]!.id

    const actor = createActor({ initial: project, idGen, clock: () => '2026-09-28T19:00:00Z' })

    const mediaId = idGen()
    actor.dispatch('add_media', {
      id: mediaId,
      kind: 'Video',
      duration_us: 10_000_000,
      with_audio: true,
    })

    // Add baseline layers to work with
    const addLayer1 = actor.dispatch('add_layer', {
      track: trackA,
      kind: 'color',
      color: { r: 255, g: 0, b: 0, a: 255 },
      t_start_us: 0,
      t_end_us: 2_000_000,
    })
    const layer1Id = (addLayer1 as any).value as string

    const addLayer2 = actor.dispatch('add_layer', {
      track: trackB,
      kind: 'video',
      media: mediaId,
      src_in_us: 0,
      src_out_us: 2_000_000,
      t_start_us: 0,
      t_end_us: 2_000_000,
    })
    const layer2Id = (addLayer2 as any).value as string

    const addLayer3 = actor.dispatch('add_layer', {
      track: trackA,
      kind: 'text',
      text: 'Title',
      t_start_us: 2_000_000,
      t_end_us: 4_000_000,
    })
    expect(addLayer3.ok).toBe(true)

    const agentSession = {
      begin: (reason: string) => ({ session_id: 'agent-sess-1', reason }),
      end: (who: string) => ({ ended: true, who }),
      lock: (reason: string) => ({ locked: true, reason }),
      unlock: () => ({ unlocked: true }),
      run: (_cid: any, _client: any, _tool: any, _args: any, _read: any, fn: any) => fn(),
    }

    const motifs = new Map<string, any>()
    const motifTool = (name: string, args: any) => {
      if (name === 'list_motifs') return Array.from(motifs.values())
      if (name === 'get_motif_source') {
        const m = motifs.get(args.id || args.motif_id)
        if (!m) throw new Error('Motif not found')
        return m
      }
      if (name === 'write_motif_draft') {
        motifs.set(args.motif_id, { id: args.motif_id, name: args.name, js: args.js, css: args.css })
        return args.motif_id
      }
      if (name === 'install_motif') {
        motifs.set(args.id || args.motif_id, { installed: true, id: args.id || args.motif_id })
        return args.id || args.motif_id
      }
      if (name === 'delete_motif') {
        motifs.delete(args.id || args.motif_id)
        return null
      }
      return {}
    }

    const hybridDeps: HybridDeps = {
      actor,
      compute: {
        probeMedia: async () => JSON.stringify({ id: idGen(), kind: 'Video', metadata: { duration_us: 5000000 } }),
        hashMediaSource: async () => '0000000000000000000000000000000000000000000000000000000000000000',
        parseSubtitles: async () => JSON.stringify({ cues: [{ start_us: 0, end_us: 1000000, text: 'Hello subtitle' }], simplified: false, label: 'sub' }),
        synthesizeSpeechCompute: async () => JSON.stringify({ media_item: { id: idGen(), kind: 'Audio', metadata: { duration_us: 2000000 } } }),
        detectPauses: async () => ({
          pauses: [{ t_start_us: 500000, t_end_us: 800000 }],
          noise_floor_amp: 0.05,
          peaks_source: 'raw'
        }),
        analyzeShotsFloor: async () => JSON.stringify({ shots: [], cut_scores: [] }),
        reduceShotReport: () => JSON.stringify({ shots: [] }),
        shotFloorReportCached: async () => true,
        shotFloorSensitivity: () => 0.5,
        shotDefaultOpts: () => ({ sensitivity: 0.5, min_shot_us: 500000 }),
        readTranscript: async () => JSON.stringify({ segments: [{ t_start_us: 0, t_end_us: 1000000, text: 'Hello word', words: [] }] })
      },
      enqueueDerivatives: async () => {},
      enqueueWorkspaceCopy: async () => {},
      workspaceDir: () => null,
      readFile: () => '1\n00:00:00,000 --> 00:00:01,000\nHello subtitle',
      snapshotComposition: () => ({ width: 1920, height: 1080, duration_us: 10_000_000 })
    }

    const tsHost: TsActorHost = {
      actor,
      mcpCall: (name: string, argsJson: string) => actor.mcpCall(name, argsJson),
      hybridDeps,
      motifTool: motifTool as any,
      agent: agentSession as any,
    } as unknown as TsActorHost

    const server = buildMcpServer(backend, {
      getTsHost: () => tsHost,
      enableExternalMedia: true,
      evaluateSourcePassages: async () => ({
        ranked: [{ start_us: 0, end_us: 1000000, text: 'Sample evidence', score: 0.9 }],
        evaluated: 1,
        source: 'jev-fixture'
      })
    })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'audit-runner', version: '1.0' }, { capabilities: {} })
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    const toolList = (await client.listTools()).tools
    expect(toolList.length).toBeGreaterThan(0)
    expect(new Set(toolList.map(t => t.name)).size).toBe(toolList.length)

    const auditRecords: Record<string, ToolAuditRecord> = {}

    async function testTool(
      name: string,
      validFn: Record<string, unknown> | (() => Promise<Record<string, unknown>> | Record<string, unknown>),
      invalidArgs: any,
      category: string,
      classification: ToolAuditRecord['classification'],
      prerequisites = 'Authoritative ProjectActor running in MCP server',
      failureBehavior = 'Returns isError: true with descriptive message'
    ) {
      const toolDef = toolList.find(t => t.name === name)
      if (!toolDef) throw new Error(`Tool ${name} not found in catalog`)

      const record: ToolAuditRecord = {
        name,
        purpose: toolDef.description || '',
        classification,
        category,
        inputSchema: toolDef.inputSchema,
        hasValidation: true,
        invalidInputTest: { status: 'PASS' },
        executionTest: { status: 'PASS' },
        prerequisites,
        failureBehavior,
        discoverableByHermes: true,
      }

      // 1. Test invalid arguments
      if (invalidArgs !== undefined) {
        try {
          const res = await client.callTool({ name, arguments: invalidArgs })
          if (res.isError) {
          record.invalidInputTest = { status: 'PASS', errorMsg: Array.isArray(res.content) && res.content[0]?.type === 'text' ? res.content[0].text : undefined }
          } else {
            record.invalidInputTest = { status: 'PARTIAL', errorMsg: 'Did not return isError: true on invalid args' }
          }
        } catch (e: any) {
          record.invalidInputTest = { status: 'PASS', errorMsg: e.message }
        }
      }

      // 2. Test valid execution
      const snapBefore = JSON.stringify(actor.snapshot())
      try {
        const validArgs = typeof validFn === 'function' ? await validFn() : validFn
        const res = await client.callTool({ name, arguments: validArgs })
        const snapAfter = JSON.stringify(actor.snapshot())
        const mutated = snapBefore !== snapAfter

        if (res.isError) {
          const detail = Array.isArray(res.content) && res.content[0]?.type === 'text' ? res.content[0].text : 'Returned isError: true'
          const isBlocked = classification === 'external_compute' || detail.includes('offline') || detail.includes('not configured') || detail.includes('No such file')
          record.executionTest = {
            status: isBlocked ? 'BLOCKED' : 'FAIL',
            mutatesState: mutated,
            detail
          }
        } else {
          record.executionTest = {
            status: 'PASS',
            mutatesState: mutated,
            detail: 'Success payload returned'
          }
        }
      } catch (e: any) {
        const isBlocked = classification === 'external_compute' || e.message.includes('not configured') || e.message.includes('No such file')
        record.executionTest = {
          status: isBlocked ? 'BLOCKED' : 'FAIL',
          detail: e.message
        }
      }

      auditRecords[name] = record
    }

    // 1. Project management
    await testTool('ping', {}, undefined, 'Project management', 'read_only')
    const mcpCpRes = await client.callTool({ name: 'checkpoint', arguments: { label: 'Audit checkpoint' } })
    const cpId = Array.isArray(mcpCpRes.content) && mcpCpRes.content[0]?.type === 'text' ? mcpCpRes.content[0].text : ''
    await testTool('checkpoint', { label: 'Audit checkpoint 2' }, undefined, 'Project management', 'state_mutating')
    await testTool('list_checkpoints', {}, undefined, 'Project management', 'read_only')
    await testTool('restore_checkpoint', { checkpoint_id: cpId }, { checkpoint_id: 'bad-uuid' }, 'Project management', 'state_mutating')
    await testTool('begin_agent_session', { reason: 'Audit session' }, { reason: 123 }, 'Project management', 'session_control')
    await testTool('lock_history', { reason: 'Audit lock' }, { reason: 123 }, 'Project management', 'session_control')
    await testTool('unlock_history', {}, undefined, 'Project management', 'session_control')
    await testTool('end_agent_session', {}, undefined, 'Project management', 'session_control')
    await testTool('dry_run', { operations: [] }, { operations: 'not-an-array' }, 'Project management', 'read_only')
    
    // For undo & redo: make a dummy edit, then undo, then redo!
    actor.dispatch('add_track', { composition_id: project.root_id, kind: 'Video' })
    await testTool('undo', {}, undefined, 'Project management', 'state_mutating')
    await testTool('redo', {}, undefined, 'Project management', 'state_mutating')

    // 2. Media import and metadata
    const tempMediaId = idGen()
    actor.dispatch('add_media', { id: tempMediaId, kind: 'Audio', duration_us: 1000000 })
    await testTool('remove_media', { media_id: tempMediaId }, { media_id: 'bad-uuid' }, 'Media import and metadata', 'state_mutating')
    await testTool('import_media', { file_path: '/non/existent/path.mp4' }, {}, 'Media import and metadata', 'external_compute', 'Local media file accessible on filesystem')
    await testTool('extract_clip_audio', { media_id: mediaId, start_us: 0, end_us: 1000000 }, {}, 'Media import and metadata', 'external_compute', 'FFmpeg audio extraction binary & real media')

    // 3. Transcript and source retrieval
    await testTool('get_media_context', { media_id: mediaId, detail: 'overview' }, { media_id: mediaId, range: { start: 0 } }, 'Transcript and source retrieval', 'read_only')
    await testTool('transcribe_clip', { media_id: mediaId, start_us: 0, end_us: 1000000 }, {}, 'Transcript and source retrieval', 'external_compute', 'Local Whisper/STT engine or provider')
    await testTool('apply_transcripts', { layer_id: layer2Id }, { layer_id: 'bad-id' }, 'Transcript and source retrieval', 'state_mutating')
    await testTool('apply_subtitles', { composition_id: project.root_id, body: '1\n00:00:00,000 --> 00:00:01,000\nHello' }, {}, 'Transcript and source retrieval', 'state_mutating')
    await testTool('synthesize_speech', { text: 'Hello speech', voice: 'default' }, {}, 'Transcript and source retrieval', 'external_compute', 'Local TTS binary/model')

    // 4. Audio analysis
    await testTool('detect_pauses', { media_id: mediaId }, {}, 'Audio analysis', 'external_compute', 'Audio peaks computation/cache')
    const audioLRes = actor.mcpCall('add_media_layer', JSON.stringify({ media_id: mediaId, track_id: trackA, t_start_us: 20_000_000 }))
    const audioLId = audioLRes.ok && Array.isArray(audioLRes.result?.content) && audioLRes.result.content[0]?.type === 'text' ? audioLRes.result.content[0].text : ''
    await testTool('remove_pauses', { layer_id: audioLId }, { layer_id: 'bad' }, 'Audio analysis', 'state_mutating')

    // 5. Vision and image inspection
    await testTool('inspect_timeline_frame', { t_us: 0 }, { t_us: -100 }, 'Vision and image inspection', 'external_compute', 'Compositor / BrowserWindow active')
    await testTool('vision_inspect', { question: 'Is the speaker visible?' }, { question: '' }, 'Vision and image inspection', 'external_compute', 'Qwen vision model sidecar/binary')
    await testTool('calculate_video_fit', { layer_id: layer2Id, mode: 'cover' }, { layer_id: 'bad', mode: 'invalid' }, 'Vision and image inspection', 'read_only')
    await testTool('get_timeline_critique', {}, undefined, 'Vision and image inspection', 'read_only')
    await testTool('describe_clip', { media_id: mediaId, start_us: 0, end_us: 1000000 }, {}, 'Vision and image inspection', 'external_compute', 'VLM backend configured')
    await testTool('compare_frames', { a: { media: mediaId, t_us: 0 }, b: { media: mediaId, t_us: 100000 } }, {}, 'Vision and image inspection', 'external_compute', 'Real decoded media frames')
    await testTool('analyze_clip', { media_id: mediaId, start_us: 0, end_us: 1000000 }, {}, 'Vision and image inspection', 'external_compute', 'VSHOT scene cut detector')

    // 6. Clip creation and deletion
    await testTool('add_color_layer', { track_id: trackA, color: { r: 0, g: 255, b: 0, a: 255 }, t_start_us: 4_000_000, t_end_us: 6_000_000 }, { track_id: 'bad' }, 'Clip creation and deletion', 'state_mutating')
    await testTool('add_video_layer', { track_id: trackB, media_id: mediaId, t_start_us: 2_000_000, t_end_us: 4_000_000, src_in_us: 0, src_out_us: 2_000_000 }, { track_id: 'bad' }, 'Clip creation and deletion', 'state_mutating')
    await testTool('add_media_layer', { track_id: trackA, media_id: mediaId, t_start_us: 6_000_000, t_end_us: 8_000_000 }, { track_id: 'bad' }, 'Clip creation and deletion', 'state_mutating')
    const extraTrackRes = actor.dispatch('add_track', { composition_id: project.root_id, kind: 'Video' })
    const extraTrackId = (extraTrackRes as any).value as string

    await testTool('add_text_layer', { track_id: trackB, content: 'Hello text', t_start_us: 4_000_000, duration_us: 2_000_000 }, { track_id: 'bad' }, 'Clip creation and deletion', 'state_mutating')
    await testTool('duplicate_layer', { layer_id: layer1Id, t_offset_us: 80_000_000 }, { layer_id: 'bad' }, 'Clip creation and deletion', 'state_mutating')
    await testTool('paste_layers', { layer_ids: [layer1Id], t_start_us: 85_000_000, target_track_id: extraTrackId }, { target_track_id: 'bad' }, 'Clip creation and deletion', 'state_mutating')
    
    // Create a temporary layer on extraTrackId to delete
    const tempDel = actor.dispatch('add_layer', { track: extraTrackId, kind: 'color', color: { r: 1, g: 1, b: 1, a: 255 }, t_start_us: 90_000_000, t_end_us: 91_000_000 })
    const tempDelId = (tempDel as any).value as string
    await testTool('delete_layer', { layer_id: tempDelId }, { layer_id: 'bad' }, 'Clip creation and deletion', 'state_mutating')

    // 7. Clip trimming and splitting
    await testTool('trim_layer', { layer_id: layer1Id, edge: 'out', new_t_us: 1_800_000 }, { layer_id: 'bad' }, 'Clip trimming and splitting', 'state_mutating')
    await testTool('split_layer', { layer_id: layer1Id, at_t_us: 1_000_000 }, { layer_id: 'bad' }, 'Clip trimming and splitting', 'state_mutating')
    await testTool('auto_split_by_shot', { layer_id: layer2Id }, { layer_id: 'bad' }, 'Clip trimming and splitting', 'state_mutating')

    // 8. Clip moving and rearrangement
    const moveL = actor.dispatch('add_layer', { track: trackB, kind: 'color', color: { r: 50, g: 50, b: 50, a: 255 }, t_start_us: 30_000_000, t_end_us: 31_000_000 })
    const moveLId = (moveL as any).value as string
    await testTool('move_layer', { layer_id: moveLId, new_t_start_us: 32_000_000, new_track_id: trackB }, { layer_id: 'bad' }, 'Clip moving and rearrangement', 'state_mutating')
    await testTool('restack_layer', { layer_id: moveLId, anchor_layer_id: layer1Id, position: 'above' }, { layer_id: 'bad' }, 'Clip moving and rearrangement', 'state_mutating')
    
    const ripDelL = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 9, g: 9, b: 9, a: 255 }, t_start_us: 70_000_000, t_end_us: 71_000_000 })
    const ripDelLId = (ripDelL as any).value as string
    await testTool('ripple_delete_layers', { layer_ids: [ripDelLId] }, { layer_ids: [] }, 'Clip moving and rearrangement', 'state_mutating')
    
    const gapTrackRes = actor.dispatch('add_track', { composition_id: project.root_id, kind: 'Video' })
    const gapTrackId = (gapTrackRes as any).value as string
    actor.dispatch('add_layer', { track: gapTrackId, kind: 'color', color: { r: 1, g: 1, b: 1, a: 255 }, t_start_us: 150_000_000, t_end_us: 151_000_000 })
    actor.dispatch('add_layer', { track: gapTrackId, kind: 'color', color: { r: 2, g: 2, b: 2, a: 255 }, t_start_us: 152_000_000, t_end_us: 153_000_000 })
    await testTool('ripple_delete_gap', { track_id: gapTrackId, start_us: 151_000_000, end_us: 152_000_000 }, { track_id: 'bad' }, 'Clip moving and rearrangement', 'state_mutating')

    // 9. Track management
    const testTrackRes = actor.dispatch('add_track', { composition_id: project.root_id, kind: 'Video' })
    const testTrackId = (testTrackRes as any).value as string
    await testTool('add_track', { composition_id: project.root_id, kind: 'Video' }, { composition_id: 'bad' }, 'Track management', 'state_mutating')
    await testTool('rename_track', { track_id: testTrackId, name: 'Renamed Track' }, { track_id: 'bad' }, 'Track management', 'state_mutating')
    await testTool('move_track', { track_id: testTrackId, new_position: 0 }, { track_id: 'bad' }, 'Track management', 'state_mutating')
    await testTool('remove_track', { track_id: testTrackId }, { track_id: 'bad' }, 'Track management', 'state_mutating')

    // 10. Linked audio/video operations
    const linkL1 = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 1, g: 1, b: 1, a: 255 }, t_start_us: 35_000_000, t_end_us: 36_000_000 })
    const linkL2 = actor.dispatch('add_layer', { track: trackB, kind: 'color', color: { r: 2, g: 2, b: 2, a: 255 }, t_start_us: 35_000_000, t_end_us: 36_000_000 })
    const linkL3 = actor.dispatch('add_layer', { track: trackB, kind: 'color', color: { r: 3, g: 3, b: 3, a: 255 }, t_start_us: 37_000_000, t_end_us: 38_000_000 })
    const lL1 = (linkL1 as any).value as string
    const lL2 = (linkL2 as any).value as string
    const lL3 = (linkL3 as any).value as string
    await testTool('links_create', { layer_ids: [lL1, lL2], reassign: true }, { layer_ids: [] }, 'Linked audio/video operations', 'state_mutating')
    const compLinks = actor.snapshot().compositions[project.root_id].links
    const liveLinkId = compLinks[0]?.id || ''
    await testTool('links_rename', { link_id: liveLinkId, label: 'Renamed Link' }, { link_id: 'bad' }, 'Linked audio/video operations', 'state_mutating')
    await testTool('links_add_members', { link_id: liveLinkId, layer_ids: [lL3] }, { link_id: 'bad' }, 'Linked audio/video operations', 'state_mutating')
    await testTool('links_remove_members', { link_id: liveLinkId, layer_ids: [lL3] }, { link_id: 'bad' }, 'Linked audio/video operations', 'state_mutating')
    await testTool('links_dissolve', { link_id: liveLinkId }, { link_id: 'bad' }, 'Linked audio/video operations', 'state_mutating')
    await testTool('set_scale_linked', { layer_id: layer2Id, linked: true }, { layer_id: 'bad' }, 'Linked audio/video operations', 'state_mutating')

    // 11. Timing and synchronization (keyframes)
    await testTool('set_keyframe', { layer_id: layer2Id, param_key: 'opacity', t_us: 0, value: 1.0 }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')
    await testTool('get_param_track', { layer_id: layer2Id, param_key: 'opacity' }, { layer_id: 'bad' }, 'Timing and synchronization', 'read_only')
    const paramTrackResult = await client.callTool({ name: 'get_param_track', arguments: { layer_id: layer2Id, param_key: 'opacity' } })
    const paramTrack = JSON.parse(Array.isArray(paramTrackResult.content) && paramTrackResult.content[0]?.type === 'text' ? paramTrackResult.content[0].text : '{}')
    const kfId = paramTrack.keyframes?.[0]?.id || idGen()
    await testTool('set_keyframe_easing', { layer_id: layer2Id, param_key: 'opacity', keyframe_id: kfId, interp: { kind: 'Linear' } }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')
    await testTool('set_keyframe_tangents', { layer_id: layer2Id, param_key: 'opacity', keyframe_id: kfId, in: { x: 0.5, y: 0.5, mode: 'Auto' }, out: { x: 0.5, y: 0.5, mode: 'Auto' } }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')
    await testTool('smooth_keyframes', { layer_id: layer2Id, param_key: 'opacity' }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')
    await testTool('set_extrapolation', { layer_id: layer2Id, param_key: 'opacity', before: 'Hold', after: 'Hold' }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')
    await testTool('retime_keyframe', { layer_id: layer2Id, param_key: 'opacity', keyframe_id: kfId, t_us: 100_000 }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')
    await testTool('remove_keyframe', { layer_id: layer2Id, param_key: 'opacity', keyframe_id: kfId }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')
    await testTool('clear_keyframes', { layer_id: layer2Id, param_key: 'opacity' }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')
    await testTool('set_param_track', { layer_id: layer2Id, param_key: 'opacity', track: { mode: 'Static', value: 1.0 } }, { layer_id: 'bad' }, 'Timing and synchronization', 'state_mutating')

    // 12. Captions and text
    await testTool('restyle_captions', { composition_id: project.root_id, font_size_px: 32 }, { font_size_px: -1 }, 'Captions and text', 'state_mutating')

    // 13. Transitions and effects
    const effRes = await client.callTool({ name: 'add_effect', arguments: { layer_id: layer2Id, kind: 'blur' } })
    const effId = Array.isArray(effRes.content) && effRes.content[0]?.type === 'text' ? effRes.content[0].text : idGen()
    await testTool('add_effect', { layer_id: layer2Id, kind: 'blur' }, { layer_id: 'bad' }, 'Transitions and effects', 'state_mutating')
    await testTool('update_effect', { layer_id: layer2Id, effect_id: effId, patch: {} }, { layer_id: 'bad' }, 'Transitions and effects', 'state_mutating')
    await testTool('move_effect', { layer_id: layer2Id, effect_id: effId, new_index: 0 }, { layer_id: 'bad' }, 'Transitions and effects', 'state_mutating')
    await testTool('remove_effect', { layer_id: layer2Id, effect_id: effId }, { layer_id: 'bad' }, 'Transitions and effects', 'state_mutating')
    
    // Add adjacent layers on track A to test transition
    const transL1 = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 10, g: 10, b: 10, a: 255 }, t_start_us: 40_000_000, t_end_us: 41_000_000 })
    const transL2 = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 20, g: 20, b: 20, a: 255 }, t_start_us: 41_000_000, t_end_us: 42_000_000 })
    const transL3 = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 15, g: 15, b: 15, a: 255 }, t_start_us: 42_000_000, t_end_us: 43_000_000 })
    const transL4 = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 25, g: 25, b: 25, a: 255 }, t_start_us: 43_000_000, t_end_us: 44_000_000 })
    const tL1Id = (transL1 as any).value as string
    const tL2Id = (transL2 as any).value as string
    const tL3Id = (transL3 as any).value as string
    const tL4Id = (transL4 as any).value as string
    const addTrMcp = await client.callTool({ name: 'add_transition', arguments: { from_layer_id: tL1Id, to_layer_id: tL2Id, duration_us: 200_000, kind: 'Crossfade' } })
    const liveTrId = Array.isArray(addTrMcp.content) && addTrMcp.content[0]?.type === 'text' ? addTrMcp.content[0].text : idGen()

    await testTool('add_transition', { from_layer_id: tL3Id, to_layer_id: tL4Id, duration_us: 100_000, kind: 'Crossfade' }, { from_layer_id: 'bad' }, 'Transitions and effects', 'state_mutating')
    await testTool('update_transition', { transition_id: liveTrId, duration_us: 250_000 }, { transition_id: 'bad' }, 'Transitions and effects', 'state_mutating')
    await testTool('remove_transition', { transition_id: liveTrId }, { transition_id: 'bad' }, 'Transitions and effects', 'state_mutating')

    // 14. Transform, cropping and reframing
    await testTool('set_position', { layer_id: layer2Id, position: { mode: 'XY', x: { mode: 'Static', value: 100 }, y: { mode: 'Static', value: 100 } } }, { layer_id: 'bad' }, 'Transform, cropping and reframing', 'state_mutating')
    const pathLRes = await client.callTool({ name: 'add_text_layer', arguments: { track_id: extraTrackId, content: 'Path Layer', t_start_us: 100_000_000, duration_us: 2_000_000 } })
    const pathLId = Array.isArray(pathLRes.content) && pathLRes.content[0]?.type === 'text' ? pathLRes.content[0].text : idGen()
    const pathPosition = {
      mode: 'Path',
      path: {
        nodes: [
          { id: 'start', point: { x: 100, y: 200 }, inHandle: { x: 0, y: 0 }, outHandle: { x: 0, y: 0 }, segment: 'Line', tangentMode: 'Corner' },
          { id: 'end', point: { x: 500, y: 200 }, inHandle: { x: 0, y: 0 }, outHandle: { x: 0, y: 0 }, segment: 'Line', tangentMode: 'Corner' }
        ]
      },
      progress: { mode: 'Static', value: 0 }
    }
    await client.callTool({ name: 'set_position', arguments: { layer_id: pathLId, position: pathPosition } })
    await testTool('translate_path', { layer_id: pathLId, dx: 10, dy: 10 }, { layer_id: 'bad' }, 'Transform, cropping and reframing', 'state_mutating')
    await testTool('update_layer', { layer_id: layer2Id, patch: { label: 'Renamed Video Layer' } }, { layer_id: 'bad' }, 'Transform, cropping and reframing', 'state_mutating')
    await testTool('update_layer_params', { layer_id: layer2Id, patch: { kind: 'VideoClip', opacity: 0.8 } }, { layer_id: 'bad' }, 'Transform, cropping and reframing', 'state_mutating')

    // 15. Color and visual properties
    await testTool('set_layers_enabled', { layer_ids: [layer2Id], enabled: true }, { layer_ids: [] }, 'Color and visual properties', 'state_mutating')
    await testTool('fit_composition_to_layers', { composition_id: project.root_id }, { composition_id: 'bad' }, 'Color and visual properties', 'state_mutating')
    await testTool('set_composition', { composition_id: project.root_id, patch: { width: 1080, height: 1920 } }, { composition_id: 'bad' }, 'Color and visual properties', 'state_mutating')
    
    // Create an orphan composition for compositions_delete
    const grpForDel = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 1, g: 2, b: 3, a: 255 }, t_start_us: 60_000_000, t_end_us: 61_000_000 })
    const grpDelLId = (grpForDel as any).value as string
    const grpDelRes = actor.dispatch('groups_create', { layers: [grpDelLId] })
    const orphanCompId = (grpDelRes as any).value?.composition_id as string
    const orphanLayerId = (grpDelRes as any).value?.layer_id as string
    actor.dispatch('delete_layer', { layer: orphanLayerId })
    await testTool('compositions_delete', { composition_id: orphanCompId }, { composition_id: project.root_id }, 'Color and visual properties', 'state_mutating')

    // 16. Music and audio controls
    await testTool('set_role_gain', { composition_id: project.root_id, role: 'dialogue', gain_db: -3.0 }, { composition_id: 'bad' }, 'Music and audio controls', 'state_mutating')
    await testTool('set_role_flags', { composition_id: project.root_id, role: 'dialogue', muted: false, solo: false }, { composition_id: 'bad' }, 'Music and audio controls', 'state_mutating')

    // 17. Project validation
    await testTool('validate_rough_cut_plan', {
      plan: {
        version: 1,
        brief: { goal: 'Test', audience: 'Audience', target_duration_us: 2000000, tone: ['neutral'] },
        source_summary: 'Summary',
        editorial_thesis: 'Thesis',
        sections: [{ id: 'sec-1', purpose: 'P', clips: [{ media_id: mediaId, source_start_us: 0, source_end_us: 2000000, action: 'keep', reason: 'R' }] }],
        removed_ranges: [],
        estimated_duration_us: 2000000,
        uncertainties: []
      }
    }, { plan: { invalid: true } }, 'Project validation', 'read_only')

    await testTool('validate_rough_cut_review', {
      review: {
        version: 1,
        composition_id: project.root_id,
        project_id: project.project_id,
        summary: 'Review summary',
        inspections: [],
        identified_issues: [],
        ready_for_next_stage: true
      }
    }, { review: { invalid: true } }, 'Project validation', 'read_only')

    await testTool('get_timeline_context', { composition_id: project.root_id }, {}, 'Project validation', 'read_only')

    // 18. Rough-cut and batch execution
    await testTool('apply_rough_cut_plan', {
      plan: {
        version: 1,
        brief: { goal: 'Test', audience: 'Audience', target_duration_us: 2000000, tone: ['neutral'] },
        source_summary: 'Summary',
        editorial_thesis: 'Thesis',
        sections: [{ id: 'sec-1', purpose: 'P', clips: [{ media_id: mediaId, source_start_us: 0, source_end_us: 2000000, action: 'keep', reason: 'R' }] }],
        removed_ranges: [],
        estimated_duration_us: 2000000,
        uncertainties: []
      },
      dry_run: true
    }, { plan: { invalid: true } }, 'Rough-cut and batch execution', 'state_mutating')

    // 19. Export and rendering
    await testTool('render_timeline_range', { start_us: 0, end_us: 2000000 }, { start_us: 'bad' }, 'Export and rendering', 'external_compute', 'Live compositor or offline frame render engine')

    // 21. Jev and semantic evaluation
    await testTool('evaluate_source_passages', { media_ids: [mediaId], request: 'Find tutorial hook' }, { request: '' }, 'Jev and semantic evaluation', 'read_only')

    // 22. Groups, Markers, Motifs, Revision control
    const gm1Res = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 5, g: 5, b: 5, a: 255 }, t_start_us: 50_000_000, t_end_us: 51_000_000 })
    const gm2Res = actor.dispatch('add_layer', { track: trackB, kind: 'color', color: { r: 6, g: 6, b: 6, a: 255 }, t_start_us: 50_000_000, t_end_us: 51_000_000 })
    const gm3Res = actor.dispatch('add_layer', { track: trackA, kind: 'color', color: { r: 7, g: 7, b: 7, a: 255 }, t_start_us: 75_000_000, t_end_us: 76_000_000 })
    const gm1Id = (gm1Res as any).value as string
    const gm2Id = (gm2Res as any).value as string
    const gm3Id = (gm3Res as any).value as string
    const grpCreateRes = await client.callTool({ name: 'groups_create', arguments: { layer_ids: [gm1Id] } })
    const grpCreated = JSON.parse(Array.isArray(grpCreateRes.content) && grpCreateRes.content[0]?.type === 'text' ? grpCreateRes.content[0].text : '{}')
    const grpId = grpCreated.composition_id || idGen()
    const grpLayerId = grpCreated.layer_id || idGen()

    await testTool('groups_create', { layer_ids: [gm2Id] }, { layer_ids: [] }, 'Groups and nesting', 'state_mutating')
    await testTool('groups_rename', { composition_id: grpId, label: 'Renamed Group' }, { composition_id: 'bad' }, 'Groups and nesting', 'state_mutating')
    await testTool('add_group_layer', { track_id: trackA, source_composition_id: grpId, t_start_us: 55_000_000 }, { track_id: 'bad' }, 'Groups and nesting', 'state_mutating')
    await testTool('groups_add_members', { group_layer_id: grpLayerId, layer_ids: [gm3Id] }, { group_layer_id: 'bad' }, 'Groups and nesting', 'state_mutating')
    await testTool('move_layers_to_composition', { layer_ids: [gm2Id], to_composition_id: grpId, anchor_layer_id: gm2Id, anchor_t_start_us: 0 }, { layer_ids: 'bad' }, 'Groups and nesting', 'state_mutating')
    await testTool('groups_ungroup', { layer_id: grpLayerId }, { layer_id: 'bad' }, 'Groups and nesting', 'state_mutating')

    const markRes = actor.dispatch('add_marker', { composition_id: project.root_id, t_us: 1_000_000, label: 'Mark 1' })
    const markId = (markRes as any).value as string
    await testTool('add_marker', { composition_id: project.root_id, t_us: 1_500_000, label: 'Mark 2', color: { r: 255, g: 0, b: 0, a: 255 } }, { composition_id: 'bad' }, 'Markers and cues', 'state_mutating')
    await testTool('update_marker', { marker_id: markId, patch: { label: 'Updated Mark' } }, { marker_id: 'bad' }, 'Markers and cues', 'state_mutating')
    await testTool('attach_marker', { marker_id: markId, layer_id: layer2Id }, { marker_id: 'bad' }, 'Markers and cues', 'state_mutating')
    await testTool('detach_marker', { marker_id: markId }, { marker_id: 'bad' }, 'Markers and cues', 'state_mutating')
    await testTool('remove_marker', { marker_id: markId }, { marker_id: 'bad' }, 'Markers and cues', 'state_mutating')

    await testTool('add_motif', { motif_id: 'countdown', t_start_us: 90_000_000, t_end_us: 95_000_000 }, { motif_id: '' }, 'Motifs and overlays', 'state_mutating')
    await testTool('list_motifs', {}, undefined, 'Motifs and overlays', 'read_only')
    await testTool('write_motif_draft', { motif_id: 'draft-1', name: 'Draft', js: '// js', css: '/* css */' }, { motif_id: '' }, 'Motifs and overlays', 'state_mutating')
    await testTool('get_motif_source', { id: 'draft-1' }, { id: 'bad' }, 'Motifs and overlays', 'read_only')
    await testTool('install_motif', { id: 'draft-1' }, { id: 'bad' }, 'Motifs and overlays', 'state_mutating')
    await testTool('delete_motif', { id: 'draft-1' }, { id: 'bad' }, 'Motifs and overlays', 'state_mutating')
    await testTool('preview_motif_draft', { motif_id: 'draft-1', t_sec: 0 }, { motif_id: '' }, 'Motifs and overlays', 'external_compute', 'CDP browser capture / Chromium preview renderer')

    await testTool('revision_control', { action: 'status' }, { action: 'unknown_action' }, 'Revision control', 'session_control')
    await testTool('video_search_external_media', { query: 'timelapse city' }, { query: '' }, 'External media & B-roll', 'read_only')
    await testTool('resolve_visual_intents', { intents: [{ subject: 'city skyline' }] }, { intents: [] }, 'External media & B-roll', 'read_only')
    await testTool('import_external_media', { candidate_id: 'non-existent' }, { candidate_id: '' }, 'External media & B-roll', 'state_mutating')

    await client.close()
    await server.close()

    // Assert that EVERY tool in toolList was audited!
    const auditedNames = Object.keys(auditRecords)
    const unaudited = toolList.map(t => t.name).filter(n => !auditedNames.includes(n))
    console.log(`Audited ${auditedNames.length} of ${toolList.length} tools. Unaudited:`, unaudited)
    console.log('Execution status:', Object.values(auditRecords).reduce<Record<string, number>>((counts, record) => {
      counts[record.executionTest.status] = (counts[record.executionTest.status] ?? 0) + 1
      return counts
    }, {}))
    // New evidence/transaction handlers have focused real-transport and
    // state tests; this older fixture intentionally lacks their prerequisites.
    const focused = new Set(['apply_repair_transaction','ripple_cut_range','get_editorial_evidence_packet',
      'get_source_observations','get_source_speech_context','get_source_understanding',
      'inspect_rendered_audio','inspect_timeline_range_visuals','inspect_timeline_temporal_window','record_issue','withdraw_issue'])
    expect(unaudited.filter(name => !focused.has(name))).toEqual([])

    // Keep the audit read-only with respect to the checked-in research artifact.
    const matrixPath = path.join(tmpDir, 'sclip-mcp-tool-matrix.json')
    fs.writeFileSync(matrixPath, JSON.stringify(Object.values(auditRecords), null, 2))
  }, 25000)
})
