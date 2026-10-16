import {describe,it,expect} from 'vitest'
import {validateManifest,type Manifest} from './catalog'
import lower from './builtin/lower-third/manifest.json'
import text from './builtin/text-fx/manifest.json'
import countdown from './builtin/countdown/manifest.json'
const fixture=(spec:unknown)=>({...lower,props_schema:{value:spec}} as unknown as Manifest)
describe('external manifest property shape',()=>{
 it('rejects string enum options instead of accepting substring membership',()=>expect(()=>validateManifest(fixture({type:'enum',default:'left',options:'left,right'}))).toThrow(/options/))
 it('rejects coerced numeric bounds',()=>expect(()=>validateManifest(fixture({type:'number',default:10,min:'0',max:'100'}))).toThrow(/bounds/))
 it('rejects coerced string length limits',()=>expect(()=>validateManifest(fixture({type:'string',default:'label',max_length:'100'}))).toThrow(/max_length/))
 it('preserves valid builtins and existing absent/null optional bounds',()=>{
  for(const m of [lower,text,countdown])expect(()=>validateManifest(m as unknown as Manifest)).not.toThrow()
  expect(()=>validateManifest(fixture({type:'number',default:10,min:null,max:null}))).not.toThrow()
  expect(()=>validateManifest(fixture({type:'enum',default:'left',options:['left','right']}))).not.toThrow()
 })
})
