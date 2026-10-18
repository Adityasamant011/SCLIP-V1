import type { Manifest, PropSpec } from '../../shared/motifs/catalog'

/** Original, offline editorial starting points, not upstream catalog imports.
 * Returns source only: reading a recipe never creates a draft or edits a project. */
export const HYPERFRAMES_RECIPES = [
  { id: 'comparison', name: 'Comparison cards', purpose: 'Compare two grounded alternatives or before/after states.' },
  { id: 'numbers', name: 'Numeric comparison', purpose: 'Explain two supplied nonnegative values with proportional bars and exact labels.' },
  { id: 'process', name: 'Three-step process', purpose: 'Explain a sequence or flow using three supplied steps.' },
  { id: 'timeline', name: 'Three-event timeline', purpose: 'Reveal three supplied events in order. Spacing is ordinal, not proportional to dates.' },
  { id: 'key-point', name: 'Key point or quotation', purpose: 'Emphasize a grounded takeaway or a verified quotation with attribution.' },
  { id: 'annotation', name: 'Supplied-image callout', purpose: 'Point to a feature in an authorized supplied image. No invented screenshot or UI.' },
] as const

const text = (value: string, max_length = 90): PropSpec => ({ type: 'string', default: value, max_length, multiline: true })
const schemas: Record<string, Record<string, PropSpec>> = {
  comparison: { left_label: text('First option', 40), left_detail: text('Add a verified distinction'), right_label: text('Second option', 40), right_detail: text('Add a verified distinction') },
  numbers: { left_label: text('First value', 40), left_value: { type: 'number', default: 0, min: 0, max: 1e9 }, right_label: text('Second value', 40), right_value: { type: 'number', default: 0, min: 0, max: 1e9 }, unit: text('', 20) },
  process: { step_1: text('First step', 60), step_2: text('Second step', 60), step_3: text('Third step', 60) },
  timeline: { date_1: text('First event', 30), event_1: text('Add a sourced event', 70), date_2: text('Next event', 30), event_2: text('Add a sourced event', 70), date_3: text('Final event', 30), event_3: text('Add a sourced event', 70) },
  'key-point': { statement: text('Add the verified takeaway or exact quotation', 180), attribution: text('', 70) },
  annotation: { image_data: text('', 1_000_000), callout: text('Describe the supplied feature', 80), point_x: { type: 'number', default: 0.5, min: 0, max: 1 }, point_y: { type: 'number', default: 0.5, min: 0, max: 1 } },
}

