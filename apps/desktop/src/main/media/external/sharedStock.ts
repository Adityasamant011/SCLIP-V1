type SharedRequest = (route: string) => Promise<unknown>
let shared: SharedRequest | null = null
export function configureSharedStock(request: SharedRequest | null): void { shared = request }
export function sharedStockAvailable(): boolean { return !!shared }
export async function stockSearchRequest(provider: 'pexels'|'pixabay', directUrl: string, init: RequestInit, ownKey: boolean): Promise<Response> {
  if (ownKey || !shared) return fetch(directUrl,init)
  const source = new URL(directUrl)
  const kind = source.pathname.includes('videos') ? 'video' : 'image'
  const q = source.searchParams.get(provider === 'pexels' ? 'query' : 'q') ?? ''
  const original = source.searchParams.get('orientation')
  const orientation = original === 'vertical' ? 'portrait' : original === 'horizontal' ? 'landscape' : original
  const params = new URLSearchParams({ q, ...(orientation ? { orientation } : {}) })
  return Response.json(await shared(`/v1/stock/${provider}/${kind}?${params}`))
}
