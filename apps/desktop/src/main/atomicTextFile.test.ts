import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeTextAtomically } from './atomicTextFile'

describe('writeTextAtomically', () => {
  let dir: string | undefined
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); dir = undefined })

  it('replaces a file without exposing a partial target and leaves no temp file', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-atomic-text-'))
    const target = path.join(dir, 'project.json')
    fs.writeFileSync(target, 'old')
    writeTextAtomically(fs, target, 'complete-new-content')
    expect(fs.readFileSync(target, 'utf8')).toBe('complete-new-content')
    expect(fs.readdirSync(dir)).toEqual(['project.json'])
  })

  it('keeps the prior target and removes the temporary file when rename fails', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-atomic-text-'))
    const target = path.join(dir, 'project.json')
    fs.writeFileSync(target, 'prior-good-content')
    const io = {
      ...fs,
      writeFileSync: fs.writeFileSync.bind(fs),
      renameSync: vi.fn(() => { throw new Error('synthetic rename failure') }),
      rmSync: fs.rmSync.bind(fs),
    }
    expect(() => writeTextAtomically(io, target, 'new-content')).toThrow('synthetic rename failure')
    expect(fs.readFileSync(target, 'utf8')).toBe('prior-good-content')
    expect(fs.readdirSync(dir)).toEqual(['project.json'])
  })

  it('does not delete an existing target when writing the temp file fails', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sclip-atomic-text-'))
    const target = path.join(dir, 'project.json')
    fs.writeFileSync(target, 'prior-good-content')
    const io = {
      ...fs,
      writeFileSync: vi.fn(() => { throw new Error('synthetic write failure') }),
      renameSync: fs.renameSync.bind(fs),
      rmSync: fs.rmSync.bind(fs),
    }
    expect(() => writeTextAtomically(io, target, 'new-content')).toThrow('synthetic write failure')
    expect(fs.readFileSync(target, 'utf8')).toBe('prior-good-content')
    expect(fs.readdirSync(dir)).toEqual(['project.json'])
  })
})


describe('atomic write durability and ownership', () => {
  it('syncs before replacement and preserves the old bytes on sync failure', () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atomic-sync-'))
    try {
      const target=path.join(dir,'project.json');fs.writeFileSync(target,'old')
      expect(()=>writeTextAtomically({...fs,fsyncSync:()=>{throw Error('sync failed')}},target,'new')).toThrow('sync failed')
      expect(fs.readFileSync(target,'utf8')).toBe('old');expect(fs.readdirSync(dir)).toEqual(['project.json'])
    }finally{fs.rmSync(dir,{recursive:true,force:true})}
  })
  it('never removes a temp file it failed to open exclusively', () => {
    const remove=vi.fn()
    expect(()=>writeTextAtomically({...fs,statSync:()=>({mode:0o600}) as fs.Stats,openSync:()=>{throw Error('exclusive open failed')},rmSync:remove},'/unused/project.json','new')).toThrow('exclusive open failed')
    expect(remove).not.toHaveBeenCalled()
  })
  it.skipIf(process.platform==='win32')('reports a post-rename durability failure without falsely claiming rollback', () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atomic-directory-sync-'))
    try{
      const target=path.join(dir,'project.json');fs.writeFileSync(target,'old');let syncs=0
      const io={...fs,fsyncSync:(fd:number)=>{if(++syncs===2)throw Error('directory sync failed');fs.fsyncSync(fd)}}
      let error:unknown;try{writeTextAtomically(io,target,'new')}catch(e){error=e}
      expect(error).toMatchObject({destinationReplaced:true});expect(fs.readFileSync(target,'utf8')).toBe('new')
      expect(fs.readdirSync(dir)).toEqual(['project.json'])
    }finally{fs.rmSync(dir,{recursive:true,force:true})}
  })
})
