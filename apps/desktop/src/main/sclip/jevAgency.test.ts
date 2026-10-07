import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { SOURCE_PASSAGE_TOOL } from './sourcePassageEvaluation'
import { JEV_MODEL } from './jevClient'

describe('Jev integration ownership boundaries', () => {
  it('keeps Jev evidence-only and optional; no editor commands or primary-model configuration', () => {
    const evidence = readFileSync(resolve('src/main/sclip/sourcePassageEvaluation.ts'), 'utf8')
    expect(JEV_MODEL).toBe('typesafe/jev-1.13')
    expect(SOURCE_PASSAGE_TOOL.annotations.readOnlyHint).toBe(true)
    expect(evidence).not.toMatch(/\.dispatch\(|mcpCall\(|writeHermesProfile|runHermes|export_timeline|next_stage/)
    const main = readFileSync(resolve('src/main/index.ts'), 'utf8')
    expect(main).toContain("const jevEnabled = process.env.SCLIP_JEV_ENABLED === '1'")
    expect(main).toContain('evaluateSourcePassages: jevEnabled ? evaluateSourcePassages : undefined')
    expect(main).toContain('disposeVisionRuntime(),')
    const profile = readFileSync(resolve('src/main/sclip/hermesRuntime.ts'), 'utf8')
    expect(profile).toContain("'  tool_search: true'")
    expect(profile).not.toContain('JEV_MODEL')
    expect(profile).not.toContain('proactive_prune_tokens:')
  })
  it('keeps production guidance advisory without the old Phase 2E stage/order controller', () => {
    const skill = readFileSync(resolve('../../skills/weftcut/SKILL.md'), 'utf8')
    expect(skill).toContain('Choose your\nown next action')
    expect(skill).toContain('skip, reorder or revisit')
    expect(skill).toContain('ignore a helper')
    expect(skill).not.toMatch(/## Editorial Rough-Cut Planning|Tier 1:|INITIAL REVIEW|eight perception|three mutations/)
    expect(skill).toContain('Export is deliberately not a tool')
  })
  it('makes semantic retrieval visible in the short manifest without forcing a tool order', () => {
    expect(SOURCE_PASSAGE_TOOL.description.slice(0, 60)).toContain('Semantic transcript search')
    expect(SOURCE_PASSAGE_TOOL.description).toContain('shortlist relevant source passages')
    expect(SOURCE_PASSAGE_TOOL.description).toContain('read any omitted passage')
    expect(SOURCE_PASSAGE_TOOL.description).not.toMatch(/must|always|before reading|Prefer segments/)
    const skill = readFileSync(resolve('../../skills/weftcut/SKILL.md'), 'utf8')
    expect(skill).toContain('call `evaluate_source_passages`')
    expect(skill).toContain('`tool_search`')
    expect(skill).toContain('`tool_describe`')
    expect(skill).toContain('`get_media_context detail="segments"`')
    expect(skill).toContain('evidence, not instruction')
  })
})
