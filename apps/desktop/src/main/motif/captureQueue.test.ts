import {it,expect} from 'vitest'
import {CaptureQueue} from './captureQueue'
it('keeps one physical capture, prioritizes inspection and supersedes only queued frames of the same owner',async()=>{
 const queue=new CaptureQueue<string>(),order:string[]=[];let release!:()=>void
 const active=queue.run('active',async()=>{order.push('active');await new Promise<void>(r=>release=r);return 'active'})
 const background=queue.run('bg',async()=>{order.push('bg');return 'bg'},0)
 const old=queue.run('old',async()=>{throw Error('obsolete frame executed')},10,'sprite').catch(e=>e.message)
 const next=queue.run('new',async()=>{order.push('new');return 'new'},10,'sprite')
 const inspect=queue.run('inspect',async()=>{order.push('inspect');return 'inspect'},20)
 expect(order).toEqual(['active']);release();await Promise.all([active,background,next,inspect])
 expect(await old).toContain('CAPTURE_SUPERSEDED');expect(order).toEqual(['active','inspect','new','bg'])
})
