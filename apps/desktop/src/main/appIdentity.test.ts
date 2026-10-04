import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DESKTOP_PRODUCT_NAME, WINDOWS_APP_USER_MODEL_ID } from './appIdentity'

// The runtime AUMID (what the main process passes to app.setAppUserModelId) and
// the installer's shortcut stamp (electron-builder.yml `appId`) are two separate
// literals that MUST stay identical — a drift silently breaks the Windows taskbar
// icon + window grouping. This pins them together at build time.
describe('WINDOWS_APP_USER_MODEL_ID', () => {
  it('equals appId in electron-builder.yml', () => {
    const ymlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'electron-builder.yml')
    const yml = readFileSync(ymlPath, 'utf8')
    const match = yml.match(/^appId:\s*(\S+)\s*$/m)
    expect(match, 'appId: line not found in electron-builder.yml').not.toBeNull()
    expect(match![1]).toBe(WINDOWS_APP_USER_MODEL_ID)
  })
})

describe('DESKTOP_PRODUCT_NAME', () => {
  it('matches the packaged application name used by macOS safeStorage', () => {
    const desktopDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
    const yml = readFileSync(path.join(desktopDir, 'electron-builder.yml'), 'utf8')
    const packageJson = JSON.parse(readFileSync(path.join(desktopDir, 'package.json'), 'utf8')) as { productName: string }
    expect(yml.match(/^productName:\s*(\S+)\s*$/m)?.[1]).toBe(DESKTOP_PRODUCT_NAME)
    expect(packageJson.productName).toBe(DESKTOP_PRODUCT_NAME)
  })
})
