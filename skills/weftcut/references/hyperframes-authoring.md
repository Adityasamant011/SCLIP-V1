# HyperFrames authoring inside Sclip

Adapted from the official [HyperFrames core](https://github.com/heygen-com/hyperframes/blob/434ad8c41c6fd86b4341c52cc6e751f40474f13f/skills/hyperframes-core/SKILL.md), [animation](https://github.com/heygen-com/hyperframes/blob/434ad8c41c6fd86b4341c52cc6e751f40474f13f/skills/hyperframes-animation/SKILL.md) and creative guidance. This guide is an adapted integration document, not a standalone upstream installation. Upstream license: [Apache-2.0](hyperframes-upstream-LICENSE.txt). Pinned upstream commit: `434ad8c41c6fd86b4341c52cc6e751f40474f13f`. Sclip provides its own media timeline, offline capture host, bundled GSAP and real HyperFrames GSAP adapter. Follow the Sclip tools below; upstream project creation, CLI upgrades, remote assets and alternative renderers are outside this integration.

## Choose motion that communicates

Use recipes when their composition fits; custom HTML is equally legitimate. For tactics, routes or processes, animate positions, arrows, relationships and the order of events. A title plus paragraphs can introduce or summarize; it does not demonstrate movement. Choose a coherent visual language and validate one representative scene before producing the rest. Keep labels short enough to read, make critical relationships visually distinct, and hold important states long enough to understand. Narration timing controls scene beats; do not cram a script into predetermined cards. Use the creator's requested sources and style, not the previous project's subject.

For a custom scene, choose a few meaningful motion primitives: an object moves, a path reveals, a group responds, a label arrives, then the result holds. Animate with transforms/opacity rather than width/top/left layout changes. For footage-led work, preserve the speaker/subject with a transparent surface or a small overlay unless the brief benefits from an intentional full-screen cutaway. A cuts/subtitles request need not receive a new graphic. Keep caption space clear. Avoid hiding the entire scene at its last moment if the placed slot needs to hold.

## Native authoring contract

- Use `write_hyperframes_draft` with **either** `recipe` plus instance `props`, **or** custom `manifest` plus `html`. Do not mix modes. Use actual JSON types; the host repairs unambiguous numeric/container transport but still rejects invalid values.
- Custom manifest: `name`, `size:[width,height]`, `default_duration_s`, `props_schema:{...}`. Sclip supplies draft identity/version. Props types are `string`, `color`, `number`, `enum`; each needs a correctly typed `default`. String length is `max_length`; enums use `options:["a","b"]`. Keep numeric bounds numeric.
- One visible root with `data-composition-id`, `data-width`, `data-height` and `data-duration` matching the manifest. Never wrap it in a `<template>`. The importer supplies omitted dimensions; conflicting explicit dimensions reject. Size internal layouts against that root.
- Register exactly one fully built, paused GSAP timeline at `window.__timelines[rootId]`. Inline classic JavaScript only. `window.__sclipProps` holds instance values. Set `window.__sclipReady` to a promise if setup must await assets/layout; register the finished timeline before readiness resolves.
- Sclip seeks frames in arbitrary order. Use explicit from/to states, a finite deterministic timeline, and no wall-clock callbacks, timers, random layout, repeated autoplay, or network dependencies. Put timed changes on the timeline. Avoid CSS transform centering on the same node that GSAP moves; center a wrapper or use GSAP percent transforms.
- Media playback, audio, nested compositions and external script/font/image files belong on Sclip's ordinary timeline. This graphic adapter supports self-contained HTML/CSS/SVG and bundled GSAP. Embedded data assets are allowed. Do not put `data-start`/`data-duration` on child elements; schedule them in the paused timeline.

Minimal editable scene (replace canvas, timing, text and movement for the brief):

```html
<div data-composition-id="diagram" data-width="1080" data-height="1920" data-duration="4">
  <main style="width:100%;height:100%;position:relative;background:#111;color:white">
    <h1 id="label" style="position:absolute;left:8%;top:8%;font:64px Arial"></h1>
    <svg viewBox="0 0 1080 1920" style="position:absolute;inset:0;width:100%;height:100%">
      <path d="M200 1000 L800 650" stroke="#888" stroke-width="8"/>
      <circle id="actor" cx="200" cy="1000" r="45" fill="#e44"/>
    </svg>
  </main>
</div>
<script>
const p=window.__sclipProps;
document.querySelector('#label').textContent=p.title;
const tl=gsap.timeline({paused:true});
tl.fromTo('#label',{opacity:0,y:24},{opacity:1,y:0,duration:0.35},0);
tl.fromTo('#actor',{x:0,y:0},{x:600,y:-350,duration:1.2,ease:'power2.inOut'},0.7);
tl.to({}, {duration:2.1},1.9);
window.__timelines.diagram=tl;
</script>
```

## Preview, place and review

`preview_motif_draft {id,t_sec,props:{}}` returns both the seeked image and a short LOCAL visual observation, plus placement state. Use that observation rather than another native image-loading call. `inspect:false` skips local inference when only image capture is wanted. One entrance/read pair is enough to place a working first scene; polish on the timeline instead of producing many unplaced variants. Inspect with `vision_inspect {image_path,question}` when the preview result supplies a file; current-timeline inspection is preferable after placement. Reuse observations; do not send unchanged images repeatedly through different vision tools.

Place with `add_motif {motif_id,t_start_us,t_end_us,props:{}}`; its returned ID is a timeline layer, while the draft ID names the reusable source. A scene's placement must correspond to actual rendered narration timing. After the complete draft, `inspect_audio_visual_alignment {start_us,end_us}` pairs recognized speech with every authored shot/graphic interval, up to twelve samples per call. Continue with `remaining_range_us` if present. Compare the diagram and movement to the spoken claim yourself; observations are fallible, not an automatic match verdict. After repairs, inspect the changed state. Report uncertainty or unavailable checks accurately.


## Current Sclip authoring additions

`get_hyperframes_authoring_context {}` returns the real canvas, current graphic intentions/content hashes, imported still IDs and composable motion examples. Design from the video's explanation rather than repeatedly substituting a key-point card. A simple reveal can still be the right choice.

`write_hyperframes_draft` accepts optional `scene_intent` with concise `purpose`, `visual_concept`, `entities` and increasing `{at_s,description}` beats inside its duration. This is authored intent, never evidence that the motion succeeded. Use `asset_bindings:[{name,media_id}]` with `sclip-asset:NAME` image URLs in your HTML, and optional `font_bindings:[{family,path,weight}]` for explicit local fonts. The host verifies and embeds those approved local bytes into the immutable source; it does not allow remote loading or add a second media/audio timeline. Keep images/fonts small enough for the reported source budget.

`preview_motif_draft {id,t_secs:[...],props:{}}` captures 2–4 chosen actual times in one request. Select the first readable state and meaningful intermediate motion/relationship beats. The returned distinct-pixel count does not prove purposeful motion. Captures wait for fonts/images and the requested renderer frame. Paired timeline review remains necessary after placement and actual speech generation.
