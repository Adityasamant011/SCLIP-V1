import {describe,it,expect,vi} from 'vitest'
import {textLayoutBox,textHorizontalBounds} from './textLayoutFacts'
import {defaultTransform} from '../state/mutations/add'
import {BackgroundReviewer} from './reviewer/backgroundReviewer'
import {blankProject} from '../state/model'
import {uuidV7Gen} from '../state/ids'
function text(id:string){const t=defaultTransform();t.position={mode:'XY',x:{mode:'Static',value:10},y:{mode:'Static',value:20}};t.anchor_x={mode:'Static',value:.5};t.anchor_y={mode:'Static',value:.5};return {id,label:null,t_start_us:0,t_end_us:1000000,enabled:true,locked:false,metadata:{},effects:[],params:{kind:'Text',content:'Synthetic label',font:{family:'__not_installed_synthetic__',size_px:48,weight:400,italic:false},transform:t,box_w:100,box_h:100}} as any}
describe('anchored text boxes and reviewer limitations',()=>{
 it('detects left/top as well as right/bottom without mistaking position for a margin',()=>{const l=text('a');expect(textLayoutBox(l)).toEqual({left:-40,right:60,top:-30,bottom:70});l.params.transform.position.x.value=190;expect(textLayoutBox(l)?.right).toBe(240);l.params.box_h=null;expect(textLayoutBox(l)).toBeNull();expect(textHorizontalBounds(l)).toEqual({left:140,right:240});l.params.transform.rotation_deg.value=10;expect(textLayoutBox(l)).toBeNull()})
 it('reports collisions, missing fonts and outside boxes as uninspected concerns, never repairs them',()=>{const p=blankProject(uuidV7Gen(),'synthetic'),c=p.compositions[p.root_id];c.width=100;c.height=100;c.duration_us=1000000;c.tracks[0].layers=[text('a'),text('b')];const before=JSON.stringify(p);const reviewer=new BackgroundReviewer({actor:{snapshot:()=>p,subscribe:vi.fn()}} as any);const r=reviewer.auditSynchronous();expect(r.issues.some(i=>i.id==='text_box_bounds_a')).toBe(true);expect(r.issues.some(i=>i.id==='text_collision_a_b')).toBe(true);expect(r.issues.some(i=>i.id==='text_font_unavailable_a')).toBe(true);expect(r.readiness).toBe('not_certified');expect(r.coverage).toContain('uninspected');expect(JSON.stringify(p)).toBe(before);reviewer.dispose()})
})
