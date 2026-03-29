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
  ],
})
