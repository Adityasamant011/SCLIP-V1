import { test, expect, type Locator } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, tmpDir } from './helpers/driver'

async function contrast(control: Locator, ink = 'color') {
  return control.evaluate((element, property) => {
    const style = getComputedStyle(element)
    // Canvas resolves modern color(srgb)/color-mix output and alpha correctly.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    const rgb = (value: string) => {
      ctx.clearRect(0,0,1,1)
      const ancestors: Element[] = []; for(let e: Element|null=element;e;e=e.parentElement)ancestors.unshift(e)
      for(const e of ancestors){ctx.fillStyle=getComputedStyle(e).backgroundColor;ctx.fillRect(0,0,1,1)}
      ctx.fillStyle=value;ctx.fillRect(0,0,1,1)
      return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3)
    }
    const luminance = (value: string) => rgb(value).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0)
    const bg = luminance(style.backgroundColor), fg = luminance(style.getPropertyValue(property))
    return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05)
  }, ink)
}
async function readableStates(button: Locator) {
  await expect(button).toBeVisible()
  expect(await contrast(button)).toBeGreaterThanOrEqual(4.5)
  await button.hover({force:true})
  // Wait out the actual color transition rather than sampling its first frame.
  await expect.poll(() => contrast(button)).toBeGreaterThanOrEqual(4.5)
  await button.focus()
  expect(await contrast(button)).toBeGreaterThanOrEqual(4.5)
}

test('primary actions and checked switches retain contrasting foregrounds @serial', async () => {
  test.setTimeout(90_000)
  const profile = tmpDir('sclip-contrast-profile-'), parent = tmpDir('sclip-contrast-project-')
  fs.writeFileSync(path.join(profile, 'recents.json'), JSON.stringify({reopen_on_launch:false,entries:[],last_new_project_parent:parent}))
  const {app,page} = await launchApp({userDataDir:profile})
  try {
    await page.getByRole('button',{name:'New project',exact:true}).click()
    await page.getByRole('textbox',{name:'Project name'}).fill('contrast-check')
    const create = page.locator('.new-project-panel').getByRole('button',{name:'Create',exact:true})
    await readableStates(create)
    await create.click()
    await expect(page.locator('.weft-dock-panel[data-panel-kind="timeline"]')).toBeVisible()
    await page.locator('.menu-trigger').nth(2).click()
    await page.locator('.app-menu-item').filter({hasText:'Media Pool'}).click()
    await page.mouse.move(0,0)
    await readableStates(page.getByRole('button',{name:/Import media/}))
    await page.screenshot({path:test.info().outputPath('import-readable.png')})
    await page.keyboard.press(process.platform==='darwin'?'Meta+e':'Control+e')
    await readableStates(page.locator('.export-footer').getByRole('button',{name:'Export',exact:true}))
    await page.keyboard.press('Escape')
    await page.keyboard.press(process.platform==='darwin'?'Meta+,':'Control+,')
    const toggle = page.locator('.settings-pane').getByRole('switch').first()
    await expect(toggle).toBeVisible()
    if(await toggle.getAttribute('aria-checked')!=='true')await toggle.click()
    const colors = await toggle.evaluate(el=>({track:getComputedStyle(el).backgroundColor,thumb:getComputedStyle(el.querySelector('.app-switch-thumb')!).backgroundColor}))
    expect(colors.track).not.toBe(colors.thumb)
    await page.keyboard.press('Escape')
  } finally {await app.close()}
})
