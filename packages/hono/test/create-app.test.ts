import { route } from '@zodapi/core'
import { createApp } from '@zodapi/hono'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Item = z.object({ id: z.string() })

describe('createApp()', () => {
  it('responds 400 with problem+json and documents ValidationError as a component', async () => {
    const app = createApp()
      .openapi(
        route({
          method: 'get',
          path: '/items/{id}',
          request: { params: z.object({ id: z.string().min(2) }) },
          responses: {
            200: { description: 'ok', content: { 'application/json': { schema: Item } } },
          },
        }),
        (c) => c.json({ id: c.req.valid('param').id }, 200),
      )
      .doc31('/openapi.json', { openapi: '3.1.0', info: { title: 't', version: '1' } })

    const bad = await app.request('/items/x')
    expect(bad.status).toBe(400)
    expect(bad.headers.get('content-type')).toContain('application/problem+json')
    const body = await bad.json()
    expect(body.type).toBe('urn:zodapi:validation')
    expect(body.status).toBe(400)
    expect(body.target).toBe('param')
    expect(body.issues[0]?.path).toEqual(['id'])

    const doc = await (await app.request('/openapi.json')).json()
    expect(doc.components.schemas.ValidationError).toBeDefined()
    expect(
      doc.paths['/items/{id}'].get.responses['400'].content['application/problem+json'].schema,
    ).toEqual({ $ref: '#/components/schemas/ValidationError' })
  })

  it('documents a discriminated union as oneOf with a discriminator object', async () => {
    const Circle = z.object({ shape: z.literal('circle'), radius: z.number() }).meta({
      id: 'Circle',
    })
    const Square = z.object({ shape: z.literal('square'), side: z.number() }).meta({
      id: 'Square',
    })
    const Shape = z.discriminatedUnion('shape', [Circle, Square]).meta({ id: 'Shape' })
    const app = createApp()
      .openapi(
        route({
          method: 'get',
          path: '/shape',
          responses: {
            200: { description: 'ok', content: { 'application/json': { schema: Shape } } },
          },
        }),
        (c) => c.json({ shape: 'circle' as const, radius: 1 }, 200),
      )
      .doc31('/openapi.json', { openapi: '3.1.0', info: { title: 't', version: '1' } })

    const doc = await (await app.request('/openapi.json')).json()
    expect(doc.components.schemas.Shape).toEqual({
      oneOf: [{ $ref: '#/components/schemas/Circle' }, { $ref: '#/components/schemas/Square' }],
      discriminator: {
        propertyName: 'shape',
        mapping: {
          circle: '#/components/schemas/Circle',
          square: '#/components/schemas/Square',
        },
      },
    })
  })

  it('parses the wire-string idioms: coerced number and stringbool', async () => {
    const app = createApp().openapi(
      route({
        method: 'get',
        path: '/w',
        request: {
          query: z.object({ n: z.coerce.number(), b: z.stringbool() }),
        },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json(c.req.valid('query'), 200),
    )
    const res = await app.request('/w?n=5&b=false')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ n: 5, b: false })
  })

  it('lets a user-supplied defaultHook win', async () => {
    const app = createApp({
      defaultHook: (result, c) => {
        if (!result.success) return c.json({ custom: true }, 400)
      },
    }).openapi(
      route({
        method: 'get',
        path: '/x',
        request: { query: z.object({ n: z.coerce.number() }) },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json({}, 200),
    )
    const res = await app.request('/x?n=abc')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ custom: true })
  })
})
