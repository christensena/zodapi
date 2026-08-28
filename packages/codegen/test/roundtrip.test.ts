import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { generateContract } from '../src/index.js'
import { buildDoc } from './fixture/build-doc.js'
import { routes as fixtureRoutes } from './fixture/contract.js'
import { routes as generatedDatesRoutes } from './fixture/generated-dates.js'
import { routes as generatedRoutes } from './fixture/generated.js'

describe('round trip', () => {
  const docA = buildDoc(fixtureRoutes)

  it('generated.ts is up to date (pnpm --filter @zodapi/codegen generate:fixture)', () => {
    const committed = readFileSync(new URL('./fixture/generated.ts', import.meta.url), 'utf8')
    expect(committed).toBe(generateContract(docA))
  })

  it('the doc built from the generated contract equals the original doc', () => {
    const docB = buildDoc(generatedRoutes)
    expect(docB).toEqual(docA)
  })

  it('generated-dates.ts is up to date (pnpm --filter @zodapi/codegen generate:fixture)', () => {
    const committed = readFileSync(new URL('./fixture/generated-dates.ts', import.meta.url), 'utf8')
    expect(committed).toBe(generateContract(docA, { dates: { datetime: true, date: true } }))
  })

  it('the doc built from the dates contract equals the original doc', () => {
    const docB = buildDoc(generatedDatesRoutes)
    expect(docB).toEqual(docA)
  })
})
