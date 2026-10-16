import {it,expect} from 'vitest'
import {captionRevealRects} from './captionMask'
const layout={lines:['One two','three'],lineWidths:[70,50],maxLineWidth:70,lineHeight:20},bounds={x:-35,y:-20,width:70,height:40},measure=(s:string)=>s.length*10
it('keeps full-phrase positions while clipping each wrapped line',()=>{
 expect(captionRevealRects('One two three',3,layout,bounds,'center',1,measure)).toEqual([{x:-36,y:-21,width:32,height:22}])
 expect(captionRevealRects('One two three',10,layout,bounds,'center',1,measure)).toEqual([{x:-36,y:-21,width:72,height:22},{x:-26,y:-1,width:22,height:22}])
})
it('shows no glyphs before any word and abstains on unmatchable/RTL wrapping',()=>{
 expect(captionRevealRects('One two three',0,layout,bounds,'center',1,measure)).toEqual([])
 expect(captionRevealRects('different',3,layout,bounds,'center',1,measure)).toBeNull()
 expect(captionRevealRects('مرحبا',2,layout,bounds,'center',1,measure)).toBeNull()
})
