import { expect, test } from '@playwright/test'

test('renders the editor shell', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: /trimmr.*edit video in seconds for free/i }),
  ).toBeVisible()
  await expect(page.getByText('Choose a file')).toBeVisible()
  await expect(page.getByRole('link', { name: 'workflows' })).toBeVisible()
})
