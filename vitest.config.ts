import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    typecheck: {
      include: ['packages/*/test/**/*.test-d.ts'],
      // TypeScript 7's CLI cannot drive the typecheck runner yet, so the type
      // tests run against the TypeScript 6 compiler installed alongside it.
      checker: './node_modules/typescript-6/bin/tsc',
      tsconfig: './tsconfig.test.json',
    },
  },
})
