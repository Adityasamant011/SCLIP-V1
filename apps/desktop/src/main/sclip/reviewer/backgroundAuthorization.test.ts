import { describe, it, expect, vi } from 'vitest'
import { backgroundJevAuthorized } from './backgroundAuthorization'
import { BackgroundReviewer } from './backgroundReviewer'
import { currentCritique } from './currentCritique'

function fixture() {
  let listener = () => {}
  const unsubscribe = vi.fn()
  const project: any = { audio_roles:{},project_id:'offline',root_id:'root',settings:{},media_pool:{ m:{id:'m',metadata:{duration_us:10000000,video:{width:10,height:10}},transcript:{segments:[{words:[{text:'context',t_start_us:0,t_end_us:100000}]}]}} },compositions:{root:{id:'root',width:100,height:100,duration_us:2000000,tracks:[{id:'t',role:'ARoll',enabled:true,layers:[0,1].map(n=>({id:`l${n}`,enabled:true,t_start_us:n*1000000,t_end_us:(n+1)*1000000,params:{kind:'VideoClip',media:'m',src_in_us:0,src_out_us:1000000}}))}]}} }
  return { project, unsubscribe, notify:()=>listener(), host:{actor:{snapshot:()=>project,subscribe:(l:()=>void)=>{listener=l;return unsubscribe}}} as any }
}
describe('Background authorization and freshness',()=>{
  it.each([undefined,'0','true','invalid'])('public opt-in cannot authorize background inference (%s)',async flag=>{
    const f=fixture(),provider=vi.fn()
    const reviewer=new BackgroundReviewer(f.host,undefined,1,undefined,undefined,provider,{jev:()=>backgroundJevAuthorized({SCLIP_JEV_ENABLED:'1',SCLIP_BACKGROUND_JEV_AUTHORIZED:flag},()=> 'sk-or-offline')})
    await reviewer.runReview();f.notify();await new Promise(r=>setTimeout(r,5));await reviewer.runReview();reviewer.dispose()
    expect(provider).not.toHaveBeenCalled();expect(reviewer.auditSynchronous().availability).toBe('unavailable')
  })
  it.each(['', 'bad', 'sk-or-space key', 'sk-or-非ascii'])('rejects missing/invalid credential without provider requests',async key=>{
    const f=fixture(),provider=vi.fn(),reviewer=new BackgroundReviewer(f.host,undefined,1,undefined,undefined,provider,{jev:()=>backgroundJevAuthorized({SCLIP_BACKGROUND_JEV_AUTHORIZED:'1'},()=>key)})
    expect((await reviewer.runReview()).issues).toHaveLength(2);expect(provider).not.toHaveBeenCalled();reviewer.dispose()
  })
  it('allows authorized mock, preserves local findings on failure and cancels/discards late results',async()=>{
    const f=fixture();let resolve!: (v:any)=>void
    const provider=vi.fn((_state: unknown, _questions: unknown, _signal?: AbortSignal)=>new Promise<any>(r=>{resolve=r}))
    const reviewer=new BackgroundReviewer(f.host,undefined,1,undefined,undefined,provider,{jev:()=>true})
    const pending=reviewer.runReview();expect(provider).toHaveBeenCalledOnce()
    const signal=provider.mock.calls[0]![2] as AbortSignal
    f.project.compositions.root.tracks[0].layers[0].params.src_in_us=100;f.notify()
    expect(signal.aborted).toBe(true)
    resolve({answers:{broken_0:.99,whiplash_0:.99}});const result=await pending
    expect(result.issues.every(i=>i.evidence_class==='DETERMINISTIC_MEASUREMENT')).toBe(true)
    const old=result;f.project.compositions.root.width=200;f.notify()
    expect(currentCritique(f.project,()=>old).availability).toBe('stale_or_unavailable')
    expect(currentCritique(f.project,()=>old).issues).toEqual([])
    reviewer.dispose();expect(f.unsubscribe).toHaveBeenCalledOnce()
    await reviewer.runReview();expect(provider).toHaveBeenCalledOnce()
  })
  it('ordinary mutation scheduling never invokes optional perception/provider, even opted in',async()=>{
    const f=fixture(),provider=vi.fn(),perception={analyzeAudio:vi.fn()} as any
    const reviewer=new BackgroundReviewer(f.host,perception,1,undefined,undefined,provider,{jev:()=>true,localPerception:()=>true})
    f.notify();f.notify();await new Promise(r=>setTimeout(r,5))
    expect(provider).not.toHaveBeenCalled();expect(perception.analyzeAudio).not.toHaveBeenCalled()
    expect(reviewer.getSummary().issues).toHaveLength(2);reviewer.dispose()
  })
})

it('bounds a stuck optional pass, then admits later clean current review without late publication',async()=>{
 const f=fixture(),provider=vi.fn(()=>new Promise<any>(()=>{}))
 const reviewer=new BackgroundReviewer(f.host,undefined,1,undefined,undefined,provider,{jev:()=>true,deadlineMs:5})
 const result=await reviewer.runReview()
 expect(result.optional_observations).toBe('timed_out');expect(result.issues).toHaveLength(2)
 reviewer.dispose();expect(f.unsubscribe).toHaveBeenCalledOnce()
})
it('overlapping optional passes cannot publish the earlier same-state result; duplicates collapse by identity',async()=>{
 const f=fixture(),resolvers:Array<(r:any)=>void>=[],provider=vi.fn(()=>new Promise<any>(r=>resolvers.push(r)))
 const reviewer=new BackgroundReviewer(f.host,undefined,1,undefined,undefined,provider,{jev:()=>true})
 const first=reviewer.runReview(),second=reviewer.runReview()
 resolvers[1]!({answers:{broken_0:.1,whiplash_0:.1}});await second
 resolvers[0]!({answers:{broken_0:.99,whiplash_0:.99}});await first
 expect(reviewer.getSummary().issues).toHaveLength(2)
 f.project.compositions.root.tracks[0].layers.push(f.project.compositions.root.tracks[0].layers[0]);f.notify()
 expect(reviewer.getSummary().issues).toHaveLength(2)
 reviewer.dispose()
 const restarted=new BackgroundReviewer(f.host)
 expect(restarted.getSummary().state_version).toBe(reviewer.getSummary().state_version)
 restarted.dispose()
})
