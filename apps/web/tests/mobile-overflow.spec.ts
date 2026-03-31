import { expect, test, type Page } from '@playwright/test'

const MOBILE_VIEWPORTS = [
  { width: 320, height: 568, name: 'iPhone SE' },
  { width: 375, height: 812, name: 'iPhone X' },
  { width: 390, height: 844, name: 'iPhone 12/13' },
] as const

const PAGES = [
  { path: '/', name: 'editor' },
  { path: '/workflows/index.html', name: 'workflows hub' },
  { path: '/workflows/trimmr-vs-kapwing.html', name: 'kapwing comparison page' },
  { path: '/workflows/trim-video.html', name: 'trim video workflow' },
  { path: '/workflows/video-to-gif.html', name: 'video to GIF workflow' },
  { path: '/workflows/video-meme.html', name: 'video meme workflow' },
] as const

async function horizontalOverflowPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const excess = (el: Element) => Math.max(0, el.scrollWidth - el.clientWidth)
    return Math.max(excess(document.documentElement), excess(document.body))
  })
}

for (const viewport of MOBILE_VIEWPORTS) {
  for (const { path, name } of PAGES) {
    test(`no horizontal overflow: ${name} @ ${viewport.name} (${viewport.width}×${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      // Two rAFs: let layout + fonts settle after first paint
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )

      const overflow = await horizontalOverflowPx(page)
      expect(overflow, `scrollWidth exceeded clientWidth by ${overflow}px`).toBeLessThanOrEqual(2)
    })
  }
}
