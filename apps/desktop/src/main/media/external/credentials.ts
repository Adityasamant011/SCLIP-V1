import type { ExternalMediaProviderName } from './types.js'
import { loadAllKeys } from '../../keys.js'

export function getProviderKey(provider: ExternalMediaProviderName): string | null {
  let stored: Record<string, string> = {}
  try {
    stored = loadAllKeys()
  } catch {
    // If running in an environment without Electron safeStorage, ignore
  }

  const findKey = (...names: string[]): string | null => {
    for (const name of names) {
      if (stored[name]?.trim()) return stored[name].trim()
      if (process.env[name]?.trim()) return process.env[name]!.trim()
    }
    return null
  }

  switch (provider) {
    case 'pexels':
      return findKey('PEXELS_API_KEY', 'pexels')
    case 'pixabay':
      return findKey('PIXABAY_API_KEY', 'pixabay')
    case 'youtube':
      return findKey('YOUTUBE_API_KEY', 'GOOGLE_API_KEY', 'youtube', 'google')
    case 'wikimedia':
    case 'openverse':
      return null // keyless
    default:
      return null
  }
}

export function isProviderConfigured(provider: ExternalMediaProviderName): boolean {
  if (provider === 'wikimedia' || provider === 'openverse') return true
  return Boolean(getProviderKey(provider))
}
