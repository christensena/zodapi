#!/usr/bin/env tsx
// Regenerates test/fixture/generated.ts from the fixture contract's OpenAPI doc.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { generateContract } from '../src/index.js'
import { buildDoc } from '../test/fixture/build-doc.js'
import { routes } from '../test/fixture/contract.js'

const out = fileURLToPath(new URL('../test/fixture/generated.ts', import.meta.url))
writeFileSync(out, generateContract(buildDoc(routes)))
console.log(`wrote ${out}`)
