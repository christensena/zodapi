#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

import { generateContract, type GenerateOptions } from './generate.js'
import type { DatesOptions, DocsMode } from './schema-to-zod.js'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const USAGE =
  'Usage: zodapi-codegen <openapi.json> [-o contract.ts] [--docs jsdoc|meta|none] [--export-types] [--dates-datetime] [--dates-date] [--dates-offset]'

const DOCS_MODES: readonly DocsMode[] = ['meta', 'jsdoc', 'none']

const args = process.argv.slice(2)
let input: string | undefined
let output: string | undefined
let exportTypes = false
let docs: DocsMode | undefined
const dates: DatesOptions = {}
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '-o' || arg === '--output') {
    output = args[++i] ?? fail(`${arg} requires a value`)
  } else if (arg === '--docs') {
    const value = args[++i] ?? fail(`${arg} requires a value`)
    if (!(DOCS_MODES as readonly string[]).includes(value)) {
      fail(`--docs must be one of: ${DOCS_MODES.join(', ')}`)
    }
    docs = value as DocsMode
  } else if (arg === '--export-types') {
    exportTypes = true
  } else if (arg === '--dates-datetime') {
    dates.datetime = true
  } else if (arg === '--dates-date') {
    dates.date = true
  } else if (arg === '--dates-offset') {
    dates.offset = true
  } else if (arg === '-h' || arg === '--help') {
    console.log(USAGE)
    process.exit(0)
  } else if (input === undefined) {
    input = arg
  } else {
    fail(`unexpected argument: ${arg}`)
  }
}
if (input === undefined) fail(USAGE)

const options: GenerateOptions = {
  ...(Object.keys(dates).length > 0 && { dates }),
  ...(exportTypes && { exportTypes: true }),
  ...(docs !== undefined && { docs }),
}
const doc: unknown = JSON.parse(readFileSync(input, 'utf8'))
const source = generateContract(doc, options)
if (output === undefined) {
  process.stdout.write(source)
} else {
  writeFileSync(output, source)
}
