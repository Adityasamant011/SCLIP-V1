import { useEffect, useState } from 'react'
import { invoke } from '@/bridge/ipc'
import { Button } from '@/components/ui/button'
import { AppInput } from '../components/AppInput'
import type { CreatorStyleView } from '../../shared/creator-style'

/** Small inspectable controls; no automatic editing settings or creative defaults. */
export function CreatorStyleSection() {
  const [view, setView] = useState<CreatorStyleView | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [label, setLabel] = useState('')
  const [series, setSeries] = useState('')
  const [scope, setScope] = useState('creator')
  const [referenceId, setReferenceId] = useState('')
  const [relationship, setRelationship] = useState('own_finished')
  const [intent, setIntent] = useState('project')
  const [busy, setBusy] = useState(false)
  const update = async (args: Record<string, unknown>) => {
    setBusy(true); setError('')
    try { const next = await invoke<CreatorStyleView>('sclip_creator_style', args); setView(next); setSeries(next.binding.seriesId ?? '') }
    catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  useEffect(() => { void update({ action: 'view' }) }, [])
  const creator = view?.creators.find(c => c.id === view.binding.creatorId)
  return <section className="settings-section">
    <h3>Creator style memory</h3>
    <p>Stored locally. Your current request takes priority. Corrections are evidence; Hermes decides what they mean. Inferred preferences need your approval.</p>
    {error && <p role="alert">{error}</p>}
    {view && <>
      {view.captureWarning && <p role="alert">{view.captureWarning}</p>}
      {view.retention && <p>Recent observations admitted: {view.retention.admittedObservations}. Uninterpreted observations lost: {view.retention.evictedObservations} ({view.retention.evictedOperations} edits). Claimed observations compacted: {view.retention.compactedObservations}. No style conclusions are made during rotation.</p>}
      <label>Creator <select aria-label="Creator" disabled={busy} value={view.binding.creatorId} onChange={e => void update({ action: 'bind', creatorId: e.target.value })}>
        {view.creators.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select></label>
      <AppInput ariaLabel="New creator name" value={label} onValueChange={setLabel} placeholder="New creator name" />
      <Button disabled={busy || !label.trim()} onClick={() => void update({ action: 'create_creator', label })}>Add creator</Button>
      <label><input type="checkbox" checked={creator?.enabled ?? false} disabled={busy} onChange={e => void update({ action: 'enable', enabled: e.target.checked })} /> Learn and recall for this creator</label>
      <label><input type="checkbox" checked={view.binding.learningEnabled !== false} disabled={busy} onChange={e => void update({ action: 'project_enable', enabled: e.target.checked })} /> Use creator learning in this project</label>
      <AppInput ariaLabel="Series" value={series} onValueChange={setSeries} placeholder="Optional series for this project" />
      <Button disabled={busy} onClick={() => void update({ action: 'bind', creatorId: view.binding.creatorId, seriesId: series })}>Set project scope</Button>
      <p>Switching or changing memory closes existing Hermes terminals so old context cannot carry into a new creator. Open the terminal again to continue. Other creators use isolated terminal sessions.</p>
      <label>Remember for <select aria-label="Preference scope" value={scope} onChange={e => setScope(e.target.value)}><option value="creator">This creator</option><option value="series">This series</option><option value="project">This project only</option></select></label>
      <AppInput ariaLabel="Explicit style preference" value={text} onValueChange={setText} placeholder="An editing preference or project override" />
      <Button disabled={busy || !text.trim()} onClick={() => void update({ action: 'explicit', text, scope: { kind: scope } })}>Remember preference</Button>
      <Button disabled={busy} onClick={() => void update({ action: 'view' })}>Refresh</Button>
      <ul>{view.preferences.map(p => <li key={p.id}>
        <p>{p.hypothesis} — {p.status}, {p.approved ? 'creator-approved' : 'tentative'}, {p.scope.kind}, version {p.version}; {p.support.length} retained support samples, {p.counterexamples.length} counterexample samples. Counts are factual coverage, not certainty.</p>
        {p.applicability && <p>Applies when: {p.applicability}</p>}
        <Button disabled={busy} onClick={() => void update({ action: 'approve', id: p.id })}>Approve</Button>
        <Button disabled={busy || !text.trim()} onClick={() => void update({ action: 'revise', id: p.id, text })}>Replace with entered preference</Button>
        <Button disabled={busy} onClick={() => void update({ action: 'disable', id: p.id })}>Disable</Button>
        <Button disabled={busy} onClick={() => void update({ action: 'remove', id: p.id })}>Forget</Button>
      </li>)}</ul>
      <details><summary>Correction and reference evidence ({view.evidence.length})</summary>
        {view.evidence.slice(-30).map(e => <div key={e.id}><p>{e.kind} · {e.authority} · {e.projectId}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(e.data, null, 2)}</pre><Button disabled={busy} onClick={() => void update({ action: 'remove_evidence', id: e.id })}>Forget evidence</Button></div>)}
        {view.evidence.length > 30 && <p>Showing the latest 30. Older observations may rotate out. Retained capsule samples and loss counts are shown separately.</p>}
      </details>
      <details><summary>Compact provenance capsules ({view.capsules?.length ?? 0})</summary>
        {view.capsules?.map(c=><div key={c.id}><p>{c.role} · version {c.version} · at least {c.observations} distinct observations across {c.projects.length} recorded projects; {c.omittedSamples} sample details omitted.</p>{c.samples.map(e=><details key={e.id}><summary>{e.kind} · {e.authority} · {e.projectId}</summary><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(e.data,null,2)}</pre><Button disabled={busy} onClick={()=>void update({action:'remove_evidence',id:e.id})}>Forget evidence</Button></details>)}</div>)}
      </details>
      <details><summary>Register a supplied finished-video reference</summary>
        <p>Import it first. Cached local observations are retained; missing analysis stays unknown. Original edit decisions cannot be reconstructed.</p>
        <select aria-label="Imported reference video" value={referenceId} onChange={e => setReferenceId(e.target.value)}><option value="">Choose an imported video</option>{view.referenceMedia?.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <select aria-label="Reference relationship" value={relationship} onChange={e => setRelationship(e.target.value)}><option value="own_finished">My finished work</option><option value="external_inspiration">External inspiration</option></select>
        <select aria-label="Reference scope" value={intent} onChange={e => setIntent(e.target.value)}><option value="project">This project</option><option value="persistent">Future projects</option></select>
        <Button disabled={busy || !referenceId.trim()} onClick={() => void update({ action: 'reference', media_id: referenceId, relationship, intent })}>Remember reference evidence</Button>
      </details>
      <details><summary>Reset creator learning</summary><p>Clears this creator's style preferences, evidence and proposal associations. Projects and generic Hermes memory are preserved.</p><Button disabled={busy} onClick={() => void update({ action: 'reset' })}>Clear creator style memory</Button></details>
    </>}
  </section>
}
