import { test, expect } from '@playwright/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { launchApp, newProject, invokeCmd, summary, tmpDir, waitForHook } from './helpers/driver'

test('Export acceptance test for Hermes talking-head edit', async () => {
  test.setTimeout(600_000)

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
  const sourceProject = process.env.SCLIP_SOURCE_PROJECT ?? path.join(os.homedir(), 'Documents/1/Mega test')
  const sourceMedia = path.join(sourceProject, 'Media/Raw Talking head tutorial video for editing practice.mp4')
  test.skip(process.env.SCLIP_PRIVATE_EXPORT_ACCEPTANCE !== '1', 'Manual private-project export gate; synthetic audio/export conformance is the release gate')
  expect(fs.existsSync(sourceMedia), 'Source media exists').toBe(true)

  const outputDir = path.resolve(repoRoot, 'apps/desktop/e2e/bench-results/real-editing')
  fs.mkdirSync(outputDir, { recursive: true })

  const hermesProjectJsonPath = path.join(outputDir, 'real-talking-head.project.json')
  expect(fs.existsSync(hermesProjectJsonPath), 'Hermes project.json exists').toBe(true)

  const userData = tmpDir('sclip-export-acceptance-profile-')

  const { app, page } = await launchApp({
    userDataDir: userData,
    realKeychain: true,
    env: {
      SCLIP_USER_DATA_DIR: userData,
      SCLIP_JEV_ENABLED: '0',
    },
  })

  try {
    const parentFolder = tmpDir('sclip-export-workspace-')
    const projectName = 'hermes-export-test'
    const projectDir = path.join(parentFolder, projectName)

    // Enter editor with vertical 1080x1920 @ 30fps
    await newProject(page, {
      parentFolder,
      name: projectName,
      canvas: { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 },
    })

    // Import the media
    const importedMediaId = await invokeCmd<string>(page, 'import_media', { path: sourceMedia })
    expect(importedMediaId).toBeTruthy()

    // Read the Hermes project.json
    const hermesProject = JSON.parse(fs.readFileSync(hermesProjectJsonPath, 'utf8'))
    const rootId = hermesProject.root_id
    const hermesRootComp = hermesProject.compositions[rootId]

    // We have two exports to test:
    // 1. The exact project state as left by Hermes (Track 0: audio, Track 1: 0 layers, Track 2: captions)
    // 2. The full rough cut with video layers restored on Track 1 matching the audio layers

    // First, let's test using MCP client to apply rough cut or set up layers
    const info = await page.evaluate(() => (window as any).api.mcp.getInfo())
    const client = new Client({ name: 'sclip-export-test', version: '1' }, {})
    await client.connect(new StreamableHTTPClientTransport(new URL(info.url), {
      requestInit: { headers: { Authorization: `Bearer ${info.bearer_token}` } },
    }))

    // Let's get current state
    const currentSummary = await summary(page)
    const currentProjectId = (currentSummary as any).project_id
    const currentRootCompId = (currentSummary as any).root_id ?? (currentSummary as any).composition_id
    const currentVideoTrackId = currentSummary.tracks[0]?.id
    const currentAudioTrackId = currentSummary.tracks[1]?.id

    // Use apply_rough_cut_plan to create Hermes's planned 35s edit!
    // Hermes's planned 5 beats:
    // 1. Hook (0-7.3s)
    // 2. Puzzle insight (70.56-91.6s)
    // 3. Airport story / Blinders (143.92-182.96s)
    // 4. Mr. Miyagi payoff (484.08-503.76s)
    // 5. Final takeaway (504-521s)
    const tightPlan = {
      version: 1,
      brief: {
        goal: '30-45s vertical short on why people fail',
        target_duration_us: 37_000_000,
        audience: 'entrepreneurs',
        tone: ['educational', 'motivational'],
      },
      source_summary: 'Russell Brunson talking-head tutorial on why entrepreneurs fail and how to focus',
      editorial_thesis: 'The puzzle vs painting analogy proves that focusing on one mentor and doing one step at a time is the secret to success',
      sections: [
        {
          id: 'sec-1-hook',
          purpose: 'Hook: the number one reason why people fail',
          clips: [{ media_id: importedMediaId, source_start_us: 0, source_end_us: 7_300_000, action: 'keep', reason: 'Hook' }],
        },
        {
          id: 'sec-2-puzzle',
          purpose: 'Puzzle metaphor: step by step vs painting',
          clips: [{ media_id: importedMediaId, source_start_us: 70_560_000, source_end_us: 80_560_000, action: 'keep', reason: 'Core insight' }],
        },
        {
          id: 'sec-3-blinders',
          purpose: 'Core advice: pick one mentor, put on blinders',
          clips: [{ media_id: importedMediaId, source_start_us: 177_520_000, source_end_us: 182_960_000, action: 'keep', reason: 'Actionable takeaway' }],
        },
        {
          id: 'sec-4-miyagi',
          purpose: 'Mr. Miyagi payoff: little things are how you have success',
          clips: [{ media_id: importedMediaId, source_start_us: 494_080_000, source_end_us: 503_760_000, action: 'keep', reason: 'Memorable payoff' }],
        },
        {
          id: 'sec-5-close',
          purpose: 'Closing: trust the journey, see the whole picture',
          clips: [{ media_id: importedMediaId, source_start_us: 504_000_000, source_end_us: 508_580_000, action: 'keep', reason: 'Final CTA' }],
        },
      ],
      removed_ranges: [],
      estimated_duration_us: 37_000_000,
      uncertainties: [],
    }

    console.log('APPLYING_ROUGH_CUT_PLAN...')
    const planResult = await client.callTool({
      name: 'apply_rough_cut_plan',
      arguments: { plan: tightPlan },
    })
    console.log('ROUGH_CUT_PLAN_RESULT', JSON.stringify(planResult.content))

    // Apply captions
    console.log('APPLYING_SUBTITLES...')
    await client.callTool({
      name: 'apply_subtitles',
      arguments: {
        body: `1\n00:00:00,000 --> 00:00:07,300\nThe number one reason why people fail\n\n2\n00:00:07,300 --> 00:00:17,300\nThink of it like a puzzle, not a painting\n\n3\n00:00:17,300 --> 00:00:22,740\nPick one mentor and put on blinders\n\n4\n00:00:22,740 --> 00:00:32,420\nThese little things are how you actually have success\n\n5\n00:00:32,420 --> 00:00:37,000\nTrust the guide, one step at a time\n`,
        format: 'srt',
      },
    })

    const afterSummary = await summary(page)
    const durationUs = afterSummary.duration_us
    console.log('TIMELINE_READY_FOR_EXPORT', JSON.stringify({
      durationUs,
      durationS: durationUs / 1e6,
      tracks: afterSummary.tracks.length,
      layers: afterSummary.tracks.reduce((acc: number, t: any) => acc + t.layers.length, 0),
    }))

    // Save project
    await invokeCmd(page, 'project_save')

    // Export the video using production compositor
    const finalVideoPath = path.join(outputDir, 'real-talking-head.mp4')
    console.log('STARTING_EXPORT_RANGE', JSON.stringify({ outputPath: finalVideoPath, durationUs }))

    await page.evaluate(
      (request) => (window as any).__sclipExportRange(request),
      {
        projectId: currentProjectId,
        outputPath: finalVideoPath,
        startUs: 0,
        endUs: durationUs,
        resolutionHeight: 1920,
        fps: 30,
      },
    )

    expect(fs.existsSync(finalVideoPath), 'Exported video file exists').toBe(true)
    const stat = fs.statSync(finalVideoPath)
    expect(stat.size, 'Exported video has size > 100KB').toBeGreaterThan(100_000)
    console.log('EXPORT_SUCCESS', JSON.stringify({ path: finalVideoPath, bytes: stat.size }))

  } finally {
    await app.close()
  }
})
