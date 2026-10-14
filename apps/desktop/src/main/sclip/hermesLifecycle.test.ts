import {it,expect} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {stageHermesLifecycle,validTurnEvent,HERMES_LIFECYCLE_PLUGIN} from './hermesLifecycle'
import {parse} from 'yaml'
it('stages hooks only and preserves explicit plugins and inference settings',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-hook-config-'))
 try{fs.writeFileSync(path.join(home,'config.yaml'),'plugins:\n  enabled: [custom-local]\n  disabled: [custom-disabled]\ncompression:\n  enabled: false\nauxiliary:\n  title_generation:\n    enabled: true\n')
 expect(stageHermesLifecycle(home)).toBe(true);expect(stageHermesLifecycle(home)).toBe(true)
 const c=parse(fs.readFileSync(path.join(home,'config.yaml'),'utf8'));expect(c.plugins.enabled).toEqual(['custom-local','sclip-completion']);expect(c.plugins.disabled).toEqual(['custom-disabled']);expect(c.compression.enabled).toBe(false);expect(c.auxiliary.title_generation.enabled).toBe(true)
 expect(HERMES_LIFECYCLE_PLUGIN).toContain('ctx.register_hook("on_session_end"');expect(HERMES_LIFECYCLE_PLUGIN).not.toContain('register_tool');expect(HERMES_LIFECYCLE_PLUGIN).toContain('ProxyHandler({})')
 }finally{fs.rmSync(home,{recursive:true,force:true})}
})
it('honors explicit observer opt-out; never enables unrelated plugins',()=>{const home=fs.mkdtempSync(path.join(os.tmpdir(),'sclip-hook-disabled-'));try{fs.writeFileSync(path.join(home,'config.yaml'),'plugins:\n  disabled: [sclip-completion]\n');expect(stageHermesLifecycle(home)).toBe(false);expect(parse(fs.readFileSync(path.join(home,'config.yaml'),'utf8')).plugins.enabled).toBeUndefined()}finally{fs.rmSync(home,{recursive:true,force:true})}})
it('refuses malformed/oversized lifecycle metadata and preserves unknown background status',()=>{expect(validTurnEvent({kind:'end',turn_id:'turn',completed:true,background_jobs_pending:null})).toBe(true);expect(validTurnEvent({kind:'end',turn_id:'turn',completed:'yes'})).toBe(false);expect(validTurnEvent({kind:'start',turn_id:'turn',user_message:'x'.repeat(65537)})).toBe(false);expect(validTurnEvent({kind:'end',turn_id:''})).toBe(false)})
