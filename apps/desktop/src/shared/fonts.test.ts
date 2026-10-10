import {it,expect} from 'vitest'
import {captionFontFallback} from './fonts'
it('preview/export use requested families then explicit bundled fallbacks, no generic serif',()=>{expect(captionFontFallback('Missing Family')).toEqual(['Missing Family','Liberation Sans','Noto Sans SC']);expect(captionFontFallback('Liberation Sans, Noto Sans SC')).toEqual(['Liberation Sans','Noto Sans SC'])})
