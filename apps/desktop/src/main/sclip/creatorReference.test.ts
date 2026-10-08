import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CreatorStyleStore } from './creatorStyle'
import { rememberCreatorReference } from './creatorReference'
import { blankProject } from '../state/model'
import { seededGen } from '../state/ids'

describe('Finished references use current imported identity and cached local evidence',()=>{
  it('preserves independent contradictory observations, unknown speech and own/inspiration scope without inference',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creator-ref-'))
    try {
      const store=new CreatorStyleStore(dir),project=blankProject(seededGen(),'synthetic')
      project.media_pool.source={id:'source',kind:'Video',label:'Synthetic',file_hash_blake3:'synthetic-hash',metadata:{duration_us:4_000_000}} as any
      const overview={observations:[{source_t_us:0,description:'Text visible',evidence:'model_observation'},{source_t_us:2_000_000,description:'No text',evidence:'model_observation'}],speech:{status:'not_observed'}}
      const before=structuredClone(project)
      const cache=vi.fn(async()=>overview), analysis=vi.fn(()=>{throw new Error('Reanalysis forbidden')})
      const result=await rememberCreatorReference(store,()=>project,{media_id:'source',relationship:'own_finished',intent:'persistent'},{cachedUnderstanding:cache,understand:analysis} as any)
      await rememberCreatorReference(store,()=>project,{media_id:'source',relationship:'own_finished',intent:'persistent'},{cachedUnderstanding:cache,understand:analysis} as any)
      expect(cache).toHaveBeenCalledTimes(2);expect(analysis).not.toHaveBeenCalled()
      expect(result.evidence[0]!.data.observations).toEqual(overview)
      expect(result.evidence[0]!.data.source_hash).toBe('synthetic-hash')
      expect(result.preferences).toHaveLength(0); expect(project).toEqual(before)
      expect(store.context('next-project')).toContain('not_observed')
    }finally{fs.rmSync(dir,{recursive:true,force:true})}
  })
  it('rejects creator/source changes during cache retrieval and does not publish evidence',async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creator-ref-'))
    try {
      const store=new CreatorStyleStore(dir),project=blankProject(seededGen(),'synthetic')
      project.media_pool.source={id:'source',kind:'Video',file_hash_blake3:'first',metadata:{}} as any
      await expect(rememberCreatorReference(store,()=>project,{media_id:'source',relationship:'external_inspiration',intent:'project'},{cachedUnderstanding:async()=>{project.media_pool.source.file_hash_blake3='changed';return {} as any}})).rejects.toThrow('source changed')
      expect(store.view(project.project_id).evidence).toHaveLength(0)
    }finally{fs.rmSync(dir,{recursive:true,force:true})}
  })
})