export function getHyperframesRecipe(args: Record<string, unknown>): unknown {
  const { recipe, duration_s = 6 } = args
  let aspect = args.aspect ?? 'landscape'
  if (args.detail !== undefined && args.detail !== 'schema' && args.detail !== 'source') throw new Error('detail must be schema or source')
  if (!['landscape', 'portrait', 'square'].includes(String(aspect))) throw new Error('aspect must be landscape, portrait or square')
  const exactSize = args.width !== undefined || args.height !== undefined
  if (exactSize) {
    if (![args.width, args.height].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 320 && v <= 8192)) throw new Error('Provide both width and height as integers within 320..8192')
    aspect = Number(args.height) > Number(args.width) ? 'portrait' : Number(args.width) > Number(args.height) ? 'landscape' : 'square'
  }
  if (typeof duration_s !== 'number' || !Number.isFinite(duration_s) || duration_s < 3 || duration_s > 30) throw new Error('Recipe duration_s must be within 3..30 seconds; match it to the actual narration and reading time')
  if (recipe === undefined) return {
    recipes: HYPERFRAMES_RECIPES,
    usage: 'Read one recipe with recipe, aspect and duration_s. Returns editable manifest + HTML for write_hyperframes_draft, not a placed asset. Use custom HyperFrames code when these starting points do not fit.',
  }
  const entry = HYPERFRAMES_RECIPES.find(r => r.id === recipe)
  if (!entry) throw new Error('Unknown recipe; omit recipe to list available starting points')
  const size: [number, number] = exactSize ? [Number(args.width), Number(args.height)] : aspect === 'portrait' ? [720, 1280] : aspect === 'square' ? [720, 720] : [1280, 720]
  const props_schema: Record<string, PropSpec> = {
    title: text('Add a grounded heading', 90),
    ...structuredClone(schemas[entry.id]),
    ...(['process', 'timeline'].includes(entry.id) ? {
      second_at: { type: 'number', default: duration_s / 3, min: 0.7, max: duration_s - 0.7 } as PropSpec,
      third_at: { type: 'number', default: duration_s * 2 / 3, min: 1.2, max: duration_s - 0.7 } as PropSpec,
    } : {}),
    accent: { type: 'color', default: '#9BE2C4' },
    foreground: { type: 'color', default: '#F5F3EA' },
    background: { type: 'color', default: '#152B2A' },
    surface: { type: 'enum', default: 'solid', options: ['solid', 'transparent'] },
    motion: { type: 'enum', default: 'standard', options: ['standard', 'reduced'] },
  }
  const manifest: Manifest = { id: 'recipe', version: 1, name: entry.name, size, default_duration_s: duration_s, props_schema, fonts: [] }
  const boxes = (keys: string[], extras = '') => keys.map((key, i) => `<section class="card reveal"><span class="index">${String(i + 1).padStart(2, '0')}</span><div class="copy" data-fit data-prop="${key}"></div>${extras}</section>`).join('')
  let body: string
  switch (entry.id) {
    case 'comparison':
      body = `<div class="cards two">${['left', 'right'].map(side => `<section class="card reveal"><h2 data-fit data-prop="${side}_label"></h2><p data-fit data-prop="${side}_detail"></p></section>`).join('')}</div>`
      break
    case 'numbers':
      body = `<div class="numeric">${['left', 'right'].map(side => `<section class="number-row reveal"><div class="number-heading"><span data-fit data-prop="${side}_label"></span><strong id="${side}-value"></strong></div><div class="bar-track"><div class="bar" id="${side}-bar"></div></div></section>`).join('')}</div>`
      break
    case 'process': body = `<div class="cards three process">${boxes(['step_1', 'step_2', 'step_3'])}</div><svg id="process-rail" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible"><path id="process-path" fill="none" stroke="var(--accent)" stroke-width="${1.5 * Math.min(...size) / 720}" opacity="0.35"/><circle id="process-marker" r="${8 * Math.min(...size) / 720}" fill="var(--accent)" opacity="0"/></svg>`; break
    case 'timeline':
      body = `<div class="cards three chronology">${[1, 2, 3].map(i => `<section class="card reveal"><h2 data-fit data-prop="date_${i}"></h2><p data-fit data-prop="event_${i}"></p></section>`).join('')}</div>`
      break
    case 'key-point': body = '<section class="statement reveal"><div class="statement-text" data-fit data-prop="statement"></div><div class="attribution" data-fit data-prop="attribution"></div></section>'; break
    case 'annotation': body = '<section class="image-card reveal"><div class="image-area"><img id="supplied-image" alt="Supplied source image"><div id="image-placeholder">Supply an authorized image</div><div id="pointer"></div></div><p class="image-caption" data-fit data-prop="callout"></p></section>'; break
  }
  const unit = Math.min(...size) / 720
  const html = `<div data-composition-id="editorial" data-width="${size[0]}" data-height="${size[1]}"><main id="stage"><h1 data-fit data-prop="title"></h1><div id="content">${body}</div></main></div>
<style>
*{box-sizing:border-box}#stage{width:100%;height:100%;padding:8% 7% 12%;font-family:Arial,Helvetica,sans-serif;color:var(--fg);background:var(--bg);display:flex;flex-direction:column;gap:${24 * unit}px;overflow:hidden}
h1,h2,p{margin:0}h1{font-size:${48 * unit}px;line-height:1.12;flex:0 0 22%;max-height:22%;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}#content{flex:1;min-height:0;position:relative}.cards{display:grid;height:100%;gap:${20 * unit}px;grid-template-columns:repeat(2,minmax(0,1fr))}.three{grid-template-columns:repeat(3,minmax(0,1fr))}.card{border:1px solid var(--accent);padding:${25 * unit}px;display:flex;flex-direction:column;gap:${20 * unit}px;overflow:hidden;border-radius:${12 * unit}px;background:var(--panel)}h2{font-size:${32 * unit}px;line-height:1.15;height:35%;color:var(--accent)}p,.copy{font-size:${27 * unit}px;line-height:1.25;flex:1;min-height:0;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden}.process .card{position:relative;overflow:visible}.process .card:not(:last-child)::after{content:'→';position:absolute;right:-${20 * unit}px;top:72%;width:${20 * unit}px;font-size:${22 * unit}px;color:var(--accent)}.index{font-size:${18 * unit}px;color:var(--accent)}.copy{font-size:${32 * unit}px}.numeric{height:100%;display:flex;flex-direction:column;justify-content:center;gap:${40 * unit}px}.number-heading{display:flex;justify-content:space-between;gap:${25 * unit}px;font-size:${30 * unit}px;margin-bottom:${15 * unit}px}.number-heading span{min-width:0;flex:1;max-height:${74 * unit}px;overflow:hidden}.number-heading strong{color:var(--accent);font-size:${32 * unit}px}.bar-track{height:${40 * unit}px;background:var(--panel);border:1px solid var(--accent)}.bar{height:100%;background:var(--accent);transform-origin:left}.statement{height:100%;border-left:${6 * unit}px solid var(--accent);padding:0 0 0 ${30 * unit}px;display:flex;flex-direction:column;gap:${24 * unit}px}.statement-text{font-size:${44 * unit}px;line-height:1.18;flex:1;min-height:0;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere}.attribution{font-size:${24 * unit}px;color:var(--accent);height:20%;white-space:pre-wrap;overflow:hidden}.image-card{height:100%;display:flex;flex-direction:column;gap:${16 * unit}px}.image-area{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:var(--panel)}#supplied-image{display:none;position:absolute}#image-placeholder{font-size:${24 * unit}px}#pointer{position:absolute;width:${32 * unit}px;height:${32 * unit}px;border:${4 * unit}px solid var(--accent);border-radius:50%;transform:translate(-50%,-50%);display:none}.image-caption{flex:0 0 26%;font-size:${28 * unit}px}
${aspect === 'portrait' ? `.cards,.three{grid-template-columns:1fr;grid-auto-rows:minmax(0,1fr)}.card{padding:${20 * unit}px;gap:${12 * unit}px}h2{height:auto;max-height:40%;flex-shrink:0}.copy{font-size:${32 * unit}px}.process .card:not(:last-child)::after{content:'↓';right:50%;top:auto;bottom:-${22 * unit}px;height:${22 * unit}px}.number-heading{flex-wrap:wrap}#stage{padding-top:12%;padding-bottom:18%}h1{flex-basis:15%;max-height:15%}` : ''}
</style><script>
const p=window.__sclipProps,stage=document.getElementById('stage');
stage.style.setProperty('--fg',p.foreground);stage.style.setProperty('--accent',p.accent);stage.style.setProperty('--bg',p.surface==='transparent'?'transparent':p.background);stage.style.setProperty('--panel',p.surface==='transparent'?'rgba(0,0,0,0.72)':'rgba(255,255,255,0.05)');
document.querySelectorAll('[data-prop]').forEach(el=>{el.textContent=String(p[el.dataset.prop]??'')});
${entry.id === 'numbers' ? `const maxValue=Math.max(p.left_value,p.right_value,1);['left','right'].forEach(side=>{document.getElementById(side+'-value').textContent=String(p[side+'_value'])+(p.unit?' '+p.unit:'');document.getElementById(side+'-bar').style.width=(p[side+'_value']/maxValue*100)+'%';});` : ''}
const tl=gsap.timeline({paused:true});const reduced=p.motion==='reduced';
tl.fromTo('h1',{opacity:0,y:reduced?0:16},{opacity:1,y:0,duration:0.35,ease:'power2.out'},0);
${['process', 'timeline'].includes(entry.id) ? `if(p.third_at<p.second_at+0.5)throw new Error('Keep at least 0.5 seconds between the second and third visual beats');document.querySelectorAll('.reveal').forEach((el,i)=>tl.fromTo(el,{opacity:0,y:reduced?0:24},{opacity:1,y:0,duration:0.4,ease:'power2.out'},[0.25,p.second_at,p.third_at][i]));` : `tl.fromTo('.reveal',{opacity:0,y:reduced?0:24},{opacity:1,y:0,duration:0.4,stagger:0.16,ease:'power2.out'},0.25);`}
${entry.id === 'numbers' ? `if(!reduced)tl.fromTo('.bar',{scaleX:0},{scaleX:1,duration:0.75,stagger:0.16,ease:'power2.inOut'},0.4);` : ''}
tl.to('#stage',{opacity:0,duration:0.3,ease:'power2.in'},${duration_s - 0.3});
window.__timelines.editorial=tl;
// The capture host awaits this before seeking or taking the first frame.
window.__sclipReady=(async()=>{await document.fonts.ready;
 document.querySelectorAll('[data-fit]').forEach(el=>{let size=parseFloat(getComputedStyle(el).fontSize);while(size>16&&(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)){size-=1;el.style.fontSize=size+'px';}if(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)throw new Error('Recipe text does not fit; shorten copy or revise layout');});
 ${entry.id === 'process' ? `const content=document.getElementById('content');document.getElementById('process-rail').setAttribute('viewBox','0 0 '+content.clientWidth+' '+content.clientHeight);const points=Array.from(document.querySelectorAll('.process .card')).map(el=>({x:el.offsetLeft+${aspect === 'portrait' ? `el.offsetWidth-${24 * unit}` : 'el.offsetWidth/2'},y:el.offsetTop+el.offsetHeight*${aspect === 'portrait' ? 0.5 : 0.72}}));document.getElementById('process-path').setAttribute('d',points.map((q,i)=>(i?'L':'M')+q.x+' '+q.y).join(' '));const marker=document.getElementById('process-marker');tl.set(marker,{attr:{cx:points[0].x,cy:points[0].y}},0).to(marker,{opacity:1,duration:0.2},0.25);[1,2].forEach((i)=>{const at=[0,p.second_at,p.third_at][i];if(reduced)tl.set(marker,{attr:{cx:points[i].x,cy:points[i].y}},at);else tl.to(marker,{attr:{cx:points[i].x,cy:points[i].y},duration:0.4,ease:'power2.inOut'},at-0.4);});` : ''}
 ${entry.id === 'annotation' ? `const image=document.getElementById('supplied-image');if(p.image_data){if(!/^data:image\\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\\r\\n]+$/.test(p.image_data))throw new Error('Use an embedded PNG, JPEG or WebP supplied image');image.src=p.image_data;await image.decode();const area=image.parentElement;const scale=Math.min(area.clientWidth/image.naturalWidth,area.clientHeight/image.naturalHeight);const w=image.naturalWidth*scale,h=image.naturalHeight*scale,x=(area.clientWidth-w)/2,y=(area.clientHeight-h)/2;Object.assign(image.style,{display:'block',left:x+'px',top:y+'px',width:w+'px',height:h+'px'});const pointer=document.getElementById('pointer');Object.assign(pointer.style,{display:'block',left:(x+p.point_x*w)+'px',top:(y+p.point_y*h)+'px'});document.getElementById('image-placeholder').style.display='none';}` : ''}
})();
</script>`
  const result = { recipe: entry.id, purpose: entry.purpose, manifest, html,
    guidance: 'Fill placeholders from verified source context; zero values are placeholders, not evidence. Keep facts exact. Use write_hyperframes_draft with manifest and html, preview at entrance/read/exit and with changed props, then add_motif with grounded props. Check the composed timeline and underlying audio. For process/timeline, set second_at and third_at from actual narration beats (at least 0.5 seconds apart); defaults are evenly spaced. Change duration by requesting source again. Custom code is allowed. Surface transparent is an overlay; solid is a cutaway.',
    limitations: entry.id === 'annotation' ? 'image_data accepts embedded PNG/JPEG/WebP only. point_x/point_y are fractions of the contained image, not canvas coordinates. Preview after image decoding; no screenshot is fabricated.' : entry.id === 'timeline' ? 'Events are equally spaced in supplied order, not on a calibrated time axis.' : 'No external assets or factual claims are supplied by this recipe.' }
  if (args.detail === 'schema') { const { html: _html, ...summary } = result; return summary }
  return result
}
