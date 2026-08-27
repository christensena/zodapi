import { defineConfig } from 'vitest/config'

// Type-level assertions live in packages/*/test/*.test-d.ts and are verified by
// each package's `tsc --noEmit` (vitest's typecheck runner does not support the
// TypeScript 7 compiler CLI yet).
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
