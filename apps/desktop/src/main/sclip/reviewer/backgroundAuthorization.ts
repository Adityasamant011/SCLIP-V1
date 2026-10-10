/** Separate paid-background opt-in. Public SCLIP_JEV_ENABLED is not authorization. */
export function backgroundJevAuthorized(env: NodeJS.ProcessEnv, credential: () => string | undefined): boolean {
  if (env.SCLIP_BACKGROUND_JEV_AUTHORIZED !== '1') return false
  try {
    const key = credential()
    return typeof key === 'string' && /^sk-or-[!-~]+$/.test(key) && !/\s/.test(key)
  } catch { return false }
}
