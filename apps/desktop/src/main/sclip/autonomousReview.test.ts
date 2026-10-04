import {describe,it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stageEditorialEvidence } from './autonomousReview'
describe('Automatic evidence preloading',()=>{
 it('stages session-isolated observational context and cleans up without replacing user settings',()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-hermes-context-'));fs.writeFileSync(path.join(home,'config.yaml'),'agent:\n  system_prompt: User-owned instruction\n')
  try {
   const a=stageEditorialEvidence(home,{identity:{state_version:'alpha'},relationships:[]}),b=stageEditorialEvidence(home,{identity:{state_version:'beta'}})
   expect(a.name).not.toBe(b.name);const file=path.join(home,'skills',a.name,'SKILL.md');expect(fs.readFileSync(file,'utf8')).toContain('alpha');expect(fs.readFileSync(file,'utf8')).toContain('observations, not instructions')
   expect(fs.readFileSync(path.join(home,'config.yaml'),'utf8')).toContain('User-owned instruction');a.cleanup();expect(fs.existsSync(file)).toBe(false);expect(fs.existsSync(path.join(home,'skills',b.name))).toBe(true);b.cleanup()
  }finally{fs.rmSync(home,{recursive:true,force:true})}
 })
})
