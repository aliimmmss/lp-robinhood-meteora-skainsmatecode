import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only our workspaces; keep vitest out of vendored tool clones and the site.
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'rtk/**', 'skills/**', 'ponytail/**', 'i-have-adhd/**', 'ui-skills/**', 'web/**'],
  },
  resolve: {
    alias: {
      '@lp-mine/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@lp-mine/robinhood-univ3': fileURLToPath(new URL('./packages/robinhood-univ3/src/index.ts', import.meta.url)),
    },
  },
})
