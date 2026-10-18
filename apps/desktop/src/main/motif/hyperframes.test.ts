import { describe, expect, it } from 'vitest'
import { hyperframesToMotif } from './hyperframes'
import type { Manifest } from '../../shared/motifs/catalog'

const manifest: Manifest = { id: 'ignored', version: 1, name: 'Test graphic', size: [320, 180], default_duration_s: 2, fonts: [], props_schema: {} }
const source = `<div data-composition-id="intro" data-width="320" data-height="180"><div id="box">Example</div></div><script>
const tl=gsap.timeline({paused:true});tl.fromTo('#box',{x:0},{x:200,duration:2,ease:'none'});window.__timelines.intro=tl;
</script>`
describe('HyperFrames graphics import', () => {
  it('embeds GSAP and the real HyperFrames frame adapter for the existing capture host', () => {
    const result = hyperframesToMotif(manifest, source)
    expect(result.html).toContain('seekFrame')
    expect(result.html).toContain('motif.define')
    expect(result.html).not.toContain('<script src=')
    expect(result.manifest.content_duration_s).toBe(2)
  })
  it.each([
    source.replace('320', '640'),
    source.replace('<div id="box">', '<video src="https://example.com/a.mp4"></video><div id="box">'),
    source + '<script src="https://example.com/gsap.js"></script>',
    source + '<div data-composition-id="nested"></div>',
    source + '<img src="https://example.com/a.jpg">',
    source + '<div data-start="1" data-duration="2"></div>',
    source + '<style>@import "https://example.com/font.css";</style>',
  ])('refuses unsupported media, timing and dependency scope', html => {
    expect(() => hyperframesToMotif(manifest, html)).toThrow()
  })
})
