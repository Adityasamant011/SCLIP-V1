import type { LocalGeneration } from './localGeneration'
import { validateGenerationRequest } from './localGeneration'
import type { TsActorHost } from '../state/ts-actor-host'

const prompt = { type: 'string', minLength: 1, maxLength: 1000, description: 'Your chosen description. Passed unchanged to the local generator; no LLM rewrite.' }
const seed = { type: 'integer', minimum: 0, maximum: 2147483647, description: 'Choose a seed; identical verified model/settings reuse the cached asset.' }
export const LOCAL_GENERATION_TOOLS = [
  { name: 'get_local_generation_status', description: 'Check optional local image/music model packs without inference or downloads. Missing packs remain unavailable; no paid/cloud fallback.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'generate_image', description: 'Generate one optional local FLUX.2 Klein 4B image as a project-owned PNG asset. Requires a saved project and installed verified model pack. No timeline/pool mutation or completion evidence. You choose prompt, seed and dimensions. Then decide whether to import_media and add_media_layer. Bounded 256–768px dimensions; one generation at a time; cancellable; no model download or cloud fallback.',
    inputSchema: { type: 'object', properties: { prompt, seed, width: { type: 'integer', minimum: 256, maximum: 768, multipleOf: 32 }, height: { type: 'integer', minimum: 256, maximum: 768, multipleOf: 32 } }, required: ['prompt', 'seed'], additionalProperties: false } },
  { name: 'generate_music', description: 'Generate a short local music/audio candidate with Stable Audio Open Small, not Kokoro. Requires a saved project and optional licensed model pack. Produces a project-owned stereo WAV, 1–11 seconds. Better suited to short textures, stings and loops than complete songs; musical quality and absence of vocals are not guaranteed. No timeline/pool mutation, model download, provider call or review evidence. You decide whether to import_media and place/mix with existing tools.',
    inputSchema: { type: 'object', properties: { prompt, seed, duration_seconds: { type: 'number', minimum: 1, maximum: 11 } }, required: ['prompt', 'seed'], additionalProperties: false } },
] as const

export async function callLocalGeneration(service: LocalGeneration, getHost: () => TsActorHost | null, name: string, args: Record<string, unknown>, signal?: AbortSignal, assertAuthority?: () => void) {
  const request = validateGenerationRequest(args, name === 'generate_image' ? 'image' : 'music')
  const host = getHost(), project = host?.actor.snapshot().project_id, opening = host?.mcpHybridDeps.projectOpening?.()
  const directory = host?.mcpHybridDeps.workspaceDir()
  if (!host || !directory) throw new Error('Save the active project before generating media')
  const assertCurrent = () => {
    signal?.throwIfAborted(); assertAuthority?.()
    const current = getHost()
    if (current !== host || current.actor.snapshot().project_id !== project || current.mcpHybridDeps.projectOpening?.() !== opening ||
        current.mcpHybridDeps.workspaceDir() !== directory) throw new Error('Project opening changed; generation has no authority to publish')
  }
  return service.generate(request, { directory, assertCurrent }, signal)
}
