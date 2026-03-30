#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEO_PAGES } from './seo-config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const webPublic = path.join(root, 'apps/web/public')

const OG_IMAGE = 'https://trimmr.xyz/og-image.png'

const pages = SEO_PAGES.map((entry) => ({
  ...entry,
  path: path.join(root, entry.relPath),
  label: entry.relPath,
}))

const sitemapPath = path.join(webPublic, 'sitemap.xml')
const robotsPath = path.join(webPublic, 'robots.txt')
const sitemap = readFileSync(sitemapPath, 'utf8')
const robots = readFileSync(robotsPath, 'utf8')

const failures = []

function expectedLastmod(absPath) {
  return statSync(absPath).mtime.toISOString().slice(0, 10)
}

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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
  if (!new RegExp(`<link\\s+rel="canonical"\\s+href="${escapeForRegex(page.loc)}"`).test(content)) {
    failures.push(`${page.label}: canonical does not match ${page.loc}`)
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
  if (!new RegExp(`property="og:image"\\s+content="${escapeForRegex(OG_IMAGE)}"`).test(content)) {
    failures.push(`${page.label}: missing or wrong og:image (expected ${OG_IMAGE})`)
  }
  if (!new RegExp(`name="twitter:image"\\s+content="${escapeForRegex(OG_IMAGE)}"`).test(content)) {
    failures.push(`${page.label}: missing or wrong twitter:image (expected ${OG_IMAGE})`)
  }
  if (!/application\/ld\+json/i.test(content)) {
    failures.push(`${page.label}: missing JSON-LD block`)
  }
  if (page.requireAppLink && !/href="\/(\?workflow=[a-z-]+)?"|href='\/(\?workflow=[a-z-]+)?'/i.test(content)) {
    failures.push(`${page.label}: missing link back to app root`)
  }

  if (page.workflowGuide) {
    if (!/href="\/workflows\/index\.html"/i.test(content)) {
      failures.push(`${page.label}: workflow guide should link to /workflows/index.html (hub)`)
    }
  }

  if (!sitemap.includes(`<loc>${page.loc}</loc>`)) {
    failures.push(`sitemap.xml: missing <loc>${page.loc}</loc>`)
  }

  const locBlock = new RegExp(
    `<loc>${escapeForRegex(page.loc)}</loc>\\s*<lastmod>(\\d{4}-\\d{2}-\\d{2})</lastmod>`,
    'i',
  )
  const match = sitemap.match(locBlock)
  if (!match) {
    failures.push(`sitemap.xml: missing <lastmod> after <loc>${page.loc}</loc>`)
  } else {
    const expected = expectedLastmod(page.path)
    if (match[1] !== expected) {
      failures.push(
        `sitemap.xml: lastmod for ${page.loc} is ${match[1]}, expected ${expected} (run npm run seo:sitemap)`,
      )
    }
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

console.log(`SEO checks passed for ${pages.length} pages (sitemap lastmod matches files).`)
