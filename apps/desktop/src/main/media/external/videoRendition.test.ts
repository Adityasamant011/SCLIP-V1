import {it,expect} from 'vitest'
import {chooseVideoRendition} from './videoRendition'
it('does not select the first nominal HD proxy over a full HD source',()=>{const low={quality:'hd',width:360,height:640,link:'low'},full={width:1080,height:1920,link:'full'},huge={width:2160,height:3840,link:'huge'};expect(chooseVideoRendition([low,huge,full])).toEqual(full)})
it('falls back to the largest actual rendition without inventing asset dimensions',()=>{expect(chooseVideoRendition([{width:360,height:640,link:'small'},{width:720,height:1280,link:'medium'}]).link).toBe('medium');expect(chooseVideoRendition([])).toBeUndefined()})
