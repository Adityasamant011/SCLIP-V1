import { defineConfig } from 'vitest/config'
import base from './vitest.config.ts'
if (process.env.SCLIP_ALLOW_PROVIDER_TESTS !== '1') {
  throw new Error('Provider tests may spend money. Explicit SCLIP_ALLOW_PROVIDER_TESTS=1 is required.')
}
export default defineConfig({ ...base, test: { ...base.test,
  include: ['src/main/**/*.provider.test.ts'],
  exclude: ['**/node_modules/**'], maxWorkers: 1,
} })
