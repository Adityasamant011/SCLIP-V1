import { useEffect, useState } from 'react'
import { invoke } from '@/bridge/ipc'
import { Button } from '@/components/ui/button'
import { AppInput } from '../components/AppInput'
import { AppDialog } from '../components/AppDialog'
import type { CloudAccountView } from '../../shared/cloud-account'

const dollars = (micro: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micro / 1_000_000)
export function AccountSection({ showHeading = true }: { showHeading?: boolean } = {}) {
  const [account, setAccount] = useState<CloudAccountView | null>(null)
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [signup, setSignup] = useState(false); const [busy, setBusy] = useState(false)
  const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const refresh = async () => { const value = await invoke<CloudAccountView>('sclip_account_get'); setAccount(value ?? { configured: false, signedIn: false }); window.dispatchEvent(new Event('sclip-account-changed')) }
  useEffect(() => { void refresh().catch(() => setError('Could not load your account. Try refreshing.')) }, [])
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Account request failed.') }
    finally { setBusy(false) }
  }
  const login = async () => {
    const input = { email, password, signup }; setPassword('')
    const result = await invoke<{ confirmationRequired: boolean }>('sclip_account_sign_in', input)
    if (result.confirmationRequired) setNotice('Check your email to confirm your account, then sign in here.')
    await refresh()
  }
  return <section className="settings-section sclip-account">
    {showHeading && <h3>Account and billing</h3>}
    <p className="settings-blurb">Choose a paid plan before using the AI assistant. Your projects, manual editing and exports stay available when your plan ends.</p>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!account ? <p role="status">Loading account…</p> : !account.configured ?
      <p role="status">The account service is not available in this build. Subscriptions cannot be purchased yet.</p> : <>
      {!account.signedIn ? <form className="sclip-account-form" onSubmit={e => { e.preventDefault(); void run(login) }}>
        <label>Email<AppInput ariaLabel="Account email" autoComplete="email" value={email} onValueChange={setEmail} /></label>
        <label>Password<AppInput type="password" ariaLabel="Account password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onValueChange={setPassword} /></label>
        <p className="settings-toggle-hint">Use at least eight characters. New accounts require email confirmation.</p>
        <div className="settings-key-input-row">
          <Button type="submit" disabled={busy || !email || password.length < 8}>{signup ? 'Create account' : 'Sign in'}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setSignup(!signup)}>{signup ? 'I have an account' : 'Create an account'}</Button>
          <Button type="button" variant="secondary" disabled={busy || !email} onClick={() => void run(async () => { await invoke('sclip_account_reset_password',{ email }); setNotice('If an account exists, a password reset link will arrive by email.') })}>Forgot password</Button>
        </div>
      </form> : <>
        <p>{account.email} · {account.active ? account.plan === 'managed' ? 'Sclip AI' : 'Bring your AI' : 'No active plan'}</p>
        {account.paidUntil && account.active && <p className="settings-toggle-hint">Paid access until {new Date(account.paidUntil).toLocaleDateString()}. Manage renewal or cancellation in billing.</p>}
        {account.blocked && <p className="settings-error">Your billing needs review. Contact support before using AI.</p>}
        {account.credit && <p role="status">AI allowance available: <strong>{dollars(Math.max(0,account.credit.allowance-account.credit.spent-account.credit.reserved))}</strong>
          {account.credit.reserved > 0 && ` · ${dollars(account.credit.reserved)} reserved or awaiting usage confirmation`}</p>}
        <div className="settings-key-input-row">
          {account.plan !== 'none' && <Button disabled={busy} onClick={() => void run(async () => { await invoke('sclip_account_portal') })}>Manage billing</Button>}
          <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await invoke('sclip_account_sign_out'); await refresh() })}>Sign out</Button>
        </div>
      </>}
      <div className="sclip-account-plans">
        <div className="settings-card">
          <h4>Bring your AI · $5/month</h4>
          <p className="settings-blurb">Use any existing Hermes connection, your own API keys, available OpenRouter free models or local models. Provider charges and limits belong to your account.</p>
          <Button disabled={busy || !account.signedIn || !!account.active || !!account.blocked} onClick={() => void run(async () => { await invoke('sclip_account_checkout', { plan: 'byok' }) })}>Choose Bring your AI</Button>
        </div>
        <div className="settings-card">
          <h4>Sclip AI · $19/month</h4>
          <p className="settings-blurb">Includes $12 of managed AI usage per paid month with GLM 5.3 Flash. Allowance resets each billing period. No rollover or automatic overage charges. Your own connections remain available.</p>
          {!account.managedEnabled && <p className="settings-toggle-hint">Managed AI is not accepting purchases yet.</p>}
          <Button disabled={busy || !account.signedIn || !account.managedEnabled || !!account.active || !!account.blocked} onClick={() => void run(async () => { await invoke('sclip_account_checkout', { plan: 'managed' }) })}>Choose Sclip AI</Button>
        </div>
      </div>
    </>}
    <Button className="sclip-account-refresh" variant="secondary" disabled={busy} onClick={() => void run(refresh)}>Refresh account</Button>
    {account?.signedIn && <p className="settings-toggle-hint">After Checkout, return here and refresh. Payment is confirmed by the server before AI access starts.</p>}
  </section>
}

/** Same account surface on the dashboard and in the editor; no project required. */
export function AccountButton({ compact = false }: { compact?: boolean } = {}) {
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState<CloudAccountView | null>(null)
  useEffect(() => {
    const refresh = () => { void Promise.resolve().then(() => invoke<CloudAccountView>('sclip_account_get')).then(value => setAccount(value ?? null)).catch(() => {}) }
    refresh(); window.addEventListener('sclip-account-changed',refresh)
    const unlisten = window.api?.on?.('sclip:account_changed',refresh)
    return () => { window.removeEventListener('sclip-account-changed',refresh); unlisten?.() }
  }, [])
  return <>
    <Button className="sclip-account-button" size="sm" variant="secondary" aria-label={compact ? 'Account and billing' : undefined} onClick={() => setOpen(true)}>{account?.active ? account.plan === 'managed'
      ? `${compact ? '' : 'Sclip AI · '}${dollars(Math.max(0,(account.credit?.allowance ?? 0)-(account.credit?.spent ?? 0)-(account.credit?.reserved ?? 0)))}`
      : compact ? 'BYOK' : 'Bring your AI' : compact ? 'Account' : 'Account and plans'}</Button>
    {open && <AppDialog title="Account and billing" onClose={() => setOpen(false)} panelClassName="settings-panel sclip-account-dialog"><div className="settings-body"><AccountSection showHeading={false} /></div></AppDialog>}
  </>
}
