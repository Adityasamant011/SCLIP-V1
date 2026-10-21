// apps/desktop/src/main/mcp/motifToolDefs.ts
// TS-owned MCP tool defs + resource defs for the motif surface.
// inputSchemas are TS-owned: all motif tool DEFS live here, and
// rust-catalog-snapshot.json carries no motif arms (do not expect a regenerated
// one to contain them). preview_motif_draft's def is TS-sourced like the others,
// but its EXECUTION routes 'rust' (the CDP capture special-case in server.ts).

export interface MotifToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MotifResourceDef {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export const MOTIF_TOOL_DEFS: ReadonlyArray<MotifToolDef> = [
  {
    name: 'get_hyperframes_recipe',
    description: 'Read original editable HyperFrames starting points: comparison cards, numeric bars, connected process with moving marker, timelines, key points and supplied-image callouts. Omit recipe for the compact catalog. For short recipe authoring request recipe + detail="schema" to read editable prop definitions without HTML; then write_hyperframes_draft with recipe + grounded props. detail="source" (default) returns manifest + HTML for custom adaptation. Read-only: no draft, installation, image generation or timeline edit. Preview then place the result; custom code remains available. Do not replace documentary evidence or invent data.',
    inputSchema: { type: 'object', properties: {
      recipe: { type: 'string', enum: ['comparison', 'numbers', 'process', 'timeline', 'key-point', 'annotation'] },
      detail: { type: 'string', enum: ['schema', 'source'], description: 'schema returns compact prop definitions for recipe authoring; source (default) also includes custom-editable HTML.' },
      aspect: { type: 'string', enum: ['landscape', 'portrait', 'square'], description: 'Match composition orientation; defaults landscape. Source can be adapted to exact canvas dimensions.' },
      width: { type: 'integer', minimum: 320, maximum: 8192, description: 'Optional exact canvas width; supply height too. Exact dimensions determine layout orientation and text scale.' },
      height: { type: 'integer', minimum: 320, maximum: 8192, description: 'Optional exact canvas height; supply width too.' },
      duration_s: { type: 'number', minimum: 3, maximum: 30, description: 'Content duration, default 6. Choose for narration/reading time, not arbitrary cutting frequency.' },
    }, additionalProperties: false },
  },
  {
    name: 'write_hyperframes_draft',
    description: 'Create editable explanatory B-roll or motion graphics through HyperFrames. Custom semantic graphics are first-class: get_hyperframes_authoring_context supplies current canvas, existing intentions and composable motion primitives. scene_intent can record your visual purpose/beats; asset_bindings/font_bindings embed local assets by handle. Two modes: (1) recipe + props with exact width/height and duration_s builds an original tested graphic WITHOUT copying HTML. Read get_hyperframes_recipe to discover ids and prop definitions; supplied prop values become editable draft defaults. Process recipe includes connected stages and a moving marker with second_at/third_at narration beats. (2) Custom manifest + html supports designs beyond recipes. Supply metadata {name,size:[w,h],default_duration_s,props_schema} and one data-composition-id root; register a paused GSAP timeline at window.__timelines[compositionId]. GSAP is bundled: no external scripts. Use window.__sclipProps; optional window.__sclipReady awaits embedded-image/font layout. No audio/video, external assets or nested/timed primitives; use normal media tools. Returns a draft id; preview_motif_draft, then add_motif. Reusable installation needs user approval. Rendering is local; authoring-model costs depend on provider.',
    inputSchema: { type: 'object', properties: {
      recipe: { type: 'string', enum: ['comparison', 'numbers', 'process', 'timeline', 'key-point', 'annotation'], description: 'Optional shortcut: create a tested recipe with props rather than resending source. Omit manifest and html in this mode.' },
      props: { type: 'object', description: 'Recipe mode only: grounded instance values matching the recipe props_schema; unknown/invalid props reject.' },
      aspect: { type: 'string', enum: ['landscape', 'portrait', 'square'] },
      width: { type: 'integer', minimum: 320, maximum: 8192 },
      height: { type: 'integer', minimum: 320, maximum: 8192 },
      duration_s: { type: 'number', minimum: 3, maximum: 30, description: 'Recipe duration; choose actual narration/reading time. Default 6.' },
      manifest: {
        type: 'object',
        description: 'Graphic metadata and editable prop DEFINITIONS, not prop values. App assigns id/version. Put actual instance values in preview_motif_draft/add_motif props. For a fixed graphic props_schema may be {}.',
        properties: {
          name: { type: 'string', minLength: 1 },
          size: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 8192 }, minItems: 2, maxItems: 2, description: '[width, height] matching the HTML root and project canvas.' },
          default_duration_s: { type: 'number', exclusiveMinimum: 0, maximum: 180 },
          props_schema: { type: 'object', description: 'Map of prop names to typed definitions, e.g. {title:{type:"string",default:"Heading",max_length:90},accent:{type:"color",default:"#9BE2C4"}}. Keep the definitions returned by get_hyperframes_recipe.' },
        },
        required: ['name', 'size', 'default_duration_s', 'props_schema'],
      },
      html: { type: 'string', description: 'Self-contained HyperFrames HTML/CSS/inline GSAP script.' },
      scene_intent:{type:'object',description:'Optional agent-authored purpose and visual concept with actual content-time beats. A planning aid, not proof the motion was rendered.',properties:{purpose:{type:'string',maxLength:500},visual_concept:{type:'string',maxLength:500},entities:{type:'array',maxItems:12,items:{type:'string',maxLength:100}},beats:{type:'array',maxItems:12,items:{type:'object',properties:{at_s:{type:'number',minimum:0},description:{type:'string',maxLength:200}},required:['at_s','description'],additionalProperties:false}}},required:['purpose','visual_concept'],additionalProperties:false},
      asset_bindings:{type:'array',maxItems:4,description:'Imported PNG/JPEG/WebP IDs bound immutably into HTML. Use src="sclip-asset:NAME" or CSS url(sclip-asset:NAME); the host embeds bytes without sending base64 through your prompt.',items:{type:'object',properties:{name:{type:'string'},media_id:{type:'string'}},required:['name','media_id'],additionalProperties:false}},
      font_bindings:{type:'array',maxItems:2,description:'Explicit local font files embedded immutably; no network fonts. Use the supplied family in CSS. Entire source stays within 2MiB.',items:{type:'object',properties:{family:{type:'string'},path:{type:'string'},weight:{type:'integer',minimum:100,maximum:900}},required:['family','path'],additionalProperties:false}},
      from: { type: 'string', description: 'Optional existing Motif id to update after preview.' },
    }, oneOf: [{ required: ['recipe'], not: { anyOf: [{ required: ['manifest'] }, { required: ['html'] }] } }, { required: ['manifest', 'html'], not: { anyOf: [{ required: ['recipe'] }, { required: ['props'] }, { required: ['aspect'] }, { required: ['width'] }, { required: ['height'] }, { required: ['duration_s'] }] } }], additionalProperties: false },
  },
  {
    name: 'list_motifs',
    description:
      'List every motif available to add via `add_motif` — built-ins PLUS installed and ' +
      'draft user motifs. Returns an array of `{ id, name, version, size: [w,h], ' +
      'default_duration_s, props_schema, status, content_hash, target_id? }` where ' +
      '`status` is `builtin` | `installed` | `draft`. Inspect `props_schema` before ' +
      '`add_motif` to know what keys + types each motif accepts; unknown keys reject. ' +
      'Drafts (status `draft`) are placeable immediately for preview.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      description:
        'Empty arg shape for tools that take no parameters. The dispatch table deserializes `{}` (or any object) into this; `schemars` advertises it as an empty object schema.',
      title: 'EmptyArgs',
      type: 'object',
    },
  },
  {
    name: 'get_motif_source',
    description:
      'Read a Motif\'s source { manifest, html } — any built-in, installed, or draft. ' +
      'Read this before editing so you can base your changes on the current source. ' +
      '`id` comes from `list_motifs`.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      description: 'Shared single-id arg for `get_motif_source` + `delete_motif`.',
      properties: {
        id: {
          description: 'The Motif id (from `list_motifs`).',
          type: 'string',
        },
      },
      required: ['id'],
      title: 'MotifIdArgs',
      type: 'object',
    },
  },
  {
    name: 'write_motif_draft',
    description:
      'Write a Motif draft from { manifest, html }. Returns the draft id. The draft is ' +
      'placeable immediately (via `add_motif`) for preview, and re-writable. `from` ' +
      '(optional) records an existing Motif id as the draft\'s UPDATE target so a later ' +
      '`install_motif {mode:\'update\'}` republishes over it; omit `from` for a brand-new ' +
      'Motif (installs as new). The manifest\'s `id`/`version` are ignored — app-assigned. ' +
      'Expose tweakable controls via `props_schema`. Optional format="hyperframes" accepts a single self-contained HyperFrames HTML/GSAP graphic. GSAP is bundled: omit external scripts, register a paused timeline at window.__timelines[compositionId], use data-composition-id and manifest-matching data-width/data-height. Read props from window.__sclipProps. No audio/video, external URLs, nested files or timed primitive clips; add those through normal Sclip media tools. Preview before placing; rendering remains local.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      properties: {
        format: { type: 'string', enum: ['motif', 'hyperframes'], description: 'Defaults to motif; hyperframes converts a self-contained GSAP graphic for the same preview/export renderer.' },
        from: {
          description:
            'Optional id of an existing Motif this draft will UPDATE on install (records it as the draft\'s target). Omit for a brand-new Motif (installs as new).',
          type: ['string', 'null'],
        },
        html: {
          description:
            'The HTML body. The manifest island is injected by the app; a `<script>motif.define({...})</script>` drives the render.',
          type: 'string',
        },
        manifest: {
          // `type` is load-bearing: an untyped field gets string-coerced by MCP
          // clients, forcing agents to send the manifest as a JSON-encoded
          // string (mcp.catalog-bijection.test.ts assertion 7 gates this).
          type: 'object',
          description:
            'The manifest as a JSON object (its `id`/`version` are ignored — app-assigned). Shape: `{ name, size:[w,h], default_duration_s, props_schema, ... }` — inspect a built-in via `get_motif_source` for an exact example. Rejected if malformed.',
        },
      },
      required: ['html', 'manifest'],
      title: 'WriteMotifDraftArgs',
      type: 'object',
    },
  },
  {
    name: 'preview_motif_draft',
    description:
      'Render one frame of a Motif (draft / installed / built-in) and return it as a ' +
      'base64-encoded PNG plus a short local vision observation of those exact pixels (inspect=false returns image only). This is draft evidence, not current-timeline verification. Place a working first scene before polishing every draft. Args: `id`, ' +
      '`t_sec` (content time), optional `width`/`height` (default = the motif\'s size), ' +
      'optional `props`. Requires the app\'s preview runtime to be live; returns an error ' +
      '(rather than hanging) if it isn\'t ready.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      properties: {
        t_secs:{type:'array',minItems:2,maxItems:4,items:{type:'number',minimum:0},description:'Optional increasing meaningful content times for one bounded motion preview. Omit t_sec in this mode; returns labelled images and observations for each. Draft evidence only.'},
        inspect: {type:'boolean',description:'Default true: include local vision facts with the preview, avoiding a separate image-analysis call. False requests image only.'},
        question: {type:'string',description:'Optional focused visual question for the local observer. Motion requires comparing actual frames.'},
        height: {
          description: 'Optional render height (default = the motif\'s manifest height).',
          format: 'uint32',
          minimum: 0,
          type: ['integer', 'null'],
        },
        id: {
          description: 'Motif id (draft / installed / built-in).',
          type: 'string',
        },
        props: {
          type: 'object',
          description: 'Props (JSON object); `{}` uses the manifest defaults.',
        },
        t_sec: {
          description: 'Content time in seconds to render (e.g. 0 = first frame).',
          format: 'double',
          type: 'number',
        },
        width: {
          description: 'Optional render width (default = the motif\'s manifest width).',
          format: 'uint32',
          minimum: 0,
          type: ['integer', 'null'],
        },
      },
      required: ['id'],
      title: 'PreviewMotifDraftArgs',
      type: 'object',
    },
  },
  {
    name: 'install_motif',
    description:
      'Install a draft. mode \'new\' publishes under the draft\'s own id; \'update\' ' +
      'republishes over the draft\'s recorded UPDATE target (set via `write_motif_draft`\'s ' +
      '`from`) — bumping its version so every placement re-renders, and rebinding + ' +
      'migrating current-project layers. Returns the published id.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      properties: {
        draft_id: {
          description: 'The draft id (from `write_motif_draft`).',
          type: 'string',
        },
        mode: {
          description:
            '"new" (publish under the draft\'s own id) or "update" (republish over the draft\'s recorded target; fails if the draft has no target).',
          type: 'string',
        },
      },
      required: ['draft_id', 'mode'],
      title: 'InstallMotifArgs',
      type: 'object',
    },
  },
  {
    name: 'delete_motif',
    description:
      'Delete an installed or draft user Motif by id. Built-ins are rejected. Placed ' +
      'layers referencing it degrade to an error placeholder.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      description: 'Shared single-id arg for `get_motif_source` + `delete_motif`.',
      properties: {
        id: {
          description: 'The Motif id (from `list_motifs`).',
          type: 'string',
        },
      },
      required: ['id'],
      title: 'MotifIdArgs',
      type: 'object',
    },
  },
]

export const MOTIF_RESOURCE_DEFS: ReadonlyArray<MotifResourceDef> = [
  {
    uri: 'motifs://current',
    name: 'Motif catalog',
    description: 'Built-in, installed, and draft Motifs (html stripped). Re-fetch after motifs:changed events.',
    mimeType: 'application/json',
  },
]
