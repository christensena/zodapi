import { rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { PROBLEM_JSON_CONTENT_TYPE, isValidationErrorBody } from '@zodapi/core'
import { createApp } from '@zodapi/hono'
import { describe, expect, it } from 'vitest'

import { generateContract } from '../src/index.js'
import { getItem, listItems } from './fixture/generated-foreign.js'

describe('generated routes are route()-wrapped', () => {
  it('carries a routing path, so a generated contract mounts on a server', () => {
    expect(getItem.getRoutingPath()).toBe('/items/:id')
  })

  it('injects the zodapi 400 into an operation whose spec declared none', () => {
    expect(getItem.responses[400].content[PROBLEM_JSON_CONTENT_TYPE].schema).toBeDefined()
  })

  it("keeps the backend's own 400 and merges the problem+json content beside it", () => {
    expect(listItems.responses[400].description).toBe('the backend’s own bad request')
    expect(Object.keys(listItems.responses[400].content)).toEqual([
      'application/json',
      PROBLEM_JSON_CONTENT_TYPE,
    ])
  })
})

describe('generated numeric and boolean parameters parse the wire', () => {
  const app = createApp().openapi(getItem, (c) => {
    const { id } = c.req.valid('param')
    const { verbose, ratio } = c.req.valid('query')
    expect(id).toBe(7)
    expect(verbose).toBe(true)
    expect(ratio).toBe(0.5)
    return c.json({ id }, 200)
  })

  it('decodes raw strings that a coercion-free schema would reject', async () => {
    const res = await app.request('/items/7?verbose=true&ratio=0.5')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 7 })
  })

  it('still rejects values the declared schema forbids', async () => {
    const res = await app.request('/items/0')
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain(PROBLEM_JSON_CONTENT_TYPE)
    const body = await res.json()
    expect(isValidationErrorBody(body)).toBe(true)
  })

  it('rejects a non-numeric value rather than coercing it to NaN', async () => {
    expect((await app.request('/items/abc')).status).toBe(400)
  })
})

describe('a spec route() cannot accept', () => {
  // A templated path whose parameter the spec never declares. route() throws
  // when it is defined, so the generated module fails loudly on import rather
  // than 400-ing every request at runtime.
  it('fails on import instead of generating a route that can never match', async () => {
    const source = generateContract({
      openapi: '3.1.0',
      info: { title: 'undeclared-param', version: '1.0.0' },
      paths: {
        '/items/{id}': {
          get: { operationId: 'getItem', responses: { 200: { description: 'ok' } } },
        },
      },
    })
    expect(source).toContain('path: "/items/{id}"')
    expect(source).not.toContain('params:')

    const file = fileURLToPath(new URL('./fixture/tmp-undeclared-param.ts', import.meta.url))
    writeFileSync(file, source)
    try {
      await expect(import(/* @vite-ignore */ pathToFileURL(file).href)).rejects.toThrow(
        /params do not match path '\/items\/\{id\}'/,
      )
    } finally {
      rmSync(file, { force: true })
    }
  })
})
