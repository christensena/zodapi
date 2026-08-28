#!/usr/bin/env tsx
// Regenerates test/fixture/generated.ts and generated-dates.ts from the
// fixture contract's OpenAPI doc.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { generateContract } from '../src/index.js'
import { buildDoc } from '../test/fixture/build-doc.js'
import { routes } from '../test/fixture/contract.js'

const doc = buildDoc(routes)
for (const [file, options] of [
  ['generated.ts', undefined],
  ['generated-dates.ts', { dates: { datetime: true, date: true }, exportTypes: true }],
] as const) {
  const out = fileURLToPath(new URL(`../test/fixture/${file}`, import.meta.url))
  writeFileSync(out, generateContract(doc, options))
  console.log(`wrote ${out}`)
}
