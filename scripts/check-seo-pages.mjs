#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const webPublic = path.join(root, 'apps/web/public')

const pages = [
  { file: 'workflows/index.html', url: 'https://trimmr.xyz/workflows/index.html' },
  { file: 'workflows/trim-gif.html', url: 'https://trimmr.xyz/workflows/trim-gif.html' },
  { file: 'workflows/resize-gif.html', url: 'https://trimmr.xyz/workflows/resize-gif.html' },
  { file: 'workflows/add-text-to-gif.html', url: 'https://trimmr.xyz/workflows/add-text-to-gif.html' },
  { file: 'workflows/video-to-gif.html', url: 'https://trimmr.xyz/workflows/video-to-gif.html' },
  { file: 'workflows/gif-speed-changer.html', url: 'https://trimmr.xyz/workflows/gif-speed-changer.html' },
]

const sitemapPath = path.join(webPublic, 'sitemap.xml')
const robotsPath = path.join(webPublic, 'robots.txt')
const sitemap = readFileSync(sitemapPath, 'utf8')
const robots = readFileSync(robotsPath, 'utf8')

const failures = []

for (const page of pages) {
  const content = readFileSync(path.join(webPublic, page.file), 'utf8')

  if (!/<title>[\s\S]*<\/title>/i.test(content)) {
    failures.push(`${page.file}: missing <title>`)
  }
  if (!/name="description"/i.test(content)) {
    failures.push(`${page.file}: missing meta description`)
  }
  if (!new RegExp(`<link\\s+rel="canonical"\\s+href="${page.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(content)) {
    failures.push(`${page.file}: canonical does not match ${page.url}`)
  }
  if (!/property="og:title"/i.test(content)) {
    failures.push(`${page.file}: missing og:title`)
  }
  if (!/property="og:description"/i.test(content)) {
    failures.push(`${page.file}: missing og:description`)
  }
  if (!/name="twitter:card"/i.test(content)) {
    failures.push(`${page.file}: missing twitter:card`)
  }
  if (!/application\/ld\+json/i.test(content)) {
    failures.push(`${page.file}: missing JSON-LD block`)
  }
  if (!/href="\/(\?workflow=[a-z-]+)?"|href='\/(\?workflow=[a-z-]+)?'/i.test(content)) {
    failures.push(`${page.file}: missing link back to app root`)
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
