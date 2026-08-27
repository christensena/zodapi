import { describe, expect, it } from 'vitest'
import { createApp, route, validationErrorResponse, z } from '@zodapi/hono'

const Item = z.object({ id: z.string() })

describe('route()', () => {
  it('injects the fixed 400 validation error response', () => {
    const r = route({
      method: 'get',
      path: '/items/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { description: 'ok', content: { 'application/json': { schema: Item } } },
      },
    })
    expect(r.responses[400]).toBe(validationErrorResponse)
    expect(r.getRoutingPath()).toBe('/items/:id')
  })

  it('leaves an explicitly declared 400 alone', () => {
    const custom = { description: 'my own 400' }
    const r = route({
      method: 'get',
      path: '/items',
      responses: { 200: { description: 'ok' }, 400: custom },
    })
    expect(r.responses[400]).toBe(custom)
  })

  it('defaults request.body.required to true, preserving an explicit false', () => {
    const body = { content: { 'application/json': { schema: Item } } }
    const required = route({
      method: 'post',
      path: '/items',
      request: { body },
      responses: { 201: { description: 'created' } },
    })
    expect((required.request.body as { required?: boolean }).required).toBe(true)

    const optional = route({
      method: 'post',
      path: '/items-opt',
      request: { body: { ...body, required: false } },
      responses: { 201: { description: 'created' } },
    })
    expect(optional.request?.body?.required).toBe(false)
  })

  it('carries the alias through', () => {
    const r = route({
      alias: 'listItems',
      method: 'get',
      path: '/items',
      responses: { 200: { description: 'ok' } },
    })
    expect(r.alias).toBe('listItems')
  })
})

describe('createApp()', () => {
  it('responds 400 with the fixed shape and documents ValidationError as a component', async () => {
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
    const body = await bad.json()
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.target).toBe('param')

    const doc = await (await app.request('/openapi.json')).json()
    expect(doc.components.schemas.ValidationError).toBeDefined()
    expect(
      doc.paths['/items/{id}'].get.responses['400'].content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/ValidationError' })
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
        request: { query: z.object({ n: z.coerce.number<number>() }) },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json({}, 200),
    )
    const res = await app.request('/x?n=abc')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ custom: true })
  })
})
