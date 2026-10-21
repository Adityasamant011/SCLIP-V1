import {it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {normalizeToolArguments} from './argumentNormalization'
import {SOURCE_RANGES_SCHEMA,mechanicalPlanFromRanges} from '../sclip/assemblyInput'
it.runIf(fs.existsSync('resources/hermes/arm64/python/bin/python3'))('repairs the actual pinned Hermes coercer output, not only the model-emitted JSON',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-native-coercion-'))
 try{
  const schema={type:'object',properties:{clips:SOURCE_RANGES_SCHEMA,dry_run:{type:'boolean'}}}
  const raw={clips:{item:[{media_id:'synthetic',source_start_us:'0',source_end_us:'3000000'},{media_id:'synthetic',source_start_us:'10000000',source_end_us:'13000000'}]},dry_run:'true'}
  const script='import sys,json\nsys.path.insert(0,sys.argv[1])\nimport model_tools\npayload=json.load(sys.stdin)\nmodel_tools.registry.get_schema=lambda name:{"parameters":payload["schema"]}\nprint(json.dumps(model_tools.coerce_tool_args("mcp__weftcut__apply_rough_cut_plan",payload["args"])))'
  const run=spawnSync(path.resolve('resources/hermes/arm64/python/bin/python3'),['-B','-c',script,path.resolve('resources/hermes/arm64/app')],{input:JSON.stringify({schema,args:raw}),encoding:'utf8',timeout:25000,env:{...process.env,HERMES_HOME:home,PYTHONDONTWRITEBYTECODE:'1'}})
  expect(run.status,run.stderr).toBe(0)
  const wire=JSON.parse(run.stdout.trim());expect(Array.isArray(wire.clips)).toBe(true);expect(wire.clips[0]).toHaveProperty('item')
  const normalized=normalizeToolArguments(wire,schema)
  expect(normalized.dry_run).toBe(true)
  expect(mechanicalPlanFromRanges(normalized.clips).brief.target_duration_us).toBe(6000000)
  expect(normalized.clips).toHaveLength(2)
 }finally{fs.rmSync(home,{recursive:true,force:true})}
},30000)
