import { afterEach, expect, it, vi } from 'vitest'
import { configureSharedStock, stockSearchRequest } from './sharedStock'
afterEach(()=>{ configureSharedStock(null);vi.unstubAllGlobals() })
it('keeps personal stock requests direct, without sending a personal key to the shared service',async()=>{
  const shared=vi.fn();configureSharedStock(shared)
  const direct=vi.fn().mockResolvedValue(Response.json({ photos:[] }));vi.stubGlobal('fetch',direct)
  await stockSearchRequest('pexels','https://api.pexels.com/v1/search?query=coffee',{ headers:{ Authorization:'personal-key' } },true)
  expect(direct).toHaveBeenCalledOnce();expect(shared).not.toHaveBeenCalled()
})
it('normalizes shared video search and removes direct provider keys/URLs from the gateway request',async()=>{
  const shared=vi.fn().mockResolvedValue({ hits:[] });configureSharedStock(shared)
  const direct=vi.fn();vi.stubGlobal('fetch',direct)
  await stockSearchRequest('pixabay','https://pixabay.com/api/videos/?key=unused&q=coffee&orientation=vertical',{ },false)
  expect(shared).toHaveBeenCalledWith('/v1/stock/pixabay/video?q=coffee&orientation=portrait')
  expect(direct).not.toHaveBeenCalled()
})
