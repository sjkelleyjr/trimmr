import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./apps/web/src/test/setup.ts'],
    include: [
      'apps/web/src/**/*.test.ts',
      'apps/web/src/**/*.test.tsx',
      'packages/media-engine/src/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/shared/src/timeline.ts',
        'packages/editor-core/src/index.ts',
        'apps/web/src/hooks/useKeyboardShortcuts.ts',
        'apps/web/src/lib/renderProjectFrame.ts',
      ],
      exclude: [
        'apps/web/src/main.tsx',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
})
