#!/usr/bin/env node
import { statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEO_PAGES } from './seo-config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outPath = path.join(root, 'apps/web/public/sitemap.xml')

function lastmodFromFile(absPath) {
  const { mtime } = statSync(absPath)
  return mtime.toISOString().slice(0, 10)
}

const entries = SEO_PAGES.map(({ relPath, loc }) => {
  const abs = path.join(root, relPath)
  const lastmod = lastmodFromFile(abs)
  return { loc, lastmod }
})

entries.sort((a, b) => a.loc.localeCompare(b.loc))

const body = entries
  .map(
    ({ loc, lastmod }) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
  </url>`,
  )
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`

writeFileSync(outPath, xml, 'utf8')
console.log(`Wrote ${entries.length} URLs to ${path.relative(root, outPath)}`)
