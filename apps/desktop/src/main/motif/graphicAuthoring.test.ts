import {describe,it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {bindGraphicAssets,validateSceneIntent} from './graphicAuthoring'
import type {Project} from '../state/model'

describe('subject-specific graphic authoring',()=>{
  it('binds approved stills without alias-prefix corruption or remote loading',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-graphic-'))
    try {
      const image=path.join(dir,'image.png');fs.writeFileSync(image,Buffer.from('89504e470d0a1a0a00000000','hex'))
      const project={media_pool:{one:{kind:'Image',path_abs:image}}} as unknown as Project
      const result=bindGraphicAssets('<img src="sclip-asset:a"><img src="sclip-asset:art">',{asset_bindings:[{name:'a',media_id:'one'},{name:'art',media_id:'one'}]},project)
      expect(result.html.match(/data:image\/png;base64,/g)).toHaveLength(2)
      expect(result.html).not.toContain('sclip-asset:')
      expect(result.assets[0]?.sha256).toBe(result.assets[1]?.sha256)
      expect(()=>bindGraphicAssets('<img src="sclip-asset:art">',{asset_bindings:[{name:'a',media_id:'one'}]},project)).toThrow('Unused')
      fs.writeFileSync(image,'not an image')
      expect(()=>bindGraphicAssets('sclip-asset:a',{asset_bindings:[{name:'a',media_id:'one'}]},project)).toThrow('verified')
    }finally{fs.rmSync(dir,{recursive:true,force:true})}
  })
  it('requires ordered actual beats without inventing a quality verdict',()=>{
    const intent={purpose:'Explain the supported relationship',visual_concept:'Two labelled objects and a connecting path',beats:[{at_s:0.5,description:'Reveal objects'},{at_s:2,description:'Connect them'}]}
    expect(validateSceneIntent(intent,4)).toEqual(intent)
    expect(()=>validateSceneIntent(intent,2)).toThrow('actual content times')
    expect(()=>validateSceneIntent({...intent,beats:[intent.beats[1],intent.beats[0]]},4)).toThrow('increasing')
    expect(()=>validateSceneIntent({...intent,quality_verdict:'excellent'},4)).toThrow('scene_intent')
  })
})
