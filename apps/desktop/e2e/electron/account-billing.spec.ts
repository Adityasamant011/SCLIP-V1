import { expect, test } from '@playwright/test'
import { launchApp, invokeCmd } from './helpers/driver'

test('account UI is honest before deployment and preserves the Hermes connections', async ({}, testInfo) => {
  const { app, page } = await launchApp({ env:{ SCLIP_CLOUD_URL:'' } })
  try {
    await page.getByRole('button',{ name:'Account and plans',exact:true }).click()
    await expect(page.getByText('Subscriptions cannot be purchased yet.',{ exact:false })).toBeVisible()
    await expect(page.getByRole('button',{ name:'Choose Sclip AI',exact:true })).toHaveCount(0)
    const state = await invokeCmd<{ configured:boolean }>(page,'sclip_account_get')
    expect(state.configured).toBe(false)
    await page.screenshot({ path:testInfo.outputPath('account-not-configured.png') })
    await page.keyboard.press('Escape')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
    await page.getByRole('tab',{ name:'Agent',exact:true }).click()
    for (const label of ['Sclip AI','OpenRouter','Anthropic (Claude)','OpenAI','DeepSeek','Groq','Google Gemini','Ollama (Local)','LM Studio (Local)','Custom Endpoint']) {
      await expect(page.locator('.sclip-provider-card-name').getByText(label,{ exact:true })).toBeVisible()
    }
    await page.screenshot({ path:testInfo.outputPath('preserved-hermes-providers.png') })
  } finally { await app.close() }
})
