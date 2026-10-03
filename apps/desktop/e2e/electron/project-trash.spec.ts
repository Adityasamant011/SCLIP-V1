import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, newProject, tmpDir, invokeCmd } from './helpers/driver'

test('dashboard project management confirms Trash and can open another project afterward', async ({}, testInfo) => {
  const parent = tmpDir('dashboard-trash-e2e-')
  const { app, page } = await launchApp()
  const firstName = `disposable-trash-check-${Date.now()}`
  const secondName = 'preserved-project'
  const first = path.join(parent, firstName)
  const second = path.join(parent, secondName)
  const canvas = { width: 1080, height: 1920, fpsNum: 30, fpsDen: 1 }
  try {
    await newProject(page, { parentFolder: parent, name: secondName, canvas })
    await newProject(page, { parentFolder: parent, name: firstName, canvas })
    await page.locator('.menu-bar .menu-trigger').filter({ hasText: /^File$/ }).click()
    await page.getByRole('menuitem', { name: 'Save and Close', exact: false }).click()
    await expect(page.locator('.startup-titlebar')).toBeVisible()
    const row = page.locator('.startup-recent-list li').filter({ hasText: firstName })
    await row.getByRole('button', { name: 'Manage' }).click()
    await page.screenshot({ path: testInfo.outputPath('dashboard-manage.png') })
    await page.getByRole('menuitem', { name: 'Move project to Trash…', exact: true }).click()
    const confirmation = page.getByRole('dialog')
    await expect(confirmation).toContainText(first)
    await expect(confirmation).toContainText('contained media, cache and backups')
    await page.screenshot({ path: testInfo.outputPath('dashboard-trash-confirmation.png') })
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(fs.existsSync(path.join(first, 'project.json'))).toBe(true)
    await expect(row).toBeVisible()

    // Remove from list is intentionally not a filesystem deletion.
    await row.getByRole('button', { name: 'Manage' }).click()
    await page.getByRole('menuitem', { name: 'Remove from recent list', exact: true }).click()
    await expect(row).toHaveCount(0)
    expect(fs.existsSync(path.join(first, 'project.json'))).toBe(true)
    await invokeCmd(page, 'project_open', { path: first })
    // The screen stays on the dashboard for this direct IPC probe.
    await page.reload()
    await expect(page.locator('.startup-titlebar')).toBeVisible()
    const restoredRow = page.locator('.startup-recent-list li').filter({ hasText: firstName })
    await restoredRow.getByRole('button', { name: 'Manage' }).click()
    await page.getByRole('menuitem', { name: 'Move project to Trash…', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Move to Trash', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('was moved to Trash')
    expect(fs.existsSync(first)).toBe(false)
    expect(fs.existsSync(path.join(second, 'project.json'))).toBe(true)
    await expect(restoredRow).toHaveCount(0)
    await page.locator('.startup-recent-item').filter({ hasText: secondName }).click()
    await expect(page.locator('.startup-titlebar')).toHaveCount(0)
    expect(await invokeCmd(page, 'project_summary')).toMatchObject({ name: secondName })
  } finally {
    await app.close()
  }
})
