#!/usr/bin/env node
/**
 * Copy ffmpeg-core.js + wasm into public/ffmpeg for Vite dev / Playwright.
 * Not committed (gitignored); production builds load core from CDN and omit these from dist.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')

function findCoreEsmDir() {
  const candidates = [
    path.resolve(webRoot, '../../node_modules/@ffmpeg/core/dist/esm'),
    path.resolve(webRoot, '../packages/media-engine/node_modules/@ffmpeg/core/dist/esm'),
  ]
  return candidates.find((p) => fs.existsSync(path.join(p, 'ffmpeg-core.wasm'))) ?? null
}

const srcDir = findCoreEsmDir()
if (!srcDir) {
  console.warn('copy-ffmpeg-core: @ffmpeg/core esm bundle not found; skip')
  process.exit(0)
}

const destDir = path.join(webRoot, 'public/ffmpeg')
const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm']

fs.mkdirSync(destDir, { recursive: true })
for (const f of files) {
  fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f))
}
