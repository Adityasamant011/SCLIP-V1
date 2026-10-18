import { describe, expect, it } from 'vitest'
import { getHyperframesRecipe, HYPERFRAMES_RECIPES } from './hyperframesRecipes'
import { hyperframesToMotif } from './hyperframes'
import { canonicalizeProps, validateManifest, type Manifest } from '../../shared/motifs/catalog'

describe('offline editorial HyperFrames recipes', () => {
  it('lists compact choices without sending all graphic source', () => {
    const result = getHyperframesRecipe({}) as { recipes: unknown[] }
    expect(result.recipes).toHaveLength(6)
    expect(JSON.stringify(result)).not.toContain('<script>')
  })
  it('can provide editable prop definitions without sending source through the model', () => {
    const result = getHyperframesRecipe({ recipe: 'process', detail: 'schema' }) as { manifest: Manifest; html?: string }
    expect(result.manifest.props_schema.second_at).toBeDefined()
    expect(result.html).toBeUndefined()
  })
  for (const entry of HYPERFRAMES_RECIPES) for (const aspect of ['landscape', 'portrait', 'square']) {
    it(`${entry.id}/${aspect}: validates props and passes the actual supported HyperFrames converter`, () => {
      const source = getHyperframesRecipe({ recipe: entry.id, aspect, duration_s: 4.5 }) as { manifest: Manifest; html: string }
      validateManifest(source.manifest)
      expect(() => canonicalizeProps(source.manifest, {})).not.toThrow()
      expect(hyperframesToMotif(source.manifest, source.html).manifest.content_duration_s).toBe(4.5)
    })
  }
  it.each([{ recipe: 'unknown' }, { aspect: 'cinema' }, { duration_s: 0 }, { duration_s: Infinity }, { duration_s: '6' }])('refuses unsupported requests %j', args => {
    expect(() => getHyperframesRecipe(args)).toThrow()
  })
  it('does not share mutable defaults across independent callers', () => {
    const first = getHyperframesRecipe({ recipe: 'comparison' }) as { manifest: Manifest }
    first.manifest.props_schema.left_label.default = 'Changed'
    const next = getHyperframesRecipe({ recipe: 'comparison' }) as { manifest: Manifest }
    expect(next.manifest.props_schema.left_label.default).toBe('First option')
  })
  it('matches an exact project canvas without requiring agent source rewrites', () => {
    const source = getHyperframesRecipe({ recipe: 'process', width: 640, height: 360 }) as { manifest: Manifest; html: string }
    expect(source.manifest.size).toEqual([640, 360])
    expect(() => hyperframesToMotif(source.manifest, source.html)).not.toThrow()
    expect(source.html).toContain('font-size:24px')
    expect(() => getHyperframesRecipe({ recipe: 'process', width: 640 })).toThrow('both width and height')
  })
})
