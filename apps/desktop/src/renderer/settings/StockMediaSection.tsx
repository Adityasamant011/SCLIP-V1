import { useEffect, useState } from 'react'
import { invoke } from '@/bridge/ipc'
import { Button } from '@/components/ui/button'
import { AppInput } from '../components/AppInput'
import { settingsSetApiKey, settingsClearApiKey } from '../ipc'

type StockStatus = { sharedAvailable?: boolean; providers: Array<{ provider: 'pexels' | 'pixabay'; configured: boolean }> }

/** Provider keys are write-only here; status never returns credentials. */
export function StockMediaSection() {
  const [status, setStatus] = useState<StockStatus | null>(null)
  const [values, setValues] = useState({ pexels: '', pixabay: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => setStatus(await invoke<StockStatus>('stock_media_status'))
  useEffect(() => { void refresh().catch(e => setError(String(e))) }, [])
  const save = async (provider: 'pexels' | 'pixabay', remove = false) => {
    setBusy(true); setError('')
    try {
      if (remove) await settingsClearApiKey(`${provider.toUpperCase()}_API_KEY`)
      else await settingsSetApiKey(`${provider.toUpperCase()}_API_KEY`, values[provider].trim())
      setValues(v => ({ ...v, [provider]: '' }))
      await refresh()
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  return <section className="settings-section">
    <h3>Stock images and video</h3>
    <p className="settings-blurb">Sclip Agent can search Pexels and Pixabay stock, import an asset and use it as B-roll when you request it. Search terms go to the selected provider. Stock searches do not consume your AI allowance; the assistant’s model calls still use your chosen AI connection.</p>
    <p role="status">{status?.sharedAvailable ? 'Shared stock access is active with fair usage limits. A personal key takes priority when saved.' : 'Shared stock access is not available. You can connect your own free stock API keys below.'}</p>
    <p className="settings-blurb">Keys are stored using your operating system’s encrypted key storage. Provider quotas and usage terms apply. Source and license details stay with imported assets.</p>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {(['pexels', 'pixabay'] as const).map(provider => {
      const label = provider === 'pexels' ? 'Pexels' : 'Pixabay'
      const configured = status?.providers.find(p => p.provider === provider)?.configured
      return <div key={provider} className="settings-section">
        <h4>{label}</h4>
        <p role="status">{status ? configured ? 'Key saved' : 'No key configured' : 'Checking…'}</p>
        <AppInput type="password" ariaLabel={`${label} API key`} value={values[provider]} autoComplete="off"
          onValueChange={value => setValues(v => ({ ...v, [provider]: value }))} />
        <Button disabled={busy || !values[provider].trim()} onClick={() => void save(provider)}>Save {label} key</Button>
        <Button variant="secondary" disabled={busy || !configured} onClick={() => void save(provider, true)}>Remove {label} key</Button>
        <p className="settings-toggle-hint">Optional personal key: {provider === 'pexels' ? 'pexels.com/api' : 'pixabay.com/api/docs'}. Provider quotas apply. Shared credentials are managed securely by Sclip when shared access is enabled.</p>
      </div>
    })}
  </section>
}
