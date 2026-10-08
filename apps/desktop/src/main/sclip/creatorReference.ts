import type { Project } from '../state/model'
import type { SourceObservationIndex } from './sourceObservationIndex'
import type { CreatorStyleStore } from './creatorStyle'
/** Retain only user-selected imported reference evidence already observed locally. No inference. */
export async function rememberCreatorReference(store: CreatorStyleStore, current: () => Project, args: Record<string, unknown>, index?: Pick<SourceObservationIndex, 'cachedUnderstanding'>) {
  const project = current(), bindingKey = store.sessionKey(project.project_id)
  const media = structuredClone(project.media_pool[String(args.media_id)])
  if (!media || media.kind !== 'Video') throw new Error('Import the user-supplied finished video first')
  const observations = await index?.cachedUnderstanding(media)
  const after = current()
  if (after.project_id !== project.project_id || store.sessionKey(project.project_id) !== bindingKey || after.media_pool[media.id]?.file_hash_blake3 !== media.file_hash_blake3) throw new Error('Project, creator or source changed; register reference again')
  return store.reference(project.project_id, {
    relationship: args.relationship, intent: args.intent, media_id: media.id,
    source_hash: media.file_hash_blake3, metadata: media.metadata,
    observations: observations ?? { status: 'unavailable', reason: 'No local cached source understanding' },
    limitations: 'Finished-video observations only; original cuts/intent unknown. Use existing source tools for further evidence. Reference is not a preference.',
  })
}
