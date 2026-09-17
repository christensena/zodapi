import { ZODAPI_VALIDATION_TYPE, route } from '@zodapi/core'
import { createApp, withZodErrors } from '@zodapi/hono'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

class DataFault extends Error {
  override name = 'DataFault'
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super('stored data did not match its schema')
  }
}

const parses = route({
  method: 'get',
  path: '/items',
  responses: { 200: { description: 'ok' } },
})

/** A handler whose own `.parse()` of internal data throws a bare ZodError. */
const badParse = () => {
  z.object({ id: z.string() }).parse({})
  throw new Error('unreachable')
}

describe('zodError option', () => {
  it('answers a stray ZodError with the validator’s own 400 problem document', async () => {
    const app = createApp({ zodError: true }).openapi(parses, badParse)

    const res = await app.request('/items')
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
    const body = await res.json()
    expect(body.type).toBe(ZODAPI_VALIDATION_TYPE)
    expect(body.target).toBe('json')
    expect(body.issues[0].path).toEqual(['id'])
  })

  it('wraps an onError registered after createApp', async () => {
    const app = createApp({ zodError: true }).openapi(parses, badParse)
    let seen: unknown = 'never ran'
    app.onError((err, c) => {
      seen = err
      return c.text('mine', 500)
    })

    const res = await app.request('/items')
    expect(res.status).toBe(400)
    expect(seen).toBe('never ran')
  })

  it('hands other errors to the app’s own handler', async () => {
    const boom = new RangeError('boom')
    const app = createApp({ zodError: true }).openapi(parses, () => {
      throw boom
    })
    let seen: unknown
    app.onError((err, c) => {
      seen = err
      return c.text('mine', 503)
    })

    const res = await app.request('/items')
    expect(res.status).toBe(503)
    expect(seen).toBe(boom)
  })

  it('maps to the app’s own error type when given a function', async () => {
    const app = createApp({ zodError: (err) => new DataFault(err.issues) }).openapi(
      parses,
      badParse,
    )
    let seen: unknown
    app.onError((err, c) => {
      seen = err
      return c.text('mapped', 422)
    })

    const res = await app.request('/items')
    expect(res.status).toBe(422)
    expect(seen).toBeInstanceOf(DataFault)
    expect((seen as DataFault).issues[0]?.path).toEqual(['id'])
  })

  it('leaves the ZodError to the app when the option is not set', async () => {
    const app = createApp().openapi(parses, badParse)
    let seen: unknown
    app.onError((err, c) => {
      seen = err
      return c.text('unmapped', 500)
    })

    await app.request('/items')
    expect(seen).toBeInstanceOf(z.ZodError)
  })

  it('does not disturb request validation, which still answers 400 on its own', async () => {
    const app = createApp({ zodError: true }).openapi(
      route({
        method: 'get',
        path: '/items/{id}',
        request: { params: z.object({ id: z.string().min(2) }) },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.text(c.req.valid('param').id, 200),
    )

    const res = await app.request('/items/x')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.target).toBe('param')
  })

  it('is usable directly on an error handler', async () => {
    const app = createApp().openapi(parses, badParse)
    app.onError(withZodErrors(true, (_err, c) => c.text('other', 500)))

    const res = await app.request('/items')
    expect(res.status).toBe(400)
  })
})
