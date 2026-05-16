import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'omit-ffmpeg-core-from-pages-dist',
      apply: 'build',
      closeBundle() {
        const ffmpegDist = path.join(__dirname, 'dist/ffmpeg')
        for (const f of ['ffmpeg-core.wasm', 'ffmpeg-core.js']) {
          try {
            fs.unlinkSync(path.join(ffmpegDist, f))
          } catch {
            /* not present */
          }
        }
      },
    },
    // Serve static SEO workflow pages in dev mode instead of falling through to the SPA.
    // Without this, visiting /workflows/ or /workflows/trim-gif/ in dev would serve the
    // React shell (empty page + flicker). Production hosts like Cloudflare Pages already
    // serve these as static files, so this is dev-only.
    {
      name: 'serve-workflow-pages',
      configureServer(server) {
        const workflowsDir = path.join(__dirname, 'public/workflows')
        if (!fs.existsSync(workflowsDir)) return

        server.middlewares.use((req, res, next) => {
          const pathname = (req.url ?? '/').split('?')[0] // ignore query params

          // Only handle /workflows paths — don't interfere with the SPA root
          if (!pathname.startsWith('/workflows')) return next()

          // Direct index.html requests: /workflows/trim-gif/index.html
          if (pathname.endsWith('/index.html')) {
            const filePath = path.join(__dirname, 'public', pathname)
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              fs.createReadStream(filePath).pipe(res)
              return
            }
          }

          // Directory-style requests: /workflows/ or /workflows/trim-gif/
          if (pathname.endsWith('/')) {
            const dirName = pathname.replace(/^\/workflows\//, '').replace(/\/$/, '')
            if (dirName) {
              // /workflows/trim-gif/ → public/workflows/trim-gif/index.html
              const filePath = path.join(__dirname, 'public', 'workflows', dirName, 'index.html')
              if (fs.existsSync(filePath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8')
                fs.createReadStream(filePath).pipe(res)
                return
              }
            } else {
              // /workflows/ → public/workflows/index.html
              const filePath = path.join(__dirname, 'public', 'workflows', 'index.html')
              if (fs.existsSync(filePath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8')
                fs.createReadStream(filePath).pipe(res)
                return
              }
            }
          }

          next()
        })
      },
    },
  ],
})
