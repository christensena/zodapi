import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { generateContract } from '../src/index.js'
import { buildDoc } from './fixture/build-doc.js'
import { routes as fixtureRoutes } from './fixture/contract.js'
import { routes as generatedDatesRoutes } from './fixture/generated-dates.js'
import { routes as generatedMetaRoutes } from './fixture/generated-meta.js'
import { Category as JsdocCategory, routes as generatedRoutes } from './fixture/generated.js'

describe('round trip', () => {
  const docA = buildDoc(fixtureRoutes)

  const fixture = (name: string): string =>
    readFileSync(new URL(`./fixture/${name}`, import.meta.url), 'utf8')

  it('generated.ts is up to date (pnpm --filter @zodapi/codegen generate:fixture)', () => {
    expect(fixture('generated.ts')).toBe(generateContract(docA))
  })

  // The jsdoc contract drops meta/ids, so it cannot rebuild the doc (recursive
  // schemas need the id registry) — but every operation must still be declared
  // and its schemas must execute.
  it('the jsdoc contract still declares every route', () => {
    const keys = (routes: readonly { method: string; path: string }[]): string[] =>
      routes.map((r) => `${r.method} ${r.path}`).sort()
    expect(keys(generatedRoutes)).toEqual(keys(fixtureRoutes))
    expect(
      JsdocCategory.parse({ name: 'root', children: [{ name: 'leaf', children: [] }] }),
    ).toEqual({ name: 'root', children: [{ name: 'leaf', children: [] }] })
  })

  it('generated-meta.ts is up to date (pnpm --filter @zodapi/codegen generate:fixture)', () => {
    expect(fixture('generated-meta.ts')).toBe(generateContract(docA, { docs: 'meta' }))
  })

  // Only docs: 'meta' keeps full fidelity (component ids, descriptions, route
  // doc fields), so the doc-equality half of the round trip runs on it.
  it('the doc built from the meta contract equals the original doc', () => {
    const docB = buildDoc(generatedMetaRoutes)
    expect(docB).toEqual(docA)
  })

  it('generated-dates.ts is up to date (pnpm --filter @zodapi/codegen generate:fixture)', () => {
    expect(fixture('generated-dates.ts')).toBe(
      generateContract(docA, {
        dates: { datetime: true, date: true },
        exportTypes: true,
        docs: 'meta',
      }),
    )
  })

  it('the doc built from the dates contract equals the original doc', () => {
    const docB = buildDoc(generatedDatesRoutes)
    expect(docB).toEqual(docA)
  })
})
