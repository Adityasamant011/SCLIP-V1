import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
describe('routine test provider isolation', () => {
  it('always excludes real provider suites, including when opt-in leaks into CI', () => {
    expect(fs.readFileSync('vitest.config.ts','utf8')).toContain("'**/*.provider.test.ts'")
    for (const name of ['realHermesValidation','hermesVisionInspect']) {
      expect(fs.existsSync(`src/main/sclip/${name}.test.ts`)).toBe(false)
      expect(fs.readFileSync(`src/main/sclip/${name}.provider.test.ts`, 'utf8')).toContain("SCLIP_ALLOW_PROVIDER_TESTS !== '1'")
    }
  })
})
