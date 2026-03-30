import { expect, test } from '@playwright/test'

test('renders the editor shell', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /^trimmr$/i })).toBeVisible()
  await expect(page.getByText('Choose a file')).toBeVisible()
  await expect(
    page.getByRole('link', { name: /guides for how to trim, resize, convert to gif, and more/i }),
  ).toBeVisible()
})
