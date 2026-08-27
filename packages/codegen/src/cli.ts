#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

import { generateContract } from './generate.js'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const args = process.argv.slice(2)
let input: string | undefined
let output: string | undefined
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '-o' || arg === '--output') {
    output = args[++i] ?? fail(`${arg} requires a value`)
  } else if (arg === '-h' || arg === '--help') {
    console.log('Usage: zodapi-codegen <openapi.json> [-o contract.ts]')
    process.exit(0)
  } else if (input === undefined) {
    input = arg
  } else {
    fail(`unexpected argument: ${arg}`)
  }
}
if (input === undefined) fail('Usage: zodapi-codegen <openapi.json> [-o contract.ts]')

const doc: unknown = JSON.parse(readFileSync(input, 'utf8'))
const source = generateContract(doc)
if (output === undefined) {
  process.stdout.write(source)
} else {
  writeFileSync(output, source)
}
