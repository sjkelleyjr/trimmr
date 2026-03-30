#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const webPublic = path.join(root, 'apps/web/public')

const OG_IMAGE = 'https://trimmr.xyz/og-image.png'

const workflowFiles = [
  { file: 'workflows/index.html', url: 'https://trimmr.xyz/workflows/index.html' },
  { file: 'workflows/trim-gif.html', url: 'https://trimmr.xyz/workflows/trim-gif.html' },
  { file: 'workflows/resize-gif.html', url: 'https://trimmr.xyz/workflows/resize-gif.html' },
  { file: 'workflows/add-text-to-gif.html', url: 'https://trimmr.xyz/workflows/add-text-to-gif.html' },
  { file: 'workflows/video-to-gif.html', url: 'https://trimmr.xyz/workflows/video-to-gif.html' },
  { file: 'workflows/gif-speed-changer.html', url: 'https://trimmr.xyz/workflows/gif-speed-changer.html' },
]

const pages = [
  {
    path: path.join(root, 'apps/web/index.html'),
    label: 'apps/web/index.html',
    url: 'https://trimmr.xyz/',
    requireAppLink: false,
  },
  ...workflowFiles.map(({ file, url }) => ({
    path: path.join(webPublic, file),
    label: file,
    url,
    requireAppLink: true,
  })),
]

const sitemapPath = path.join(webPublic, 'sitemap.xml')
const robotsPath = path.join(webPublic, 'robots.txt')
const sitemap = readFileSync(sitemapPath, 'utf8')
const robots = readFileSync(robotsPath, 'utf8')

const failures = []

for (const page of pages) {
  const content = readFileSync(page.path, 'utf8')

  if (!/<title>[\s\S]*<\/title>/i.test(content)) {
    failures.push(`${page.label}: missing <title>`)
  }
  if (!/name="description"/i.test(content)) {
    failures.push(`${page.label}: missing meta description`)
  }
  if (!/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\/favicon\.svg"/i.test(content)) {
    failures.push(`${page.label}: missing favicon link to /favicon.svg`)
  }
  if (!new RegExp(`<link\\s+rel="canonical"\\s+href="${page.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(content)) {
    failures.push(`${page.label}: canonical does not match ${page.url}`)
  }
  if (!/property="og:title"/i.test(content)) {
    failures.push(`${page.label}: missing og:title`)
  }
  if (!/property="og:description"/i.test(content)) {
    failures.push(`${page.label}: missing og:description`)
  }
  if (!/name="twitter:card"/i.test(content)) {
    failures.push(`${page.label}: missing twitter:card`)
  }
  if (!new RegExp(`property="og:image"\\s+content="${OG_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(content)) {
    failures.push(`${page.label}: missing or wrong og:image (expected ${OG_IMAGE})`)
  }
  if (!new RegExp(`name="twitter:image"\\s+content="${OG_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(content)) {
    failures.push(`${page.label}: missing or wrong twitter:image (expected ${OG_IMAGE})`)
  }
  if (!/application\/ld\+json/i.test(content)) {
    failures.push(`${page.label}: missing JSON-LD block`)
  }
  if (page.requireAppLink && !/href="\/(\?workflow=[a-z-]+)?"|href='\/(\?workflow=[a-z-]+)?'/i.test(content)) {
    failures.push(`${page.label}: missing link back to app root`)
  }

  if (!sitemap.includes(`<loc>${page.url}</loc>`)) {
    failures.push(`sitemap.xml: missing ${page.url}`)
  }
}

if (!/Sitemap:\s*https:\/\/trimmr\.xyz\/sitemap\.xml/i.test(robots)) {
  failures.push('robots.txt: missing sitemap pointer')
}

if (failures.length > 0) {
  console.error('SEO checks failed:\n')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`SEO checks passed for ${pages.length} pages.`)
