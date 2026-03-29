import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/**/*.{ts,tsx}',
        '../../packages/shared/src/**/*.ts',
        '../../packages/editor-core/src/**/*.ts',
        '../../packages/media-engine/src/**/*.ts',
        '../../packages/ui/src/**/*.tsx',
      ],
      exclude: ['src/main.tsx'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
})
