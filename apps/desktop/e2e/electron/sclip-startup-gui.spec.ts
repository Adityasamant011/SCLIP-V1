import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, summary, tmpDir } from './helpers/driver'

test('the normal project picker creates a workspace and opens the editor', async () => {
  test.setTimeout(90_000)
  const userDataDir = tmpDir('sclip-startup-gui-profile-')
  const parentFolder = tmpDir('sclip-startup-gui-projects-')
  fs.writeFileSync(path.join(userDataDir, 'recents.json'), JSON.stringify({
    reopen_on_launch: false,
    entries: [],
    last_new_project_parent: parentFolder,
  }))

  const { app, page } = await launchApp({ userDataDir, env: { SCLIP_USER_DATA_DIR: userDataDir } })
  try {
    await expect(page.getByText('Pick a project to open, or create a new one.')).toBeVisible()
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByRole('textbox', { name: 'Project name' }).fill('gui-created-project')
    await expect(page.locator('.new-project-panel')).toContainText(parentFolder)
    await page.locator('.new-project-panel').getByRole('button', { name: 'Create' }).click()

    await expect(page.locator('.weft-dock-panel[data-panel-kind="timeline"]')).toBeVisible()
    await expect(page.locator('.new-project-panel')).toHaveCount(0)
    expect(fs.existsSync(path.join(parentFolder, 'gui-created-project', 'project.json'))).toBe(true)
    const project = await summary(page)
    expect(project.name).toBe('gui-created-project')
  } finally {
    await app.close()
  }
})
