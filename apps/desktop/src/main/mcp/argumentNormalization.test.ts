import {describe,it,expect} from 'vitest'
import {normalizeToolArguments as normalize} from './argumentNormalization'
import {ROUGH_CUT_PLAN_INPUT_SCHEMA} from '../sclip/roughCutPlan'
describe('model argument transport encodings',()=>{
 it('repairs nested cut plan numbers and XML array wrappers without changing decisions',()=>{
  const plan={version:'1',brief:{goal:'food',audience:'viewers',target_duration_us:'3000000',tone:{item:['warm']}},source_summary:'source',editorial_thesis:'food',sections:{item:{id:'a',purpose:'eating',clips:{item:{media_id:'source',source_start_us:'1000000',source_end_us:'4000000',action:'keep',reason:'eating'}}}},removed_ranges:{item:[]},uncertainties:{item:['name unreadable']}}
  const result=normalize(plan,ROUGH_CUT_PLAN_INPUT_SCHEMA)
  expect(result.version).toBe(1);expect(result.brief.target_duration_us).toBe(3000000)
  expect(result.sections[0].clips[0]).toMatchObject({source_start_us:1000000,source_end_us:4000000})
  expect(result.uncertainties).toEqual(['name unreadable']);expect(plan.version).toBe('1')
  expect(normalize(JSON.stringify(plan),ROUGH_CUT_PLAN_INPUT_SCHEMA)).toEqual(result)
 })
 it('rejects lossy encodings and supplies no missing defaults',()=>{
  expect(normalize('001',{type:'string'})).toBe('001')
  expect(normalize('12px',{type:'number'})).toBe('12px')
  expect(normalize('9007199254740993',{type:'integer'})).toBe('9007199254740993')
  expect(normalize('a,b',{type:'array',items:{type:'string'}})).toBe('a,b')
  expect(normalize({item:['x'],other:'y'},{type:'array'})).toEqual({item:['x'],other:'y'})
  expect(normalize('false',{type:['boolean','null']})).toBe(false)
  expect(normalize('220',{type:'integer'})).toBe(220)
  expect(normalize({}, {type:'object',properties:{required:{type:'number'}}})).toEqual({})
 })
})

it('repairs the real Hermes pre-dispatch singleton-list coercion before nested numeric validation',()=>{
 const schema={type:'object',properties:{clips:{type:'array',items:{type:'object',properties:{media_id:{type:'string'},source_start_us:{type:'number'},source_end_us:{type:'number'}}}}}}
 const raw={clips:[{item:[{media_id:'synthetic',source_start_us:'0',source_end_us:'3000000'},{media_id:'synthetic',source_start_us:'10000000',source_end_us:'13000000'}]}]}
 expect(normalize(raw,schema)).toEqual({clips:[{media_id:'synthetic',source_start_us:0,source_end_us:3000000},{media_id:'synthetic',source_start_us:10000000,source_end_us:13000000}]})
 expect(normalize([{item:'legitimate'}],{type:'array',items:{type:'object',properties:{item:{type:'string'}}}})).toEqual([{item:'legitimate'}])
})

it('repairs the observed empty XML props object without inventing strings or missing fields',()=>{expect(normalize({props:''},{type:'object',properties:{props:{type:'object'}}})).toEqual({props:{}});expect(normalize('',{type:['string','object']})).toBe('');expect(normalize(undefined,{type:'object'})).toBeUndefined()})
