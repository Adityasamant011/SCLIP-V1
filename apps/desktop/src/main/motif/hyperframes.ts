import { validateSceneIntent } from './graphicAuthoring.js'
import { createGSAPFrameAdapter } from '@hyperframes/core'
import { DOMParser } from 'linkedom'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { validateManifest, type Manifest } from '../../shared/motifs/catalog'

// Resolve the installed dependency in development and app.asar alike. A ?raw
// import of a dependency can be externalized into the module object by the
// Electron bundler instead of becoming browser source text.
const gsapSource = readFileSync(createRequire(import.meta.url).resolve('gsap/dist/gsap.min.js'), 'utf8')

/** HyperFrames' real GSAP frame adapter inside the existing offline Motif host.
 * No second renderer: captured frames feed the normal preview and export.
 * Deliberately supports one self-contained motion-graphics composition, not
 * HyperFrames' media playback, nested files or hosted authoring service.
 */
export function hyperframesToMotif(manifest: Manifest, source: string, intentValue?:unknown): { manifest: Manifest; html: string } {
  manifest = { ...manifest, id: 'hyperframes-draft', version: 1, fonts: manifest.fonts ?? [] }
  validateManifest(manifest)
  if (typeof source !== 'string' || Buffer.byteLength(source) > 2 * 1024 * 1024) throw new Error('HyperFrames HTML must be at most 2 MiB')
  if (manifest.default_duration_s > 180) throw new Error('HyperFrames motion graphics are limited to 180 seconds')
  const document = new DOMParser().parseFromString(/<html[\s>]/i.test(source) ? source : `<html><head></head><body>${source}</body></html>`, 'text/html')
  type ElementLike = { getAttribute(name: string): string | null; setAttribute(name: string, value: string): void; hasAttribute(name: string): boolean; textContent: string | null; remove(): void }
  const selectAll = (selector: string) => Array.from(document.querySelectorAll(selector) as unknown as ArrayLike<ElementLike>)
  if (document.querySelector('video,audio,iframe,object,embed,base,link,template,[data-composition-src]'))
    throw new Error('Use one self-contained HyperFrames graphic. Add video/audio with Sclip media tools; external files and nested templates are unsupported.')
  const roots = selectAll('[data-composition-id]')
  if (roots.length !== 1) throw new Error('Exactly one data-composition-id root is required')
  const root = roots[0]
  const id = root.getAttribute('data-composition-id')!
  const intent=validateSceneIntent(intentValue,manifest.default_duration_s)
  if(intent)root.setAttribute('data-sclip-scene-intent',JSON.stringify(intent))
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/.test(id)) throw new Error('Use a simple letter-led HyperFrames composition id')
  if (selectAll('[data-start],[data-duration]').some(e => e !== root))
    throw new Error('Timed primitive clips need HyperFrames media playback; animate this graphic with its paused GSAP timeline instead')
  for (const [attr, expected] of [['data-width', manifest.size[0]], ['data-height', manifest.size[1]]] as const) {
    const value = root.getAttribute(attr)
    if (value !== null && Number(value) !== expected) throw new Error(`${attr} must match manifest.size`)
    root.setAttribute(attr, String(expected))
  }
  // Preserve the upstream composition canvas contract in the serialized source;
  // CSS sizing alone is not explicit canvas metadata.
  if (!root.hasAttribute('data-duration')) root.setAttribute('data-duration', String(manifest.default_duration_s))
  const scripts: string[] = []
  for (const script of selectAll('script')) {
    if (script.hasAttribute('src')) throw new Error('Remove external script tags: Sclip bundles GSAP for HyperFrames graphics')
    const type = script.getAttribute('type')
    if (type && !['text/javascript', 'application/javascript'].includes(type)) throw new Error('Use inline classic JavaScript for this HyperFrames graphic')
    scripts.push(script.textContent ?? '')
    script.remove()
  }
  for (const element of selectAll('[src],[href],[srcset]')) {
    for (const attr of ['src', 'href', 'srcset']) {
      const value = element.getAttribute(attr)
      if (value && !value.startsWith('data:') && !value.startsWith('#')) throw new Error('Embed graphic assets as data URLs; external assets are not supported')
    }
  }
  if (/\b(?:import|export)\s/.test(scripts.join('\n'))) throw new Error('Module imports/exports are unsupported; use the bundled gsap global')
  const css = selectAll('style').map(e => e.textContent ?? '').join('\n')
  if (/@import\b|url\(\s*['"]?(?!data:|#)/i.test(css)) throw new Error('Embed fonts/images instead of loading external CSS assets')
  // Keep the markup inert until setup; every props change rebuilds the DOM and
  // timeline rather than accumulating animations from the preceding instance.
  const markup = document.body.innerHTML
  const scriptSafe = (s: string) => s.replace(/<\/script/gi, '<\\/script')
  const adapter = createGSAPFrameAdapter.toString()
  return {
    manifest: { ...manifest, content_duration_s: manifest.default_duration_s },
    html: `<!doctype html><html><head><meta charset="utf-8">${intent?`<meta name="sclip-scene-intent" content="${JSON.stringify(intent).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">`:""}<style>html,body{margin:0;background:transparent;width:100%;height:100%;overflow:hidden}${css}</style>
<script>${scriptSafe(gsapSource)}</script></head><body><script>
(() => {
  const createAdapter = ${adapter};
  let frameAdapter;
  motif.define({
    async setup(props, ctx) {
      gsap.globalTimeline.clear(); gsap.ticker.sleep();
      document.body.innerHTML = ${JSON.stringify(markup).replace(/</g, '\\u003c')};
      window.__timelines = Object.create(null);
      window.__sclipReady = undefined;
      window.__sclipProps = props;
      const container = document.querySelector('[data-composition-id]');
      container.style.width = ${JSON.stringify(`${manifest.size[0]}px`)};
      container.style.height = ${JSON.stringify(`${manifest.size[1]}px`)};
      await document.fonts.ready;
      ${scripts.join('\n;\n')}
      // Optional authored asset/layout readiness. Rejections reach the normal
      // capture error path instead of producing a half-loaded export frame.
      await window.__sclipReady;
      // Local embedded assets must be decoded before a deterministic capture.
      // A broken asset rejects; no blank loading frame becomes evidence.
      await Promise.all(Array.from(document.querySelectorAll('img,image')).map(async el => {
        const src = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('xlink:href');
        if (!src) return;
        const image = new Image(); image.src = src; await image.decode();
      }));
      const timeline = window.__timelines[${JSON.stringify(id)}];
      if (!timeline || typeof timeline.seek !== 'function' || typeof timeline.duration !== 'function')
        throw new Error('Register a paused GSAP timeline in window.__timelines for the composition');
      const duration = timeline.totalDuration();
      if (!Number.isFinite(duration) || duration <= 0 || duration > 180)
        throw new Error('HyperFrames timeline must have a finite duration in 0..180 seconds');
      frameAdapter = createAdapter({ timeline, fps: ctx.fps, id: ${JSON.stringify(id)} });
      await frameAdapter.init();
      gsap.ticker.sleep();
      await document.fonts.ready;
    },
    frame(t, ctx) { frameAdapter.seekFrame(Math.max(0, Math.round(t * ctx.fps))); }
  });
})();
</script></body></html>`,
  }
}
