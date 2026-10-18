# HyperFrames graphics tool

`write_hyperframes_draft` creates an editable motion graphic rendered through
Sclip's existing Motif preview/export host. It uses the pinned HyperFrames
`createGSAPFrameAdapter` and bundled GSAP; no hosted renderer is required.

Supply a manifest with `name`, `size: [width,height]`, `default_duration_s` and
`props_schema`, plus self-contained HTML/CSS/inline JavaScript:

```html
<div data-composition-id="intro" data-width="320" data-height="180">
  <div id="title">Example</div>
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.fromTo('#title', { x: 0 }, { x: 200, duration: 2, ease: 'none' });
window.__timelines.intro = tl;
</script>
```

Do not import GSAP or other scripts. Read editable props from
`window.__sclipProps`. The tool returns an ordinary draft id; inspect it with
`preview_motif_draft`, place it with `add_motif`, and use the existing publishing
workflow when requested. Rebuilding props reconstructs the DOM/timeline, and
frame seeking uses the same adapter for preview and export.

For embedded image decoding or font-dependent layout, assign a Promise to
`window.__sclipReady`. Setup awaits it before the first captured frame; reject it
to report missing/invalid assets or impossible text fit. Each props rebuild clears
the previous readiness promise and creates a new one. Do not use a wall-clock
timer to decide what a frame displays.

`get_hyperframes_recipe` is a read-only source catalog. With no arguments it
lists six original editorial starting points: comparison cards, numeric bars,
three-step process, timeline, key point, and supplied-image annotation. With
`recipe`, optional `aspect` (landscape/portrait/square) and `duration_s` (3–30),
it returns a manifest and HTML for the existing write/preview/place flow. Use
detail="schema" to omit HTML when you only need editable prop definitions for
short recipe authoring. Optional paired width/height (320–8192) match an exact
project canvas and set layout/text scale. Reading a recipe does not create or
install a Motif. Custom designs remain available.

To avoid echoing a large source payload, `write_hyperframes_draft` also accepts
recipe + props with optional exact width/height and duration_s. It creates a
fresh draft with validated grounded values as editable defaults; preview/place
can use empty props unless overriding them. Do not combine recipe mode with
custom manifest/HTML. No recipe is automatically installed. The process recipe
includes a connected rail and moving marker synchronized to second_at/third_at;
reduced motion advances it without travel.

Replace placeholder content with verified facts. Numeric bars accept comparable
nonnegative values; timeline spacing is ordinal, not calibrated by dates. The
annotation recipe accepts embedded PNG/JPEG/WebP and points in normalized image
coordinates, accounting for letterboxing. Props expose text/data/colors, a solid
or transparent surface, and standard/reduced motion.
For process/timeline sequences, second_at and third_at control the reveal beats;
set them from actual narration timing, at least half a second apart. Defaults
are evenly spaced, not an automatic speech alignment.
Typography uses local Arial/Helvetica/sans-serif fallbacks; exact font metrics
depend on the machine.
Match the actual composition size if adapting the returned source, and verify
text fit and readability in the final composition. Overlays should not obscure
faces/captions. Full-frame cutaways retain underlying dialogue on native tracks.

The supported scope is one motion graphic up to 180 seconds. Embed fonts/images
as data URLs; load any declared fonts before measuring text. External assets,
audio/video tags, nested projects and timed media primitives are rejected. Use
Sclip's ordinary media tools for source footage and sound. This is not a complete
importer for arbitrary HyperFrames projects.

HyperFrames core is Apache-2.0; linkedom is ISC. GSAP has its own
[standard no-charge license](https://gsap.com/community/standard-license/),
including restrictions on competing visual animation builders. It is not MIT
or Apache-2.0. Preserve the bundled GSAP copyright/license header. This
integration authors animation in code; it does not supply a visual GSAP builder.
